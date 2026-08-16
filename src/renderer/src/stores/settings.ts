import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PaletteId } from '../theme/themes'
import type { Lang } from '../utils/i18n'
import type { FontId } from '../utils/fonts'

export const DEFAULT_SYNC_REMOTE = ''

interface SettingsState {
  showSettings: boolean
  palette: PaletteId
  isDark: boolean
  lang: Lang
  font: FontId
  notesPath: string
  showCountdown: boolean
  syncRemote: string
  syncUser: string
  syncPass: string
  toggleSettings: () => void
  openSettings: () => void
  closeSettings: () => void
  setPalette: (palette: PaletteId) => void
  toggleDark: () => void
  setLang: (lang: Lang) => void
  setFont: (font: FontId) => void
  setNotesPath: (path: string) => void
  setShowCountdown: (show: boolean) => void
  setSyncRemote: (url: string) => void
  setSyncUser: (user: string) => void
  setSyncPass: (pass: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      showSettings: false,
      palette: 'tokyonight',
      isDark: true,
      lang: 'ru',
      font: 'neon',
      notesPath: '',
      showCountdown: true,
      syncRemote: DEFAULT_SYNC_REMOTE,
      syncUser: '',
      syncPass: '',
      toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),
      openSettings: () => set({ showSettings: true }),
      closeSettings: () => set({ showSettings: false }),
      setPalette: (palette) => set({ palette }),
      toggleDark: () => set((s) => ({ isDark: !s.isDark })),
      setLang: (lang) => set({ lang }),
      setFont: (font) => set({ font }),
      setNotesPath: (notesPath) => set({ notesPath }),
      setShowCountdown: (showCountdown) => set({ showCountdown }),
      setSyncRemote: (syncRemote) => set({ syncRemote }),
      setSyncUser: (syncUser) => set({ syncUser }),
      setSyncPass: (syncPass) => set({ syncPass }),
    }),
    {
      name: 'jazz-settings',
      partialize: (s) => ({
        palette: s.palette,
        isDark: s.isDark,
        lang: s.lang,
        font: s.font,
        notesPath: s.notesPath,
        showCountdown: s.showCountdown,
        syncRemote: s.syncRemote,
        syncUser: s.syncUser,
        syncPass: s.syncPass,
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