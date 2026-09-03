import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve, sep } from 'path'
import * as svc from '../src/shared/service'
import { parseNote, type NoteDraft } from '../src/shared/note'
import { getIndexStore } from './index-store-web'
import { handleNotePost } from './note-receiver'
import { authenticate, loadUsers } from './auth'

const VAULT = process.env.JAZZ_VAULT || ''
if (!VAULT) {
  console.error(
    'JAZZ_VAULT is not set. Point it at your notes folder, e.g. JAZZ_VAULT=/home/user/Documents/jazz-notes-vault node web/dist-server/server.js'
  )
  process.exit(1)
}
const HISTORY_PATH = join(process.env.HOME || '/home/jc', '.jazz-notes-web-history.json')
const PORT = Number(process.env.PORT || 3180)
const ROOT =
  process.env.JAZZ_WEB_ROOT ||
  [join(__dirname, 'dist'), join(__dirname, '..', 'dist')].find(existsSync) ||
  join(__dirname, 'dist')
const API_USERS_FILE =
  process.env.JAZZ_API_USERS ||
  join(process.env.HOME || '/home/jc', '.config', 'jazz-notes-api-users.json')

let rev = 0
let commitTimer: ReturnType<typeof setTimeout> | null = null

function scheduleCommit() {
  rev++
  if (commitTimer) clearTimeout(commitTimer)
  commitTimer = setTimeout(() => {
    commitTimer = null
    svc.gitCommit(VAULT).catch(() => {})
  }, 30000)
}

function sanitize(relPath: string): string {
  const clean = relPath.replace(/^\/+/, '').replace(/\\/g, '/')
  const full = resolve(VAULT, clean)
  if (full !== VAULT && !full.startsWith(VAULT + sep)) {
    throw new Error('bad path')
  }
  return full
}

async function reindexNote(relPath: string) {
  try {
    const raw = await readFile(sanitize(relPath), 'utf-8')
    const { meta, content } = parseNote(raw)
    getIndexStore().upsert(relPath, meta, content)
  } catch {
    // unreadable file — leave the index as is
  }
}

function send(res: ServerResponse, code: number, body: unknown) {
  const data = JSON.stringify(body)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(data)
}

function fail(res: ServerResponse, code: number, msg: string) {
  send(res, code, { error: msg })
}

async function readHistory(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(HISTORY_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

function isStaticAsset(urlPath: string): boolean {
  return /\.(js|css|woff2|ttf|png|jpg|svg|ico|map)$/.test(urlPath)
}

async function serveStatic(res: ServerResponse, urlPath: string) {
  let filePath: string
  if (urlPath === '/' || urlPath === '') {
    filePath = join(ROOT, 'index.html')
  } else if (isStaticAsset(urlPath)) {
    filePath = join(ROOT, urlPath)
  } else {
    filePath = join(ROOT, 'index.html')
  }
  try {
    const content = await readFile(filePath)
    const ext = filePath.endsWith('.html')
      ? 'text/html; charset=utf-8'
      : filePath.endsWith('.js')
        ? 'application/javascript; charset=utf-8'
        : filePath.endsWith('.css')
          ? 'text/css; charset=utf-8'
          : filePath.endsWith('.woff2')
            ? 'font/woff2'
            : filePath.endsWith('.ttf')
              ? 'font/ttf'
              : 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': ext, 'Cache-Control': 'no-cache' })
    res.end(content)
  } catch {
    fail(res, 404, 'not found')
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const p = url.pathname
    const q = url.searchParams

    if (p.startsWith('/api/')) {
      // /api/note — token auth only, no user/password auth needed
      if (req.method === 'POST' && p === '/api/note') {
        return handleNotePost(req, res, VAULT, scheduleCommit)
      }

      // All other /api/* — require user+password auth
      const auth = await authenticate(req, res)
      if (!auth) return // 401 already sent
      const body = auth.body

      if (req.method === 'GET' && p === '/api/path') {
        return send(res, 200, { path: VAULT })
      }
      if (req.method === 'GET' && p === '/api/vault') {
        return send(res, 200, { path: VAULT, exists: existsSync(VAULT) })
      }
      if (req.method === 'GET' && p === '/api/rev') {
        return send(res, 200, { rev })
      }
      if (req.method === 'GET' && p === '/api/tree') {
        return send(res, 200, { entries: await svc.readDirRecursive(VAULT) })
      }
      if (req.method === 'GET' && p === '/api/read') {
        const rel = q.get('rel') || ''
        return send(res, 200, { content: await svc.readFile(VAULT, rel) })
      }
      if (req.method === 'GET' && p.startsWith('/api/search')) {
        const searchQ = url.searchParams.get('q') || ''
        const limit = Number(url.searchParams.get('limit')) || 50
        return send(res, 200, getIndexStore().search(searchQ, limit))
      }
      if (req.method === 'GET' && p === '/api/history') {
        return send(res, 200, { data: await readHistory() })
      }
      if (req.method === 'POST' && p === '/api/write') {
        if (typeof body.content === 'string' && body.rel) {
          await svc.writeRaw(VAULT, String(body.rel), body.content, scheduleCommit)
          await reindexNote(String(body.rel))
          return send(res, 200, { ok: true })
        }
        const draft = body as {
          rel: string
          title: string
          text?: string
          due?: string
          color?: string
          priority?: 0 | 1 | 2 | 3 | 4
          tags?: string[]
        }
        if (!draft.rel || !draft.title) {
          return fail(res, 400, 'rel and title are required')
        }
        const saved = await svc.updateNote(VAULT, draft.rel, draft, scheduleCommit)
        await reindexNote(draft.rel)
        return send(res, 200, { saved: [saved] })
      }
      if (req.method === 'POST' && p === '/api/create') {
        if (typeof body.content === 'string' && body.rel) {
          await svc.writeRaw(VAULT, String(body.rel), body.content, scheduleCommit)
          await reindexNote(String(body.rel))
          return send(res, 200, { ok: true })
        }
        if (!body.title) {
          return fail(res, 400, 'title is required')
        }
        const saved = await svc.createNote(VAULT, body as NoteDraft, scheduleCommit)
        await reindexNote(saved.relPath)
        return send(res, 200, { saved: [saved] })
      }
      if (req.method === 'POST' && p === '/api/delete') {
        const { rel } = body as { rel: string }
        await svc.deleteFile(VAULT, rel)
        getIndexStore().remove(rel)
        scheduleCommit()
        return send(res, 200, { ok: true })
      }
      if (req.method === 'POST' && p === '/api/mkdir') {
        const { rel } = body as { rel: string }
        await svc.mkdir(VAULT, rel)
        scheduleCommit()
        return send(res, 200, { ok: true })
      }
      if (req.method === 'POST' && p === '/api/rmdir') {
        const { rel } = body as { rel: string }
        await svc.rmdir(VAULT, rel)
        scheduleCommit()
        return send(res, 200, { ok: true })
      }
      if (req.method === 'POST' && p === '/api/rename') {
        const { rel, newRel } = body as { rel: string; newRel: string }
        await svc.renameFile(VAULT, rel, newRel)
        getIndexStore().rename(rel, newRel)
        scheduleCommit()
        return send(res, 200, { ok: true })
      }
      if (req.method === 'POST' && p === '/api/history') {
        const { data } = body as { data: unknown }
        await writeFile(HISTORY_PATH, JSON.stringify(data), 'utf-8')
        return send(res, 200, { ok: true })
      }
      if (req.method === 'POST' && p === '/api/git/ensure') {
        const { remote } = body as { remote: string }
        await svc.gitEnsure(VAULT, remote)
        return send(res, 200, { ok: true })
      }
      if (req.method === 'POST' && p === '/api/git/commit') {
        const { message } = body as { message?: string }
        const ok = await svc.gitCommit(VAULT, message || 'autosave')
        return send(res, 200, { ok })
      }
      if (req.method === 'POST' && p === '/api/git/sync') {
        const { auth: gitAuth } = body as { auth?: svc.GitAuth }
        const result: svc.SyncResult = await svc.gitSync(VAULT, gitAuth)
        rev++
        return send(res, 200, result)
      }
      if (req.method === 'POST' && p === '/api/git/resolve') {
        const { picks, auth: gitAuth } = body as {
          picks: Array<{ file: string; source: 'local' | 'remote' }>
          auth?: svc.GitAuth
        }
        const result: svc.SyncResult = await svc.gitResolveConflicts(VAULT, picks, gitAuth)
        rev++
        return send(res, 200, result)
      }
      if (req.method === 'GET' && p === '/api/git/history') {
        const rel = q.get('rel') || ''
        const limit = Number(q.get('limit')) || 50
        const items: svc.GitCommitInfo[] = await svc.gitHistory(VAULT, rel, limit)
        return send(res, 200, { items })
      }
      if (req.method === 'GET' && p === '/api/git/show') {
        const rel = q.get('rel') || ''
        const hash = q.get('hash') || ''
        const content = await svc.gitShow(VAULT, rel, hash)
        return send(res, 200, { content })
      }
      if (req.method === 'POST' && p === '/api/git/restore') {
        const { rel, hash } = body as { rel: string; hash: string }
        const content = await svc.gitRestore(VAULT, rel, hash)
        rev++
        return send(res, 200, { content })
      }
      return fail(res, 404, 'no such api')
    }

    return serveStatic(res, p)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    fail(res, 500, msg)
  }
})

if (require.main === module) {
  loadUsers(API_USERS_FILE)
  if (existsSync(VAULT)) {
    svc.gitEnsure(VAULT, '').catch((e) => console.error('init failed', e))
    getIndexStore().open(VAULT)
    getIndexStore()
      .scan(VAULT)
      .catch((e) => console.error('index scan failed', e))
  }
  server.listen(PORT, () => {
    console.log(`jazz-notes-web on :${PORT}, vault=${VAULT}`)
  })
}
