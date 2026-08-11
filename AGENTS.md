# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

JazzNote — a local-first Markdown note-taking app ("Second Brain") with Obsidian-style inline live preview.

- Electron 43 + React 19 + TypeScript (electron-vite)
- CodeMirror 6 editing via `@atomic-editor/editor`
- State: zustand; file watching: chokidar
- Notes are plain `.md` files in a vault (default `~/Documents/jazz-notes`), frontmatter metadata on top
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
npm run dist     # build + electron-builder (AppImage/deb)
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

## Conventions

- Don't add code comments unless asked.
- Follow the existing code style (existing components, zustand stores, i18n strings in Russian).
- Don't commit build output (`out/`, `dist/`, `node_modules/`).
