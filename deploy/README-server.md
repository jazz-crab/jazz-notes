# JazzNote server bundle

A self-contained web server for JazzNote. It serves the same browser UI and
the same `jazz` API against a vault on disk, and it serves that vault over
**git smart HTTP** so devices can sync against it. The bundle needs **only
Node.js 18+** plus the **git** binary — everything else is compiled in.

## Contents

- `server.js` — the server (Node.js, single file; spawns `git-upload-pack` /
  `git-receive-pack`, so git must be in the service PATH)
- `node-sqlite3-wasm.wasm` — sqlite build used by the search index
- `dist/` — the static browser client
- `jazz-notes-web.service` — systemd unit template
- `post-receive` — git hook that checks every push out into the vault
- `install.sh` — legacy install helper (web UI + `POST /api/note` only)
- `install-server.sh` — **full installer** (web UI + git smart HTTP + auth)
- `package.json` — stub (`npm start` = `node server.js`)

## One-command install (Ubuntu/Debian with systemd)

The full installer provisions everything: Node.js and git (via apt if
missing), the vault, the bare repository with the post-receive hook, the env
file, the git-access user, and a `jazz-notes-web` systemd service.

```bash
# from the released bundle (recommended):
curl -fsSL https://github.com/jazz-crab/jazz-notes/releases/latest/download/install-server.sh | bash
```

The released bundle contains `install-server.sh`; you can also run it straight
from the repository (this variant downloads the latest published
`jazz-note-server-<tag>.tar.gz` itself):

```bash
curl -fsSL https://raw.githubusercontent.com/jazz-crab/jazz-notes/main/deploy/install-server.sh | bash
```

If no GitHub release with a `jazz-note-server-*.tar.gz` asset has been
published yet, the script prints an error and tells you how to build a local
bundle and pass it via `JAZZ_BUNDLE_SRC`:

```bash
git clone https://github.com/jazz-crab/jazz-notes && cd jazz-notes
npm install && npm run web:build
mkdir -p /tmp/jn-bundle
cp -r web/dist-server/server.js web/dist-server/node-sqlite3-wasm.wasm /tmp/jn-bundle/
cp -r web/dist /tmp/jn-bundle/dist
cp deploy/post-receive deploy/jazz-notes-web.service deploy/install-server.sh /tmp/jn-bundle/
JAZZ_BUNDLE_SRC=/tmp/jn-bundle /tmp/jn-bundle/install-server.sh
```

Running the script inside an already-unpacked bundle works too: it detects
`server.js` next to it and uses that directory.

`install-server.sh` does, in order:

1. installs **Node.js (>= 18)**, **git**, curl, tar and openssl via apt when
   missing (root can run it directly; otherwise passwordless sudo or
   `SUDO_PASS=<password>` is required — see below);
2. fetches the server bundle (local dir, `JAZZ_BUNDLE_SRC`, or GitHub
   release) and unpacks it into the install dir;
3. creates the vault and the bare repository
   `git init --bare -b main <vault>.git`;
4. installs the **post-receive hook** — after every push the vault is checked
   out, so the web UI immediately sees what devices pushed;
5. writes the **env file** with a generated `JAZZ_NOTE_TOKEN` (kept and only
   extended when the file already exists);
6. creates the **git-access user** (`jc` by default) in the users file with a
   `sha256(password)` hash — existing users are preserved;
7. registers and starts the `jazz-notes-web` systemd service.

Run it as root on a fresh VPS, or as a normal sudo user. Without a TTY and
without passwordless sudo, pass `SUDO_PASS=<password>`.

### Environment variables (install-server.sh)

All are optional:

| Variable | Default | Meaning |
|----------|---------|---------|
| `JAZZ_VAULT` | `~/jazz-notes-vault` | Vault directory |
| `PORT` | `3180` | HTTP port |
| `JAZZ_INSTALL_DIR` | `~/jazz-notes-server` | Where the bundle is unpacked |
| `JAZZ_BUNDLE_SRC` | *(empty)* | Local dir with a built bundle (`server.js` + `dist/`); skips the GitHub download |
| `JAZZ_NOTE_TOKEN` | *(generated)* | Token for `POST /api/note` |
| `JAZZ_GIT_USER` | `jc` | Primary git-access login |
| `JAZZ_GIT_PASSWORD` | *(generated, printed)* | Primary git-access password |
| `JAZZ_ENV_FILE` | `~/.config/jazz-note-server.env` | Env file path |
| `JAZZ_GIT_USERS_FILE` | `~/.config/jazz-notes-git-users.json` | Git-users JSON path |
| `JAZZ_RUN_USER` | `$SUDO_USER` or current user | systemd service user |
| `SUDO_PASS` | *(empty)* | Sudo password for non-interactive runs |
| `SKIP_SYSTEMD` | *(unset)* | `1` skips systemd registration (tests / manual runs) |

Run `curl … | bash` with `export`ed variables, e.g.:

```bash
export PORT=8443
export JAZZ_GIT_USER=me
export JAZZ_GIT_PASSWORD='a long passphrase'
curl -fsSL https://raw.githubusercontent.com/jazz-crab/jazz-notes/main/deploy/install-server.sh | bash
```

Re-running the installer upgrades the server and keeps the vault, the git
users, the API token and the env file.

## Installer output and connecting devices

The installer prints a summary like this:

```text
JazzNote sync server is ready:
  Web UI:        http://203.0.113.10:3180/
  Sync remote:   http://203.0.113.10:3180/jazz-notes-vault.git
  Git login:     jc
  Git password:  a1b2c3d4e5f6a7b8c9d0e1f2   (keep it secret; connect devices with these credentials)
  API token:     …                            (X-Auth-Token header for POST /api/note)
```

On every device, open **Settings → Sync** and enter:

- **Server**: the `Sync remote` URL, e.g. `http://203.0.113.10:3180/jazz-notes-vault.git`
  (the repository name in the URL is ignored by the server — only the suffix
  matters — but keep the same URL on all devices);
- **Login / Password**: the printed `Git login` / `Git password`.

The sync remote is also shareable as a QR code or copyable string from the
desktop app. From the CLI, sync the local vault with:

```bash
node dist/cli.js git sync --user jc --password '<password>'
```

(requires the remote to be configured — in the app settings or a prior
`gitEnsure` — and `JAZZ_VAULT` pointing at the vault).

The web UI runs against the server's own vault copy, which the post-receive
hook keeps in sync with every push. Note that the server does **not**
auto-push local web edits to the bare repository — use one device as the
authoritative writer, or push from the CLI/UI after web edits.

## Server environment variables

The env file (`~/.config/jazz-note-server.env`) is loaded by systemd and
contains:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3180` | HTTP port |
| `JAZZ_VAULT` | *(required)* | Path to the notes vault; the server refuses to start without it |
| `JAZZ_WEB_ROOT` | `<install dir>/dist` | Static client root |
| `JAZZ_NOTE_TOKEN` | *(empty)* | Token for `POST /api/note`; empty disables the endpoint |
| `JAZZ_API_USERS` | `~/.config/jazz-notes-api-users.json` | JSON file of `user` → SHA-256(password); guards all `/api/*` except `/api/note` |
| `JAZZ_BARE_REPO` | `<JAZZ_VAULT>.git` | Path to the bare repository served over git smart HTTP |
| `JAZZ_GIT_USERS_FILE` | `~/.config/jazz-notes-git-users.json` | JSON file with git-access users (login → sha256 of password) |

## API authentication (all endpoints except /api/note)

Every other `/api/*` endpoint requires credentials, either as an HTTP Basic
`Authorization` header or as `user` + `password` in the JSON body:

```bash
curl -u jc:secret http://host:3180/api/tree
curl -X POST http://host:3180/api/create \
  -H 'Content-Type: application/json' \
  -d '{"user":"jc","password":"secret","title":"Idea","text":"body","folder":"inbox"}'
```

## Git / smart HTTP

The server serves the vault's bare repository over **git smart HTTP** for
fetch/push. Git requests are matched by URL suffix (`/info/refs`,
`/git-upload-pack`, `/git-receive-pack`), authenticated with HTTP **Basic
auth**, and handled by spawning the system **git** binaries
(`git-upload-pack` / `git-receive-pack`) — so git must be installed and in the
PATH of the service user, and that user must have write access to both the
bare repository and the vault.

Git-access users live in the users file (`JAZZ_GIT_USERS_FILE`), a JSON object
mapping `login` → `sha256(password)`. Manage them with the CLI on the server
(`node dist/cli.js git-users …` — `list`, `add`, `remove`, `set-password`,
`rename`) or via the installer. If the users file is empty or missing when the
server starts, the server creates the default account `jc` / `1991` — the
installer writes the file *before* first start precisely to avoid that. If no
git-access users exist, git access is closed (401).

The **post-receive hook** in the bare repository checks every successful push
out into the vault (`git --work-tree=$JAZZ_VAULT checkout -f`) and updates
`info/refs`. It reads `JAZZ_VAULT` from the service environment or from the
env file, so it works without extra configuration.

## Creating notes over HTTP

```bash
curl -H 'X-Auth-Token: <token>' -H 'Content-Type: application/json' \
  -d '{"title":"Quick note","text":"body","folder":"inbox"}' \
  http://host:3180/api/note
```

## Manual run

```bash
export JAZZ_VAULT=~/jazz-notes-vault
export JAZZ_NOTE_TOKEN=<secret>
node server.js   # listens on PORT (default 3180)
```

## Upgrade

```bash
curl -fsSL …/install-server.sh | bash     # or unpack the new bundle and run ./install-server.sh
```

The installer reuses the existing vault, env file and git users, and simply
replaces the bundle and restarts the service.
