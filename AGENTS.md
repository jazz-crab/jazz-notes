# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

JazzNote — a local-first Markdown note-taking app ("Second Brain") with Obsidian-style inline live preview.

- Electron 43 + React 19 + TypeScript (electron-vite)
- CodeMirror 6 editing via `@atomic-editor/editor`
- State: zustand; file watching: chokidar
- Notes are plain `.md` files in a vault (default `~/Documents/jazz-notes-vault`), frontmatter metadata on top
- The same renderer UI runs in the browser (`web/`) served by a small Node server that reuses the main process git/save logic

## Start of every session: verify the project

1. `git status` and `git log --oneline -10` to see where the work stands.
2. Run the checks to confirm the current state actually builds (`npm run build`).
3. Verify the docs reflect the code:
   - `README.md` / `README_ru.md` — implemented features, honest status
   - `ROADMAP.md` / `ROADMAP_ru.md` — checkboxes match what is actually done
4. If the docs drifted from the code, update them in the same change as the code.

## Documentation rules

- Docs describe what **exists**, not aspirations. Never list features as done if they are not.
- When you add, change, or remove a feature, update `README.md` and `README_ru.md` in the same commit.
- When you complete a roadmap item, tick its checkbox in `ROADMAP.md` and `ROADMAP_ru.md`.
- Keep the English and Russian docs in sync with each other.
- This repo intentionally has no `ARCHITECTURE.md` — it is a single-package app; README + ROADMAP are the source of truth. Don't create one unless asked.

## Commands

```bash
npm install
npm run dev      # electron-vite dev
npm run build    # electron-vite build
npm run dist     # build + electron-builder (current platform: AppImage/deb/pacman or nsis)
npm run dist:all # build linux (AppImage/deb/pacman) + windows (nsis) from Linux (requires wine)
npm run test     # vitest
npm run web:build    # web client (web/dist) + server bundle (web/dist-server/server.js)
npm run web:dev      # vite dev server for the browser UI
npm run web:preview  # preview of the built web client
```

## Note format and the saver

- Note format (frontmatter parse/serialize, ID helpers) lives in `src/shared/note.ts` — the single source of truth. The renderer re-exports it from `src/renderer/src/utils/frontmatter.ts`.
- The saver (`src/main/save.ts`: `saveNotes`, `updateNote`, `writeRaw`) is shared by the desktop main process (`src/main/index.ts`) and the web server (`web/server.ts`). Do not add a second serialization path.
- `POST /api/note` (`web/note-receiver.ts`) accepts raw note drafts `{title, text, folder, due, color, priority, tags}` and is guarded by `X-Auth-Token` / `JAZZ_NOTE_TOKEN`.
- When changing the note format or the saver, update the tests in `src/renderer/src/utils/frontmatter.test.ts` (they exercise the shared `src/shared/note.ts` parser/serializer) and re-run `npm run test`.

## Запуск и sandbox

Если приложение падает с ошибкой `GPU process launch failed` или `Network service crashed`, запускай с флагом `--no-sandbox`:

```bash
./dist/jazz-notes-linux-x86_64.AppImage --no-sandbox
./dist/linux-unpacked/jazz-notes --no-sandbox
```

Это связано с тем, что `chrome-sandbox` не имеет suid-бита после сборки (electron-builder не сохраняет suid в пакетах). Для production-использования можно установить suid вручную:

```bash
sudo chown root dist/linux-unpacked/chrome-sandbox
sudo chmod 4755 dist/linux-unpacked/chrome-sandbox
```

## Release

When preparing a release, build packages for all target platforms right away, not just the default:
- Arch Linux — `pacman` (electron-builder `linux.target: pacman`)
- Debian / Ubuntu — `deb`
- Windows — `nsis`

`npm run dist` builds the current platform only. To build all in one go (from Linux, requires `wine`):

```bash
npm run dist:all
```

Beta releases are published automatically from a `v*` tag — see `.github/workflows/release.yml`.

## Language

- GitHub-facing content — issues, PRs, commit messages, release notes — is written in **English** (the default language).
- Documentation (`README`, `ROADMAP`, guides) is maintained in both **English and Russian**, kept in sync.
- When only one language fits (titles, code comments, etc.), use **English**.

## Automation (console-first)

Every feature of the app must be reachable from the console — no function may live only behind the GUI. This keeps the app automatable (cron, SSH, scripts) and makes the desktop UI, the web server, and the CLI thin adapters over the same shared core (`src/main/save.ts`, `src/main/git.ts`, `src/shared/note.ts`).

- Prefer adding operations to the shared core and exposing them through all adapters (IPC + HTTP + CLI) instead of writing UI-only code paths.
- When you add a UI feature, expose the same operation via the CLI/API in the same change.
- Notes/git/save logic belongs in `src/shared/` or `src/main/`, never inside React components.

## Conventions

- Don't add code comments unless asked.
- Follow the existing code style (existing components, zustand stores, i18n strings in Russian).
- Don't commit build output (`out/`, `dist/`, `node_modules/`).
- **Don't create PRs for yourself.** This is a solo project — just commit and push directly to `main`. PRs are only for external contributors.
