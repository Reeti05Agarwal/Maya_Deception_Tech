#!/bin/bash

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Suspending all Maya Deception Fabric VMs${NC}"
echo -e "${GREEN}=========================================${NC}"

VMS=(gateway-vm fake-ftp-01 fake-jump-01 fake-rdp-01 fake-smb-01 fake-ssh-01 fake-web-01 fake-web-02 fake-web-03)

for vm in "${VMS[@]}"; do
    if [ -d "$vm" ]; then
        echo -e "${YELLOW}Suspending $vm...${NC}"
        cd "$vm"
        vagrant suspend
        cd ..
        echo -e "${GREEN}✅ $vm suspended${NC}"
    else
        echo -e "${RED}⚠️  Directory $vm not found, skipping${NC}"
    fi
done

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}All VMs suspended!${NC}"
echo -e "${GREEN}Resume them later with './resume_vms.sh'${NC}"
echo -e "${GREEN}=========================================${NC}"