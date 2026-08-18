import { useEffect, useState } from 'react'
import { useNotesStore, type SortBy, type Note } from '../stores/notes'
import { useColors } from '../theme'
import { t } from '../utils/i18n'
import { useSettingsStore } from '../stores/settings'
import { useSyncStore } from '../stores/sync'
import { isInFolder, leafName, depthOf } from '../utils/folder'
import Sidebar from '../components/Sidebar'
import NoteCard from '../components/NoteCard'
import ConfirmDialog from '../components/ConfirmDialog'
import NextDueTimer from '../components/NextDueTimer'
import SyncIndicator from '../components/SyncIndicator'
import ContextMenu from '../components/ContextMenu'
import Modal from '../components/Modal'
import PromptDialog from '../components/PromptDialog'
import DatePicker from '../components/DatePicker'
import ColorPicker from '../components/ColorPicker'
import type React from 'react'

interface Props {
  onSelectNote: (relPath: string) => void
}

interface NoteItemProps {
  note: Note
  isDeleting: boolean
  onOpen: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDeleteConfirmed: () => void
}

function NoteItem({ note, isDeleting, onOpen, onContextMenu, onDeleteConfirmed }: NoteItemProps) {
  if (isDeleting) {
    return (
      <div
        style={{ animation: 'cardOut 0.22s ease both' }}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) onDeleteConfirmed()
        }}
      >
        <NoteCard note={note} isActive={false} onClick={onOpen} onContextMenu={onContextMenu} />
      </div>
    )
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-jazz-note', note.relPath)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <NoteCard note={note} isActive={false} onClick={onOpen} onContextMenu={onContextMenu} />
    </div>
  )
}

type NoteAction = { note: Note; action: 'rename' | 'date' | 'color' | 'delete' } | null

export default function NoteList({ onSelectNote }: Props) {
  const colors = useColors()
  const lang = useSettingsStore((s) => s.lang)
  const showDone = useSettingsStore((s) => s.showDone)
  const notes = useNotesStore((s) => s.notes)
  const loading = useNotesStore((s) => s.loading)
  const sidebarSelection = useNotesStore((s) => s.sidebarSelection)
  const searchQuery = useNotesStore((s) => s.searchQuery)
  const sortBy = useNotesStore((s) => s.sortBy)
  const loadNotes = useNotesStore((s) => s.loadNotes)
  const setSearchQuery = useNotesStore((s) => s.setSearchQuery)
  const setSortBy = useNotesStore((s) => s.setSortBy)
  const deleteNote = useNotesStore((s) => s.deleteNote)
  const createNote = useNotesStore((s) => s.createNote)
  const renameNote = useNotesStore((s) => s.renameNote)
  const moveNote = useNotesStore((s) => s.moveNote)
  const updateNoteMetaByPath = useNotesStore((s) => s.updateNoteMetaByPath)
  const folders = useNotesStore((s) => s.folders)

  const [newTitle, setNewTitle] = useState('')
  const [deleting, setDeleting] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; note: Note } | null>(null)
  const [noteAction, setNoteAction] = useState<NoteAction>(null)
  const [movingNote, setMovingNote] = useState<Note | null>(null)

  const handleDeleted = (relPath: string) => {
    deleteNote(relPath)
    setDeleting((prev) => {
      const next = new Set(prev)
      next.delete(relPath)
      return next
    })
  }

  useEffect(() => {
    loadNotes()
  }, [])

  useEffect(() => {
    void useSyncStore.getState().startup()
  }, [])

  useEffect(() => {
    const unsub = window.jazz.onNotesChanged((relPath) => {
      useNotesStore.getState().handleExternalChange(relPath)
    })
    return unsub
  }, [])

  let filtered = notes.filter((n) => {
    if (sidebarSelection.type === 'folder') {
      if (!isInFolder(n.relPath, sidebarSelection.path)) return false
    }
    if (sidebarSelection.type === 'today') {
      if (!n.meta.due) return false
      const today = new Date()
      const d = new Date(n.meta.due)
      if (d.toDateString() !== today.toDateString()) return false
    }
    if (sidebarSelection.type === 'tomorrow') {
      if (!n.meta.due) return false
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const d = new Date(n.meta.due)
      if (d.toDateString() !== tomorrow.toDateString()) return false
    }
    if (sidebarSelection.type === 'week') {
      if (!n.meta.due) return false
      const week = new Date()
      week.setDate(week.getDate() + 7)
      const d = new Date(n.meta.due)
      if (d > week) return false
    }
    if (sidebarSelection.type === 'later') {
      if (!n.meta.due) return false
      const week = new Date()
      week.setDate(week.getDate() + 7)
      const d = new Date(n.meta.due)
      if (d <= week) return false
    }
    if (sidebarSelection.type === 'nodate') {
      if (n.meta.due) return false
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (
        !n.title.toLowerCase().includes(q) &&
        !n.body.toLowerCase().includes(q)
      )
        return false
    }
    if (n.meta.done && !showDone) return false
    return true
  })

  if (sortBy === 'due') {
    filtered = [...filtered].sort((a, b) => {
      if (!a.meta.due && !b.meta.due) return 0
      if (!a.meta.due) return 1
      if (!b.meta.due) return -1
      return new Date(a.meta.due).getTime() - new Date(b.meta.due).getTime()
    })
  } else {
    filtered = [...filtered].sort((a, b) => {
      const aT = a.meta.updated || a.meta.created || ''
      const bT = b.meta.updated || b.meta.created || ''
      return bT.localeCompare(aT)
    })
  }

  const handleCreate = async (quick = false) => {
    setNewTitle('')
    const relPath = await createNote(newTitle)
    if (relPath && !quick) onSelectNote(relPath)
  }

  const openMenu = (note: Note, x: number, y: number) => {
    setMenu({ note, x, y })
  }

  const closeAction = () => setNoteAction(null)

  const sortOptions: Array<{ value: SortBy; label: string }> = [
    { value: 'date', label: t('sort.by.date', lang) },
    { value: 'due', label: t('sort.by.due', lang) },
  ]

  return (
    <div style={layoutStyle}>
      <Sidebar />
      <div style={mainStyle}>
        <div style={topBarStyle}>
          <NextDueTimer />
          <div style={{ position: 'relative' as const }}>
            <input
              style={searchStyle(colors)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search.placeholder', lang)}
            />
            {searchQuery && (
              <button style={clearBtnStyle(colors)} onClick={() => setSearchQuery('')}>×</button>
            )}
          </div>
          <div style={sortRowStyle}>
            {sortOptions.map((opt) => (
              <button
                key={opt.value}
                style={{
                  ...sortBtnStyle(colors),
                  ...(sortBy === opt.value ? sortBtnActiveStyle(colors) : {}),
                }}
                onClick={() => setSortBy(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <SyncIndicator />
        </div>

        <div style={listStyle}>
          {loading && <div style={loadingStyle(colors)}>{t('loading', lang)}</div>}
          {!loading && filtered.length === 0 && (
            <div style={emptyStyle(colors)}>
              {searchQuery ? t('no.results', lang) : t('no.notes', lang)}
            </div>
          )}
          {filtered.map((note) => (
            <NoteItem
              key={note.relPath}
              note={note}
              isDeleting={deleting.has(note.relPath)}
              onOpen={() => onSelectNote(note.relPath)}
              onContextMenu={(e) => {
                e.preventDefault()
                openMenu(note, e.clientX, e.clientY)
              }}
              onDeleteConfirmed={() => handleDeleted(note.relPath)}
            />
          ))}
        </div>

        <div style={bottomBarStyle(colors)}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={newNoteInputStyle(colors)}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t('new.note.placeholder', lang)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate(e.ctrlKey || e.metaKey)
              }}
            />
            <button style={createBtnStyle(colors)} onClick={(e) => handleCreate(e.ctrlKey || e.metaKey)}>{t('create', lang)}</button>
          </div>
        </div>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { icon: '✓', iconColor: '#9ece6a', label: '', onClick: () => void updateNoteMetaByPath(menu.note.relPath, { done: true }) },
            { icon: '🕐', iconColor: '#ff9e64', label: '', onClick: () => setNoteAction({ note: menu.note, action: 'date' }) },
            { icon: '✕', iconColor: '#848597', label: '', onClick: () => void updateNoteMetaByPath(menu.note.relPath, { done: false, due: undefined }) },
            { label: t('context.rename', lang), onClick: () => setNoteAction({ note: menu.note, action: 'rename' }) },
            { label: t('context.move.note', lang), onClick: () => setMovingNote(menu.note) },
            { label: t('context.change.date', lang), onClick: () => setNoteAction({ note: menu.note, action: 'date' }) },
            { label: t('context.change.color', lang), onClick: () => setNoteAction({ note: menu.note, action: 'color' }) },
            { label: t('context.delete', lang), onClick: () => setNoteAction({ note: menu.note, action: 'delete' }), danger: true },
          ]}
        />
      )}

      {movingNote && (
        <Modal title={t('move.note', lang)} onClose={() => setMovingNote(null)}>
          <div style={moveListStyle}>
            <button
              style={moveTargetStyle(colors)}
              onClick={() => {
                void moveNote(movingNote.relPath, null)
                setMovingNote(null)
              }}
            >
              {"\u2514"} {t('move.to.root', lang)}
            </button>
            {[...folders].sort().map((folder) => (
              <button
                key={folder}
                style={moveTargetStyle(colors)}
                onClick={() => {
                  void moveNote(movingNote.relPath, folder)
                  setMovingNote(null)
                }}
              >
                {"\u2514"} <span style={{ paddingLeft: depthOf(folder) * 14 }}>{leafName(folder)}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {noteAction?.action === 'rename' && (
        <PromptDialog
          message={t('rename.note', lang)}
          initialValue={noteAction.note.title}
          confirmLabel={t('rename', lang)}
          onConfirm={(v) => {
            void renameNote(noteAction.note.relPath, v)
            closeAction()
          }}
          onCancel={closeAction}
        />
      )}

      {noteAction?.action === 'delete' && (
        <ConfirmDialog
          message={t('delete.confirm', lang)}
          confirmLabel={t('delete', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={() => {
            setDeleting((prev) => new Set(prev).add(noteAction.note.relPath))
            closeAction()
          }}
          onCancel={closeAction}
        />
      )}

      {noteAction?.action === 'date' && (
        <Modal onClose={closeAction}>
          <DatePicker
            date={noteAction.note.meta.due || ''}
            onDateChange={(d) => {
              void updateNoteMetaByPath(noteAction.note.relPath, { due: d || undefined })
            }}
            onDone={closeAction}
          />
        </Modal>
      )}

      {noteAction?.action === 'color' && (
        <Modal onClose={closeAction}>
          <ColorPicker
            value={noteAction.note.meta.color || ''}
            onChange={(c) => {
              void updateNoteMetaByPath(noteAction.note.relPath, { color: c || undefined })
              closeAction()
            }}
          />
        </Modal>
      )}
    </div>
  )
}

const layoutStyle: React.CSSProperties = {
  display: 'flex',
  height: '100%',
}
const mainStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}
const topBarStyle: React.CSSProperties = {
  padding: '12px 20px 8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}
const sortRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
}
const listStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: '8px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}
const searchStyle = (c: any) => ({
  width: '100%',
  padding: '8px 12px',
  background: c.bgAlt,
  border: `1px solid ${c.border}`,
  borderRadius: 6,
  color: c.fg,
  fontSize: 13,
})
const clearBtnStyle = (c: any) => ({
  position: 'absolute' as const,
  right: 8,
  top: '50%',
  transform: 'translateY(-50%)',
  color: c.comment,
  fontSize: 16,
})
const sortBtnStyle = (c: any) => ({
  padding: '4px 10px',
  fontSize: 11,
  color: c.comment,
  borderRadius: 4,
})
const sortBtnActiveStyle = (c: any) => ({
  background: c.bgHighlight,
  color: c.blue,
  fontWeight: 600,
})
const loadingStyle = (c: any) => ({
  color: c.comment,
  textAlign: 'center' as const,
  padding: 40,
})
const emptyStyle = (c: any) => ({
  color: c.comment,
  textAlign: 'center' as const,
  padding: 60,
  fontSize: 14,
})
const bottomBarStyle = (c: any) => ({
  padding: '8px 20px 12px',
  borderTop: `1px solid ${c.border}`,
})
const newNoteInputStyle = (c: any) => ({
  flex: 1,
  padding: '8px 12px',
  background: c.bgAlt,
  border: `1px solid ${c.border}`,
  borderRadius: 6,
  color: c.fg,
  fontSize: 13,
})
const createBtnStyle = (c: any) => ({
  padding: '8px 16px',
  background: c.blue,
  color: c.bg,
  borderRadius: 6,
  fontWeight: 700,
  fontSize: 16,
})
const moveListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  maxHeight: '50vh',
  overflowY: 'auto',
}
const moveTargetStyle = (c: any): React.CSSProperties => ({
  textAlign: 'left' as const,
  padding: '8px 12px',
  borderRadius: 6,
  fontSize: 13,
  color: c.fg,
  background: c.bgAlt,
  border: `1px solid ${c.border}`,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})
