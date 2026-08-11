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
- **Plain Markdown files** in a vault folder (customizable — pick any folder in Settings; defaults to `~/Documents/jazz-notes`, auto-created)
- **Full CRUD** — create, edit, delete notes and folders; **nested folders** at any depth
- **Right-click menu** — on a note: rename, move to a folder, change date/color, delete; on a folder: rename, move (into another folder or to root), delete
- **New note goes to the selected folder** — when a folder is active in the sidebar, new notes are created inside it; a new folder is created inside the selected one too. The vault root is selectable (named after the storage folder), so you can create notes and folders at the root level as well
- **Search** — full-text over title and body, case-insensitive
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
- **Sync engine** — push/pull/merge against a git remote (URL, login and token editable in Settings). Non-conflicting changes merge automatically. You point it at a remote you host yourself (e.g. a GitHub repo); JazzNote does not host a vault server yet — see [ROADMAP](ROADMAP.md) (issue #8)
- **Multi-device onboarding** — share the server URL, login and token as a **QR code** or a copyable string; on another device scan the QR or paste the string to connect
- **Sync indicator** — a dot in the top-right corner: green = synced, yellow = server unavailable, red = error, orange = conflicts; click for details, a manual sync button and conflict resolution
- **Conflict resolution** — when the same file was changed on both sides, pick local or server version per file (with a preview) and apply

### Appearance
- **3 palettes** — TokyoNight, Everforest, Catppuccin — each with **dark and light** variants
- **5 Monaspace fonts** (Argon, Neon, Krypton, Xenon, Radon) + Nerd Font icons
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

## How notes are stored

Notes are plain `.md` files in the vault, optionally nested in folders. Each file carries a small frontmatter block:

```
~/Documents/jazz-notes/
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

App preferences (palette, theme, language, font, notes vault path) are persisted in `localStorage` under `jazz-settings`.

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
| `JAZZ_VAULT` | `~/jazz-notes` | Path to the notes vault |
| `PORT` | `3180` | HTTP port |
| `JAZZ_WEB_ROOT` | `web/dist` | Static client root |

### Receiving notes over HTTP

`POST /api/note` creates one or more notes from plain JSON — useful for phone/curl/automation. Requires the `X-Auth-Token` header (env `JAZZ_NOTE_TOKEN`); if the token is not set, the endpoint is disabled.

```bash
curl -H 'X-Auth-Token: your-token' -H 'Content-Type: application/json' \
  -d '{"title":"Quick note","text":"body","folder":"inbox","due":"2026-08-15","color":"red","priority":2,"tags":["work"]}' \
  https://notes.example.com/api/note
```

An array of note objects is accepted too. Allowed fields: `title`, `text`, `folder`, `due`, `color`, `priority`, `tags`. Notes go through the same saver as the app: IDs are auto-assigned, frontmatter is generated, autosave commits are scheduled.

### Server deployment

Every release ships a self-contained server bundle — `jazz-note-server-<version>.tar.gz` (available on the [Releases](https://github.com/jazz-crab/jazz-note/releases) page). It needs **only Node.js**; all other dependencies are compiled into `server.js`. The bundle contains `server.js`, the static client (`dist/`), and an `install.sh` that sets everything up on a systemd host:

```bash
tar -xzf jazz-note-server-<version>.tar.gz
cd jazz-note-server-<version>
./install.sh
```

`install.sh` installs Node.js via apt if missing, creates the vault (`~/jazz-notes`), writes an env file with a generated `JAZZ_NOTE_TOKEN`, and registers a `jazz-note-server` systemd service. Running it again upgrades the bundle while reusing the existing vault and env file.

Manual run (any host with Node.js):

```bash
export JAZZ_VAULT=~/jazz-notes
export JAZZ_NOTE_TOKEN=<secret>
node server.js   # listens on PORT (default 3180)
```

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the current development plan.

## License

MIT
