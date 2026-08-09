# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

JazzNote — a local-first Markdown note-taking app ("Second Brain") with Obsidian-style inline live preview.

- Electron 43 + React 19 + TypeScript (electron-vite)
- CodeMirror 6 editing via `@atomic-editor/editor`
- State: zustand; file watching: chokidar
- Notes are plain `.md` files in a vault (default `~/Documents/jazz-notes`), frontmatter metadata on top

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
npm run dist     # build + electron-builder (AppImage/deb)
```

## Запуск и sandbox

Если приложение падает с ошибкой `GPU process launch failed` или `Network service crashed`, запускай с флагом `--no-sandbox`:

```bash
./dist/jazz-note-linux-x86_64.AppImage --no-sandbox
./dist/linux-unpacked/jazz-note --no-sandbox
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

## Conventions

- Don't add code comments unless asked.
- Follow the existing code style (existing components, zustand stores, i18n strings in Russian).
- Don't commit build output (`out/`, `dist/`, `node_modules/`).
