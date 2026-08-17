#!/usr/bin/env bash
# Lucky777 one-shot server setup. Run on a fresh Ubuntu box, from this folder:
#
#     bash setup-server.sh                 # HTTP on port 8000 (by IP)
#     bash setup-server.sh yourdomain.com  # + HTTPS once DNS points here
#
# Safe to re-run: it never overwrites an existing .env (your secrets) and
# never touches the data volume (your ledger).
set -euo pipefail

DOMAIN="${1:-}"
cd "$(dirname "$0")"

say() { printf '\n\033[1;33m» %s\033[0m\n' "$*"; }

# ---- docker ------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker (one-time)…"
  curl -fsSL https://get.docker.com | sh
fi

# ---- secrets -----------------------------------------------------------------
if [ ! -f .env ]; then
  say "First-time setup — creating your master agent login."
  read -rp  "  master agent username [brock]: " ADMIN_USER
  ADMIN_USER="${ADMIN_USER:-brock}"
  while :; do
    read -rsp "  master agent password (min 6 chars): " ADMIN_PASS; echo
    [ "${#ADMIN_PASS}" -ge 6 ] && break
    echo "  too short, try again."
  done
  read -rp  "  The Odds API key for real lines (Enter = use built-in key): " ODDS_KEY
  ODDS_KEY="${ODDS_KEY:-cdf45a267ea57478898e834d5344a5d3}"

  {
    echo "LUCKY777_JWT_SECRET=$(openssl rand -hex 32)"
    echo "LUCKY777_ADMIN_USERNAME=${ADMIN_USER}"
    echo "LUCKY777_ADMIN_PASSWORD=${ADMIN_PASS}"
    if [ -n "${ODDS_KEY}" ]; then
      echo "LUCKY777_ODDS_PROVIDER=the_odds_api"
      echo "LUCKY777_ODDS_API_KEY=${ODDS_KEY}"
    fi
  } > .env
  chmod 600 .env
  say "Secrets written to .env (kept on this server only)."
else
  say "Existing .env found — keeping your secrets as they are."
fi

# ---- firewall (if ufw is active, open what we serve) -------------------------
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null || true
  ufw allow 443/tcp >/dev/null || true
  ufw allow 8000/tcp >/dev/null || true
fi

# ---- launch ------------------------------------------------------------------
if [ -n "$DOMAIN" ]; then
  say "Enabling HTTPS for ${DOMAIN}…"
  printf '%s {\n    reverse_proxy lucky777:8000\n}\n' "$DOMAIN" > Caddyfile
  docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
else
  docker compose up -d --build
fi

IP="$(curl -fs4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
say "Done."
if [ -n "$DOMAIN" ]; then
  echo "  Your book:  https://${DOMAIN}   (give DNS a few minutes if it's new)"
else
  echo "  Your book:  http://${IP}:8000"
  echo "  Got a domain later? Point its A record at ${IP}, then re-run:"
  echo "      bash setup-server.sh yourdomain.com"
fi
echo "  Log in as the master agent you just set — the board is already stocked."
echo "  Nightly backup (recommended):"
echo "      crontab -e   and add:"
echo "      0 5 * * * docker compose -f $(pwd)/docker-compose.yml cp lucky777:/srv/data/lucky777.db /root/l77-backup-\$(date +\\%u).db"
