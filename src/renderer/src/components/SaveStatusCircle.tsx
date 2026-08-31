import { useState } from 'react'
import { useColors } from '../theme'
import { useSettingsStore } from '../stores/settings'
import { t, localeOf } from '../utils/i18n'

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'success' | 'error'

interface Props {
  status: SaveStatus
  lastSavedAt: Date | null
  error?: string | null
}

const statusKey: Record<SaveStatus, string> = {
  idle: 'status.idle',
  dirty: 'status.dirty',
  saving: 'status.saving',
  success: 'status.success',
  error: 'status.error',
}

function colorFor(status: SaveStatus, c: any): string {
  if (status === 'error') return c.red
  if (status === 'dirty') return c.comment
  return c.green
}

function formatTime(d: Date, lang: 'ru' | 'en'): string {
  return d.toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' })
}

export default function SaveStatusCircle({ status, lastSavedAt, error }: Props) {
  const colors = useColors()
  const lang = useSettingsStore((s) => s.lang)
  const [showPopup, setShowPopup] = useState(false)
  const color = colorFor(status, colors)
  const statusLabel = t(statusKey[status], lang)

  return (
    <div style={containerStyle}>
      <button
        style={{
          ...dotStyle,
          background: color,
        }}
        onClick={() => setShowPopup((v) => !v)}
        title={statusLabel}
      />
      {showPopup && (
        <div style={popupStyle(colors)} onClick={() => setShowPopup(false)}>
          <div style={titleStyle(colors)}>{statusLabel}</div>
          {status === 'error' && error && (
            <div style={errorStyle(colors)}>{error}</div>
          )}
          <div style={timeStyle(colors)}>
            {status === 'error' && lastSavedAt
              ? `${t('last.saved.ok', lang)} ${formatTime(lastSavedAt, lang)}`
              : `${t('last.saved', lang)} ${lastSavedAt ? formatTime(lastSavedAt, lang) : '—'}`}
          </div>
        </div>
      )}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
}
const dotStyle: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  cursor: 'pointer',
  transition: 'background 0.5s ease, opacity 0.5s ease',
}
const popupStyle = (c: any) => ({
  position: 'absolute' as const,
  top: '100%',
  right: 0,
  marginTop: 8,
  width: 220,
  padding: '10px 12px',
  borderRadius: 8,
  background: c.bgPopup,
  border: `1px solid ${c.border}`,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  zIndex: 300,
})
const titleStyle = (c: any) => ({
  fontSize: 13,
  fontWeight: 600,
  color: c.fg,
})
const errorStyle = (c: any) => ({
  fontSize: 12,
  color: c.red,
  marginTop: 4,
})
const timeStyle = (c: any) => ({
  fontSize: 11,
  color: c.comment,
  marginTop: 4,
})
