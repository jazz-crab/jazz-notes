import { create } from 'zustand'
import type { PaletteId } from '../theme/themes'
import type { Lang } from '../utils/i18n'
import type { FontId } from '../utils/fonts'
import type { Settings } from '../../../shared/settings'

export const DEFAULT_SYNC_REMOTE = ''

export const UI_ZOOM_MIN = 0.75
export const UI_ZOOM_MAX = 2
export const UI_ZOOM_STEP = 0.1

export const EDITOR_WIDTH_MIN = 320
export const EDITOR_WIDTH_MAX = 1800

export function clampUiZoom(v: number): number {
  if (!Number.isFinite(v)) return 1
  return Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, v))
}

export function clampEditorWidth(v: number): number {
  if (!Number.isFinite(v)) return EDITOR_WIDTH_MAX
  return Math.min(EDITOR_WIDTH_MAX, Math.max(EDITOR_WIDTH_MIN, v))
}

interface SettingsState {
  showSettings: boolean
  hydrated: boolean
  palette: PaletteId
  isDark: boolean
  lang: Lang
  font: FontId
  uiZoom: number
  editorWidth: number | null
  notesPath: string
  showCountdown: boolean
  showDone: boolean
  syncRemote: string
  syncUser: string
  syncPass: string
  autoSync: boolean
  toggleSettings: () => void
  openSettings: () => void
  closeSettings: () => void
  setPalette: (palette: PaletteId) => void
  toggleDark: () => void
  setLang: (lang: Lang) => void
  setFont: (font: FontId) => void
  setUiZoom: (v: number) => void
  setEditorWidth: (v: number | null) => void
  setNotesPath: (path: string) => void
  setShowCountdown: (show: boolean) => void
  setShowDone: (show: boolean) => void
  setSyncRemote: (url: string) => void
  setSyncUser: (user: string) => void
  setSyncPass: (pass: string) => void
  setAutoSync: (v: boolean) => void
  hydrate: () => Promise<void>
}

let writeChain: Promise<unknown> = Promise.resolve()

function vaultPointer(): string | undefined {
  try {
    return localStorage.getItem('jazz-vault') || undefined
  } catch {
    return undefined
  }
}

function persistNow(): void {
  const s = useSettingsStore.getState()
  const patch: Partial<Settings> = {
    palette: s.palette,
    isDark: s.isDark,
    lang: s.lang,
    font: s.font,
    uiZoom: s.uiZoom,
    editorWidth: s.editorWidth,
    notesPath: s.notesPath,
    showCountdown: s.showCountdown,
    showDone: s.showDone,
    syncRemote: s.syncRemote,
    syncUser: s.syncUser,
    syncPass: s.syncPass,
    autoSync: s.autoSync,
  }
  const vault = s.notesPath || vaultPointer()
  writeChain = writeChain
    .then(() => window.jazz.writeSettings(vault, patch))
    .catch(() => {})
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  showSettings: false,
  hydrated: false,
  palette: 'tokyonight',
  isDark: true,
  lang: 'ru',
  font: 'neon',
  uiZoom: 1,
  editorWidth: null,
  notesPath: '',
  showCountdown: true,
  showDone: false,
  syncRemote: DEFAULT_SYNC_REMOTE,
  syncUser: '',
  syncPass: '',
  autoSync: true,
  hydrate: async () => {
    if (get().hydrated) return

    // 1) Which vault to read: sys-pointer → legacy localStorage → undefined (default)
    let dir: string | undefined
    try {
      dir = localStorage.getItem('jazz-vault') || undefined
    } catch {
      // ignore
    }
    if (!dir) {
      try {
        const legacyRaw = localStorage.getItem('jazz-settings')
        if (legacyRaw) {
          const parsed = JSON.parse(legacyRaw) as { state?: { notesPath?: unknown } }
          const legacyPath = parsed?.state?.notesPath
          if (typeof legacyPath === 'string' && legacyPath) dir = legacyPath
        }
      } catch {
        // ignore
      }
    }

    // 2) Read the settings file
    const res = await window.jazz.readSettings(dir)

    // 3) Migration from old localStorage (first run of the new version)
    if (!res.exists) {
      let legacyState: Record<string, unknown> | null = null
      try {
        const legacyRaw = localStorage.getItem('jazz-settings')
        if (legacyRaw) {
          const parsed = JSON.parse(legacyRaw) as { state?: Record<string, unknown> }
          legacyState = parsed?.state && typeof parsed.state === 'object' ? parsed.state : null
        }
      } catch {
        // ignore
      }
      if (legacyState && Object.keys(legacyState).length > 0) {
        const writeDir = dir || (await window.jazz.getPath())
        const migrated = await window.jazz.writeSettings(writeDir, legacyState as Partial<Settings>)
        set({ ...migrated, showSettings: false, hydrated: true })
        try {
          localStorage.setItem('jazz-vault', migrated.notesPath || writeDir)
        } catch {
          // ignore
        }
        try {
          localStorage.removeItem('jazz-settings')
        } catch {
          // ignore
        }
        return
      }
    }

    // 4) Apply what was read
    set({ ...res.settings, showSettings: false, hydrated: true })
    try {
      localStorage.setItem('jazz-vault', res.settings.notesPath || dir || (await window.jazz.getPath()))
    } catch {
      // ignore
    }
  },
  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),
  openSettings: () => set({ showSettings: true }),
  closeSettings: () => set({ showSettings: false }),
  setPalette: (palette) => {
    set({ palette })
    void persistNow()
  },
  toggleDark: () => {
    set((s) => ({ isDark: !s.isDark }))
    void persistNow()
  },
  setLang: (lang) => {
    set({ lang })
    void persistNow()
  },
  setFont: (font) => {
    set({ font })
    void persistNow()
  },
  setUiZoom: (uiZoom) => {
    set({ uiZoom: clampUiZoom(uiZoom) })
    void persistNow()
  },
  setEditorWidth: (editorWidth) => {
    set({ editorWidth: editorWidth == null ? null : clampEditorWidth(editorWidth) })
    void persistNow()
  },
  setNotesPath: (notesPath) => {
    set({ notesPath })
    try {
      localStorage.setItem('jazz-vault', notesPath)
    } catch {
      // ignore
    }
    void persistNow()
  },
  setShowCountdown: (showCountdown) => {
    set({ showCountdown })
    void persistNow()
  },
  setShowDone: (showDone) => {
    set({ showDone })
    void persistNow()
  },
  setSyncRemote: (syncRemote) => {
    set({ syncRemote })
    void persistNow()
  },
  setSyncUser: (syncUser) => {
    set({ syncUser })
    void persistNow()
  },
  setSyncPass: (syncPass) => {
    set({ syncPass })
    void persistNow()
  },
  setAutoSync: (autoSync) => {
    set({ autoSync })
    void persistNow()
  },
}))
