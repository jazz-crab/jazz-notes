import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PaletteId } from '../theme/themes'
import type { Lang } from '../utils/i18n'
import type { FontId } from '../utils/fonts'

export const DEFAULT_SYNC_REMOTE = ''

export const UI_ZOOM_MIN = 0.75
export const UI_ZOOM_MAX = 2
export const UI_ZOOM_STEP = 0.1

export function clampUiZoom(v: number): number {
  if (!Number.isFinite(v)) return 1
  return Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, v))
}

interface SettingsState {
  showSettings: boolean
  palette: PaletteId
  isDark: boolean
  lang: Lang
  font: FontId
  uiZoom: number
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
  setNotesPath: (path: string) => void
  setShowCountdown: (show: boolean) => void
  setShowDone: (show: boolean) => void
  setSyncRemote: (url: string) => void
  setSyncUser: (user: string) => void
  setSyncPass: (pass: string) => void
  setAutoSync: (v: boolean) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      showSettings: false,
      palette: 'tokyonight',
      isDark: true,
      lang: 'ru',
      font: 'neon',
      uiZoom: 1,
      notesPath: '',
      showCountdown: true,
      showDone: false,
      syncRemote: DEFAULT_SYNC_REMOTE,
      syncUser: '',
      syncPass: '',
      autoSync: true,
      toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),
      openSettings: () => set({ showSettings: true }),
      closeSettings: () => set({ showSettings: false }),
      setPalette: (palette) => set({ palette }),
      toggleDark: () => set((s) => ({ isDark: !s.isDark })),
      setLang: (lang) => set({ lang }),
      setFont: (font) => set({ font }),
      setUiZoom: (uiZoom) => set({ uiZoom: clampUiZoom(uiZoom) }),
      setNotesPath: (notesPath) => set({ notesPath }),
      setShowCountdown: (showCountdown) => set({ showCountdown }),
      setShowDone: (showDone) => set({ showDone }),
      setSyncRemote: (syncRemote) => set({ syncRemote }),
      setSyncUser: (syncUser) => set({ syncUser }),
      setSyncPass: (syncPass) => set({ syncPass }),
      setAutoSync: (autoSync) => set({ autoSync }),
    }),
    {
      name: 'jazz-settings',
      partialize: (s) => ({
        palette: s.palette,
        isDark: s.isDark,
        lang: s.lang,
        font: s.font,
        uiZoom: s.uiZoom,
        notesPath: s.notesPath,
        showCountdown: s.showCountdown,
        showDone: s.showDone,
        syncRemote: s.syncRemote,
        syncUser: s.syncUser,
        syncPass: s.syncPass,
        autoSync: s.autoSync,
      }),
      merge: (persisted, current) => {
        const saved = { ...(persisted as Partial<SettingsState>) }
        if (saved.syncRemote === 'rentgen:git/jazz-notes.git') {
          saved.syncRemote = DEFAULT_SYNC_REMOTE
        }
        return { ...current, ...saved }
      },
    }
  )
)