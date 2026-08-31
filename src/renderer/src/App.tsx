import { useState, useEffect, useRef } from 'react'
import { useSettingsStore } from './stores/settings'
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
  | { type: 'edit'; relPath: string }

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

  useEffect(() => {
    applyTheme(palette, isDark, font)
  }, [palette, isDark, font])

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
        <NoteList onSelectNote={(relPath) => setScreen({ type: 'edit', relPath })} />
      </div>
      {screen.type === 'edit' && (
        <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
          <NoteEdit
            relPath={screen.relPath}
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
