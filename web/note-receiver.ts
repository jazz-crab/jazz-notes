import type { IncomingMessage, ServerResponse } from 'http'
import { timingSafeEqual } from 'crypto'
import { saveNotes, type SaveResult } from '../src/main/save'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { parseNote, type NoteDraft } from '../src/shared/note'
import { getIndexStore } from './index-store-web'

const TOKEN = process.env.JAZZ_NOTE_TOKEN || ''

export function isNoteReceiverEnabled(): boolean {
  return TOKEN.length > 0
}

function tokenOk(header: string | undefined): boolean {
  if (!header || TOKEN.length === 0) return false
  const a = Buffer.from(header)
  const b = Buffer.from(TOKEN)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  return new Promise((resolve, reject) => {
    req.on('data', (chunk) => chunks.push(chunk as Buffer))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('invalid json'))
      }
    })
    req.on('error', reject)
  })
}

function send(res: ServerResponse, code: number, body: unknown) {
  const data = JSON.stringify(body)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(data)
}

export async function handleNotePost(
  req: IncomingMessage,
  res: ServerResponse,
  vault: string,
  onChanged?: () => void
): Promise<void> {
  if (!isNoteReceiverEnabled()) {
    return send(res, 404, { error: 'not found' })
  }
  if (!tokenOk(req.headers['x-auth-token'])) {
    return send(res, 401, { error: 'unauthorized' })
  }

  let body: unknown
  try {
    body = await readJson(req)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return send(res, 400, { error: msg })
  }

  const drafts: NoteDraft[] = Array.isArray(body) ? (body as NoteDraft[]) : [body as NoteDraft]
  const clean: NoteDraft[] = []
  for (const d of drafts) {
    const draft = d as Partial<NoteDraft>
    if (!draft || typeof draft !== 'object') continue
    const title = String(draft.title || '').trim()
    if (!title) continue
    clean.push({
      title,
      text: draft.text !== undefined ? String(draft.text) : '',
      folder: draft.folder !== undefined ? String(draft.folder) : '',
      due: draft.due !== undefined ? String(draft.due) : undefined,
      color: draft.color !== undefined ? String(draft.color) : undefined,
      priority: draft.priority,
      tags: Array.isArray(draft.tags) ? draft.tags.map((t) => String(t)) : undefined,
    })
  }

  if (clean.length === 0) {
    return send(res, 400, { error: 'no valid notes' })
  }

  try {
    const result: SaveResult = await saveNotes(clean, vault, onChanged)
    for (const saved of result.saved) {
      try {
        const raw = await readFile(join(vault, saved.relPath), 'utf-8')
        const { meta, content } = parseNote(raw)
        getIndexStore().upsert(saved.relPath, meta, content)
      } catch {
        // unreadable file — leave the index as is
      }
    }
    send(res, 200, { ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    send(res, 500, { error: msg })
  }
}
