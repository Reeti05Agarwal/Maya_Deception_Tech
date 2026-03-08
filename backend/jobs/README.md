# Edit crontab
```bash
crontab -e
```

# Add line to run daily at 3 AM
```bash
0 3 * * * cd /path/to/your/project && npx ts-node src/jobs/syncMitreAttack.ts >> /var/log/mitre-sync.log 2>&1
```