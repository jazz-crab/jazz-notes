# JazzNote server bundle

A self-contained web server for JazzNote. It serves the same browser UI and
the same `jazz` API against a vault on disk. The bundle needs **only Node.js** —
all other dependencies are compiled in.

## Contents

- `server.js` — the server (Node.js, single file)
- `dist/` — the static browser client
- `install.sh` — install helper
- `jazz-note-server.service` — systemd unit template
- `package.json` — stub (`npm start` = `node server.js`)

## Install (Ubuntu/Debian with systemd)

```bash
tar -xzf jazz-note-server-<version>.tar.gz
cd jazz-note-server-<version>
./install.sh
```

`install.sh`:

1. installs Node.js via `apt` if it is missing;
2. creates the vault directory (`~/jazz-notes` by default, `JAZZ_VAULT` to override);
3. writes an env file at `~/.config/jazz-note-server.env` with a generated
   `JAZZ_NOTE_TOKEN` (keep it secret — it guards `POST /api/note`);
4. installs and starts a `jazz-note-server` systemd service.

It needs `sudo` to install Node and register the service.

## Manual run

```bash
export JAZZ_VAULT=~/jazz-notes
export JAZZ_NOTE_TOKEN=<secret>
node server.js   # listens on PORT (default 3180)
```

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3180` | HTTP port |
| `JAZZ_VAULT` | `~/jazz-notes` | Vault directory |
| `JAZZ_WEB_ROOT` | `./dist` | Static client root |
| `JAZZ_NOTE_TOKEN` | *(empty)* | Token for `POST /api/note`; empty disables the endpoint |

## Creating notes over HTTP

```bash
curl -H 'X-Auth-Token: <token>' -H 'Content-Type: application/json' \
  -d '{"title":"Quick note","text":"body","folder":"inbox"}' \
  http://host:3180/api/note
```

## Upgrade

```bash
tar -xzf jazz-note-server-<new-version>.tar.gz
cd jazz-note-server-<new-version>
./install.sh          # reuses the existing env file and vault
```
