import type { Note } from '../stores/notes'
import { useColors, useNoteColors, getVariant } from '../theme'
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
  const palette = useSettingsStore((s) => s.palette)
  const isDark = useSettingsStore((s) => s.isDark)
  const lang = useSettingsStore((s) => s.lang)
  const c = isActive ? getVariant(palette, !isDark).colors : colors
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
  const preview = note.body.replace(/^#+\s*/gm, '').replace(/[*~`>-]/g, '').trim().slice(0, 140)
  const cardBg = noteColor ? mixHex(noteColor, c.bgAlt, 0.1) : undefined
  const folder = parentOf(note.relPath)

  return (
    <div
      style={{
        ...card(c),
        ...(cardBg ? { background: cardBg } : {}),
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
          {note.meta.done && <span style={doneMarkStyle(c)}>{'\u2713'}</span>}
          <span style={titleStyle(c, note.meta.done)}>{note.title || t('untitled', lang)}</span>
        </div>
        {preview && <div style={previewStyle(c)}>{preview}</div>}
        <div style={styles.footer}>
          {folder && (
            <span style={pillStyle(c)} title={folder}>
              {leafName(folder)}
            </span>
          )}
          {due && (
            <span style={{ ...dueStyle(c), ...(isOverdue ? overdueStyle(c) : {}) }}>
              {due.toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short' })}
            </span>
          )}
          {countdown && <span style={countdownStyle(c)}>{countdown}</span>}
          {movedFrom && <span style={movedFromStyle(c)}>{t('moved.from', lang) + ' ' + movedFrom}</span>}
          {note.meta.updated && (
            <span style={updatedStyle(c)}>
              {new Date(note.meta.updated).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  body: { flex: 1, padding: '10px 12px', minWidth: 0 },
  header: { display: 'flex', alignItems: 'center', gap: 6 },
  footer: { display: 'flex', gap: 8, marginTop: 6, fontSize: 11 },
}

const card = (c: any) => ({
  display: 'flex',
  borderRadius: 6,
  overflow: 'hidden',
  background: c.bgAlt,
  border: `1px solid ${c.border}`,
  cursor: 'pointer',
  transition: 'border-color 0.1s, background 0.1s',
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
const previewStyle = (c: any) => ({
  fontSize: 12,
  color: c.comment,
  marginTop: 4,
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical' as any,
  lineClamp: 2,
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
