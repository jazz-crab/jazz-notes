import { create } from 'zustand'
import type { NoteMeta, NoteDraft } from '../utils/frontmatter'
import { parseNote, serializeNote } from '../utils/frontmatter'
import { useSettingsStore } from './settings'
import { debounce } from '../utils/debounce'
import { replaceFirstHeading } from '../utils/note'
import { parentOf, moveFolderPath, leafName } from '../utils/folder'
import { historyStore } from './history'

const ID_DIGITS = 5
const ID_STORAGE_KEY = 'jazz-notes:next-id'
const LEGACY_ID_STORAGE_KEY = 'jazz-note:next-id'
const ignoreWatcher = new Set<string>()

const pad = (n: number) => String(n).padStart(ID_DIGITS, '0')

function readNextId(): number {
  let raw = localStorage.getItem(ID_STORAGE_KEY)
  if (raw === null) {
    // one-time migration from the pre-rename key
    raw = localStorage.getItem(LEGACY_ID_STORAGE_KEY)
    if (raw !== null) {
      localStorage.setItem(ID_STORAGE_KEY, raw)
      localStorage.removeItem(LEGACY_ID_STORAGE_KEY)
    }
  }
  const stored = parseInt(raw || '', 10)
  return Number.isNaN(stored) ? 0 : stored
}

function computeAndStoreNextId(notes: Note[]): string {
  const max = notes.reduce((m, n) => {
    const id = parseInt(n.meta.id || '', 10)
    return Number.isNaN(id) ? m : Math.max(m, id)
  }, 0)
  const next = Math.max(max, readNextId()) + 1
  localStorage.setItem(ID_STORAGE_KEY, String(next))
  return pad(next)
}

export interface Note {
  relPath: string
  title: string
  meta: NoteMeta
  content: string
  body: string
}

export type SidebarSelection =
  | { type: 'all' }
  | { type: 'today' }
  | { type: 'tomorrow' }
  | { type: 'week' }
  | { type: 'later' }
  | { type: 'nodate' }
  | { type: 'folder'; path: string }

export type SortBy = 'date' | 'due'

interface NotesState {
  notes: Note[]
  folders: string[]
  currentNote: Note | null
  sidebarSelection: SidebarSelection
  searchQuery: string
  sortBy: SortBy
  loading: boolean
  notesPath: string
  dirtyNotes: Set<string>

  setNotesPath: (path: string) => void
  loadNotes: () => Promise<void>
  setCurrentNote: (relPath: string | null) => Promise<void>
  updateCurrentNote: (body: string) => void
  updateNoteMeta: (meta: Partial<NoteMeta>) => void
  saveCurrentNote: () => Promise<boolean>
  createNote: (title: string, onCreated?: (relPath: string) => void) => Promise<string>
  deleteNote: (relPath: string) => Promise<void>
  handleExternalChange: (relPath: string) => void
  renameNote: (relPath: string, title: string) => Promise<void>
  moveNote: (relPath: string, destFolder: string | null) => Promise<void>
  updateNoteMetaByPath: (relPath: string, patch: Partial<NoteMeta>) => Promise<void>
  setSidebarSelection: (sel: SidebarSelection) => void
  setSearchQuery: (q: string) => void
  setSortBy: (s: SortBy) => void
  replaceNote: (relPath: string, note: Note) => void
  createFolder: (name: string) => Promise<void>
  renameFolder: (folder: string, newName: string) => Promise<void>
  moveFolder: (folder: string, dest: string | null) => Promise<void>
  deleteFolder: (folder: string) => Promise<void>
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notes: [],
  folders: [],
  currentNote: null,
  sidebarSelection: { type: 'all' },
  searchQuery: '',
  sortBy: 'date',
  loading: false,
  notesPath: '',
  dirtyNotes: new Set(),

  setNotesPath: (path: string) => set({ notesPath: path }),

  loadNotes: async () => {
    const hasNotes = get().notes.length > 0
    if (!hasNotes) set({ loading: true })
    const saved = useSettingsStore.getState().notesPath
    const path = saved || await window.jazz.getPath()
    if (!saved) useSettingsStore.getState().setNotesPath(path)
    set({ notesPath: path })
    const entries = await window.jazz.readDirRecursive(path)
    const notes: Note[] = []
    const folders: string[] = []
    for (const entry of entries) {
      if (entry.endsWith('/')) {
        folders.push(entry.slice(0, -1))
      } else {
        const raw = await window.jazz.readFile(entry, path)
        const data = parseNote(raw)
        notes.push({
          relPath: entry,
          title: data.meta.title,
          meta: data.meta,
          content: raw,
          body: data.content,
        })
      }
    }
    for (const note of notes) {
      if (!note.meta.id) {
        const id = computeAndStoreNextId(notes)
        note.meta = { ...note.meta, id }
        note.title = note.meta.title
        await window.jazz.writeFile(note.relPath, serializeNote(note.meta, note.body), path)
      }
    }
    set({ notes, folders, loading: false })
  },

  setCurrentNote: async (relPath: string | null) => {
    const { currentNote, saveCurrentNote, notesPath } = get()
    if (currentNote && get().dirtyNotes.has(currentNote.relPath)) {
      await saveCurrentNote()
    }
    if (!relPath) return
    const raw = await window.jazz.readFile(relPath, notesPath || undefined)
    const data = parseNote(raw)
    const note: Note = {
      relPath,
      title: data.meta.title,
      meta: data.meta,
      content: raw,
      body: data.content,
    }
    const dirty = new Set(get().dirtyNotes)
    dirty.delete(relPath)
    set({ currentNote: note, dirtyNotes: dirty })
    void historyStore.seedFromGit(relPath, notesPath)
  },

  updateCurrentNote: (body: string) => {
    const { currentNote } = get()
    if (!currentNote) return
    const dirty = new Set(get().dirtyNotes)
    dirty.add(currentNote.relPath)
    set({
      currentNote: { ...currentNote, body },
      dirtyNotes: dirty,
    })
  },

  updateNoteMeta: (meta: Partial<NoteMeta>) => {
    const { currentNote } = get()
    if (!currentNote) return
    const newMeta = { ...currentNote.meta, ...meta }
    const dirty = new Set(get().dirtyNotes)
    dirty.add(currentNote.relPath)
    set({
      currentNote: { ...currentNote, meta: newMeta },
      dirtyNotes: dirty,
    })
  },

  saveCurrentNote: async () => {
    const { currentNote, notesPath } = get()
    if (!currentNote) return true
    const draft: NoteDraft = {
      title: currentNote.meta.title,
      text: currentNote.body,
      due: currentNote.meta.due,
      color: currentNote.meta.color,
      priority: currentNote.meta.priority,
      tags: currentNote.meta.tags,
    }
    try {
      await window.jazz.updateNoteDraft(currentNote.relPath, draft, notesPath)
    } catch {
      return false
    }
    const dirty = new Set(get().dirtyNotes)
    dirty.delete(currentNote.relPath)
    set({
      currentNote: { ...currentNote },
      dirtyNotes: dirty,
    })
    return true
  },

  createNote: async (title: string, onCreated?: (relPath: string) => void) => {
    const { notesPath, notes, sidebarSelection } = get()
    const folder = sidebarSelection.type === 'folder' ? sidebarSelection.path : ''
    const finalTitle = title.trim() || `#${computeAndStoreNextId(notes)}`
    const draft: NoteDraft = { title: finalTitle, text: '', folder }
    try {
      const info = await window.jazz.createNoteDraft(draft, notesPath)
      const now = new Date().toISOString()
      const meta: NoteMeta = { id: info.id, title: info.title, created: now, updated: now }
      ignoreWatcher.add(info.relPath)
      setTimeout(() => ignoreWatcher.delete(info.relPath), 3000)
      onCreated?.(info.relPath)
      set({
        notes: [
          ...notes,
          {
            relPath: info.relPath,
            title: info.title,
            meta,
            content: '',
            body: '',
          },
        ],
      })
      return info.relPath
    } catch (e) {
      throw e
    }
  },

  handleExternalChange: (relPath: string) => {
    const rel = relPath.replace(/^\/+/, '')
    if (ignoreWatcher.has(rel)) return
    void debouncedReload()
  },

  renameNote: async (relPath: string, title: string) => {
    const { notesPath, notes } = get()
    const note = notes.find((n) => n.relPath === relPath)
    const finalTitle = title.trim()
    if (!note || !finalTitle || finalTitle === note.title) return
    const body = replaceFirstHeading(note.body, finalTitle)
    const draft: NoteDraft = {
      title: finalTitle,
      text: body,
      due: note.meta.due,
      color: note.meta.color,
      priority: note.meta.priority,
      tags: note.meta.tags,
    }
    await window.jazz.updateNoteDraft(relPath, draft, notesPath)
    await get().loadNotes()
  },

  updateNoteMetaByPath: async (relPath: string, patch: Partial<NoteMeta>) => {
    const { notesPath, notes } = get()
    const note = notes.find((n) => n.relPath === relPath)
    if (!note) return
    const meta = { ...note.meta, ...patch }
    const draft: NoteDraft = {
      title: meta.title,
      text: note.body,
      due: meta.due,
      color: meta.color,
      priority: meta.priority,
      tags: meta.tags,
    }
    await window.jazz.updateNoteDraft(relPath, draft, notesPath)
    await get().loadNotes()
  },

  moveNote: async (relPath: string, destFolder: string | null) => {
    const { notesPath } = get()
    const leaf = leafName(relPath)
    const newPath = destFolder ? `${destFolder}/${leaf}` : leaf
    if (newPath === relPath) return
    await window.jazz.rename(relPath, newPath, notesPath)
    if (get().currentNote?.relPath === relPath) {
      set({ currentNote: { ...get().currentNote!, relPath: newPath } })
    }
    await get().loadNotes()
  },

  deleteNote: async (relPath: string) => {
    const { notesPath } = get()
    await window.jazz.deleteFile(relPath, notesPath)
    if (get().currentNote?.relPath === relPath) {
      set({ currentNote: null })
    }
    await get().loadNotes()
  },

  setSidebarSelection: (sel) => set({ sidebarSelection: sel }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSortBy: (s) => set({ sortBy: s }),

  replaceNote: (relPath, note) => {
    const dirty = new Set(get().dirtyNotes)
    dirty.delete(relPath)
    set({
      currentNote: note,
      dirtyNotes: dirty,
      notes: get().notes.map((n) => (n.relPath === relPath ? note : n)),
    })
  },

  createFolder: async (name: string) => {
    const n = name.trim().replace(/[/\\]/g, '')
    if (!n) return
    const { notesPath, sidebarSelection } = get()
    const folder = sidebarSelection.type === 'folder' ? sidebarSelection.path : ''
    const rel = folder ? `${folder}/${n}` : n
    await window.jazz.createDir(rel, notesPath)
    await get().loadNotes()
    set({ sidebarSelection: { type: 'folder', path: rel } })
  },

  renameFolder: async (folder: string, newName: string) => {
    const name = newName.trim().replace(/[/\\]/g, '')
    if (!name) return
    const parent = parentOf(folder)
    const newPath = parent ? `${parent}/${name}` : name
    if (newPath === folder) return
    const { notesPath } = get()
    await window.jazz.rename(folder, newPath, notesPath)
    await get().loadNotes()
    const sel = get().sidebarSelection
    if (sel.type === 'folder' && sel.path === folder) {
      set({ sidebarSelection: { type: 'folder', path: newPath } })
    }
  },

  moveFolder: async (folder: string, dest: string | null) => {
    const { notesPath } = get()
    const newPath = moveFolderPath(folder, dest)
    if (newPath === folder) return
    await window.jazz.rename(folder, newPath, notesPath)
    await get().loadNotes()
    const sel = get().sidebarSelection
    if (sel.type === 'folder' && sel.path === folder) {
      set({ sidebarSelection: { type: 'folder', path: newPath } })
    }
  },

  deleteFolder: async (folder: string) => {
    const { notesPath } = get()
    await window.jazz.deleteDir(folder, notesPath)
    await get().loadNotes()
    const sel = get().sidebarSelection
    if (sel.type === 'folder' && sel.path === folder) {
      set({ sidebarSelection: { type: 'all' } })
    }
  },
}))

const debouncedReload = debounce(() => {
  void useNotesStore.getState().loadNotes()
}, 250)
