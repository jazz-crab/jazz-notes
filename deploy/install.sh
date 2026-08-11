#!/usr/bin/env bash
# JazzNote web server installer. Run from the unpacked bundle directory.
# Installs Node if missing, creates the vault, writes an env file with a
# generated token, and registers a systemd service.
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_USER="$(id -un)"
RUN_GROUP="$(id -gn)"
VAULT="${JAZZ_VAULT:-$HOME/jazz-notes}"
PORT="${PORT:-3180}"
ENV_FILE="${ENV_FILE:-$HOME/.config/jazz-note-server.env}"
SERVICE_NAME="jazz-note-server"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

need_sudo() {
  if [ -z "${SUDO_PASS:-}" ] && ! sudo -n true 2>/dev/null; then
    echo "Sudo password is required to install Node and the systemd service." >&2
    echo "Re-run from a terminal that can prompt for sudo, or set SUDO_PASS." >&2
    exit 1
  fi
}

SUDO() {
  if [ -n "${SUDO_PASS:-}" ]; then
    echo "$SUDO_PASS" | sudo -S "$@"
  else
    sudo "$@"
  fi
}

# 1. Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found — installing via apt..."
  need_sudo
  SUDO apt-get update
  SUDO apt-get install -y nodejs
fi
NODE_VERSION="$(node --version)"
echo "Node.js $NODE_VERSION"
NODE_BIN="$(command -v node)"
echo "Node path: $NODE_BIN"

# 2. Vault
mkdir -p "$VAULT"
echo "Vault: $VAULT"

# 3. Env file with a generated token
mkdir -p "$(dirname "$ENV_FILE")"
if [ ! -f "$ENV_FILE" ]; then
  TOKEN="$(openssl rand -hex 24)"
  cat > "$ENV_FILE" <<EOF
PORT=$PORT
JAZZ_VAULT=$VAULT
JAZZ_WEB_ROOT=$SERVER_DIR/dist
JAZZ_NOTE_TOKEN=$TOKEN
EOF
  chmod 600 "$ENV_FILE"
else
  TOKEN="$(sed -n 's/^JAZZ_NOTE_TOKEN=//p' "$ENV_FILE")"
fi
echo "Env:    $ENV_FILE"

# 4. systemd unit
need_sudo
sed -e "s|__USER__|$RUN_USER|g" \
    -e "s|__GROUP__|$RUN_GROUP|g" \
    -e "s|__SERVER_DIR__|$SERVER_DIR|g" \
    -e "s|__ENV_FILE__|$ENV_FILE|g" \
    -e "s|__NODE_BIN__|$NODE_BIN|g" \
    "$SERVER_DIR/jazz-note-server.service" > "$SERVER_DIR/.service.tmp"
SUDO install -m 644 "$SERVER_DIR/.service.tmp" "$SERVICE_FILE"
rm -f "$SERVER_DIR/.service.tmp"
SUDO systemctl daemon-reload
SUDO systemctl enable --now "$SERVICE_NAME"

echo
echo "JazzNote server installed and running:"
echo "  URL:    http://$(hostname -I 2>/dev/null | awk '{print $1}'):$PORT"
echo "  Token:  $TOKEN  (for POST /api/note)"
