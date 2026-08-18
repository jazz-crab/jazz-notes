import { useEffect, useState } from 'react'
import { useSettingsStore } from '../stores/settings'
import { useSyncStore } from '../stores/sync'
import { palettes } from '../theme/themes'
import { fontOptions } from '../utils/fonts'
import { useColors, useIsDark } from '../theme'
import { t, langLabels, type Lang } from '../utils/i18n'
import { useNotesStore } from '../stores/notes'
import { decodeSyncConfig } from '../../../shared/syncConfig'
import SyncShareDialog from './SyncShareDialog'
import SyncScanDialog from './SyncScanDialog'

export default function SettingsDialog() {
  const colors = useColors()
  const isDark = useIsDark()
  const showSettings = useSettingsStore((s) => s.showSettings)
  const closeSettings = useSettingsStore((s) => s.closeSettings)
  const palette = useSettingsStore((s) => s.palette)
  const lang = useSettingsStore((s) => s.lang)
  const font = useSettingsStore((s) => s.font)
  const setPalette = useSettingsStore((s) => s.setPalette)
  const toggleDark = useSettingsStore((s) => s.toggleDark)
  const setLang = useSettingsStore((s) => s.setLang)
  const setFont = useSettingsStore((s) => s.setFont)
  const notesPath = useSettingsStore((s) => s.notesPath)
  const setNotesPath = useSettingsStore((s) => s.setNotesPath)
  const showCountdown = useSettingsStore((s) => s.showCountdown)
  const setShowCountdown = useSettingsStore((s) => s.setShowCountdown)
  const showDone = useSettingsStore((s) => s.showDone)
  const setShowDone = useSettingsStore((s) => s.setShowDone)
  const syncRemote = useSettingsStore((s) => s.syncRemote)
  const setSyncRemote = useSettingsStore((s) => s.setSyncRemote)
  const syncUser = useSettingsStore((s) => s.syncUser)
  const setSyncUser = useSettingsStore((s) => s.setSyncUser)
  const syncPass = useSettingsStore((s) => s.syncPass)
  const setSyncPass = useSettingsStore((s) => s.setSyncPass)
  const syncNow = useSyncStore((s) => s.syncNow)
  const syncStatus = useSyncStore((s) => s.status)
  const loadNotes = useNotesStore((s) => s.loadNotes)
  const [shareOpen, setShareOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState(false)
  const [tab, setTab] = useState<'main' | 'appearance' | 'sync'>('main')

  const handlePickFolder = async () => {
    const dir = await window.jazz.selectDirectory()
    if (!dir) return
    setNotesPath(dir)
    await loadNotes()
  }

  const handleScan = (config: { url: string; user: string; token: string }) => {
    setScanOpen(false)
    setSyncRemote(config.url)
    setSyncUser(config.user)
    setSyncPass(config.token)
  }

  const handleImport = () => {
    const config = decodeSyncConfig(importText)
    if (!config) {
      setImportError(true)
      return
    }
    setImportError(false)
    setImportText('')
    setSyncRemote(config.url)
    setSyncUser(config.user)
    setSyncPass(config.token)
  }

  useEffect(() => {
    if (!showSettings) return
    setTab('main')
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeSettings()
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [showSettings])

  if (!showSettings) return null

  return (
    <div style={overlayStyle} onClick={closeSettings}>
      <div style={dialogStyle(colors)} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <span style={titleStyle(colors)}>{t('settings.title', lang)}</span>
          <button style={closeBtnStyle(colors)} onClick={closeSettings}>
            {'\u2715'}
          </button>
        </div>

        <div style={bodyStyle}>
          <div style={tabsStyle}>
            <button
              style={tabBtnStyle(colors, tab === 'main')}
              onClick={() => setTab('main')}
            >
              {t('settings.tab.main', lang)}
            </button>
            <button
              style={tabBtnStyle(colors, tab === 'appearance')}
              onClick={() => setTab('appearance')}
            >
              {t('settings.tab.appearance', lang)}
            </button>
            <button
              style={tabBtnStyle(colors, tab === 'sync')}
              onClick={() => setTab('sync')}
            >
              {t('settings.tab.sync', lang)}
            </button>
          </div>

          {tab === 'main' && (
            <>
              <div style={groupStyle}>
                <label style={labelStyle(colors)}>{t('notes.folder', lang)}</label>
                <div style={folderRowStyle}>
                  <span style={folderPathStyle(colors)}>
                    {notesPath || t('notes.folder.default', lang)}
                  </span>
                  <button style={folderBtnStyle(colors)} onClick={handlePickFolder}>
                    {t('choose.folder', lang)}
                  </button>
                </div>
              </div>

              <div style={groupStyle}>
                <label style={labelStyle(colors)}>{t('language', lang)}</label>
                <select
                  style={selectStyle(colors)}
                  value={lang}
                  onChange={(e) => setLang(e.target.value as Lang)}
                >
                  {(Object.keys(langLabels) as Lang[]).map((l) => (
                    <option key={l} value={l}>
                      {langLabels[l]}
                    </option>
                  ))}
                </select>
              </div>

              <div style={toggleGroupStyle}>
                <span style={toggleLabelStyle(isDark ? 'dark' : 'light')}>{t('show.countdown', lang)}</span>
                <button style={switchTrackStyle(showCountdown)} onClick={() => setShowCountdown(!showCountdown)}>
                  <span style={switchThumbStyle(showCountdown)} />
                </button>
              </div>
              <div style={toggleGroupStyle}>
                <span style={toggleLabelStyle(isDark ? 'dark' : 'light')}>{t('show.done', lang)}</span>
                <button style={switchTrackStyle(showDone)} onClick={() => setShowDone(!showDone)}>
                  <span style={switchThumbStyle(showDone)} />
                </button>
              </div>
            </>
          )}

          {tab === 'appearance' && (
            <>
              <div style={toggleGroupStyle}>
                <span style={toggleLabelStyle(isDark ? 'dark' : 'light')}>{t('dark.theme', lang)}</span>
                <button style={switchTrackStyle(isDark)} onClick={toggleDark}>
                  <span style={switchThumbStyle(isDark)} />
                </button>
              </div>

              <div style={groupStyle}>
                <label style={labelStyle(colors)}>{t('color.scheme', lang)}</label>
                <div style={themeListStyle}>
                  {palettes.map((p) => (
                    <button
                      key={p.id}
                      style={{
                        ...themeBtnStyle(colors),
                        ...(palette === p.id ? themeBtnActiveStyle(colors) : {}),
                      }}
                      onClick={() => setPalette(p.id)}
                    >
                      <div style={swatchRowStyle}>
                        {(['bg', 'red', 'green', 'yellow', 'blue', 'purple'] as const).map((k) => (
                          <span
                            key={k}
                            style={{
                              ...swatchStyle,
                              background: isDark ? p.dark.colors[k] : p.light.colors[k],
                            }}
                          />
                        ))}
                      </div>
                      <span style={themeLabelStyle(colors)}>{p.label}</span>
                      {palette === p.id && (
                        <span style={currentBadgeStyle(colors)}>{'\u2713'}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div style={groupStyle}>
                <label style={labelStyle(colors)}>{t('font', lang)}</label>
                <div style={fontListStyle}>
                  {fontOptions.map((f) => (
                    <button
                      key={f.id}
                      style={{
                        ...fontBtnStyle(colors, f),
                        ...(font === f.id ? fontBtnActiveStyle(colors) : {}),
                      }}
                      onClick={() => setFont(f.id)}
                    >
                      <span style={{ fontFamily: f.family, color: f.color }}>{f.label}</span>
                      {font === f.id && (
                        <span style={fontCheckStyle(colors)}>{'\u2713'}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'sync' && (
            <div style={groupStyle}>
              <label style={labelStyle(colors)}>{t('sync.server', lang)}</label>
              <input
                style={syncInputStyle(colors)}
                value={syncRemote}
                onChange={(e) => setSyncRemote(e.target.value)}
                placeholder={t('sync.server.placeholder', lang)}
                spellCheck={false}
              />
              <div style={hintStyle(colors)}>{t('sync.server.hint', lang)}</div>
              <label style={labelStyle(colors)}>{t('sync.user', lang)}</label>
              <input
                style={syncInputStyle(colors)}
                value={syncUser}
                onChange={(e) => setSyncUser(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <div style={hintStyle(colors)}>{t('sync.user.hint', lang)}</div>
              <label style={labelStyle(colors)}>{t('sync.password', lang)}</label>
              <input
                style={syncInputStyle(colors)}
                type="password"
                value={syncPass}
                onChange={(e) => setSyncPass(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <div style={hintStyle(colors)}>{t('sync.password.hint', lang)}</div>
              <div style={btnRowStyle}>
                <button style={actionBtnStyle(colors)} onClick={() => setShareOpen(true)}>
                  {t('sync.share', lang)}
                </button>
                <button style={actionBtnStyle(colors)} onClick={() => setScanOpen(true)}>
                  {t('sync.scan', lang)}
                </button>
              </div>
              <div style={syncRowStyle}>
                <button style={syncBtnStyle(colors)} onClick={() => void syncNow()}>
                  {syncStatus === 'syncing' ? t('sync.syncing', lang) : t('sync.now', lang)}
                </button>
              </div>
              <div style={importRowStyle}>
                <input
                  style={syncInputStyle(colors)}
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value)
                    setImportError(false)
                  }}
                  placeholder={t('sync.import.placeholder', lang)}
                  spellCheck={false}
                />
                <button style={importBtnStyle(colors)} onClick={handleImport}>
                  {t('sync.import.apply', lang)}
                </button>
              </div>
              <div style={hintStyle(colors)}>{t('sync.import.label', lang)}</div>
              {importError && <div style={errorTextStyle(colors)}>{t('sync.import.invalid', lang)}</div>}
            </div>
          )}
        </div>
      </div>
      {shareOpen && <SyncShareDialog onClose={() => setShareOpen(false)} />}
      {scanOpen && <SyncScanDialog onScanned={handleScan} onClose={() => setScanOpen(false)} />}
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}
const dialogStyle = (c: any) => ({
  background: c.bgPopup,
  border: `1px solid ${c.border}`,
  borderRadius: 10,
  width: 460,
  maxWidth: '90vw' as const,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
})
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '14px 18px',
  borderBottom: '1px solid var(--border)',
}
const titleStyle = (c: any) => ({
  fontSize: 16,
  fontWeight: 700,
  color: c.fg,
})
const closeBtnStyle = (c: any) => ({
  fontSize: 18,
  color: c.comment,
  padding: '0 4px',
})
const bodyStyle: React.CSSProperties = {
  padding: '16px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
}
const tabsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  borderBottom: '1px solid var(--border)',
  paddingBottom: 12,
}
const tabBtnStyle = (c: any, active: boolean) => ({
  padding: '6px 14px',
  border: 'none',
  borderRadius: 6,
  color: active ? c.blue : c.comment,
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  cursor: 'pointer',
  background: active ? 'var(--hover)' : 'transparent',
  transition: 'color 0.15s, background 0.15s',
})
const toggleGroupStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}
const toggleLabelStyle = (_mode: string) => ({
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--fg)',
})
const groupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}
const labelStyle = (c: any) => ({
  fontSize: 12,
  color: c.comment,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
})
const themeListStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}
const fontListStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}
const fontBtnStyle = (c: any, f: { family: string; color: string }) => ({
  position: 'relative' as const,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderRadius: 8,
  border: `1px solid ${c.border}`,
  background: c.bg,
  color: f.color,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'border-color 0.15s, background 0.15s',
})
const fontCheckStyle = (c: any) => ({
  position: 'absolute' as const,
  top: 8,
  right: 10,
  fontSize: 12,
  color: c.blue,
  fontWeight: 700,
})
const fontBtnActiveStyle = (c: any) => ({
  borderColor: c.blue,
})
const themeBtnStyle = (c: any) => ({
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  gap: 6,
  padding: 10,
  borderRadius: 8,
  border: `2px solid ${c.border}`,
  background: c.bg,
  cursor: 'pointer',
  transition: 'border-color 0.15s',
  minWidth: 110,
  position: 'relative' as const,
})
const themeBtnActiveStyle = (c: any) => ({
  borderColor: c.blue,
})
const swatchRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 3,
}
const swatchStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 3,
}
const themeLabelStyle = (c: any) => ({
  fontSize: 11,
  color: c.fg,
  fontWeight: 500,
})
const currentBadgeStyle = (c: any) => ({
  fontSize: 11,
  color: c.blue,
  fontWeight: 700,
  position: 'absolute' as const,
  top: 4,
  right: 6,
})
const switchTrackStyle = (isDark: boolean) => ({
  width: 40,
  height: 22,
  borderRadius: 11,
  border: 'none',
  padding: 0,
  background: isDark ? 'var(--blue)' : 'var(--border)',
  position: 'relative' as const,
  cursor: 'pointer',
  transition: 'background 0.2s',
  flexShrink: 0,
})
const switchThumbStyle = (isDark: boolean) => ({
  display: 'block',
  width: 18,
  height: 18,
  borderRadius: '50%',
  background: 'var(--bg)',
  position: 'absolute' as const,
  top: 2,
  left: isDark ? 20 : 2,
  transition: 'left 0.2s',
  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
})
const selectStyle = (c: any) => ({
  padding: '8px 12px',
  background: c.bg,
  border: `1px solid ${c.border}`,
  borderRadius: 6,
  color: c.fg,
  fontSize: 13,
  cursor: 'pointer',
})
const folderRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}
const folderPathStyle = (c: any) => ({
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
  fontSize: 13,
  color: c.fg,
  background: c.bg,
  border: `1px solid ${c.border}`,
  borderRadius: 6,
  padding: '8px 12px',
})
const folderBtnStyle = (c: any) => ({
  padding: '8px 12px',
  background: c.bg,
  border: `1px solid ${c.blue}`,
  borderRadius: 6,
  color: c.blue,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  transition: 'background 0.15s',
})
const syncInputStyle = (c: any) => ({
  padding: '8px 12px',
  background: c.bg,
  border: `1px solid ${c.border}`,
  borderRadius: 6,
  color: c.fg,
  fontSize: 13,
  fontFamily: 'var(--app-font)',
})
const hintStyle = (c: any) => ({
  fontSize: 11,
  color: c.comment,
  lineHeight: 1.4,
})
const syncRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
}
const btnRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}
const actionBtnStyle = (c: any) => ({
  padding: '6px 12px',
  background: c.bg,
  border: `1px solid ${c.border}`,
  borderRadius: 6,
  color: c.fg,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.15s',
  opacity: 'var(--btn-dim)',
})
const importRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
}
const importBtnStyle = (c: any) => ({
  padding: '6px 12px',
  background: c.bg,
  border: `1px solid ${c.blue}`,
  borderRadius: 6,
  color: c.blue,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  transition: 'background 0.15s',
})
const errorTextStyle = (c: any) => ({
  fontSize: 12,
  color: c.red,
})
const syncBtnStyle = (c: any) => ({
  padding: '6px 12px',
  background: c.bg,
  border: `1px solid ${c.green}`,
  borderRadius: 6,
  color: c.green,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background 0.15s',
})
