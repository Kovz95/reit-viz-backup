#!/bin/bash
# Daily cron entry point for the yield-correlation data refresh.
export PATH=/usr/local/bin:/usr/bin:/bin
cd /opt/reit-yc-backend
node update-data.cjs >> /var/log/yc-update.log 2>&1 && pm2 restart reit-yc-backend >> /var/log/yc-update.log 2>&1
