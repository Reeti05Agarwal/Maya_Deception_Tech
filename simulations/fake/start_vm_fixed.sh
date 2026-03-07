#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Starting Maya Deception Fabric VMs${NC}"
echo -e "${GREEN}=========================================${NC}"

# Function to check if VM is running using Vagrant
is_vm_running() {
    local vm=$1
    cd "$vm" || return 1
    # Check Vagrant status
    status=$(vagrant status --machine-readable | grep ",state," | awk -F',' '{print $4}')
    cd ..
    if [[ "$status" == "running" ]]; then
        return 0
    else
        return 1
    fi
}

# Function to start a VM
start_vm() {
    local vm=$1
    local provider=${2:-libvirt}
    
    if [ ! -d "$vm" ]; then
        echo -e "${RED}❌ Directory $vm not found${NC}"
        return 1
    fi
    
    echo -e "${YELLOW}Starting $vm with provider: $provider...${NC}"

    if is_vm_running "$vm"; then
        echo -e "${GREEN}✅ $vm is already running${NC}"
    else
        cd "$vm" || return 1
        echo "  Running vagrant up..."
        vagrant up --provider="$provider"
        if [[ $? -ne 0 ]]; then
            echo -e "${RED}❌ Failed to start $vm${NC}"
            cd ..
            return 1
        fi
        cd ..
        echo -e "${GREEN}✅ Successfully started $vm${NC}"
    fi

    # Get IP address using ip addr (works on BusyBox)
    cd "$vm" || return 1
    ip=$(vagrant ssh -c "ip addr show | grep 'inet ' | grep -v '127.0.0.1' | awk '{print \$2}' | cut -d/ -f1 | head -1" 2>/dev/null | tr -d '\r')
    cd ..
    if [[ -n "$ip" ]]; then
        echo -e "   IP Address: $ip"
    else
        echo -e "${YELLOW}⚠️ IP address not found for $vm. Check network configuration.${NC}"
    fi
    echo ""
}

# Start gateway-vm first
echo -e "${GREEN}Step 1: Starting Gateway VM (Honey Wall)${NC}"
start_vm "gateway-vm" "libvirt"

# Give gateway VM time to initialize networking
echo -e "${YELLOW}Waiting 10 seconds for gateway VM to initialize...${NC}"
sleep 10

# Start all honeypot VMs
echo -e "${GREEN}Step 2: Starting Honeypot VMs${NC}"
FAKE_VMS="fake-ftp-01 fake-jump-01 fake-rdp-01 fake-smb-01 fake-ssh-01 fake-web-01 fake-web-02 fake-web-03"

for vm in $FAKE_VMS; do
    start_vm "$vm" "libvirt"
done

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Final VM Status:${NC}"
echo -e "${GREEN}=========================================${NC}"
sudo virsh list --all | grep -E "(fake-|gateway)"