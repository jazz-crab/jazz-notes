import { useState } from 'react'
import { useColors } from '../theme'
import { useSettingsStore } from '../stores/settings'
import { useSyncStore, type SyncStatus } from '../stores/sync'
import { t, localeOf } from '../utils/i18n'
import ConflictDialog from './ConflictDialog'

const statusKey: Record<SyncStatus, string> = {
  idle: 'sync.idle',
  syncing: 'sync.syncing',
  synced: 'sync.synced',
  offline: 'sync.offline',
  error: 'sync.error',
  conflict: 'sync.conflict',
}

function colorFor(status: SyncStatus, c: any): string {
  switch (status) {
    case 'synced':
      return c.green
    case 'offline':
      return c.yellow
    case 'conflict':
      return c.orange
    case 'syncing':
      return c.blue
    default:
      return c.red
  }
}

function formatTime(d: Date, lang: 'ru' | 'en'): string {
  return d.toLocaleTimeString(localeOf(lang), { hour: '2-digit', minute: '2-digit' })
}

export default function SyncIndicator() {
  const colors = useColors()
  const lang = useSettingsStore((s) => s.lang)
  const status = useSyncStore((s) => s.status)
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt)
  const error = useSyncStore((s) => s.error)
  const conflictedFiles = useSyncStore((s) => s.conflictedFiles)
  const syncNow = useSyncStore((s) => s.syncNow)
  const [showPopup, setShowPopup] = useState(false)
  const [showConflict, setShowConflict] = useState(false)

  if (status === 'idle') return null

  const color = colorFor(status, colors)

  return (
    <div style={containerStyle}>
      <button
        style={{
          ...dotStyle,
          background: color,
        }}
        onClick={() => setShowPopup((v) => !v)}
        title={t(statusKey[status], lang)}
      />
      {showPopup && (
        <div style={popupStyle(colors)} onClick={() => setShowPopup(false)}>
          <div style={titleStyle(colors)}>{t(statusKey[status], lang)}</div>
          {error && <div style={errorStyle(colors)}>{error}</div>}
          {status === 'conflict' && (
            <div style={conflictListStyle}>
              {conflictedFiles.map((f) => (
                <div key={f} style={conflictItemStyle(colors)}>{f}</div>
              ))}
            </div>
          )}
          <div style={timeStyle(colors)}>
            {t('sync.last', lang)} {lastSyncAt ? formatTime(lastSyncAt, lang) : '—'}
          </div>
          <div style={actionsStyle}>
            {status === 'conflict' && (
              <button style={btnStyle(colors, colors.orange)} onClick={() => setShowConflict(true)}>
                {t('sync.resolve', lang)}
              </button>
            )}
            <button style={btnStyle(colors, colors.blue)} onClick={() => void syncNow()}>
              {t('sync.now', lang)}
            </button>
          </div>
        </div>
      )}
      {showConflict && (
        <ConflictDialog onClose={() => setShowConflict(false)} />
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
  width: 260,
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
  fontSize: 11,
  color: c.red,
  marginTop: 4,
  wordBreak: 'break-word' as const,
  maxHeight: 80,
  overflowY: 'auto' as const,
})
const conflictListStyle: React.CSSProperties = {
  marginTop: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}
const conflictItemStyle = (c: any) => ({
  fontSize: 11,
  color: c.fgDark,
  fontFamily: 'var(--app-font)',
})
const timeStyle = (c: any) => ({
  fontSize: 11,
  color: c.comment,
  marginTop: 4,
})
const actionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  marginTop: 8,
}
const btnStyle = (c: any, color: string) => ({
  flex: 1,
  padding: '5px 8px',
  borderRadius: 6,
  fontSize: 12,
  color,
  background: c.bgAlt,
  border: `1px solid ${c.border}`,
  cursor: 'pointer',
})
