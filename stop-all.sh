#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SIM_FAKE_DIR="$ROOT_DIR/simulations/fake"

MONGO_CONTAINER="maya-mongo"
BACKEND_PORT="3001"
FRONTEND_PORT="3000"

log() {
  printf '[stop-all] %s\n' "$1"
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

collect_pids_by_port() {
  local port="$1"

  if has_cmd lsof; then
    lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u
    return 0
  fi

  if has_cmd fuser; then
    fuser -n tcp "$port" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' | sort -u
    return 0
  fi

  return 1
}

kill_pids_gracefully() {
  local service_name="$1"
  shift
  local pids=("$@")

  if [[ "${#pids[@]}" -eq 0 ]]; then
    return 0
  fi

  log "Stopping $service_name (PID(s): ${pids[*]})..."
  kill "${pids[@]}" 2>/dev/null || true

  for _ in {1..10}; do
    local alive=0
    for pid in "${pids[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        alive=1
        break
      fi
    done
    [[ "$alive" -eq 0 ]] && return 0
    sleep 1
  done

  log "$service_name still running; forcing stop."
  kill -9 "${pids[@]}" 2>/dev/null || true
}

stop_service_by_port() {
  local port="$1"
  local service_name="$2"

  local pids_raw
  pids_raw="$(collect_pids_by_port "$port" || true)"

  if [[ -z "$pids_raw" ]]; then
    log "$service_name is not listening on :$port"
    return 0
  fi

  # shellcheck disable=SC2206
  local pids=($pids_raw)
  kill_pids_gracefully "$service_name" "${pids[@]}"
}

stop_mongo() {
  if ! has_cmd docker; then
    log "Docker not found; skipping Mongo container stop."
    return 0
  fi

  if docker ps --format '{{.Names}}' | grep -q "^${MONGO_CONTAINER}$"; then
    log "Stopping Mongo container: $MONGO_CONTAINER"
    docker stop "$MONGO_CONTAINER" >/dev/null || true
    return 0
  fi

  log "Mongo container not running: $MONGO_CONTAINER"
}

stop_decoys() {
  if [[ ! -d "$SIM_FAKE_DIR" ]]; then
    log "Missing simulations directory: $SIM_FAKE_DIR"
    return 0
  fi

  log "Halting decoy VMs..."

  local total=0
  local halted=0

  while IFS= read -r vm_path; do
    local vm_dir
    vm_dir="$(dirname "$vm_path")"
    local vm_name
    vm_name="$(basename "$vm_dir")"
    total=$((total + 1))

    local is_running=0
    if (cd "$vm_dir" && vagrant status --machine-readable 2>/dev/null | grep -q "state,running"); then
      is_running=1
    fi

    if [[ "$is_running" -eq 1 ]]; then
      log "Halting VM: $vm_name"
      (cd "$vm_dir" && vagrant halt >/dev/null 2>&1 || true)
      halted=$((halted + 1))
    fi
  done < <(find "$SIM_FAKE_DIR" -mindepth 2 -maxdepth 2 -name Vagrantfile | sort)

  log "VM summary: halted $halted running VM(s) out of $total detected."
}

main() {
  log "Stopping Maya stack from: $ROOT_DIR"

  for cmd in vagrant; do
    if ! has_cmd "$cmd"; then
      log "Missing required command: $cmd"
      exit 1
    fi
  done

  stop_service_by_port "$FRONTEND_PORT" "Frontend"
  stop_service_by_port "$BACKEND_PORT" "Backend"
  stop_mongo
  stop_decoys

  log "Done."
}

main "$@"
