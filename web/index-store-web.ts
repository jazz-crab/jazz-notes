import { mkdirSync, existsSync } from 'fs'
import { mkdir, readdir, readFile } from 'fs/promises'
import { dirname, join } from 'path'
import { Database } from 'node-sqlite3-wasm'
import { parseNote, type NoteMeta } from '../src/shared/note'

export interface SearchResult {
  relPath: string
  title: string
  snippet: string
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  rel_path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  folder TEXT DEFAULT '',
  priority INTEGER DEFAULT 0,
  due TEXT,
  color TEXT,
  created TEXT,
  updated TEXT,
  tags TEXT,
  content_preview TEXT,
  body TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title, content_preview, tags, body,
  content='notes', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, content_preview, tags, body)
  VALUES (new.rowid, new.title, new.content_preview, new.tags, new.body);
END;
CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content_preview, tags, body)
  VALUES ('delete', old.rowid, old.title, old.content_preview, old.tags, old.body);
END;
CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content_preview, tags, body)
  VALUES ('delete', old.rowid, old.title, old.content_preview, old.tags, old.body);
  INSERT INTO notes_fts(rowid, title, content_preview, tags, body)
  VALUES (new.rowid, new.title, new.content_preview, new.tags, new.body);
END;
`

function folderOf(relPath: string): string {
  const dir = dirname(relPath).replace(/\\/g, '/')
  return dir === '.' ? '' : dir
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

type NoteRow = [
  id: string,
  relPath: string,
  title: string,
  folder: string,
  priority: number,
  due: string | null,
  color: string | null,
  created: string | null,
  updated: string | null,
  tags: string,
  contentPreview: string,
  body: string,
]

const INSERT_SQL =
  'INSERT OR REPLACE INTO notes (id, rel_path, title, folder, priority, due, color, created, updated, tags, content_preview, body) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'

function toRow(relPath: string, meta: NoteMeta, body: string): NoteRow {
  return [
    meta.id || relPath,
    relPath,
    meta.title,
    folderOf(relPath),
    meta.priority || 0,
    meta.due || null,
    meta.color || null,
    meta.created || null,
    meta.updated || null,
    JSON.stringify(meta.tags || []),
    body.slice(0, 200),
    body,
  ]
}

export class NoteIndexStore {
  private db: Database | null = null

  open(vault: string): void {
    this.close()
    const dir = join(vault, '.jazz')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(join(dir, 'index.db'))
    this.db.exec(SCHEMA)
  }

  async scan(vault: string): Promise<number> {
    const db = this.db
    if (!db) return 0
    const files = await listMdFiles(vault)
    const rows: NoteRow[] = []
    for (const rel of files) {
      const raw = await readFile(join(vault, rel), 'utf-8').catch(() => null)
      if (raw == null) continue
      const { meta, content } = parseNote(raw)
      rows.push(toRow(rel, meta, content))
    }
    const insert = db.prepare(INSERT_SQL)
    try {
      db.exec('BEGIN')
      db.run('DELETE FROM notes')
      for (const item of rows) insert.run(item)
      db.exec('COMMIT')
    } catch (e) {
      if (db.inTransaction) db.exec('ROLLBACK')
      throw e
    } finally {
      insert.finalize()
    }
    return rows.length
  }

  upsert(relPath: string, meta: NoteMeta, body: string): void {
    if (!this.db) return
    this.db.run(INSERT_SQL, toRow(relPath, meta, body))
  }

  remove(relPath: string): void {
    this.db?.run('DELETE FROM notes WHERE rel_path = ?', relPath)
  }

  rename(fromRel: string, toRel: string): void {
    this.db?.run('UPDATE notes SET rel_path = ?, folder = ? WHERE rel_path = ?', [
      toRel,
      folderOf(toRel),
      fromRel,
    ])
  }

  search(query: string, limit = 100): SearchResult[] {
    const db = this.db
    if (!db) return []
    const q = query.trim()
    if (!q) return []
    const match = `"${q.replace(/"/g, '""')}"`
    const rows = db.all(
      `SELECT n.rel_path as relPath, n.title as title, snippet(notes_fts, 1, '<mark>', '</mark>', '...', 12) as snip
       FROM notes_fts JOIN notes n ON n.rowid = notes_fts.rowid
       WHERE notes_fts MATCH ? ORDER BY rank LIMIT ?`,
      [match, limit]
    ) as unknown as Array<{ relPath: string; title: string; snip: string | null }>
    return rows.map((r) => ({
      relPath: r.relPath,
      title: r.title,
      snippet: r.snip ?? r.title.slice(0, 120),
    }))
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

let store: NoteIndexStore | null = null

export function getIndexStore(): NoteIndexStore {
  if (!store) store = new NoteIndexStore()
  return store
}