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
- [ ] **Vim-style hotkeys** — keyboard navigation without mouse: `j`/`k` to move between notes, `h`/`l` to collapse/expand folders, `gg`/`G` to jump to first/last note, `/` to focus search.

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

### Sync & versioning
- [x] **Git-backed vault** — the notes folder is initialized as a git repository; every autosave (400 ms debounce) and settings change become commits.
- [x] **Per-note version history** — a dialog in the editor lists versions (hash, date, message) with preview and restore via a new commit.
- [x] **Undo/redo to the first version** — the undo stack is seeded from the git history (up to 500 versions) when a note is opened.
- [x] **Sync engine** — push/pull/merge against a git remote (URL, login and token editable in Settings); non-conflicting changes merge automatically. Works with any reachable remote the user hosts themselves (e.g. a GitHub repo).
- [x] **No system git required** — all git operations run in-process on a pure-JS engine (isomorphic-git); works on any device without installing git.
- [x] **Sync indicator** — green/yellow/red/orange dot in the top-right corner with details on click.
- [x] **Conflict resolution** — pick local or remote version per conflicting file with preview.
- [x] **Multi-device onboarding** — share the remote URL, login and token as a QR code or a copyable string; import by scanning or pasting on another device.
- [ ] **Server-side vault hosting (git smart HTTP)** — the web server does **not** yet serve the vault as a git remote over HTTPS, and the server vault does not auto-sync. This is the missing piece for out-of-the-box multi-device sync. Tracks issue #8.

### Web version
- [x] **Web version** — the same UI runs in the browser (`web/`): a small Node.js server reuses the app's git and save logic against the same vault.
- [x] **HTTP note intake** — `POST /api/note` creates notes from JSON guarded by a token (`X-Auth-Token` / `JAZZ_NOTE_TOKEN`); handy from a phone or curl.

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
