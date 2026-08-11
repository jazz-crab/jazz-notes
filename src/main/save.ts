import { mkdir, readFile, readdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve, sep } from 'path'
import { parseNote, serializeNote, nextId, type NoteDraft, type NoteMeta } from '../shared/note'

export interface SavedNote {
  relPath: string
  id: string
  title: string
}

export interface SaveResult {
  saved: SavedNote[]
}

function sanitizeRel(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+/, '').replace(/\.\.(\/|$)/g, '')
}

async function listMdFiles(vault: string): Promise<string[]> {
  const result: string[] = []
  async function walk(dir: string, prefix: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), rel)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        result.push(rel)
      }
    }
  }
  if (!existsSync(vault)) await mkdir(vault, { recursive: true })
  await walk(vault, '')
  return result
}

async function collectIds(vault: string): Promise<string[]> {
  const ids: string[] = []
  const files = await listMdFiles(vault)
  for (const rel of files) {
    try {
      const raw = await readFile(join(vault, rel), 'utf-8')
      const id = parseNote(raw).meta.id
      if (id) ids.push(id)
    } catch {
      // skip unreadable files
    }
  }
  return ids
}

function buildMeta(draft: NoteDraft, existing: NoteMeta | null): NoteMeta {
  const now = new Date().toISOString()
  const meta: NoteMeta = {
    title: draft.title.trim() || 'Untitled',
  }
  if (existing?.id) meta.id = existing.id
  if (draft.priority !== undefined) meta.priority = draft.priority
  if (draft.due) meta.due = draft.due
  if (draft.color) meta.color = draft.color
  if (existing?.created) meta.created = existing.created
  if (draft.tags?.length) meta.tags = draft.tags
  meta.updated = now
  return meta
}

export async function saveNotes(
  drafts: NoteDraft[],
  vault: string,
  onChanged?: () => void
): Promise<SaveResult> {
  await mkdir(vault, { recursive: true })

  const existingIds = await collectIds(vault)
  const saved: SavedNote[] = []
  const files: Array<{ relPath: string; raw: string }> = []

  for (const draft of drafts) {
    const title = draft.title.trim() || 'Untitled'
    const folder = sanitizeRel(draft.folder || '')
    let id = nextId(existingIds)
    let relPath = folder ? `${folder}/${id}.md` : `${id}.md`

    if (await fileExists(join(vault, relPath))) {
      id = nextId([...existingIds, id])
      relPath = folder ? `${folder}/${id}.md` : `${id}.md`
    }

    const meta = buildMeta(draft, null)
    meta.id = id
    if (!meta.created) meta.created = new Date().toISOString()

    files.push({ relPath, raw: serializeNote(meta, draft.text || '') })
    saved.push({ relPath, id, title })
  }

  for (const f of files) {
    const full = resolve(vault, f.relPath)
    await mkdir(join(full, '..'), { recursive: true })
    await writeFile(full, f.raw, 'utf-8')
  }

  onChanged?.()
  return { saved }
}

export async function updateNote(
  relPath: string,
  draft: NoteDraft,
  vault: string,
  onChanged?: () => void
): Promise<SaveResult> {
  const clean = sanitizeRel(relPath)
  const full = resolve(vault, clean)
  if (!full.startsWith(resolve(vault) + sep)) {
    throw new Error('bad path')
  }

  await mkdir(vault, { recursive: true })
  let existing: NoteMeta | null = null
  try {
    existing = parseNote(await readFile(full, 'utf-8')).meta
  } catch {
    // new file — no existing meta
  }

  const meta = buildMeta(draft, existing)
  if (!meta.id) meta.id = nextId(await collectIds(vault))
  if (!meta.created) meta.created = new Date().toISOString()

  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, serializeNote(meta, draft.text || ''), 'utf-8')
  onChanged?.()

  return { saved: [{ relPath: clean, id: meta.id || '', title: meta.title }] }
}

export async function writeRaw(
  relPath: string,
  content: string,
  vault: string,
  onChanged?: () => void
): Promise<void> {
  const clean = sanitizeRel(relPath)
  const full = resolve(vault, clean)
  if (!full.startsWith(resolve(vault) + sep)) {
    throw new Error('bad path')
  }
  await mkdir(join(full, '..'), { recursive: true })
  await writeFile(full, content, 'utf-8')
  onChanged?.()
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await readFile(p)
    return true
  } catch {
    return false
  }
}
