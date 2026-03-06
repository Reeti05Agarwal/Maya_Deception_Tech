#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
SIM_FAKE_DIR="$ROOT_DIR/simulations/fake"

MONGO_CONTAINER="maya-mongo"
MONGO_PORT="27017"
BACKEND_PORT="3001"
FRONTEND_PORT="3000"
SEED_DB="${SEED_DB:-0}"

log() {
  printf '[run-all] %s\n' "$1"
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

run_sudo() {
  sudo "$@"
}

is_port_open() {
  local port="$1"
  if has_cmd ss; then
    ss -ltn "( sport = :$port )" | grep -q ":$port"
  else
    netstat -ltn 2>/dev/null | grep -q ":$port "
  fi
}

open_in_terminal() {
  local title="$1"
  local cmd="$2"

  if has_cmd gnome-terminal; then
    gnome-terminal --title="$title" -- bash -lc "$cmd; exec bash"
    return 0
  fi

  if has_cmd x-terminal-emulator; then
    x-terminal-emulator -T "$title" -e bash -lc "$cmd; exec bash"
    return 0
  fi

  return 1
}

ensure_libvirt() {
  for cmd in virsh vagrant; do
    if ! has_cmd "$cmd"; then
      log "Missing required command for VM stack: $cmd"
      exit 1
    fi
  done

  log "Ensuring libvirt daemons are running..."
  run_sudo systemctl enable --now libvirtd >/dev/null 2>&1 || true
  run_sudo systemctl enable --now virtqemud.socket >/dev/null 2>&1 || true
  run_sudo systemctl enable --now virtnetworkd.socket >/dev/null 2>&1 || true
  run_sudo systemctl enable --now virtlogd.socket >/dev/null 2>&1 || true
  run_sudo systemctl enable --now virtstoraged.socket >/dev/null 2>&1 || true

  if [[ ! -S /var/run/libvirt/virtnetworkd-sock ]]; then
    log "libvirt network socket is missing. Check libvirt service status."
    exit 1
  fi
}

ensure_storage_pool() {
  log "Ensuring default libvirt storage pool is active..."
  # pool-info is a reliable existence check across virsh output formats.
  if ! run_sudo virsh -c qemu:///system pool-info default >/dev/null 2>&1; then
    run_sudo virsh -c qemu:///system pool-define-as default dir - - - - /var/lib/libvirt/images >/dev/null
  fi
  run_sudo virsh -c qemu:///system pool-start default >/dev/null 2>&1 || true
  run_sudo virsh -c qemu:///system pool-autostart default >/dev/null 2>&1 || true
}

ensure_network_defined() {
  local network_name="$1"
  local xml_file="$2"
  if ! run_sudo virsh -c qemu:///system net-list --all | awk 'NR>2 {print $1}' | grep -qx "$network_name"; then
    run_sudo virsh -c qemu:///system net-define "$xml_file" >/dev/null
  fi
  run_sudo virsh -c qemu:///system net-start "$network_name" >/dev/null 2>&1 || true
  run_sudo virsh -c qemu:///system net-autostart "$network_name" >/dev/null 2>&1 || true
}

ensure_networks() {
  log "Ensuring libvirt networks are defined and active..."
  ensure_network_defined "corp_net" "$ROOT_DIR/simulations/corp_net.xml"
  ensure_network_defined "maya_net" "$ROOT_DIR/simulations/maya_net.xml"
}

ensure_decoys() {
  if [[ ! -d "$SIM_FAKE_DIR" ]]; then
    log "Missing simulations directory: $SIM_FAKE_DIR"
    exit 1
  fi

  log "Starting all decoy VMs (no-provision mode to avoid apt/apk DNS failures)..."
  local total=0
  local running=0

  while IFS= read -r vm_path; do
    local vm_dir
    vm_dir="$(dirname "$vm_path")"
    local vm_name
    vm_name="$(basename "$vm_dir")"
    total=$((total + 1))

    log "VM up: $vm_name"
    (cd "$vm_dir" && vagrant up --provider=libvirt --no-provision >/dev/null 2>&1 || true)

    if (cd "$vm_dir" && vagrant status --machine-readable 2>/dev/null | grep -q "state,running"); then
      running=$((running + 1))
    fi
  done < <(find "$SIM_FAKE_DIR" -mindepth 2 -maxdepth 2 -name Vagrantfile | sort)

  log "VM summary: $running/$total running"
}

ensure_mongo() {
  # If something is already listening on Mongo port, use it.
  if is_port_open "$MONGO_PORT"; then
    log "Port $MONGO_PORT is already in use. Assuming MongoDB is already running."
    return 0
  fi

  if ! has_cmd docker; then
    log "Docker not found and no service is listening on port $MONGO_PORT."
    log "Start MongoDB manually or install Docker."
    exit 1
  fi

  if docker ps --format '{{.Names}}' | grep -q "^${MONGO_CONTAINER}$"; then
    log "Mongo container already running ($MONGO_CONTAINER)."
    return 0
  fi

  if docker ps -a --format '{{.Names}}' | grep -q "^${MONGO_CONTAINER}$"; then
    log "Starting existing Mongo container ($MONGO_CONTAINER)..."
    docker start "$MONGO_CONTAINER" >/dev/null
    return 0
  fi

  log "Creating Mongo container ($MONGO_CONTAINER)..."
  if ! docker run -d --name "$MONGO_CONTAINER" -p "${MONGO_PORT}:27017" mongo:7 >/dev/null; then
    if is_port_open "$MONGO_PORT"; then
      log "Mongo port became busy during startup. Assuming an existing MongoDB instance is available."
      return 0
    fi
    log "Failed to start Mongo container and port $MONGO_PORT is still unavailable."
    exit 1
  fi
}

ensure_node_modules() {
  if [[ ! -d "$BACKEND_DIR/node_modules" ]]; then
    log "Installing backend dependencies..."
    (cd "$BACKEND_DIR" && npm install)
  fi

  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    log "Installing frontend dependencies..."
    (cd "$FRONTEND_DIR" && npm install)
  fi
}

seed_backend() {
  if [[ "$SEED_DB" != "1" ]]; then
    log "Skipping DB seed (set SEED_DB=1 to force seed)."
    return 0
  fi
  log "Seeding backend database..."
  (cd "$BACKEND_DIR" && npm run seed)
}

start_backend() {
  if curl -fsS "http://localhost:${BACKEND_PORT}/health" >/dev/null 2>&1; then
    log "Backend already healthy on :$BACKEND_PORT"
    return 0
  fi

  if is_port_open "$BACKEND_PORT"; then
    log "Port :$BACKEND_PORT is busy but health check failed. Free the port manually and rerun."
    return 1
  fi

  local backend_cmd="cd '$BACKEND_DIR' && VAGRANT_DIR='$SIM_FAKE_DIR' npm run dev"
  if open_in_terminal "Maya Backend" "$backend_cmd"; then
    log "Started backend in a new terminal."
    return 0
  fi

  log "No GUI terminal launcher found. Starting backend in background."
  nohup bash -lc "$backend_cmd" >"$ROOT_DIR/backend-dev.log" 2>&1 &
  log "Backend log: $ROOT_DIR/backend-dev.log"
}

start_frontend() {
  if curl -fsS "http://localhost:${FRONTEND_PORT}" >/dev/null 2>&1; then
    log "Frontend already responding on :$FRONTEND_PORT"
    return 0
  fi

  if is_port_open "$FRONTEND_PORT"; then
    log "Port :$FRONTEND_PORT is busy. Assuming frontend is already running."
    return 0
  fi

  local frontend_cmd="cd '$FRONTEND_DIR' && npm run dev"
  if open_in_terminal "Maya Frontend" "$frontend_cmd"; then
    log "Started frontend in a new terminal."
    return 0
  fi

  log "No GUI terminal launcher found. Starting frontend in background."
  nohup bash -lc "$frontend_cmd" >"$ROOT_DIR/frontend-dev.log" 2>&1 &
  log "Frontend log: $ROOT_DIR/frontend-dev.log"
}

start_services() {
  start_backend
  start_frontend
}

wait_for_health() {
  log "Waiting for backend health..."
  for _ in {1..60}; do
    if curl -fsS "http://localhost:${BACKEND_PORT}/health" >/dev/null 2>&1; then
      log "Backend is healthy: http://localhost:${BACKEND_PORT}/health"
      break
    fi
    sleep 1
  done

  log "Waiting for frontend..."
  for _ in {1..60}; do
    if curl -fsS "http://localhost:${FRONTEND_PORT}" >/dev/null 2>&1; then
      log "Frontend is up: http://localhost:${FRONTEND_PORT}"
      break
    fi
    sleep 1
  done
}

print_next_steps() {
  cat <<EOF

Done.

Open these URLs:
  Frontend: http://localhost:${FRONTEND_PORT}
  Dashboard: http://localhost:${FRONTEND_PORT}/dashboard
  Backend health: http://localhost:${BACKEND_PORT}/health

Quick API checks:
  curl http://localhost:${BACKEND_PORT}/api/dashboard/active-attackers
  curl http://localhost:${BACKEND_PORT}/api/dashboard/stats
  curl http://localhost:${BACKEND_PORT}/api/vms
EOF
}

main() {
  log "Starting Maya stack from: $ROOT_DIR"

  for cmd in npm curl; do
    if ! has_cmd "$cmd"; then
      log "Missing required command: $cmd"
      exit 1
    fi
  done

  ensure_libvirt
  ensure_storage_pool
  ensure_networks
  ensure_decoys
  ensure_mongo
  ensure_node_modules
  seed_backend
  start_services
  wait_for_health
  print_next_steps
}

main "$@"
