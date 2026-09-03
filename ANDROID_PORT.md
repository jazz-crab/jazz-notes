# Android port: JazzNotes on your phone (nodejs-mobile + WebView, "copy of Electron")

Status: **plan / not started**. Build machine with disk space is pending (the rentgen box
has only ~1.8G free, not enough for NDK + gradle + build output).

Goal: an offline Android app that is a true copy of the desktop (Electron) app — **not**
the current `android/` WebView that loads `https://notes.rentgen.su` (that shows 401/"404"
because it does not handle basic auth). Exactly like Electron = Chromium(webview) + embedded
Node, this port = **embedded Node (nodejs-mobile) + WebView**.

- Inside the APK: Node 18 (`libnode.so`) runs the **same self-contained server bundle**
  `web/dist-server/server.js` + `node-sqlite3-wasm.wasm`.
- Vault lives in **app storage** (`FilesDir`), wired via `JAZZ_VAULT`.
- WebView loads `http://127.0.0.1:PORT/` — the client (`web/dist`) is origin-agnostic, all
  requests are relative `/api/*`.
- Git sync via **isomorphic-git** (pure JS, bundled) as a client to the cloud.

Verified: the server bundle is self-contained (runs from an empty dir without node_modules)
and the client makes no external-domaain calls. So the existing code is reused ~100% **without
rewriting** — the exact requirement.

---

## Verified facts (from research)

| Component | On Android (nodejs-mobile) |
|---|---|
| `http / fs / path / crypto / os` | ✅ work |
| `isomorphic-git` (sync) | ✅ pure JS |
| `node-sqlite3-wasm` (FTS5 search) | ⚠️ **main risk**: `WebAssembly` may be unavailable in `libnode.so` — smoke-test before full build; fallback = JS search (no FTS/snippets) or rebuild Node with WASM |
| `child_process.spawn` (git smart HTTP) | ❌ unavailable — **exclude** on Android (only needed when the phone is a git-remote for other devices; not needed for local vault + cloud client) |
| `better-sqlite3` (native) | ❌ not used on web path — **exclude** from the server bundle |
| chokidar (file watcher) | ✅ not part of web server (Electron main only) |

---

## Stages

### Stage 0 — Prepare the build machine (when access is granted)
- Install: JDK 17 (AGP 8.2.2 pin), Android SDK (cmdline-tools, platform android-34,
  build-tools 34, **NDK 25.2.9519653**, cmake 3.22.1), git, ssh.
- Clone `jazz-notes`, run `npm install`.
- Check `df -h` — need at least ~15G free (NDK 3G + gradle deps + build).

### Stage 1 — Foundation: nodejs-mobile in an APK (prove reuse)
Minimal APK in which the Node runtime runs `server.js`, WebView shows the UI, vault in FilesDir.
- Follow the official sample `nodejs-mobile-samples/android/native-gradle-node-folder`:
  - `android/app/src/main/cpp/` — CMakeLists.txt + JNI bridge (`node::Start`) in C++;
  - `android/gradle/` — wire `android-nodejs-mobile` (Node 18 AAR), jniLibs with `libnode.so`
    for abis (arm64-v8a, armeabi-v7a, x86_64);
  - `assets/nodejs-project/` — put `server.js` + `.wasm` + `web/dist`; copy to FilesDir on
    first run (re-copy only when APK changes).
- Rewrite `MainActivity.java`: instead of `loadUrl("https://...")` — start a Node thread,
  wait for the port, then `loadUrl("http://127.0.0.1:3180/")`.
- Env for Node: `PORT=3180`, `JAZZ_VAULT=<FilesDir>/vault`, `JAZZ_WEB_ROOT=<FilesDir>/dist`,
  `HOME=<FilesDir>`.
- **WASM smoke test**: inside the Node runtime open `node-sqlite3-wasm` → if
  `WebAssembly is not defined`, either rebuild libnode with WASM on, or fall back to a pure-JS
  search index (`search` without FTS).
- Done when: APK runs on emulator/device, UI opens, note create/read/edit works offline.

### Stage 2 — Vault + editor on Android
- Vault in FilesDir; nested folders, `.md` files, frontmatter — same as on desktop.
- Client (`web/dist`) fully works: note list, editor, palettes, i18n, tabs.
- Done when: full web-version behavior works offline.

### Stage 3 — Git sync (cloud)
- Via existing `/api/git/*` + isomorphic-git; sync UI (remote/login/token, indicator,
  conflicts) already lives in the web client — reused.
- Done when: push/pull/merge to an existing remote (e.g. GitHub) from the phone.

### Stage 4 — Releases
- `android/app/build.gradle`: versionCode/versionName, signed keystore (reuse
  `jazznote-release.keystore` from rentgen — it is gitignored, not in git).
- Build `assembleRelease` → signed APK (arm64-v8a priority; fat APK acceptable).
- Wire Android build into GitHub Actions, upload APK to **Releases**.

---

## Risks and mitigation
1. **WASM search fails in nodejs-mobile** → smoke-test in Stage 1; fallback to JS search
   (lose FTS snippets) or rebuild Node with WASM.
2. **`git-smart-http.ts` (spawn git)** → exclude from the Android bundle (not needed on
   Android); it stays on rentgen where system git exists.
3. **Disk space** → build on a separate machine with space.
4. **Node 18 vs newer APIs** → the bundled server uses only basic Node modules (verified);
   if anything newer is used, small targeted fixes.
5. **Abis / APK size** → arm64-v8a priority (APK ~20–40MB).

## Explicitly NOT doing
- No rewrite to React Native / Compose — a "copy of Electron" (nodejs-mobile), as agreed.
- No git smart HTTP on Android — client-onto-cloud sync only.

---

## Relevant files
- `web/server.ts` — HTTP server, env, static, auth, API routing (port 3180, `JAZZ_VAULT`, `JAZZ_WEB_ROOT`).
- `web/dist-server/server.js` + `node-sqlite3-wasm.wasm` — self-contained bundle (via `npm run web:build`).
- `web/webjazz.ts` — client fetch bridge (relative `/api/*` only).
- `web/index-store-web.ts` — WASM SQLite FTS5 search index (`<vault>/.jazz/index.db`).
- `src/main/git.ts` — isomorphic-git sync (pure JS).
- `android/app/src/main/java/com/jazzcrab/jazznote/MainActivity.java` — current WebView (loads remote URL, to be replaced).
