import { useEffect, useState, useRef, useCallback } from 'react'
import { useNotesStore } from '../stores/notes'
import { useSettingsStore } from '../stores/settings'
import { useColors, useNoteColors } from '../theme'
import type { NoteMeta } from '../utils/frontmatter'
import { mixHex } from '../utils/color'
import { debounce } from '../utils/debounce'
import { t, localeOf } from '../utils/i18n'
import { replaceFirstHeading } from '../utils/note'
import NoteEditor from '../components/NoteEditor'
import DatePicker from '../components/DatePicker'
import ColorPicker from '../components/ColorPicker'
import SaveStatusCircle, { type SaveStatus } from '../components/SaveStatusCircle'
import HistoryDialog from '../components/HistoryDialog'
import SidePanel from '../components/SidePanel'
import UndoToast from '../components/UndoToast'

interface Props {
  relPath: string
  onBack: () => void
}

export default function NoteEdit({ relPath, onBack }: Props) {
  const colors = useColors()
  const lang = useSettingsStore((s) => s.lang)
  const noteColorMap = useNoteColors()
  const currentNote = useNotesStore((s) => s.currentNote)
  const setCurrentNote = useNotesStore((s) => s.setCurrentNote)
  const updateCurrentNote = useNotesStore((s) => s.updateCurrentNote)
  const updateNoteMeta = useNotesStore((s) => s.updateNoteMeta)
  const saveCurrentNote = useNotesStore((s) => s.saveCurrentNote)
  const dirtyNotes = useNotesStore((s) => s.dirtyNotes)
  const isDirty = currentNote ? dirtyNotes.has(currentNote.relPath) : false

  const [status, setStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<'color' | 'date' | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    setCurrentNote(relPath)
    return () => {
      setCurrentNote(null)
    }
  }, [relPath, setCurrentNote])

  const handleBack = useCallback(() => {
    if (isDirty) void performSaveRef.current()
    onBack()
  }, [isDirty, onBack])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleBack()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleBack])

  const performSaveRef = useRef(async () => {})
  performSaveRef.current = async () => {
    setStatus('saving')
    const ok = await saveCurrentNote()
    if (ok) {
      setLastSavedAt(new Date())
      setLastError(null)
      setStatus('success')
    } else {
      setLastError(t('save.error', lang))
      setStatus('error')
    }
  }
  const scheduleSave = useRef(debounce(() => {
    void performSaveRef.current()
  }, 400)).current

  useEffect(() => {
    if (currentNote?.relPath) {
      setStatus('idle')
      setLastSavedAt(currentNote.meta.updated ? new Date(currentNote.meta.updated) : null)
      setLastError(null)
      setSheet(null)
    }
  }, [currentNote?.relPath])

  const body = currentNote?.body
  const meta = currentNote?.meta
  useEffect(() => {
    if (isDirty) {
      setStatus('dirty')
      scheduleSave()
    }
  }, [body, meta, isDirty, scheduleSave])

  const handleChange = useCallback((value: string) => {
    updateCurrentNote(value)
  }, [updateCurrentNote])

  const handleTitleChange = useCallback((title: string) => {
    const note = useNotesStore.getState().currentNote
    if (!note) return
    updateNoteMeta({ title })
    updateCurrentNote(replaceFirstHeading(note.body, title))
  }, [updateNoteMeta, updateCurrentNote])

  const handleSave = useCallback(() => {
    void performSaveRef.current()
  }, [])

  const handleMetaChange = useCallback((newMeta: Partial<NoteMeta>) => {
    updateNoteMeta(newMeta)
  }, [updateNoteMeta])

  if (!currentNote) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
      </div>
    )
  }

  const noteColor = currentNote.meta.color ? noteColorMap[currentNote.meta.color] : null
  const editorTint = noteColor ? mixHex(noteColor, colors.bg, 0.2) : undefined
  const editorText = noteColor ? mixHex(noteColor, colors.fg, 0.45) : undefined
  const due = currentNote.meta.due ? new Date(currentNote.meta.due) : null
  const isOverdue = due && due < new Date()
  const isDone = currentNote.meta.done === true

  return (
    <div style={styles.container}>
      <div style={headerStyle(colors)}>
        <button style={backBtnStyle(colors)} onClick={handleBack}>{'\u2190'}</button>
        <input
          style={titleInputStyle(colors)}
          value={currentNote.meta.title}
          placeholder={t('untitled', lang)}
          onChange={(e) => handleTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab' || e.key === 'Enter') {
              e.preventDefault()
              const el = document.querySelector<HTMLElement>('.cm-content')
              if (el) {
                setTimeout(() => el.focus(), 0)
              }
            }
          }}
        />
        <button
          style={historyBtnStyle(colors)}
          onClick={() => setShowHistory(true)}
          title={t('history.title', lang)}
        >
          <span style={{ ...iconStyle, fontSize: 18 }}>{'\uf1da'}</span>
        </button>
        {isDone && (
          <span style={doneBadgeStyle} title={t('context.done', lang)}>{'\u2713'}</span>
        )}
        <SaveStatusCircle status={status} lastSavedAt={lastSavedAt} error={lastError} />
      </div>

      {showHistory && (
        <HistoryDialog relPath={currentNote.relPath} onClose={() => setShowHistory(false)} />
      )}

      <UndoToast />

      <div
        style={{
          ...styles.editorWrap,
          ...(editorTint ? { '--atomic-editor-bg': editorTint } as any : {}),
          ...(editorText ? { '--atomic-editor-fg': editorText } as any : {}),
        }}
      >
        <NoteEditor
          documentId={currentNote.relPath}
          value={currentNote.body}
          onChange={handleChange}
          onSave={handleSave}
        />
      </div>

      <button
        style={tabLeftStyle(colors)}
        onClick={() => setSheet('color')}
        title={t('note.color', lang)}
      >
        <span style={{ ...iconStyle, color: noteColor ?? colors.fgDark }}>{'\uDB80\uDCE3'}</span>
      </button>

      <button
        style={dateBtnStyle(colors)}
        onClick={() => setSheet('date')}
        title={t('note.date', lang)}
      >
        <span style={{ ...iconStyle, fontSize: 18 }}>{'\uf073'}</span>
        {due && (
          <span style={dateTextStyle(colors, !!isOverdue)}>
            {due.toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
      </button>

      <SidePanel side="left" open={sheet === 'color'} onClose={() => setSheet(null)}>
        <ColorPicker
          value={currentNote.meta.color || ''}
          onChange={(c) => {
            handleMetaChange({ color: c || undefined })
            setSheet(null)
          }}
        />
      </SidePanel>

      <SidePanel side="right" open={sheet === 'date'} onClose={() => setSheet(null)} width={300}>
        <DatePicker
          date={currentNote.meta.due || ''}
          onDateChange={(d) => handleMetaChange({ due: d || undefined })}
          onDone={() => setSheet(null)}
        />
      </SidePanel>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  editorWrap: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  spinner: {
    width: 24,
    height: 24,
    border: '2px solid var(--border)',
    borderTopColor: 'var(--blue)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
}

const headerStyle = (c: any) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 16px',
  borderBottom: `1px solid ${c.border}`,
  background: c.bgAlt,
  flexShrink: 0,
})
const backBtnStyle = (c: any) => ({
  fontSize: 18,
  color: c.blue,
  padding: '4px 8px',
  borderRadius: 4,
  flexShrink: 0,
})
const titleInputStyle = (c: any) => ({
  flex: 1,
  minWidth: 0,
  fontSize: 16,
  fontWeight: 700,
  color: c.fg,
  padding: '4px 0',
  background: 'transparent',
})
const historyBtnStyle = (c: any) => ({
  color: c.purple,
  padding: '4px 6px',
  borderRadius: 4,
  flexShrink: 0,
})
const doneBadgeStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  borderRadius: '50%',
  background: 'rgba(158, 206, 106, 0.15)',
  border: '1px solid rgba(158, 206, 106, 0.5)',
  color: '#9ece6a',
  fontSize: 13,
  fontWeight: 700,
  flexShrink: 0,
}
const iconStyle: React.CSSProperties = {
  fontFamily: 'Symbols Nerd Font',
  fontSize: 20,
  lineHeight: 1,
  display: 'block',
}
const tabStyle = (c: any) => ({
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: c.bgAlt,
  border: `1px solid ${c.border}`,
  color: c.fgDark,
  cursor: 'pointer',
  transition: 'color 0.15s, background 0.15s',
})
const tabLeftStyle = (c: any) => ({
  ...tabStyle(c),
  position: 'absolute' as const,
  left: 0,
  bottom: 0,
  zIndex: 5,
  borderLeft: 'none',
  borderBottom: 'none',
  borderTopRightRadius: 10,
})
const dateBtnStyle = (c: any) => ({
  position: 'absolute' as const,
  right: 0,
  bottom: 0,
  zIndex: 5,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 40,
  paddingLeft: 6,
  paddingRight: 12,
  background: c.bgAlt,
  border: `1px solid ${c.border}`,
  borderRight: 'none',
  borderBottom: 'none',
  borderTopLeftRadius: 10,
  cursor: 'pointer',
  maxWidth: '60vw',
})
const dateTextStyle = (c: any, overdue: boolean) => ({
  fontSize: 12,
  color: overdue ? c.red : c.fgDark,
  fontWeight: overdue ? 600 : 400,
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  animation: 'fadeIn 0.25s ease both',
})
