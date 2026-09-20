import { useMemo, useState, useRef, useEffect } from 'react'
import { DndContext, useDraggable, useDroppable, useSensors, useSensor, PointerSensor } from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import type { Note } from '../stores/notes'
import { useNotesStore } from '../stores/notes'
import { useSettingsStore } from '../stores/settings'
import { useColors } from '../theme'
import { t, localeOf } from '../utils/i18n'
import { partitionByDay, dayKeyOffset, localDateFromKey } from '../utils/calendar'
import NoteCard from './NoteCard'
import { dialogCount } from '../stores/ui'
import type React from 'react'

const RU_TO_LATIN: Record<string, string> = {
  'о': 'j', 'л': 'k', 'д': 'l', 'щ': 'o', 'п': 'g', 'р': 'h',
}

const VISIBLE_COUNT = 3

interface Props {
  onSelectNote: (relPath: string) => void
}

interface ColumnProps {
  column: { key: string; offset: number; notes: Note[] }
  isToday: boolean
  onOpen: (relPath: string) => void
  activeRelPath: string | null
}

const DAY_LABEL: Record<number, string> = {
  '-1': 'calendar.yesterday',
  0: 'calendar.today',
  1: 'calendar.tomorrow',
  2: 'calendar.day.after.tomorrow',
}

function ColumnHeader({ offset, dayKey, lang }: { offset: number; dayKey: string; lang: string }) {
  const colors = useColors()
  const labelId = DAY_LABEL[offset]
  const isToday = offset === 0
  if (labelId) {
    return <span style={headTodayStyle(colors, isToday)}>{t(labelId, lang as any)}</span>
  }
  const d = localDateFromKey(dayKey)
  return (
    <span style={headDateStyle(colors)}>
      {d.toLocaleDateString(localeOf(lang as any), { day: '2-digit', month: '2-digit', weekday: 'short' })}
    </span>
  )
}

function DraggableCard({ note, isActive, onOpen }: { note: Note; isActive: boolean; onOpen: (p: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: note.relPath })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ opacity: isDragging ? 0.4 : 1, touchAction: 'none' }}
    >
      <NoteCard note={note} isActive={isActive} onClick={() => onOpen(note.relPath)} />
    </div>
  )
}

function Column({ column, isToday, onOpen, activeRelPath }: ColumnProps) {
  const colors = useColors()
  const { setNodeRef, isOver } = useDroppable({ id: column.key })
  const lang = useSettingsStore((s) => s.lang)
  const count = column.notes.length
  return (
    <div
      ref={setNodeRef}
      style={{
        ...columnStyle(colors),
        ...(isOver ? { borderColor: colors.blue } : {}),
      }}
    >
      <div style={headRowStyle(colors, isToday)}>
        <ColumnHeader offset={column.offset} dayKey={column.key} lang={lang} />
        <span style={countStyle(colors)}>{count}</span>
      </div>
      <div style={cardListStyle}>
        {column.notes.map((note) => (
          <DraggableCard key={note.relPath} note={note} isActive={note.relPath === activeRelPath} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )
}

export default function CalendarView({ onSelectNote }: Props) {
  const colors = useColors()
  const notes = useNotesStore((s) => s.notes)
  const folders = useNotesStore((s) => s.folders)
  const sidebarSelection = useNotesStore((s) => s.sidebarSelection)
  const showDone = useSettingsStore((s) => s.showDone)
  const lang = useSettingsStore((s) => s.lang)
  const updateNoteMetaByPath = useNotesStore((s) => s.updateNoteMetaByPath)
  const [startOffset, setStartOffset] = useState(0)
  const [activeRelPath, setActiveRelPath] = useState<string | null>(null)
  const lastGTime = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const visibleOffsets = useMemo(
    () => Array.from({ length: VISIBLE_COUNT }, (_, i) => startOffset + i),
    [startOffset]
  )

  const activeFolder = sidebarSelection.type === 'folder' ? sidebarSelection.path : null

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (activeFolder !== null && !n.relPath.startsWith(activeFolder + '/')) return false
      return true
    })
  }, [notes, activeFolder])

  const data = useMemo(
    () => partitionByDay(filteredNotes, { visibleOffsets, showDone }),
    [filteredNotes, visibleOffsets, showDone]
  )

  const flatNotes = useMemo(
    () => data.columns.flatMap((c) => c.notes),
    [data.columns]
  )

  useEffect(() => {
    setActiveRelPath((prev) => {
      if (prev === null) return null
      return flatNotes.some((n) => n.relPath === prev) ? prev : null
    })
  }, [flatNotes])

  useEffect(() => {
    scrollRef.current?.scrollTo({ left: 0 })
  }, [startOffset])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (dialogCount() > 0) return
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement
      if (typing) return
      const key = RU_TO_LATIN[e.key] ?? e.key
      if (!['h', 'j', 'k', 'l', 'o', 'Enter', 'g', 'G'].includes(key)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (key === 'h') {
        setStartOffset((o) => o - 1)
        return
      }
      if (key === 'l') {
        setStartOffset((o) => o + 1)
        return
      }
      if (key === 'g') {
        const now = Date.now()
        if (now - lastGTime.current < 500) {
          lastGTime.current = 0
          if (flatNotes.length > 0) setActiveRelPath(flatNotes[0].relPath)
        } else {
          lastGTime.current = now
        }
        return
      }
      if (key === 'G') {
        if (flatNotes.length > 0) setActiveRelPath(flatNotes[flatNotes.length - 1].relPath)
        return
      }
      if (flatNotes.length === 0) return
      if (key === 'j') {
        if (activeRelPath === null) {
          setActiveRelPath(flatNotes[0].relPath)
          return
        }
        const idx = flatNotes.findIndex((n) => n.relPath === activeRelPath)
        if (idx >= 0 && idx < flatNotes.length - 1) {
          setActiveRelPath(flatNotes[idx + 1].relPath)
        }
        return
      }
      if (key === 'k') {
        if (activeRelPath === null) {
          setActiveRelPath(flatNotes[flatNotes.length - 1].relPath)
          return
        }
        const idx = flatNotes.findIndex((n) => n.relPath === activeRelPath)
        if (idx > 0) {
          setActiveRelPath(flatNotes[idx - 1].relPath)
        }
        return
      }
      if (key === 'o' || key === 'Enter') {
        if (activeRelPath !== null) onSelectNote(activeRelPath)
        return
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [flatNotes, activeRelPath, onSelectNote])

  const onDragEnd = (e: DragEndEvent) => {
    const over = e.over
    if (!over) return
    const relPath = String(e.active.id)
    const targetKey = String(over.id)
    const targetOffset = visibleOffsets.find((o) => dayKeyOffset(o) === targetKey)
    if (targetOffset === undefined) return
    void updateNoteMetaByPath(relPath, { due: targetKey, movedFrom: undefined })
  }

  const hasDue = data.columns.some((c) => c.notes.length > 0)

  return (
    <div style={wrapperStyle}>
      <div style={carouselStyle}>
        <button
          style={navBtnStyle(colors)}
          title={t('calendar.prev', lang)}
          onClick={() => setStartOffset((o) => o - 1)}
        >
          {'\u2039'}
        </button>
        <div ref={scrollRef} style={columnsRowStyle}>
          {data.columns.map((col) => (
            <Column key={col.key} column={col} isToday={col.offset === 0} onOpen={onSelectNote} activeRelPath={activeRelPath} />
          ))}
        </div>
        <button
          style={navBtnStyle(colors)}
          title={t('calendar.next', lang)}
          onClick={() => setStartOffset((o) => o + 1)}
        >
          {'\u203a'}
        </button>
      </div>
      {!hasDue && (
        <div style={emptyStyle(colors)}>
          {folders.length === 0 && data.noDate.length === 0
            ? t('calendar.empty', lang)
            : t('calendar.empty.dates', lang)}
        </div>
      )}
    </div>
  )
}

const wrapperStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  gap: 8,
  padding: '8px 20px',
}
const carouselStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  gap: 8,
  flex: 1,
  minHeight: 0,
}
const columnsRowStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  gap: 10,
  overflowX: 'auto',
  minHeight: 0,
}
const navBtnStyle = (c: any): React.CSSProperties => ({
  width: 34,
  flexShrink: 0,
  borderRadius: 6,
  border: `1px solid ${c.border}`,
  background: c.bgAlt,
  color: c.fg,
  fontSize: 22,
  cursor: 'pointer',
  alignSelf: 'center',
  lineHeight: 1,
  padding: '8px 0',
})
const columnStyle = (c: any): React.CSSProperties => ({
  flex: '1 1 0',
  minWidth: 220,
  display: 'flex',
  flexDirection: 'column',
  background: c.bgAlt,
  border: `1px solid ${c.border}`,
  borderRadius: 8,
  overflow: 'hidden',
})
const headRowStyle = (c: any, isToday: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  borderBottom: `1px solid ${c.border}`,
  background: isToday ? c.bgHighlight : 'transparent',
})
const headTodayStyle = (c: any, isToday: boolean): React.CSSProperties => ({
  fontWeight: 700,
  fontSize: 13,
  color: isToday ? c.blue : c.fg,
})
const headDateStyle = (c: any): React.CSSProperties => ({
  fontWeight: 600,
  fontSize: 13,
  color: c.fg,
  textTransform: 'capitalize' as const,
})
const countStyle = (c: any): React.CSSProperties => ({
  fontSize: 11,
  color: c.comment,
  background: c.bg,
  borderRadius: 999,
  padding: '1px 8px',
})
const cardListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minHeight: 0,
}
const emptyStyle = (c: any): React.CSSProperties => ({
  color: c.comment,
  textAlign: 'center' as const,
  fontSize: 13,
  padding: 12,
})
