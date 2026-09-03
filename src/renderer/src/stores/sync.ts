import { create } from 'zustand'
import { useSettingsStore } from './settings'
import { useNotesStore } from './notes'
import { debounce } from '../utils/debounce'

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'conflict'

export type ResolvePick = 'local' | 'remote'

interface SyncState {
  status: SyncStatus
  lastSyncAt: Date | null
  error: string | null
  conflictedFiles: string[]
  picks: Record<string, ResolvePick>
  setPick: (file: string, source: ResolvePick) => void
  startup: () => Promise<void>
  syncNow: () => Promise<void>
  resolveConflict: (picks: Record<string, ResolvePick>) => Promise<void>
  dismissConflict: () => void
  triggerAutoSync: () => void
  setupAutoSync: () => () => void
}

async function resolveVaultPath(): Promise<string> {
  const saved = useSettingsStore.getState().notesPath
  return saved || (await window.jazz.getPath())
}

function resolveAuth() {
  const { syncUser, syncPass } = useSettingsStore.getState()
  return { username: syncUser, password: syncPass }
}

function classify(result: { status: string; error?: string; conflictedFiles?: string[] }): Partial<SyncState> {
  if (result.status === 'synced') {
    return { status: 'synced', error: null, conflictedFiles: [] }
  }
  if (result.status === 'conflict') {
    return { status: 'conflict', error: null, conflictedFiles: result.conflictedFiles ?? [] }
  }
  return { status: result.status as SyncStatus, error: result.error ?? 'unknown error', conflictedFiles: [] }
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: 'idle',
  lastSyncAt: null,
  error: null,
  conflictedFiles: [],
  picks: {},

  setPick: (file, source) => set((s) => ({ picks: { ...s.picks, [file]: source } })),

  startup: async () => {
    const path = await resolveVaultPath()
    const remote = useSettingsStore.getState().syncRemote
    try {
      await window.jazz.gitEnsure(path, remote)
    } catch {
      // git not available — stay idle, indicator hidden
    }
    await get().syncNow()
    get().setupAutoSync()
  },

  syncNow: async () => {
    set({ status: 'syncing', error: null })
    const path = await resolveVaultPath()
    const remote = useSettingsStore.getState().syncRemote
    try {
      await window.jazz.gitEnsure(path, remote)
      const result = await window.jazz.gitSync(path, resolveAuth())
      set({ ...classify(result), lastSyncAt: new Date() })
      if (result.status === 'synced') {
        void useNotesStore.getState().loadNotes()
      }
    } catch (e) {
      set({ status: 'error', error: (e as Error).message, lastSyncAt: new Date() })
    }
  },

  resolveConflict: async (picks) => {
    set({ status: 'syncing', error: null })
    const path = await resolveVaultPath()
    try {
      const result = await window.jazz.gitResolveConflicts(
        path,
        Object.entries(picks).map(([file, source]) => ({ file, source })),
        resolveAuth()
      )
      set({ ...classify(result), picks: {}, lastSyncAt: new Date() })
      if (result.status === 'synced') {
        void useNotesStore.getState().loadNotes()
      }
    } catch (e) {
      set({ status: 'error', error: (e as Error).message, lastSyncAt: new Date() })
    }
  },

  dismissConflict: () => set({ status: 'synced', conflictedFiles: [], picks: {} }),

  triggerAutoSync: () => {
    const { syncRemote, autoSync } = useSettingsStore.getState()
    if (!autoSync || !syncRemote) return
    if (get().status === 'syncing') return
    void get().syncNow()
  },

  setupAutoSync: () => {
    const unsubNotes = window.jazz.onNotesChanged(() => {
      debouncedAutoSync()
    })

    const unsubFocus = window.jazz.onAppFocus(() => {
      get().triggerAutoSync()
    })

    return () => {
      unsubNotes()
      unsubFocus()
    }
  },
}))

const debouncedAutoSync = debounce(() => {
  useSyncStore.getState().triggerAutoSync()
}, 3000)
