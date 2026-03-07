#!/bin/bash

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Resuming all Maya Deception Fabric VMs${NC}"
echo -e "${GREEN}=========================================${NC}"

VMS=(gateway-vm fake-ftp-01 fake-jump-01 fake-rdp-01 fake-smb-01 fake-ssh-01 fake-web-01 fake-web-02 fake-web-03)

for vm in "${VMS[@]}"; do
    if [ -d "$vm" ]; then
        echo -e "${YELLOW}Resuming $vm...${NC}"
        cd "$vm"
        vagrant up
        cd ..
        echo -e "${GREEN}✅ $vm resumed${NC}"
    else
        echo -e "${RED}⚠️  Directory $vm not found, skipping${NC}"
    fi
done

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}All VMs resumed!${NC}"
echo -e "${GREEN}=========================================${NC}"