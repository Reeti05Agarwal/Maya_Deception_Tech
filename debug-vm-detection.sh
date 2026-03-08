#!/bin/bash
# Diagnostic script to debug VM detection issues
# Usage: ./debug-vm-detection.sh

set -e

echo "========================================"
echo "Maya VM Detection Debug Script"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if virsh is available
echo "1. Checking virsh..."
if command -v virsh &> /dev/null; then
    echo -e "${GREEN}✓ virsh is installed${NC}"
    
    echo ""
    echo "   Running VMs (virsh list):"
    virsh list --name 2>/dev/null || echo "   ${YELLOW}No VMs found or virsh failed${NC}"
    
    echo ""
    echo "   Checking specific fake-* VMs:"
    for vm in fake-jump-01 fake-web-01 fake-ftp-01 fake-db-01 fake-mail-01 fake-file-01 gateway-vm; do
        state=$(virsh domstate $vm 2>/dev/null || echo "NOT_FOUND")
        if [ "$state" == "running" ]; then
            echo -e "   ${GREEN}✓ $vm: $state${NC}"
            
            # Try to get IP
            ip=$(virsh domifaddr $vm 2>/dev/null | grep ipv4 | awk '{print $4}' | cut -d/ -f1 || echo "unknown")
            if [ -n "$ip" ]; then
                echo "      IP: $ip"
            else
                echo -e "      ${YELLOW}IP: unknown${NC}"
            fi
        else
            echo -e "   ${RED}✗ $vm: $state${NC}"
        fi
    done
else
    echo -e "${RED}✗ virsh is NOT installed${NC}"
    echo "   Install with: sudo apt install libvirt-clients"
fi

echo ""
echo "2. Checking Vagrant VMs..."
if command -v vagrant &> /dev/null; then
    echo -e "${GREEN}✓ vagrant is installed${NC}"
    
    # Find the simulations directory
    SIMS_DIR="$HOME/Documents/Maya_Deception_Tech/simulations/fake"
    if [ ! -d "$SIMS_DIR" ]; then
        SIMS_DIR="$HOME/Documents/Maya/simulations/fake"
    fi
    if [ ! -d "$SIMS_DIR" ]; then
        SIMS_DIR="$(dirname $(pwd))/simulations/fake"
    fi
    
    if [ -d "$SIMS_DIR" ]; then
        echo ""
        echo "   Scanning: $SIMS_DIR"
        echo ""
        
        for vm_dir in $SIMS_DIR/fake-*; do
            if [ -d "$vm_dir" ]; then
                vm_name=$(basename "$vm_dir")
                echo "   Checking $vm_name..."
                
                # Check if Vagrantfile exists
                if [ ! -f "$vm_dir/Vagrantfile" ]; then
                    echo -e "      ${RED}✗ No Vagrantfile found${NC}"
                    continue
                fi
                
                # Check VM status
                cd "$vm_dir"
                status=$(timeout 10 vagrant status --machine-readable 2>&1 || echo "ERROR")
                
                if echo "$status" | grep -q "state,running"; then
                    echo -e "      ${GREEN}✓ Status: running${NC}"

                    # Try to get IP using ip addr (works on BusyBox)
                    ip=$(timeout 5 vagrant ssh -c "ip addr show | grep 'inet ' | grep -v '127.0.0.1' | awk '{print \$2}' | cut -d/ -f1 | head -1" 2>/dev/null || echo "unknown")
                    if [ -n "$ip" ] && [ "$ip" != "unknown" ]; then
                        echo "      IP: $ip"
                    else
                        echo -e "      ${YELLOW}IP: could not fetch${NC}"
                    fi
                else
                    echo -e "      ${RED}✗ Status: not running${NC}"
                fi
                cd - > /dev/null
            fi
        done
    else
        echo -e "${RED}✗ Simulations directory not found${NC}"
    fi
else
    echo -e "${RED}✗ vagrant is NOT installed${NC}"
fi

echo ""
echo "3. Checking Backend VM Cache..."
echo ""
echo "   Querying backend API..."

BACKEND_URL="http://localhost:3001"

# Check if backend is running
if curl -s "$BACKEND_URL/health" > /dev/null 2>&1; then
    echo -e "   ${GREEN}✓ Backend is running${NC}"
    
    echo ""
    echo "   VM Cache Status:"
    curl -s "$BACKEND_URL/api/simulation/vm-cache" | jq -r '
        if .success then
            "   Count: \(.data.count) VMs\n" +
            "   VMs: \(.data.vms | map(.name) | join(", "))"
        else
            "   Error: \(.error // "Unknown error")"
        end
    ' 2>/dev/null || echo -e "   ${YELLOW}Could not parse response${NC}"
    
    echo ""
    echo "   Full VM Cache Details:"
    curl -s "$BACKEND_URL/api/simulation/vm-cache" | jq -r '.data.vms[] | "   - \(.name): \(.ip) (\(.path))"' 2>/dev/null || echo "   (no VMs in cache)"
else
    echo -e "   ${RED}✗ Backend is NOT running${NC}"
    echo "   Start with: cd backend && npm run dev"
fi

echo ""
echo "4. Quick Fix Commands"
echo "========================================"
echo ""
echo "If VMs are running but not detected, try:"
echo ""
echo "   # Force refresh VM cache via API:"
echo "   curl -X POST $BACKEND_URL/api/simulation/vm-cache/refresh"
echo ""
echo "   # Or manually populate cache:"
echo "   curl -X POST $BACKEND_URL/api/simulation/vm-cache/populate \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"vms\": [{\"name\": \"fake-jump-01\", \"path\": \"/path/to/vm\", \"ip\": \"10.20.20.10\"}]}'"
echo ""
echo "   # Start a VM if not running:"
echo "   cd simulations/fake/fake-jump-01 && vagrant up"
echo ""

echo ""
echo "========================================"
echo "Debug script complete!"
echo "========================================"
