#!/usr/bin/env bash
# One-time setup of the event server (Ubuntu 24.04 with Docker, nginx and certbot installed).
# Runs ON the server:  bash setup-server.sh [git ref]   (default: main)
# Safe to run again: existing .env files and their secrets are kept.
set -euo pipefail
REF=${1:-main}
APP=~/apps/voting-system
DOMAIN=vote.jeinsat.com

[ -d "$APP/.git" ] || git clone -q https://github.com/Pole-Projet-JEI/voting-system.git "$APP"
cd "$APP"
git fetch -q origin
git checkout -q --detach "origin/$REF"

# --- settings: fresh secrets, generated here, never printed ---
rnd() { openssl rand -hex 32; }
if [ ! -f server/.env ]; then
    cat >server/.env <<EOF
NODE_ENV=production
PORT=3000
HOST=$DOMAIN
CORS_ORIGINS=https://$DOMAIN
# One stream per open voter page; 2000 voters + spare tabs and reconnects.
SSE_MAX_CONNECTIONS=5000
SSE_HEARTBEAT_INTERVAL_MS=25000
ACCESS_MODE=qr-email
# Per IP per 15 min. The whole auditorium shares one Wi-Fi IP and each phone needs 2+ requests
# (scan, email, rescans): the default 3000 stops at ~1500 phones.
JOIN_REQUESTS_PER_IP=20000
SESSION_SECRET=$(rnd)
JWT_SECRET=$(rnd)
QR_SECRET=$(rnd)
VOTER_CODE_PEPPER=$(rnd)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')
EOF
    chmod 600 server/.env
fi
[ -f client/.env ] || : >client/.env  # required by docker-compose.yml, nothing in it
[ -f .env ] || echo "VITE_LANG=fr" >.env

# --- host nginx, sized for ~2000 live streams ---
sudo sed -i 's/^\(\s*\)worker_connections .*/\1worker_connections 16384;/' /etc/nginx/nginx.conf
grep -q '^worker_rlimit_nofile' /etc/nginx/nginx.conf || sudo sed -i '1i worker_rlimit_nofile 65535;' /etc/nginx/nginx.conf
sudo cp deploy/nginx-vote.conf /etc/nginx/sites-available/vote
sudo ln -sf /etc/nginx/sites-available/vote /etc/nginx/sites-enabled/vote
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

docker compose up -d --build
echo "set up at $(git log --oneline -1)"
