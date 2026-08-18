import { useEffect, useState } from 'react'
import { useNotesStore } from '../stores/notes'
import { useSettingsStore } from '../stores/settings'
import { useColors } from '../theme'
import { localeOf, t } from '../utils/i18n'
import { formatSmartCountdown, nextUpcomingDue } from '../utils/countdown'
import type React from 'react'

export default function NextDueTimer() {
  const colors = useColors()
  const lang = useSettingsStore((s) => s.lang)
  const notes = useNotesStore((s) => s.notes)
  const showCountdown = useSettingsStore((s) => s.showCountdown)
  const setShowCountdown = useSettingsStore((s) => s.setShowCountdown)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const upcoming = nextUpcomingDue(notes, now)
  if (!upcoming || !showCountdown) return null

  const timeOfDay = new Date(upcoming.due).toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' })
  const preview = upcoming.note.body.replace(/^#+\s*/gm, '').replace(/[*~`>-]/g, '').trim().slice(0, 140)

  return (
    <div style={pill(colors)}>
      <div style={textBlockStyle}>
        <div style={firstLineStyle}>
          <span style={timeOfDayStyle(colors)}>{timeOfDay}</span>
          <span style={titleStyle(colors)}>{upcoming.note.title || t('untitled', lang)}</span>
        </div>
        {preview && <div style={previewStyle(colors)}>{preview}</div>}
      </div>
      <div style={timeWrap}>
        <span style={timeStyle(colors)}>{formatSmartCountdown(upcoming.due - now, lang)}</span>
      </div>
      <button style={hideBtn(colors)} onClick={() => setShowCountdown(false)} title={t('hide.countdown', lang)}>
        ×
      </button>
    </div>
  )
}

const pill = (c: any): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 14px',
  background: c.bgHighlight,
  border: `1px solid ${c.border}`,
  borderRadius: 6,
  minWidth: 0,
})
const textBlockStyle: React.CSSProperties = { flex: 1, minWidth: 0 }
const firstLineStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 }
const timeOfDayStyle = (c: any): React.CSSProperties => ({
  fontSize: 12,
  fontWeight: 700,
  color: c.fg,
  whiteSpace: 'nowrap' as const,
  flexShrink: 0,
})
const titleStyle = (c: any): React.CSSProperties => ({
  fontSize: 14,
  fontWeight: 700,
  color: c.fg,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
  minWidth: 0,
  flex: 1,
})
const previewStyle = (c: any): React.CSSProperties => ({
  fontSize: 12,
  color: c.comment,
  marginTop: 2,
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical' as any,
  lineClamp: 2,
})
const timeWrap: React.CSSProperties = { flexShrink: 0, marginLeft: 8 }
const timeStyle = (c: any): React.CSSProperties => ({
  fontFamily: 'var(--app-font)',
  fontSize: 16,
  fontWeight: 700,
  color: c.orange,
  whiteSpace: 'nowrap' as const,
  flexShrink: 0,
})
const hideBtn = (c: any): React.CSSProperties => ({
  color: c.comment,
  fontSize: 16,
  padding: '0 2px',
  opacity: 0.5,
  flexShrink: 0,
})
