import type { Note } from '../stores/notes'
import { useColors, useNoteColors } from '../theme'
import { mixHex } from '../utils/color'
import { useSettingsStore } from '../stores/settings'
import { localeOf, t } from '../utils/i18n'
import { parentOf, leafName } from '../utils/folder'
import { formatSmartCountdown } from '../utils/countdown'
import { useEffect, useState } from 'react'
import type React from 'react'

interface Props {
  note: Note
  isActive: boolean
  isLastOpened?: boolean
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export default function NoteCard({ note, isActive, isLastOpened, onClick, onContextMenu }: Props) {
  const colors = useColors()
  const lang = useSettingsStore((s) => s.lang)
  const showCountdown = useSettingsStore((s) => s.showCountdown)
  const noteColorMap = useNoteColors()
  const noteColor = note.meta.color ? noteColorMap[note.meta.color] : null
  const due = note.meta.due ? new Date(note.meta.due) : null
  const movedFrom = note.meta.movedFrom
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const isOverdue = due && due < new Date()
  const isFuture = due && due.getTime() > now
  const countdown = isFuture && showCountdown ? formatSmartCountdown(due.getTime() - now, lang) : null
  const cardBg = noteColor ? mixHex(noteColor, colors.bgAlt, 0.1) : undefined
  const folder = parentOf(note.relPath)

  return (
    <div
      style={{
        ...card(colors),
        ...(cardBg ? { background: cardBg } : {}),
        ...(isActive ? cardActive(colors) : {}),
        ...(isLastOpened ? { borderColor: colors.blue, borderStyle: 'dashed' as const } : {}),
      }}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div style={styles.body}>
        <div style={styles.header}>
          {noteColor && (
            <span style={{ ...colorDot(noteColor) }} />
          )}
          {note.meta.done && <span style={doneMarkStyle(colors)}>{'\u2713'}</span>}
          <span style={titleStyle(colors, note.meta.done)}>{note.title || t('untitled', lang)}</span>
        </div>
        <div style={styles.footer}>
          {folder && (
            <span style={pillStyle(colors)} title={folder}>
              {leafName(folder)}
            </span>
          )}
          {due && (
            <span style={{ ...dueStyle(colors), ...(isOverdue ? overdueStyle(colors) : {}) }}>
              {due.toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short' })}
            </span>
          )}
          {countdown && <span style={countdownStyle(colors)}>{countdown}</span>}
          {movedFrom && <span style={movedFromStyle(colors)}>{t('moved.from', lang) + ' ' + movedFrom}</span>}
          {(note.meta.updated || note.meta.created) && (
            <span style={updatedStyle(colors)}>
              {new Date(note.meta.updated || note.meta.created || '').toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  body: { flex: 1, padding: '10px 12px', minWidth: 0, overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' },
  footer: { display: 'flex', gap: 8, marginTop: 6, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden' },
}

const card = (c: any): React.CSSProperties => ({
  display: 'flex',
  borderRadius: 6,
  overflow: 'hidden',
  background: c.bgAlt,
  border: `1px solid ${c.border}`,
  cursor: 'pointer',
})
const cardActive = (c: any) => ({
  background: mixHex(c.blue, c.bgAlt, 0.18),
})
const colorDot = (c: string) => ({
  width: 8,
  height: 8,
  borderRadius: '50%' as const,
  background: c,
  flexShrink: 0,
})
const titleStyle = (c: any, done?: boolean) => ({
  fontWeight: 600,
  fontSize: 14,
  color: c.fg,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
  flex: 1,
  opacity: done ? 0.6 : 1,
})
const doneMarkStyle = (c: any): React.CSSProperties => ({
  color: c.green,
  fontWeight: 700,
  fontSize: 13,
  flexShrink: 0,
})
const dueStyle = (c: any) => ({ color: c.yellow })
const overdueStyle = (c: any) => ({ color: c.red, fontWeight: 600 })
const countdownStyle = (c: any) => ({ color: c.orange, fontWeight: 700 })
const movedFromStyle = (c: any) => ({ color: c.comment })
const updatedStyle = (c: any) => ({ color: c.comment })
const pillStyle = (c: any) => ({
  fontSize: 10,
  color: c.blue,
  background: c.bgHighlight,
  border: `1px solid ${c.border}`,
  borderRadius: 999,
  padding: '1px 8px',
  whiteSpace: 'nowrap' as const,
  maxWidth: 120,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})
