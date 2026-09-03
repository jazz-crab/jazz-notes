# JazzNote — Roadmap

Current status: the MVP is complete and usable — note CRUD, Obsidian-style live preview, autosave, themes, search/filters, per-note undo/redo.

Legend: `[x] done · [ ] next · [~] deferred`

## Next up

### Usability
- [x] **English UI (i18n)** — the i18n dictionary and `t()` helper are wired through the whole UI; language switch in Settings (Русский / English), persisted.
- [x] **Custom vault path** — pick any folder as the notes vault via a system dialog (Settings → Notes folder) and persist the choice.
- [x] **Folders** — rename and delete folders (deleting non-empty folders works), and create new notes inside the currently selected folder.
- [x] **Nested folders** — folders can nest at any depth; a folder can be moved into another folder or to root via the right-click menu.
- [x] **Note context menu** — right-click on a note: rename, change date, change color, delete.
- [x] **Countdown to the next due note** — a live-updating bar at the top of the main screen; hideable via the × or a Settings toggle, the preference is remembered.
- [x] **Vim-style hotkeys** — keyboard navigation without mouse: `j`/`k` to move between notes, `gg`/`G` to jump to first/last note, `/` to focus search, `r` to rename, `d`/`x` to delete, `n` to create, `Enter`/`o` to open.

### Correctness & cleanup
- [x] **Code highlighting languages** — Java, C/C++, PHP, SQL, XML CodeMirror language packages added; highlighting works.
- [x] **Robust frontmatter parser** — quoted values with escaping, `---` inside the body no longer breaks parsing, unquoted scalar values, ISO dates.
- [x] **Dead code cleanup** — removed unused IPC handlers (`notes:readDir`, `notes:writeFileSync`, `shell:openPath`) and `theme/codemirror.ts`; `notes:deleteDir` now uses `fs.rm` for non-empty directories.
- [x] **Watcher efficiency** — the file watcher reload is debounced so a burst of events triggers one scan; self-saves are ignored.

### Reminders & notifications
- [ ] **Note reminders/alarms** — notes already carry a `due` date; surface them as system notifications and integrate with the OS (Task Scheduler on Windows, calendar/alarm on Android, etc.).

### Engineering
- [x] **Tests + CI** — unit tests for the frontmatter parser, i18n, color, debounce, and fonts utilities (Vitest); a GitHub Actions workflow runs tests and the build on every push/PR.
- [x] **Packaging + beta releases** — Linux (AppImage/deb/pacman) + Windows (NSIS); GitHub Actions builds and publishes releases with ready-to-download binaries on every `v*` tag.
- [x] **Console-first CLI** — every core operation reachable from the terminal (`list/read/write/create/delete/mkdir/rmdir/mv/git*`), sharing the same typed core (`src/shared/service.ts`) as the Electron IPC and the web server. Tracks issue #7.
- [ ] **Full UI↔CLI parity** — EVERYTHING doable in the UI must be doable from the terminal with no UI running (rename / meta changes / move / search / folders / settings / sync + server-side git-users via CLI). So `node jazz-notes add-note "..."` creates a note, bindable to a hotkey / cron / integration. See issue #7.
- [ ] **Standalone native binary** — build a self-contained executable from the same core (Bun `--compile` / electron-builder) that works without Node.js and without any UI, incl. a Windows `.exe`. Install and drive fully from the terminal. See issue #7.

### Sync & versioning
- [x] **Git-backed vault** — the notes folder is initialized as a git repository; every autosave (400 ms debounce) and settings change become commits.
- [x] **Per-note version history** — a dialog in the editor lists versions (hash, date, message) with preview and restore via a new commit.
- [x] **Undo/redo to the first version** — the undo stack is seeded from the git history (up to 500 versions) when a note is opened.
- [x] **Sync engine** — push/pull/merge against a git remote (URL, login and token editable in Settings); non-conflicting changes merge automatically. Works with any reachable remote the user hosts themselves (e.g. a GitHub repo).
- [x] **No system git required** — all git operations run in-process on a pure-JS engine (isomorphic-git); works on any device without installing git.
- [x] **Sync indicator** — green/yellow/red/orange dot in the top-right corner with details on click.
- [x] **Conflict resolution** — pick local or remote version per conflicting file with preview.
- [x] **Multi-device onboarding** — share the remote URL, login and token as a QR code or a copyable string; import by scanning or pasting on another device.
- [x] **Auto-sync** — automatic sync 3 seconds after note changes + quick sync on window focus; toggle in Settings.
- [x] **E2E two-device sync test** — a Vitest e2e test (`e2e/two-device-sync.test.ts`) that drives two independent vaults against a real git remote and verifies create → pull → edit → pull → delete end to end (`npm run test:e2e`).
- [x] **One-command sync-server installer** — `deploy/install-server.sh` provisions a ready-made sync server (git smart HTTP + web UI + auth) on a systemd VPS in one go: installs Node.js and git, creates the vault and a bare repository with the post-receive hook, writes env and git-users files, and registers the `jazz-notes-web` systemd service. Works from a GitHub release, a local bundle (`JAZZ_BUNDLE_SRC`), or `curl | bash`.
- [x] **Server-side vault hosting (git smart HTTP)** — the server serves the vault as a git remote over HTTP(s) (`web/git-smart-http.ts`) with per-user Basic auth (git-users), and a post-receive hook lands every push in the working vault, which the web UI then serves. Live at `https://notes.rentgen.su/jazz-notes-vault.git` and exercised end-to-end by the two-device sync test; the whole setup is provisioned by the one-command installer above.

### Web version
- [x] **Web version** — the same UI runs in the browser (`web/`): a small Node.js server reuses the app's git and save logic against the same vault.
- [x] **HTTP note intake** — `POST /api/note` creates notes from JSON guarded by a token (`X-Auth-Token` / `JAZZ_NOTE_TOKEN`); handy from a phone or curl.
- [x] **Vault existence guard** — the web server and CLI require an explicit `JAZZ_VAULT` (no default): without it the server refuses to start and the CLI exits with an error; if the vault folder itself is missing the UI shows a message and blocks note creation until the folder is created.

## Later

- [ ] **PDF export** — render a note (or a set of notes) to PDF.
- [ ] **Own live-preview editor** — replace the `@atomic-editor` Markdown rendering with our own parser + renderer on top of CodeMirror. Keep CodeMirror as the text engine (cursor/input are fine); the goal is formatting quality better than Obsidian.

## Deferred (not now)

- App icon
- Backlinks / wiki-links
- Tags and priority UI (data model already exists in frontmatter, no UI yet)

## Long-term

- [ ] **Line-level conflict merge** — conflicts are currently resolved per-file; add line-level picking.
- [ ] **Cloud/WebDAV backup** — auto-backup the repository beyond the SSH server.
