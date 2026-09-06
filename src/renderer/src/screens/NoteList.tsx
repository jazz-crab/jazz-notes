import { useEffect, useMemo, useRef, useState } from 'react'
import { useNotesStore, type SortBy, type Note } from '../stores/notes'
import { useColors } from '../theme'
import { t } from '../utils/i18n'
import { useSettingsStore } from '../stores/settings'
import { useSyncStore } from '../stores/sync'
import { isInFolder, leafName, depthOf } from '../utils/folder'
import { useIsMobile } from '../utils/useMedia'
import Sidebar from '../components/Sidebar'
import NoteCard from '../components/NoteCard'
import ConfirmDialog from '../components/ConfirmDialog'
import NextDueTimer from '../components/NextDueTimer'
import CalendarView from '../components/CalendarView'
import SyncIndicator from '../components/SyncIndicator'
import ContextMenu from '../components/ContextMenu'
import Modal from '../components/Modal'
import { dialogCount } from '../stores/ui'
import PromptDialog from '../components/PromptDialog'
import DatePicker from '../components/DatePicker'
import ColorPicker from '../components/ColorPicker'
import NoteCreateDialog from '../components/NoteCreateDialog'
import { DndContext, useDraggable, useSensors, useSensor, PointerSensor, TouchSensor } from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type React from 'react'

const RU_TO_LATIN: Record<string, string> = {
  'о': 'j', 'л': 'k', 'д': 'l', 'в': 'd', 'ч': 'x', 'к': 'r', 'щ': 'o', 'т': 'n', 'п': 'g', 'у': 'e', 'ы': 's', 'б': ',', 'а': 'f', '.': '/',
}

interface Props {
  isVisible: boolean
  onSelectNote: (relPath: string, editing?: boolean) => void
}

interface NoteItemProps {
  note: Note
  isDeleting: boolean
  isActive: boolean
  isLastOpened: boolean
  onOpen: () => void
  onHover: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDeleteConfirmed: () => void
}

function NoteItem({ note, isDeleting, isActive, isLastOpened, onOpen, onHover, onContextMenu, onDeleteConfirmed }: NoteItemProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: note.relPath })
  const confirmedRef = useRef(false)

  useEffect(() => {
    if (isDeleting && !confirmedRef.current) {
      confirmedRef.current = true
      onDeleteConfirmed()
    }
  }, [isDeleting])

  if (isDeleting) {
    return (
      <div>
        <NoteCard note={note} isActive={false} isLastOpened={isLastOpened} onClick={onOpen} onContextMenu={onContextMenu} />
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      {...(isActive ? { 'data-active': 'true' } : {})}
      onMouseEnter={onHover}
      style={{
        transform: CSS.Transform.toString(transform),
        opacity: isDragging ? 0.5 : 1,
        touchAction: 'none',
        width: isActive ? '100%' : '96%',
        marginLeft: isActive ? 0 : 'auto',
        transition: 'width 0.15s ease, margin-left 0.15s ease',
      }}
    >
      <NoteCard note={note} isActive={isActive} isLastOpened={isLastOpened} onClick={onOpen} onContextMenu={onContextMenu} />
    </div>
  )
}

type NoteAction = { note: Note; action: 'rename' | 'date' | 'color' | 'delete' } | null

export default function NoteList({ isVisible, onSelectNote }: Props) {
  const colors = useColors()
  const lang = useSettingsStore((s) => s.lang)
  const showDone = useSettingsStore((s) => s.showDone)
  const notes = useNotesStore((s) => s.notes)
  const loading = useNotesStore((s) => s.loading)
  const lastOpenedRelPath = useNotesStore((s) => s.lastOpenedRelPath)
  const sidebarSelection = useNotesStore((s) => s.sidebarSelection)
  const searchQuery = useNotesStore((s) => s.searchQuery)
  const searchResults = useNotesStore((s) => s.searchResults)
  const searchLoading = useNotesStore((s) => s.searchLoading)
  const sortBy = useNotesStore((s) => s.sortBy)
  const loadNotes = useNotesStore((s) => s.loadNotes)
  const vaultExists = useNotesStore((s) => s.vaultExists)
  const setSearchQuery = useNotesStore((s) => s.setSearchQuery)
  const setSortBy = useNotesStore((s) => s.setSortBy)
  const setLastListOrder = useNotesStore((s) => s.setLastListOrder)
  const deleteNote = useNotesStore((s) => s.deleteNote)
  const renameNote = useNotesStore((s) => s.renameNote)
  const moveNote = useNotesStore((s) => s.moveNote)
  const updateNoteMetaByPath = useNotesStore((s) => s.updateNoteMetaByPath)
  const folders = useNotesStore((s) => s.folders)

  const [deleting, setDeleting] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; note: Note } | null>(null)
  const [noteAction, setNoteAction] = useState<NoteAction>(null)
  const [movingNote, setMovingNote] = useState<Note | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [view, setView] = useState<'list' | 'kanban'>('list')
  const [showCreate, setShowCreate] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const lastGTime = useRef(0)
  const isMobile = useIsMobile()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const over = e.over
    if (!over) return
    const relPath = String(e.active.id)
    const folder = over.id === 'root' ? null : String(over.id)
    void moveNote(relPath, folder)
  }

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

  const filtered = useMemo(() => {
    let list = notes.filter((n) => {
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
      if (n.meta.done && !showDone) return false
      return true
    })

    if (searchQuery && searchResults) {
      const byPath = new Map(searchResults.map((r) => [r.relPath, r]))
      list = list.filter((n) => byPath.has(n.relPath))
    }
    if (searchQuery && searchResults === null) {
      list = []
    }

    if (sortBy === 'due') {
      list = [...list].sort((a, b) => {
        if (!a.meta.due && !b.meta.due) return 0
        if (!a.meta.due) return 1
        if (!b.meta.due) return -1
        return new Date(a.meta.due).getTime() - new Date(b.meta.due).getTime()
      })
    } else {
      list = [...list].sort((a, b) => {
        const aT = a.meta.updated || a.meta.created || ''
        const bT = b.meta.updated || b.meta.created || ''
        return bT.localeCompare(aT)
      })
    }
    return list
  }, [notes, sidebarSelection.type, sidebarSelection.type === 'folder' ? sidebarSelection.path : undefined, searchQuery, searchResults, showDone, sortBy])

  useEffect(() => {
    void useSyncStore.getState().startup()
  }, [])

  useEffect(() => {
    const unsub = window.jazz.onNotesChanged((relPath) => {
      useNotesStore.getState().handleExternalChange(relPath)
    })
    return unsub
  }, [])

  useEffect(() => {
    const scrollToActive = () => {
      requestAnimationFrame(() => {
        listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'center' })
      })
    }
    if (!isVisible) return
    const handler = (e: KeyboardEvent) => {
      if (dialogCount() > 0) return
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement
      if (e.key === 'Escape') {
        if (searchQuery || typing) {
          e.preventDefault()
          e.stopImmediatePropagation()
          setSearchQuery('')
          searchRef.current?.blur()
          return
        }
      }
      if (typing) return
      const key = RU_TO_LATIN[e.key] ?? e.key
      if (e.key === 'Tab') {
        e.preventDefault()
        setView(v => (v === 'kanban' ? 'list' : 'kanban'))
        return
      }
      if (key === 'n') {
        e.preventDefault()
        setShowCreate(true)
        return
      }
      if (key === '/' || key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (key === 's') {
        e.preventDefault()
        document.querySelector<HTMLElement>('[data-jz-sidebar] [data-jz-item]')?.focus()
        return
      }
      if (key === ',') {
        e.preventDefault()
        useSettingsStore.getState().openSettings()
        return
      }
      if (key === 'g') {
        e.preventDefault()
        const now = Date.now()
        if (now - lastGTime.current < 500) {
          lastGTime.current = 0
          setActiveIdx(0)
          scrollToActive()
        } else {
          lastGTime.current = now
        }
        return
      }
      if (filtered.length === 0) return
      if (key === 'G') {
        e.preventDefault()
        setActiveIdx(filtered.length - 1)
        scrollToActive()
      } else if (key === 'j') {
        e.preventDefault()
        setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
        scrollToActive()
      } else if (key === 'k') {
        e.preventDefault()
        setActiveIdx((i) => Math.max(i - 1, 0))
        scrollToActive()
      } else if (key === 'd' || key === 'x') {
        e.preventDefault()
        const note = filtered[activeIdx]
        if (note) setConfirmDelete(note.relPath)
      } else if (key === 'r') {
        e.preventDefault()
        const note = filtered[activeIdx]
        if (note) setNoteAction({ note, action: 'rename' })
      } else if (key === 'e') {
        e.preventDefault()
        const note = filtered[activeIdx]
        if (note) onSelectNote(note.relPath, true)
      } else if (key === 'o' || key === 'l' || key === ' ' || key === 'Spacebar' || key === 'Enter') {
        e.preventDefault()
        const note = filtered[activeIdx]
        if (note) onSelectNote(note.relPath, false)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [isVisible, filtered, activeIdx, searchQuery, onSelectNote])

  useEffect(() => {
    setActiveIdx((i) => (i >= filtered.length ? Math.max(0, filtered.length - 1) : i))
  }, [filtered.length])

  useEffect(() => {
    setLastListOrder(filtered.map((n) => n.relPath))
  }, [filtered, setLastListOrder])

  const openMenu = (note: Note, x: number, y: number) => {
    setMenu({ note, x, y })
  }

  const closeAction = () => setNoteAction(null)

  const showCalendar = view === 'kanban' && !searchQuery && (sidebarSelection.type === 'all' || sidebarSelection.type === 'folder')

  const sortOptions: Array<{ value: SortBy; label: string }> = [
    { value: 'date', label: t('sort.by.date', lang) },
    { value: 'due', label: t('sort.by.due', lang) },
  ]

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div style={layoutStyle}>
      {isMobile ? (
        sidebarOpen && (
          <div style={overlayStyle(colors)} onClick={() => setSidebarOpen(false)}>
            <div style={mobileSidebarStyle(colors)} onClick={(e) => e.stopPropagation()}>
              <Sidebar />
              <button style={closeBtnStyle(colors)} onClick={() => setSidebarOpen(false)}>×</button>
            </div>
          </div>
        )
      ) : (
        <Sidebar />
      )}
      <div style={mainStyle}>
        <div style={{ ...topBarStyle, ...(isMobile ? { padding: '8px 12px 6px' } : {}) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isMobile && (
              <button style={hamburgerStyle(colors)} onClick={() => setSidebarOpen(true)}>{'\u2630'}</button>
            )}
            <NextDueTimer />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              style={addBtnStyle(colors)}
              title={t('new.note', lang)}
              onClick={() => setShowCreate(true)}
            >
              {'+'}
            </button>
            <div style={{ position: 'relative' as const, flex: 1 }}>
              <input
                ref={searchRef}
                style={searchStyle(colors)}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search.placeholder', lang)}
              />
              {searchQuery && (
                <button style={clearBtnStyle(colors)} onClick={() => setSearchQuery('')}>×</button>
              )}
            </div>
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

        {showCalendar ? (
          <CalendarView onSelectNote={onSelectNote} />
        ) : (
        <div ref={listRef} style={{ ...listStyle, ...(isMobile ? { padding: '6px 12px' } : {}) }}>
          {loading && <div style={loadingStyle(colors)}>{t('loading', lang)}</div>}
          {!loading && filtered.length === 0 && (
            !vaultExists ? (
              <div style={{ ...emptyStyle(colors), whiteSpace: 'pre-line' }}>
                {t('vault.missing', lang)}
                <button style={vaultRetryBtnStyle(colors)} onClick={() => void loadNotes()}>
                  {t('vault.retry', lang)}
                </button>
              </div>
            ) : (
              <div style={emptyStyle(colors)}>
                {searchQuery && searchLoading
                  ? t('searching', lang)
                  : searchQuery
                    ? t('no.results', lang)
                    : t('no.notes', lang)}
              </div>
            )
          )}
          {filtered.map((note, idx) => (
            <NoteItem
              key={note.relPath}
              note={note}
              isDeleting={deleting.has(note.relPath)}
              isActive={idx === activeIdx}
              isLastOpened={note.relPath === lastOpenedRelPath}
              onOpen={() => onSelectNote(note.relPath)}
              onHover={() => setActiveIdx(idx)}
              onContextMenu={(e) => {
                e.preventDefault()
                openMenu(note, e.clientX, e.clientY)
              }}
              onDeleteConfirmed={() => handleDeleted(note.relPath)}
            />
          ))}
        </div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { icon: '✓', iconColor: '#9ece6a', label: '', onClick: () => void updateNoteMetaByPath(menu.note.relPath, { done: true }) },
            { icon: '🕐', iconColor: '#ff9e64', label: '', onClick: () => setNoteAction({ note: menu.note, action: 'date' }) },
            { icon: '✕', iconColor: '#848597', label: '', onClick: () => void updateNoteMetaByPath(menu.note.relPath, { done: false, due: undefined, movedFrom: undefined }) },
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
              void updateNoteMetaByPath(noteAction.note.relPath, { due: d || undefined, movedFrom: undefined })
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

      {showCreate && (
        <NoteCreateDialog
          defaultFolder={sidebarSelection.type === 'folder' ? sidebarSelection.path : ''}
          onClose={() => setShowCreate(false)}
          onCreated={(relPath) => {
            setShowCreate(false)
            onSelectNote(relPath)
          }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={t('delete.confirm', lang)}
          confirmLabel={t('delete', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={() => {
            deleteNote(confirmDelete)
            setConfirmDelete(null)
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
      </div>
    </DndContext>
  )
}

const layoutStyle: React.CSSProperties = {
  display: 'flex',
  height: '100%',
}
const hamburgerStyle = (c: any): React.CSSProperties => ({
  width: 34,
  height: 34,
  borderRadius: 6,
  border: `1px solid ${c.border}`,
  background: c.bgAlt,
  color: c.fg,
  fontSize: 16,
  cursor: 'pointer',
  flexShrink: 0,
})
const overlayStyle = (c: any): React.CSSProperties => ({
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  zIndex: 2000,
  display: 'flex',
})
const mobileSidebarStyle = (c: any): React.CSSProperties => ({
  width: 260,
  maxWidth: '85vw',
  background: c.bg,
  height: '100%',
  overflowY: 'auto',
  position: 'relative',
})
const closeBtnStyle = (c: any): React.CSSProperties => ({
  position: 'absolute',
  top: 8,
  right: 8,
  width: 28,
  height: 28,
  borderRadius: 6,
  border: `1px solid ${c.border}`,
  background: c.bgAlt,
  color: c.fg,
  fontSize: 16,
  cursor: 'pointer',
  zIndex: 10,
})
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
const vaultRetryBtnStyle = (c: any) => ({
  display: 'block',
  margin: '16px auto 0',
  padding: '8px 16px',
  background: c.blue,
  color: c.bg,
  borderRadius: 6,
  fontWeight: 700,
  fontSize: 13,
})
const addBtnStyle = (c: any): React.CSSProperties => ({
  width: 34,
  height: 34,
  borderRadius: 6,
  border: `1px solid ${c.border}`,
  background: c.bgAlt,
  color: c.fg,
  fontSize: 18,
  fontWeight: 700,
  cursor: 'pointer',
  flexShrink: 0,
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
