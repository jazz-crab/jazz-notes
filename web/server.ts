import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { readFile, mkdir, rm, rename, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve, sep, relative } from 'path'
import {
  ensureRepo,
  commitAll,
  sync as gitSync,
  resolveConflicts as gitResolveConflicts,
  history as gitHistory,
  show as gitShow,
  restore as gitRestore,
  type SyncResult,
  type GitCommitInfo,
  type GitAuth,
} from '../src/main/git'
import { saveNotes, updateNote, writeRaw } from '../src/main/save'
import { handleNotePost } from './note-receiver'
const VAULT = process.env.JAZZ_VAULT || join(process.env.HOME || '/home/jc', 'jazz-notes')
const HISTORY_PATH = join(process.env.HOME || '/home/jc', '.jazz-note-web-history.json')
const PORT = Number(process.env.PORT || 3180)
const ROOT =
  process.env.JAZZ_WEB_ROOT ||
  [join(__dirname, 'dist'), join(__dirname, '..', 'dist')].find(existsSync) ||
  join(__dirname, 'dist')

let rev = 0
let commitTimer: ReturnType<typeof setTimeout> | null = null

function scheduleCommit() {
  rev++
  if (commitTimer) clearTimeout(commitTimer)
  commitTimer = setTimeout(() => {
    commitTimer = null
    commitAll(VAULT).catch(() => {})
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

function relOf(full: string): string {
  return relative(VAULT, full).split(sep).join('/')
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf-8')
  if (!raw) return {}
  return JSON.parse(raw)
}

function send(res: ServerResponse, code: number, body: unknown) {
  const data = JSON.stringify(body)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(data)
}

function fail(res: ServerResponse, code: number, msg: string) {
  send(res, code, { error: msg })
}

async function readDirRecursive(): Promise<string[]> {
  const result: string[] = []
  async function walk(dir: string, prefix: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), rel)
        result.push(rel + '/')
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        result.push(rel)
      }
    }
  }
  if (!existsSync(VAULT)) await mkdir(VAULT, { recursive: true })
  await walk(VAULT, '')
  return result
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
      if (req.method === 'GET' && p === '/api/path') {
        return send(res, 200, { path: VAULT })
      }
      if (req.method === 'GET' && p === '/api/rev') {
        return send(res, 200, { rev })
      }
      if (req.method === 'GET' && p === '/api/tree') {
        return send(res, 200, { entries: await readDirRecursive() })
      }
      if (req.method === 'GET' && p === '/api/read') {
        const rel = q.get('rel') || ''
        return send(res, 200, { content: await readFile(sanitize(rel), 'utf-8') })
      }
      if (req.method === 'GET' && p === '/api/history') {
        return send(res, 200, { data: await readHistory() })
      }
      if (req.method === 'POST' && p === '/api/write') {
        const body = (await readJson(req)) as Record<string, unknown>
        if (typeof body.content === 'string' && body.rel) {
          await writeRaw(String(body.rel), body.content, VAULT, scheduleCommit)
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
        const result = await updateNote(draft.rel, draft, VAULT, scheduleCommit)
        return send(res, 200, result)
      }
      if (req.method === 'POST' && p === '/api/create') {
        const body = (await readJson(req)) as Record<string, unknown>
        if (typeof body.content === 'string' && body.rel) {
          await writeRaw(String(body.rel), body.content, VAULT, scheduleCommit)
          return send(res, 200, { ok: true })
        }
        if (!body.title) {
          return fail(res, 400, 'title is required')
        }
        const result = await saveNotes([body as never], VAULT, scheduleCommit)
        return send(res, 200, result)
      }
      if (req.method === 'POST' && p === '/api/note') {
        return handleNotePost(req, res, VAULT, scheduleCommit)
      }
      if (req.method === 'POST' && p === '/api/delete') {
        const { rel } = (await readJson(req)) as { rel: string }
        await rm(sanitize(rel), { force: true })
        scheduleCommit()
        return send(res, 200, { ok: true })
      }
      if (req.method === 'POST' && p === '/api/mkdir') {
        const { rel } = (await readJson(req)) as { rel: string }
        await mkdir(sanitize(rel), { recursive: true })
        scheduleCommit()
        return send(res, 200, { ok: true })
      }
      if (req.method === 'POST' && p === '/api/rmdir') {
        const { rel } = (await readJson(req)) as { rel: string }
        await rm(sanitize(rel), { recursive: true, force: true })
        scheduleCommit()
        return send(res, 200, { ok: true })
      }
      if (req.method === 'POST' && p === '/api/rename') {
        const { rel, newRel } = (await readJson(req)) as { rel: string; newRel: string }
        const from = sanitize(rel)
        const to = sanitize(newRel)
        await mkdir(join(to, '..'), { recursive: true })
        await rename(from, to)
        scheduleCommit()
        return send(res, 200, { ok: true })
      }
      if (req.method === 'POST' && p === '/api/history') {
        const { data } = (await readJson(req)) as { data: unknown }
        await writeFile(HISTORY_PATH, JSON.stringify(data), 'utf-8')
        return send(res, 200, { ok: true })
      }
      if (req.method === 'POST' && p === '/api/git/ensure') {
        const { remote } = (await readJson(req)) as { remote: string }
        await ensureRepo(VAULT, remote)
        return send(res, 200, { ok: true })
      }
      if (req.method === 'POST' && p === '/api/git/commit') {
        const { message } = (await readJson(req)) as { message?: string }
        const ok = await commitAll(VAULT, message || 'autosave')
        return send(res, 200, { ok })
      }
      if (req.method === 'POST' && p === '/api/git/sync') {
        const { auth } = (await readJson(req)) as { auth?: GitAuth }
        const result: SyncResult = await gitSync(VAULT, auth)
        rev++
        return send(res, 200, result)
      }
      if (req.method === 'POST' && p === '/api/git/resolve') {
        const { picks, auth } = (await readJson(req)) as {
          picks: Array<{ file: string; source: 'local' | 'remote' }>
          auth?: GitAuth
        }
        const result: SyncResult = await gitResolveConflicts(VAULT, picks, auth)
        rev++
        return send(res, 200, result)
      }
      if (req.method === 'GET' && p === '/api/git/history') {
        const rel = q.get('rel') || ''
        const limit = Number(q.get('limit')) || 50
        const items: GitCommitInfo[] = await gitHistory(VAULT, rel, limit)
        return send(res, 200, { items })
      }
      if (req.method === 'GET' && p === '/api/git/show') {
        const rel = q.get('rel') || ''
        const hash = q.get('hash') || ''
        const content = await gitShow(VAULT, rel, hash)
        return send(res, 200, { content })
      }
      if (req.method === 'POST' && p === '/api/git/restore') {
        const { rel, hash } = (await readJson(req)) as { rel: string; hash: string }
        const content = await gitRestore(VAULT, rel, hash)
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
  ensureRepo(VAULT, '').catch((e) => console.error('init failed', e))
  if (!existsSync(VAULT)) mkdir(VAULT, { recursive: true })
  server.listen(PORT, () => {
    console.log(`jazz-note-web on :${PORT}, vault=${VAULT}`)
  })
}
