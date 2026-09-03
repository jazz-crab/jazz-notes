#!/usr/bin/env bash
# JazzNote self-hosted sync-server installer.
#
# Provisions a complete sync server (git smart HTTP + web UI + auth) on a
# Debian/Ubuntu host with systemd:
#   1. installs Node.js (>= 18) and git via apt when missing;
#   2. fetches the server bundle (GitHub release, JAZZ_BUNDLE_SRC, or the
#      directory this script runs from) and unpacks it into JAZZ_INSTALL_DIR;
#   3. creates the vault and its bare repository (`git init --bare -b main`);
#   4. installs the post-receive hook (every push checks the vault out);
#   5. writes the env file (token generated) and the git-users file
#      (primary user added, existing users preserved);
#   6. registers and starts the `jazz-notes-web` systemd service.
#
# Usage:
#   curl -fsSL <url> | bash                          # standalone (downloads release)
#   JAZZ_BUNDLE_SRC=/path/to/bundle ./install-server.sh
#   ./install-server.sh                              # from an unpacked bundle
#
# Re-running the script upgrades the server and keeps the vault, git users,
# the API token and the env file.
#
# Environment (all optional):
#   JAZZ_VAULT          vault directory                (default $HOME/jazz-notes-vault)
#   PORT                HTTP port                      (default 3180)
#   JAZZ_INSTALL_DIR    where the bundle is unpacked   (default $HOME/jazz-notes-server)
#   JAZZ_BUNDLE_SRC     local dir with server.js + dist/ (skips the download)
#   JAZZ_NOTE_TOKEN     token for POST /api/note       (default: generated)
#   JAZZ_GIT_USER       primary git user               (default: jc)
#   JAZZ_GIT_PASSWORD   primary git password           (default: generated, printed at the end)
#   JAZZ_ENV_FILE       env file path                  (default $HOME/.config/jazz-note-server.env)
#   JAZZ_GIT_USERS_FILE git-users JSON path            (default $HOME/.config/jazz-notes-git-users.json)
#   JAZZ_RUN_USER       systemd service user           (default: $SUDO_USER or current user)
#   SUDO_PASS           sudo password for non-interactive runs
#   SKIP_SYSTEMD=1      skip systemd registration (tests / fully manual runs)
set -euo pipefail

# ---------------------------------------------------------------------------
# Sudo helpers (root runs everything directly, no sudo needed)
# ---------------------------------------------------------------------------
IS_ROOT=0
[ "$(id -u)" -eq 0 ] && IS_ROOT=1

need_sudo() {
  if [ "$IS_ROOT" -eq 1 ]; then return 0; fi
  if [ -z "${SUDO_PASS:-}" ] && ! sudo -n true 2>/dev/null; then
    echo "error: root or passwordless sudo is required to install packages and register the service." >&2
    echo "  - run as root (typical on a fresh VPS), or" >&2
    echo "  - re-run from a terminal that can prompt for sudo, or" >&2
    echo "  - set SUDO_PASS=<password> for non-interactive runs." >&2
    exit 1
  fi
}

SUDO() {
  if [ "$IS_ROOT" -eq 1 ]; then
    "$@"
  elif [ -n "${SUDO_PASS:-}" ]; then
    echo "$SUDO_PASS" | sudo -S "$@"
  else
    sudo "$@"
  fi
}

# ---------------------------------------------------------------------------
# Run user and base home
# ---------------------------------------------------------------------------
RUN_USER="${JAZZ_RUN_USER:-${SUDO_USER:-$(id -un)}}"
if ! id "$RUN_USER" >/dev/null 2>&1; then
  echo "error: run user '$RUN_USER' does not exist. Create it or set JAZZ_RUN_USER." >&2
  exit 1
fi
RUN_GROUP="$(id -gn "$RUN_USER")"

if [ "$RUN_USER" = root ]; then
  echo "warning: the service will run as root. This is not recommended — re-run as a normal" >&2
  echo "         user or set JAZZ_RUN_USER for a dedicated service account." >&2
fi

# Where files live by default. When installing as root on behalf of another
# user, anchor the defaults in that user's home so the service can reach them.
BASE_HOME="${HOME:-$(getent passwd "$RUN_USER" | cut -d: -f6 || true)}"
if [ "$IS_ROOT" -eq 1 ] && [ "$RUN_USER" != root ] && [ "$BASE_HOME" = /root ]; then
  BASE_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6 || true)"
  BASE_HOME="${BASE_HOME:-/home/$RUN_USER}"
fi
[ -n "$BASE_HOME" ] || BASE_HOME="/home/$RUN_USER"

VAULT="${JAZZ_VAULT:-$BASE_HOME/jazz-notes-vault}"
PORT="${PORT:-3180}"
ENV_FILE="${JAZZ_ENV_FILE:-${ENV_FILE:-$BASE_HOME/.config/jazz-note-server.env}}"
USERS_FILE="${JAZZ_GIT_USERS_FILE:-$BASE_HOME/.config/jazz-notes-git-users.json}"
GIT_USER="${JAZZ_GIT_USER:-jc}"
GIT_PASSWORD="${JAZZ_GIT_PASSWORD:-}"

# Directory this script runs from (empty for `curl | bash`).
SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

TMP_DIR="$(mktemp -d /tmp/jazz-notes-install.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

# ---------------------------------------------------------------------------
# 1. Dependencies: node (>= 18), git, curl, tar, openssl
# ---------------------------------------------------------------------------
MISSING=()
command -v node >/dev/null 2>&1 || MISSING+=(nodejs)
command -v git >/dev/null 2>&1 || MISSING+=(git)
command -v curl >/dev/null 2>&1 || MISSING+=(curl)
command -v tar >/dev/null 2>&1 || MISSING+=(tar)
command -v openssl >/dev/null 2>&1 || MISSING+=(openssl)
if [ "${#MISSING[@]}" -gt 0 ]; then
  echo "Installing missing packages: ${MISSING[*]}"
  need_sudo
  SUDO apt-get update
  SUDO apt-get install -y "${MISSING[@]}"
fi

NODE_VERSION="$(node --version 2>/dev/null || true)"
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 18 ]; then
  echo "error: Node.js 18 or newer is required, found '${NODE_VERSION:-none}'." >&2
  echo "       apt on this distro ships an old Node. Install a newer one, e.g. from" >&2
  echo "       https://github.com/nodesource/distributions, then re-run." >&2
  exit 1
fi
NODE_BIN="$(command -v node)"
echo "Node.js $NODE_VERSION ($NODE_BIN), git $(git --version 2>/dev/null | awk '{print $3}')"

# ---------------------------------------------------------------------------
# 2. Bundle: current dir, JAZZ_BUNDLE_SRC, or GitHub release
# ---------------------------------------------------------------------------
bundle_error() {
  echo "       Build the bundle locally instead and pass JAZZ_BUNDLE_SRC:" >&2
  echo "         git clone https://github.com/jazz-crab/jazz-notes && cd jazz-notes" >&2
  echo "         npm install && npm run web:build" >&2
  echo "         mkdir -p /tmp/jn-bundle && cp -r web/dist-server/server.js web/dist-server/node-sqlite3-wasm.wasm /tmp/jn-bundle/" >&2
  echo "         cp -r web/dist /tmp/jn-bundle/dist && cp deploy/post-receive deploy/jazz-notes-web.service deploy/install-server.sh /tmp/jn-bundle/" >&2
  echo "         JAZZ_BUNDLE_SRC=/tmp/jn-bundle /tmp/jn-bundle/install-server.sh" >&2
  exit 1
}

resolve_bundle() {
  # 1) the directory this script runs from is an unpacked bundle
  if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/server.js" ]; then
    BUNDLE_DIR="$SCRIPT_DIR"
    return 0
  fi
  # 2) explicit local bundle
  if [ -n "${JAZZ_BUNDLE_SRC:-}" ]; then
    if [ -f "$JAZZ_BUNDLE_SRC/server.js" ] || [ -f "$JAZZ_BUNDLE_SRC/dist-server/server.js" ]; then
      BUNDLE_DIR="$JAZZ_BUNDLE_SRC"
      return 0
    fi
    echo "error: JAZZ_BUNDLE_SRC=$JAZZ_BUNDLE_SRC does not look like a server bundle" >&2
    echo "       (expected server.js + dist/, or dist-server/server.js + dist after npm run web:build)." >&2
    exit 1
  fi
  # 3) download the latest published bundle from GitHub releases
  echo "Fetching the latest server bundle from GitHub releases..."
  local api out asset
  api="https://api.github.com/repos/jazz-crab/jazz-notes/releases/latest"
  out="$TMP_DIR/release.json"
  if ! curl -fsSL --max-time 30 -o "$out" "$api"; then
    echo "error: could not query $api (no published release, rate limit, or no network)." >&2
    bundle_error
  fi
  asset="$(node -e '
    const fs = require("fs");
    const rel = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const hit = (rel.assets || []).find((a) => /^jazz-note-server-.*\.tar\.gz$/.test(a.name));
    if (hit) console.log(hit.browser_download_url);
  ' "$out")"
  if [ -z "$asset" ]; then
    echo "error: the latest GitHub release has no jazz-note-server-*.tar.gz asset." >&2
    bundle_error
  fi
  echo "Downloading $asset"
  if ! curl -fsSL --max-time 120 -o "$TMP_DIR/bundle.tar.gz" "$asset"; then
    echo "error: failed to download $asset" >&2
    bundle_error
  fi
  mkdir -p "$TMP_DIR/bundle"
  tar -xzf "$TMP_DIR/bundle.tar.gz" -C "$TMP_DIR/bundle"
  BUNDLE_DIR="$TMP_DIR/bundle"
}

# Where the bundle is unpacked / served from. When the script runs from an
# unpacked bundle, that directory is the install dir by default.
LOCAL_BUNDLE=0
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/server.js" ]; then
  LOCAL_BUNDLE=1
fi
if [ "$LOCAL_BUNDLE" -eq 1 ] && [ -z "${JAZZ_INSTALL_DIR:-}" ]; then
  INSTALL_DIR="$SCRIPT_DIR"
else
  INSTALL_DIR="${JAZZ_INSTALL_DIR:-$BASE_HOME/jazz-notes-server}"
fi

resolve_bundle

# Locate the artifacts inside the bundle (flat release layout or repo layout).
if [ -f "$BUNDLE_DIR/server.js" ]; then
  BUNDLE_SERVER="$BUNDLE_DIR/server.js"
  BUNDLE_WASM="$BUNDLE_DIR/node-sqlite3-wasm.wasm"
  BUNDLE_CLIENT="$BUNDLE_DIR/dist"
elif [ -f "$BUNDLE_DIR/dist-server/server.js" ]; then
  BUNDLE_SERVER="$BUNDLE_DIR/dist-server/server.js"
  BUNDLE_WASM="$BUNDLE_DIR/dist-server/node-sqlite3-wasm.wasm"
  BUNDLE_CLIENT="$BUNDLE_DIR/dist"
else
  echo "error: bundle in '$BUNDLE_DIR' is incomplete — server.js not found." >&2
  echo "       Build it with npm run web:build and pass JAZZ_BUNDLE_SRC." >&2
  exit 1
fi

# systemd unit template: from the bundle / install dir (raw GitHub only when needed later).
UNIT_SRC=""
for candidate in "$BUNDLE_DIR/jazz-notes-web.service" "$BUNDLE_DIR/deploy/jazz-notes-web.service" "$SCRIPT_DIR/jazz-notes-web.service"; do
  if [ -n "$candidate" ] && [ -f "$candidate" ]; then
    UNIT_SRC="$candidate"
    break
  fi
done

# post-receive hook: from the bundle / install dir, or raw GitHub as a fallback.
HOOK_SRC=""
for candidate in "$BUNDLE_DIR/post-receive" "$BUNDLE_DIR/deploy/post-receive" "$SCRIPT_DIR/post-receive"; do
  if [ -n "$candidate" ] && [ -f "$candidate" ]; then
    HOOK_SRC="$candidate"
    break
  fi
done
if [ -z "$HOOK_SRC" ]; then
  echo "post-receive hook not found in the bundle — downloading it..."
  if ! curl -fsSL --max-time 30 -o "$TMP_DIR/post-receive" \
    "https://raw.githubusercontent.com/jazz-crab/jazz-notes/main/deploy/post-receive"; then
    echo "error: could not obtain deploy/post-receive (not in bundle, no network)." >&2
    exit 1
  fi
  HOOK_SRC="$TMP_DIR/post-receive"
fi

# ---------------------------------------------------------------------------
# 3. Copy artifacts into the install dir (self-contained for re-runs)
# ---------------------------------------------------------------------------
mkdir -p "$INSTALL_DIR"
if [ "$BUNDLE_DIR" != "$INSTALL_DIR" ]; then
  echo "Installing bundle into $INSTALL_DIR"
  cp "$BUNDLE_SERVER" "$INSTALL_DIR/server.js"
  if [ -f "$BUNDLE_WASM" ]; then
    cp "$BUNDLE_WASM" "$INSTALL_DIR/node-sqlite3-wasm.wasm"
  fi
  rm -rf "$INSTALL_DIR/dist"
  cp -r "$BUNDLE_CLIENT" "$INSTALL_DIR/dist"
fi
if [ ! -d "$INSTALL_DIR/dist" ]; then
  echo "warning: bundle has no dist/ — the web UI will be unavailable" >&2
fi

if [ -f "$BUNDLE_DIR/package.json" ]; then
  cp "$BUNDLE_DIR/package.json" "$INSTALL_DIR/package.json"
fi
if [ -f "$BUNDLE_DIR/README-server.md" ]; then
  cp "$BUNDLE_DIR/README-server.md" "$INSTALL_DIR/README-server.md"
fi
if [ -f "$BUNDLE_DIR/install-server.sh" ]; then
  cp "$BUNDLE_DIR/install-server.sh" "$INSTALL_DIR/install-server.sh"
fi
if [ -n "$HOOK_SRC" ] && [ "$INSTALL_DIR" != "$BUNDLE_DIR" ]; then
  cp "$HOOK_SRC" "$INSTALL_DIR/post-receive"
fi
if [ -n "$UNIT_SRC" ] && [ "$INSTALL_DIR" != "$BUNDLE_DIR" ]; then
  cp "$UNIT_SRC" "$INSTALL_DIR/jazz-notes-web.service"
fi

# ---------------------------------------------------------------------------
# 4. Env file (kept and only extended when it already exists)
# ---------------------------------------------------------------------------
env_key() { sed -n "s/^$1=//p" "$2" | tail -n 1; }
ensure_env_key() {
  local key="$1" def="${2:-}"
  if grep -qE "^$key=" "$ENV_FILE" 2>/dev/null; then
    return 0
  fi
  printf '%s=%s\n' "$key" "$def" >> "$ENV_FILE"
}

mkdir -p "$(dirname "$ENV_FILE")"
[ -f "$ENV_FILE" ] || : > "$ENV_FILE"

# Generate the token only when neither the file nor the environment has one.
TOKEN="${JAZZ_NOTE_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  TOKEN="$(env_key JAZZ_NOTE_TOKEN "$ENV_FILE")"
fi
if [ -z "$TOKEN" ]; then
  TOKEN="$(openssl rand -hex 24)"
fi

# Absorb values already present in the file so appended keys stay consistent.
ABSORB_VAULT="$(env_key JAZZ_VAULT "$ENV_FILE")"
ABSORB_PORT="$(env_key PORT "$ENV_FILE")"
ABSORB_USERS="$(env_key JAZZ_GIT_USERS_FILE "$ENV_FILE")"
[ -n "$ABSORB_VAULT" ] && VAULT="$ABSORB_VAULT"
[ -n "$ABSORB_PORT" ] && PORT="$ABSORB_PORT"
[ -n "$ABSORB_USERS" ] && USERS_FILE="$ABSORB_USERS"

ensure_env_key PORT "$PORT"
ensure_env_key JAZZ_VAULT "$VAULT"
ensure_env_key JAZZ_WEB_ROOT "$INSTALL_DIR/dist"
ensure_env_key JAZZ_NOTE_TOKEN "$TOKEN"
ensure_env_key JAZZ_BARE_REPO "$VAULT.git"
ensure_env_key JAZZ_GIT_USERS_FILE "$USERS_FILE"
chmod 600 "$ENV_FILE"

# The env file is the source of truth: re-read the final values.
PORT="$(env_key PORT "$ENV_FILE")"
VAULT="$(env_key JAZZ_VAULT "$ENV_FILE")"
BARE_REPO="$(env_key JAZZ_BARE_REPO "$ENV_FILE")"
USERS_FILE="$(env_key JAZZ_GIT_USERS_FILE "$ENV_FILE")"
TOKEN="$(env_key JAZZ_NOTE_TOKEN "$ENV_FILE")"
echo "Env:     $ENV_FILE (vault=$VAULT, port=$PORT)"

# ---------------------------------------------------------------------------
# 5. Vault + bare repository + post-receive hook
# ---------------------------------------------------------------------------
if [ "$VAULT" = "$BARE_REPO" ]; then
  echo "error: JAZZ_BARE_REPO must differ from JAZZ_VAULT." >&2
  exit 1
fi
mkdir -p "$VAULT"
echo "Vault:   $VAULT"
if [ ! -d "$BARE_REPO" ]; then
  echo "Creating bare repository $BARE_REPO (default branch: main)"
  # `-b main` needs git >= 2.28; fall back to symbolic-ref on older git.
  if ! git init --bare -b main "$BARE_REPO" >/dev/null 2>&1; then
    git init --bare "$BARE_REPO"
    git --git-dir="$BARE_REPO" symbolic-ref HEAD refs/heads/main
  fi
else
  echo "Bare repository $BARE_REPO already exists — keeping it"
fi
install -m 755 "$HOOK_SRC" "$BARE_REPO/hooks/post-receive"
echo "Hook:    $BARE_REPO/hooks/post-receive"

# ---------------------------------------------------------------------------
# 6. Git users file (preserve existing users; sha256(password) per user)
# ---------------------------------------------------------------------------
if [ -z "$GIT_USER" ]; then
  echo "error: JAZZ_GIT_USER must not be empty." >&2
  exit 1
fi
case "$GIT_USER" in
  *[!A-Za-z0-9._-]*)
    echo "error: JAZZ_GIT_USER may only contain A-Z a-z 0-9 . _ -" >&2
    exit 1
    ;;
esac

mkdir -p "$(dirname "$USERS_FILE")"
[ -f "$USERS_FILE" ] || : > "$USERS_FILE"

# Does the file already contain this login? Also validates the JSON.
USER_STATE="$(node - "$USERS_FILE" "$GIT_USER" <<'NODE'
const fs = require('fs');
const [file, login] = process.argv.slice(2);
let raw = '';
try { raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''; }
catch (e) { console.error('jazz-note: cannot read git-users file ' + file); process.exit(2); }
if (!raw.trim()) { console.log('missing'); process.exit(0); }
let u;
try { u = JSON.parse(raw); }
catch (e) { console.error('jazz-note: git-users file is not valid JSON: ' + file); process.exit(2); }
if (typeof u !== 'object' || u === null || Array.isArray(u)) {
  console.error('jazz-note: git-users file must be a JSON object: ' + file); process.exit(2);
}
console.log(Object.prototype.hasOwnProperty.call(u, login) ? 'exists' : 'missing');
NODE
)"

GIT_PASSWORD_SETUP=0
if [ "$USER_STATE" = "exists" ]; then
  echo "Git user '$GIT_USER' already in $USERS_FILE — keeping the existing password"
else
  if [ -z "$GIT_PASSWORD" ]; then
    GIT_PASSWORD="$(openssl rand -hex 12)"
  fi
  HASH="$(printf '%s' "$GIT_PASSWORD" | sha256sum | awk '{print $1}')"
  node - "$USERS_FILE" "$GIT_USER" "$HASH" <<'NODE' >/dev/null
const fs = require('fs');
const [file, login, hash] = process.argv.slice(2);
let u = {};
try { const raw = fs.readFileSync(file, 'utf8'); if (raw.trim()) u = JSON.parse(raw); } catch (e) {}
u[login] = hash;
fs.writeFileSync(file, JSON.stringify(u, null, 2) + '\n', 'utf8');
NODE
  GIT_PASSWORD_SETUP=1
  echo "Git user '$GIT_USER' added to $USERS_FILE"
fi
chmod 600 "$USERS_FILE"

# ---------------------------------------------------------------------------
# 7. Ownership for the service user
# ---------------------------------------------------------------------------
if [ "$IS_ROOT" -eq 1 ] && [ "$RUN_USER" != root ]; then
  chown -R "$RUN_USER:$RUN_GROUP" "$VAULT" "$BARE_REPO"
  chown "$RUN_USER:$RUN_GROUP" "$ENV_FILE" "$USERS_FILE" 2>/dev/null || true
  chown "$RUN_USER:$RUN_GROUP" "$(dirname "$ENV_FILE")" 2>/dev/null || true
  chown "$RUN_USER:$RUN_GROUP" "$(dirname "$USERS_FILE")" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# 8. systemd service
# ---------------------------------------------------------------------------
SERVICE_NAME="jazz-notes-web"
if [ "${SKIP_SYSTEMD:-0}" = "1" ]; then
  echo "skipped systemd (SKIP_SYSTEMD=1) — service not registered"
else
  if [ -z "$UNIT_SRC" ]; then
    echo "service unit not found in the bundle — downloading it..."
    if ! curl -fsSL --max-time 30 -o "$TMP_DIR/jazz-notes-web.service" \
      "https://raw.githubusercontent.com/jazz-crab/jazz-notes/main/deploy/jazz-notes-web.service"; then
      echo "error: could not obtain the systemd unit (not in bundle, no network)." >&2
      echo "       Re-run with SKIP_SYSTEMD=1 to skip systemd." >&2
      exit 1
    fi
    UNIT_SRC="$TMP_DIR/jazz-notes-web.service"
  fi
  need_sudo
  sed -e "s|__USER__|$RUN_USER|g" \
      -e "s|__GROUP__|$RUN_GROUP|g" \
      -e "s|__SERVER_DIR__|$INSTALL_DIR|g" \
      -e "s|__ENV_FILE__|$ENV_FILE|g" \
      -e "s|__NODE_BIN__|$NODE_BIN|g" \
      "$UNIT_SRC" > "$TMP_DIR/$SERVICE_NAME.unit"
  SUDO install -m 644 "$TMP_DIR/$SERVICE_NAME.unit" "/etc/systemd/system/$SERVICE_NAME.service"
  SUDO systemctl daemon-reload
  SUDO systemctl enable --now "$SERVICE_NAME"
  SERVICE_STATE="$(SUDO systemctl is-active "$SERVICE_NAME" 2>/dev/null || true)"
  echo "Service: $SERVICE_NAME ($SERVICE_STATE)"
fi

# ---------------------------------------------------------------------------
# 9. Summary
# ---------------------------------------------------------------------------
HOST=""
if command -v hostname >/dev/null 2>&1; then
  HOST="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  if [ -z "$HOST" ]; then
    HOST="$(hostname 2>/dev/null || true)"
  fi
fi
if [ -z "$HOST" ]; then
  HOST="localhost"
fi
BARE_NAME="$(basename "$BARE_REPO")"

echo
echo "JazzNote sync server is ready:"
echo "  Web UI:        http://$HOST:$PORT/"
echo "  Sync remote:   http://$HOST:$PORT/$BARE_NAME"
echo "  Git login:     $GIT_USER"
if [ "$GIT_PASSWORD_SETUP" -eq 1 ]; then
  echo "  Git password:  $GIT_PASSWORD   (keep it secret; connect devices with these credentials)"
else
  echo "  Git password:  (unchanged — existing user '$GIT_USER' kept)"
fi
echo "  API token:     $TOKEN   (X-Auth-Token header for POST /api/note)"
echo
echo "Connect a device in Settings -> Sync with the Sync remote URL and the Git login/password."
