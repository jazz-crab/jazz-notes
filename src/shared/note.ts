export interface NoteMeta {
  id?: string
  title: string
  priority?: 0 | 1 | 2 | 3 | 4
  due?: string
  done?: boolean
  color?: string
  created?: string
  updated?: string
  tags?: string[]
}

export interface NoteData {
  meta: NoteMeta
  content: string
  raw: string
}

export interface NoteDraft {
  title: string
  text?: string
  folder?: string
  due?: string
  color?: string
  priority?: 0 | 1 | 2 | 3 | 4
  tags?: string[]
}

export interface SavedNoteInfo {
  relPath: string
  id: string
  title: string
}

export const ID_DIGITS = 5
export const padId = (n: number) => String(n).padStart(ID_DIGITS, '0')

export function nextId(existingIds: string[]): string {
  const max = existingIds.reduce((m, id) => {
    const n = parseInt(id, 10)
    return Number.isNaN(n) ? m : Math.max(m, n)
  }, 0)
  return padId(max + 1)
}

interface Frontmatter {
  values: Record<string, string>
  content: string
}

function extractFrontmatter(raw: string): Frontmatter | null {
  if (!raw.startsWith('---')) return null
  const lines = raw.split('\n')
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === '---') {
      const values: Record<string, string> = {}
      for (const line of lines.slice(1, i)) {
        const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
        if (!match) continue
        values[match[1]] = match[2].trim()
      }
      return {
        values,
        content: lines.slice(i + 1).join('\n').trim(),
      }
    }
  }
  return null
}

function unquote(v: string): string {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return v
}

function quote(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function parseTags(v: string): string[] {
  return v.replace(/[\[\]]/g, '').split(',').map((t) => t.trim()).filter(Boolean)
}

export function parseNote(raw: string): NoteData {
  const meta: NoteMeta = { title: '' }

  const fm = extractFrontmatter(raw)
  if (fm) {
    const v = fm.values
    if (v.title !== undefined) meta.title = unquote(v.title)
    if (v.id !== undefined) meta.id = unquote(v.id)
    if (v.priority !== undefined) {
      const p = Number(v.priority)
      if (Number.isInteger(p) && p >= 0 && p <= 4) meta.priority = p as NoteMeta['priority']
    }
    if (v.due !== undefined) meta.due = unquote(v.due)
    if (v.done === 'true') meta.done = true
    if (v.done === 'false') meta.done = false
    if (v.color !== undefined) meta.color = unquote(v.color)
    if (v.created !== undefined) meta.created = unquote(v.created)
    if (v.updated !== undefined) meta.updated = unquote(v.updated)
    if (v.tags !== undefined) meta.tags = parseTags(v.tags)
  }

  const content = fm ? fm.content : raw

  if (!meta.title) {
    const firstLine = content.split('\n')[0] || ''
    meta.title = firstLine.replace(/^#+\s*/, '').trim() || 'Untitled'
  }

  return { meta, content, raw }
}

export function serializeNote(meta: NoteMeta, content: string): string {
  const now = new Date().toISOString()
  const lines = ['---']
  lines.push(`title: ${quote(meta.title)}`)
  if (meta.id) lines.push(`id: ${quote(meta.id)}`)
  if (meta.priority) lines.push(`priority: ${meta.priority}`)
  if (meta.due) lines.push(`due: ${quote(meta.due)}`)
  if (meta.done === true) lines.push('done: true')
  if (meta.color) lines.push(`color: ${quote(meta.color)}`)
  if (meta.created) lines.push(`created: ${quote(meta.created)}`)
  lines.push(`updated: ${quote(now)}`)
  if (meta.tags?.length) lines.push(`tags: [${meta.tags.join(', ')}]`)
  lines.push('---')
  lines.push('')
  if (content) lines.push(content)
  return lines.join('\n')
}
