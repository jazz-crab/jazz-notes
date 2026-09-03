[English](README.md) | [Русский](README_ru.md)

# JazzNote

Second Brain — a local-first Markdown note-taking app with Obsidian-style inline live preview.

Built with Electron + React + TypeScript on top of CodeMirror 6. Notes live as plain `.md` files on your disk — no lock-in, no database, fully yours.

Inspired by [Obsidian](https://obsidian.md): a plain-Markdown vault with inline live preview, designed to feel familiar to Obsidian users.

**Status:** early stage, already usable for daily notes.

## Features

### Editing
- **Inline live preview** — `# Heading`, `**bold**`, links and lists render right in the editor (Obsidian-style)
- **Code fence highlighting** — JS/TS, Python, Go, Rust, Ruby, Swift, Shell, TOML, Dockerfile, HTML, CSS, JSON, YAML, Markdown, Java, C/C++, PHP, SQL, XML
- **Per-note undo/redo** — seeded from the git history (up to 500 versions) and extended live, so `Ctrl/Cmd+Z` can walk a note back to its very first saved state; step-counter toast
- **Keyboard shortcuts** — `Ctrl/Cmd+S` save, `Ctrl/Cmd+Z` undo, `Shift+Ctrl/Cmd+Z` / `Ctrl/Cmd+Y` redo

### Notes
- **Plain Markdown files** in a vault folder (customizable — pick any folder in Settings; defaults to `~/Documents/jazz-notes-vault`, auto-created)
- **Full CRUD** — create, edit, delete notes and folders; **nested folders** at any depth
- **Right-click menu** — on a note: rename, move to a folder, change date/color, delete; on a folder: rename, move (into another folder or to root), delete
- **New note goes to the selected folder** — when a folder is active in the sidebar, new notes are created inside it; a new folder is created inside the selected one too. The vault root is selectable (named after the storage folder), so you can create notes and folders at the root level as well
- **Search** — full-text via a SQLite FTS5 index (`.jazz/index.db` inside the vault, kept in sync on every change); instant results with snippet highlighting on both desktop and web
- **Filters** — All / Today / Tomorrow / This week / Later / No date
- **Sorting** — by last updated / created / due date
- **Metadata** — title, due date, color, auto-assigned ID, created/updated timestamps; the note color highlights the card in the list and the **editor background/text**; a **folder pill badge** marks notes living inside a folder
- **Countdown to the next due note** — always visible at the top of the main screen, ticks in real time; can be hidden (the × on the bar or a toggle in Settings), preference is remembered

### Reliability
- **Debounced autosave** (400 ms on text, immediate on leaving a note) with a live save-status indicator (idle → dirty → saving → saved/error)
- **File watcher** (chokidar) — external edits are picked up automatically
- **Single-instance app**, context-isolated preload bridge, no menu chrome
- **Unit tests (Vitest) + CI** — GitHub Actions runs tests and builds on every push

### Sync & versioning
- **Git-backed vault** — the notes folder is a git repository; every autosave becomes a commit, so nothing is lost
- **No system git required** — all git operations are handled in-process by a pure-JS engine (isomorphic-git), so the app works on any machine without installing anything
- **Per-note version history** — a history button in the editor lists past versions; preview any version and restore it (restores are new commits, nothing is rewritten)
- **Sync engine** — push/pull/merge against a git remote (URL, login and token editable in Settings). Non-conflicting changes merge automatically. It works with any git remote you host yourself (e.g. a GitHub repo); to host the vault on your own JazzNote server instead, one command sets one up — see the Self-hosted sync server block under [Server deployment](#server-deployment) and `deploy/install-server.sh`
- **Auto-sync** — syncs automatically 3 seconds after the last save when notes change; a quick pull/merge runs when the app window regains focus; toggleable in Settings (Sync), only active when a remote server is configured
- **Multi-device onboarding** — share the server URL, login and token as a **QR code** or a copyable string; on another device scan the QR or paste the string to connect
- **Sync indicator** — a dot in the top-right corner: green = synced, yellow = server unavailable, red = error, orange = conflicts; click for details, a manual sync button and conflict resolution
- **Conflict resolution** — when the same file was changed on both sides, pick local or server version per file (with a preview) and apply

### Appearance
- **3 palettes** — TokyoNight, Everforest, Catppuccin — each with **dark and light** variants
- **5 Monaspace fonts** (Argon, Neon, Krypton, Xenon, Radon) + Nerd Font icons
- **UI zoom** — scale the whole interface from 75% to 200%: `Ctrl/Cmd` + `+`/`-` zooms in/out, `Ctrl/Cmd` + `0` resets to 100%, `Ctrl` + mouse wheel zooms too; adjustable in Settings → Appearance and persisted
- Per-note **color** and **date** pickers; overdue dates turn red
- **Bilingual UI** — Русский / English, switchable in Settings and persisted

## Tech stack

| Layer | Tech |
|-------|------|
| Shell | Electron 43 |
| UI | React 19 + TypeScript + Zustand |
| Editing | CodeMirror 6 via `@atomic-editor/editor` |
| Build | electron-vite, electron-builder |
| Watching | chokidar |
| Console | TypeScript CLI (`node dist/cli.js`), shared core in `src/shared/service.ts` |

## Getting started

```bash
npm install
npm run dev
```

Production build and packaging (AppImage + deb on Linux):

```bash
npm run build
npm run dist
```

Unit tests (Vitest):

```bash
npm run test
```

End-to-end sync test (Vitest) — drives two independent vaults against a real git
remote (the rentgen server by default) and verifies create → pull → edit → pull → delete:

```bash
npm run test:e2e
```

It targets `https://notes.rentgen.su/jazz-notes-vault.git` with the configured
credentials; point it elsewhere (and keep prod clean) via the env overrides
`JAZZ_E2E_REMOTE`, `JAZZ_E2E_USER` and `JAZZ_E2E_PASS`. The e2e suite is excluded
from `npm run test`.

## How notes are stored

Notes are plain `.md` files in the vault (the path is chosen in Settings or via `JAZZ_VAULT` for CLI/web), optionally nested in folders. Each file carries a small frontmatter block:

```
~/Documents/jazz-notes-vault/
├── 00001.md
└── subfolder/
    └── 00002.md
```

```markdown
---
title: "My note"
id: "00001"
due: "2026-08-06T14:30"
color: "blue"
created: "2026-08-05T00:00:00.000Z"
updated: "2026-08-06T00:00:00.000Z"
---

# My note
Body text…
```

Supported frontmatter keys: `title`, `id`, `priority` (0–4), `due`, `color`, `created`, `updated`, `tags`. The parser handles quoted values with escaping, unquoted scalars, and `---` lines inside the body.

App preferences (palette, theme, language, font, UI zoom, notes vault path) are persisted in `localStorage` under `jazz-settings`.

## Web (browser) version

The same renderer UI runs in the browser against the same vault, served by a small Node.js server (`web/`) that reuses the app's git and save logic.

Build and run locally:

```bash
npm run web:build   # builds the client (web/dist) and the server bundle (web/dist-server/server.js)
npm run web:dev     # vite dev server for the browser UI
npm run web:preview # preview of the built client
```

The server (run with `node web/dist-server/server.js`) exposes the vault via the same `jazz` API the desktop app uses. Env vars:

| Var | Default | Meaning |
|-----|---------|---------|
| `JAZZ_VAULT` | none (required) | Path to the notes vault. **Required** — the server refuses to start without it. |
| `PORT` | `3180` | HTTP port |
| `JAZZ_WEB_ROOT` | `web/dist` | Static client root |
| `JAZZ_API_USERS` | `~/.config/jazz-notes-api-users.json` | JSON file of `user` → SHA-256(password) for `/api/*` auth (all except `/api/note`) |

Unlike the desktop app, the server does **not** auto-create the vault: if the `JAZZ_VAULT` folder does not exist, the UI shows a «Notes folder not found» message and blocks note creation until the folder is created or `JAZZ_VAULT` points to an existing directory.

### Receiving notes over HTTP

`POST /api/note` creates one or more notes from plain JSON — useful for phone/curl/automation. Requires the `X-Auth-Token` header (env `JAZZ_NOTE_TOKEN`); if the token is not set, the endpoint is disabled.

```bash
curl -H 'X-Auth-Token: your-token' -H 'Content-Type: application/json' \
  -d '{"title":"Quick note","text":"body","folder":"inbox","due":"2026-08-15","color":"red","priority":2,"tags":["work"]}' \
  https://notes.example.com/api/note
```

An array of note objects is accepted too. Allowed fields: `title`, `text`, `folder`, `due`, `color`, `priority`, `tags`. Notes go through the same saver as the app: IDs are auto-assigned, frontmatter is generated, autosave commits are scheduled.

### API authentication

Every `/api/*` endpoint **except `POST /api/note`** requires a user/password check. Credentials can be provided either as an HTTP Basic `Authorization` header or as `user` + `password` fields in the JSON body (the fields are stripped before the payload is processed):

```bash
# Basic header
curl -u jc:secret https://notes.example.com/api/tree

# user/password in the body
curl -X POST https://notes.example.com/api/create \
  -H 'Content-Type: application/json' \
  -d '{"user":"jc","password":"secret","title":"Idea","text":"body","folder":"inbox"}'
```

Users are read from a JSON file of `user` → SHA-256(password) pairs, set via the env var `JAZZ_API_USERS` (defaults to `~/.config/jazz-notes-api-users.json`):

```json
{ "jc": "<sha256 hex of the password>" }
```

### Android wrapper app

`android/` contains a minimal WebView wrapper that opens the web version in a full-screen Android app. Build it with the Android SDK/Gradle and the usual `./gradlew assembleRelease`; it just loads the configured server URL.

### Server deployment

Every release ships a self-contained server bundle — `jazz-note-server-<version>.tar.gz` (available on the [Releases](https://github.com/jazz-crab/jazz-note/releases) page). It needs **only Node.js**; all other dependencies are compiled into `server.js`. The bundle contains `server.js`, the static client (`dist/`), and two installers: `install.sh` for a plain web deployment (web UI + `POST /api/note`) and `install-server.sh` for the full sync server described below. `install.sh` sets everything up on a systemd host:

```bash
tar -xzf jazz-note-server-<version>.tar.gz
cd jazz-note-server-<version>
./install.sh
```

`install.sh` installs Node.js via apt if missing, creates the vault (`~/jazz-notes-vault`), writes an env file with a generated `JAZZ_NOTE_TOKEN`, and registers a `jazz-notes-web` systemd service. Running it again upgrades the bundle while reusing the existing vault and env file.

**Self-hosted sync server.** One command turns any Debian/Ubuntu VPS with systemd into a full JazzNote sync server — the vault is served over **git smart HTTP** (fetch/push with per-user passwords) next to the web UI:

```bash
curl -fsSL https://raw.githubusercontent.com/jazz-crab/jazz-notes/main/deploy/install-server.sh | bash
```

`deploy/install-server.sh` installs Node.js and git, creates the vault and a bare repository with a post-receive hook (pushes land in the vault immediately), writes an env file with a generated API token, creates a git-access user, and registers a `jazz-notes-web` systemd service. The output prints the web UI URL, the sync remote (`http://host:port/<name>.git`) and the credentials to enter on each device under **Settings → Sync**. Re-running it upgrades the server while keeping the vault, users and token. Full reference and all variables: `deploy/README-server.md`.

Manual run (any host with Node.js):

```bash
export JAZZ_VAULT=/home/user/Documents/jazz-notes-vault   # required, absolute path
export JAZZ_NOTE_TOKEN=<secret>
node server.js   # listens on PORT (default 3180)
```

## CLI & automation

Every core operation of the app is reachable from the terminal. The CLI is a thin adapter over the same shared core (`src/shared/service.ts`) that the Electron IPC and the web server use, so the note format, IDs and git behavior are identical across desktop, web and console.

Build the CLI bundle and run it:

```bash
npm run cli:build       # bundles src/cli/index.ts into dist/cli.js
npm run cli path        # npm run cli == node dist/cli.js
node dist/cli.js list   # or invoke the bundle directly
```

| Command | Description |
|---------|-------------|
| `path` | Print the vault path |
| `list` | List notes as `relPath<TAB>title` |
| `read <rel>` | Print a note's raw content |
| `write <rel> [--content <t>]` | Write raw content; reads stdin if `--content` is omitted |
| `create <title> [--text <t>] [--folder <f>] [--due <d>] [--color <c>] [--priority <0-4>] [--tags <a,b>]` | Create a note; prints its relative path |
| `delete <rel>` | Delete a file |
| `mkdir <rel>` | Create a directory |
| `rmdir <rel>` | Remove a directory recursively |
| `mv <from> <to>` | Rename / move within the vault |
| `git commit [--message <m>]` | Commit changes (default message `autosave`) |
| `git sync [--user <u>] [--password <p>]` | Push / pull against the configured remote |
| `git history [--rel <rel>] [--limit <n>]` | Show git history |
| `git show <rel> <hash>` | Show a file at a given commit |
| `git restore <rel> <hash>` | Restore a file version (new commit) |
| `git-users list` | List git smart HTTP users on the server |
| `git-users add <login> [--password <p>]` | Add a git smart HTTP user (password is read from stdin if `--password` is omitted) |
| `git-users remove <login>` | Remove a git smart HTTP user |
| `git-users set-password <login> [--password <p>]` | Change a git smart HTTP user's password (read from stdin if `--password` is omitted) |
| `git-users rename <old> <new>` | Rename a git smart HTTP user |

`git-users` commands manage the git smart HTTP users of the server deployment (run them on the server host); the users file location is set via `JAZZ_GIT_USERS_FILE`.

Examples:

```bash
node dist/cli.js path
node dist/cli.js list
node dist/cli.js create "Quick note" --text "body" --folder inbox --due 2026-08-15 --color red --priority 2 --tags work,jazz
node dist/cli.js write 00002.md --content "# Title\nBody"
node dist/cli.js git commit --message "wip"
```

`JAZZ_VAULT` is required: without it the CLI prints an error to stderr and exits with code 1. Pass an absolute path (Node does not expand `~`). Like the web server, the CLI does not auto-create the vault. A standalone compiled binary for the CLI is planned (issue #37).

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the current development plan.

## License

MIT
