#!/bin/bash
# Maya Deception Tech - SSH Audit Hook
# Triggered on every SSH login

if [ -n "$SSH_CLIENT" ] || [ -n "$SSH_CONNECTION" ]; then
    # Get attacker IP
    ATTACKER_IP=$(echo $SSH_CONNECTION | awk '{ print $1 }')
    
    # Record the login
    /usr/local/bin/syslogd-helper observe "SSH login from $ATTACKER_IP" 2>/dev/null || true
    
    # Record visited decoy
    HOSTNAME_SHORT=$(hostname -s)
    /usr/local/bin/syslogd-helper visit "$ATTACKER_IP" "$HOSTNAME_SHORT" 2>/dev/null || true
    
    # Sync with peers (async)
    /usr/local/bin/syslogd-helper sync >/dev/null 2>&1 &
fi
