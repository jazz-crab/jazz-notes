import { useState, useEffect, useRef } from 'react'
import { useSettingsStore, clampUiZoom, UI_ZOOM_STEP } from './stores/settings'
import { getVariant, getThemeCSSVars, getAtomicEditorCSSVars } from './theme/themes'
import { getFontFamily } from './utils/fonts'
import { t } from './utils/i18n'
import NoteList from './screens/NoteList'
import NoteEdit from './screens/NoteEdit'
import SettingsDialog from './components/SettingsDialog'
import ConfirmDialog from './components/ConfirmDialog'
import { historyStore } from './stores/history'
import '@atomic-editor/editor/styles.css'

type Screen =
  | { type: 'list' }
  | { type: 'edit'; relPath: string; editing: boolean }

function applyTheme(palette: string, isDark: boolean, font: string) {
  const variant = getVariant(palette as any, isDark)
  const vars = { ...getThemeCSSVars(variant.colors), ...getAtomicEditorCSSVars(variant.colors) }
  const root = document.documentElement
  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(key, val)
  }
  root.style.colorScheme = isDark ? 'dark' : 'light'
  root.style.setProperty('--app-font', `${getFontFamily(font as any)}, 'JetBrains Mono', 'Fira Code', monospace`)
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ type: 'list' })
  const screenRef = useRef(screen)
  screenRef.current = screen
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const palette = useSettingsStore((s) => s.palette)
  const isDark = useSettingsStore((s) => s.isDark)
  const font = useSettingsStore((s) => s.font)
  const lang = useSettingsStore((s) => s.lang)
  const uiZoom = useSettingsStore((s) => s.uiZoom)

  useEffect(() => {
    applyTheme(palette, isDark, font)
  }, [palette, isDark, font])

  useEffect(() => {
    document.documentElement.style.zoom = String(uiZoom)
  }, [uiZoom])

  useEffect(() => {
    void historyStore.init()
  }, [])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const s = screenRef.current
        if (s.type === 'edit') return
        const settings = useSettingsStore.getState()
        if (settings.showSettings) return
        e.stopPropagation()
        setShowExitConfirm(true)
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [])

  useEffect(() => {
    const zoomBy = (delta: number) => {
      const { uiZoom, setUiZoom } = useSettingsStore.getState()
      setUiZoom(clampUiZoom(uiZoom + delta))
    }
    const handleZoomKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        zoomBy(UI_ZOOM_STEP)
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        zoomBy(-UI_ZOOM_STEP)
      } else if (e.key === '0') {
        e.preventDefault()
        useSettingsStore.getState().setUiZoom(1)
      }
    }
    window.addEventListener('keydown', handleZoomKey, true)
    return () => window.removeEventListener('keydown', handleZoomKey, true)
  }, [])

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || e.deltaY === 0) return
      e.preventDefault()
      const { uiZoom, setUiZoom } = useSettingsStore.getState()
      setUiZoom(clampUiZoom(uiZoom + (e.deltaY < 0 ? UI_ZOOM_STEP : -UI_ZOOM_STEP)))
    }
    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [])

  const handleExitConfirm = () => {
    window.close()
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: screen.type === 'list' ? 'block' : 'none',
          flex: 1,
          minHeight: 0,
          width: '100%',
        }}
      >
        <NoteList isVisible={screen.type === 'list'} onSelectNote={(relPath, editing) => setScreen({ type: 'edit', relPath, editing: editing ?? false })} />
      </div>
      {screen.type === 'edit' && (
        <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
          <NoteEdit
            relPath={screen.relPath}
            initialEditing={screen.editing}
            onBack={() => setScreen({ type: 'list' })}
          />
        </div>
      )}
      <SettingsDialog />
      {showExitConfirm && (
        <ConfirmDialog
          message={t('exit.confirm', lang)}
          confirmLabel={t('ok', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={handleExitConfirm}
          onCancel={() => setShowExitConfirm(false)}
        />
      )}
    </div>
  )
}
