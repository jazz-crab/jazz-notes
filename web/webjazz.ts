import type { JazzAPI } from '../preload/index.d'
import type { GitAuth, GitCommitInfo, SyncResult } from '../shared/types'
import type { NoteDraft, SavedNoteInfo } from '../shared/note'

interface ApiResponse {
  path?: string
  rev?: number
  entries?: string[]
  content?: string | null
  data?: Record<string, unknown>
  ok?: boolean
  error?: string
  items?: GitCommitInfo[]
}

let lastRev = 0
let polling = false
let pollTimers: ReturnType<typeof setInterval> | null = null

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init)
  const body = (await res.json().catch(() => ({}))) as ApiResponse
  if (!res.ok || body.error) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body as T
}

function jsonInit(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

async function pollRev() {
  try {
    const { rev } = await call<ApiResponse>('/rev')
    if (lastRev !== 0 && rev !== lastRev) {
      for (const cb of subscribers) cb('')
    }
    lastRev = rev
  } catch {
    // transient — keep polling
  }
}

const subscribers = new Set<(relPath: string) => void>()

export function installWebJazz() {
  if (window.jazz) return

  const api: JazzAPI = {
    getPath: async () => {
      const { path } = await call<ApiResponse>('/path')
      return path || '/vault'
    },

    readDirRecursive: async () => {
      const { entries } = await call<ApiResponse>('/tree')
      return entries || []
    },

    readFile: async (relPath: string) => {
      const { content } = await call<ApiResponse>(`/read?rel=${encodeURIComponent(relPath)}`)
      return content ?? ''
    },

    writeFile: async (relPath: string, content: string) => {
      await call('/write', jsonInit({ rel: relPath, content }))
      return true
    },

    deleteFile: async (relPath: string) => {
      await call('/delete', jsonInit({ rel: relPath }))
      return true
    },

    createFile: async (relPath: string, content: string) => {
      await call('/create', jsonInit({ rel: relPath, content }))
      return true
    },

    createDir: async (relPath: string) => {
      await call('/mkdir', jsonInit({ rel: relPath }))
      return true
    },

    deleteDir: async (relPath: string) => {
      await call('/rmdir', jsonInit({ rel: relPath }))
      return true
    },

    rename: async (relPath: string, newRelPath: string) => {
      await call('/rename', jsonInit({ rel: relPath, newRel: newRelPath }))
      return true
    },

    selectDirectory: async () => null,

    createNoteDraft: async (draft: NoteDraft) => {
      const { saved } = await call<{ saved?: SavedNoteInfo[] }>('/create', jsonInit(draft))
      return saved?.[0] || { relPath: '', id: '', title: draft.title }
    },

    updateNoteDraft: async (relPath: string, draft: NoteDraft) => {
      const { saved } = await call<{ saved?: SavedNoteInfo[] }>(
        '/write',
        jsonInit({ ...draft, rel: relPath })
      )
      return saved?.[0] || { relPath, id: '', title: draft.title }
    },

    indexInit: async () => 0,
    indexSearch: async (query: string, limit?: number) => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${limit ?? 50}`)
      if (!res.ok) return []
      return (await res.json()) as Array<{ relPath: string; title: string; snippet: string }>
    },
    indexClose: async () => true,

    readHistory: async () => {
      const { data } = await call<ApiResponse>('/history')
      return data || {}
    },

    writeHistory: async (data: unknown) => {
      await call('/history', jsonInit({ data }))
      return true
    },

    gitEnsure: async (_repoDir: string, remoteUrl: string) => {
      await call('/git/ensure', jsonInit({ remote: remoteUrl }))
      return true
    },

    gitCommit: async (_repoDir: string, message?: string) => {
      const { ok } = await call<ApiResponse>('/git/commit', jsonInit({ message }))
      return !!ok
    },

    gitSync: async (_repoDir: string, auth?: GitAuth) => {
      return call<SyncResult>('/git/sync', jsonInit({ auth }))
    },

    gitResolveConflicts: async (
      _repoDir: string,
      picks: Array<{ file: string; source: 'local' | 'remote' }>,
      auth?: GitAuth
    ) => {
      return call<SyncResult>('/git/resolve', jsonInit({ picks, auth }))
    },

    gitHistory: async (_repoDir: string, relPath: string, limit?: number) => {
      const { items } = await call<ApiResponse>(
        `/git/history?rel=${encodeURIComponent(relPath)}&limit=${limit || 50}`
      )
      return items || []
    },

    gitShow: async (_repoDir: string, relPath: string, hash: string) => {
      const { content } = await call<ApiResponse>(
        `/git/show?rel=${encodeURIComponent(relPath)}&hash=${encodeURIComponent(hash)}`
      )
      return content ?? null
    },

    gitRestore: async (_repoDir: string, relPath: string, hash: string) => {
      const { content } = await call<ApiResponse>('/git/restore', jsonInit({ rel: relPath, hash }))
      return content ?? null
    },

    onNotesChanged: (cb: (relPath: string) => void) => {
      subscribers.add(cb)
      if (!polling) {
        polling = true
        pollRev()
        pollTimers = setInterval(pollRev, 2000)
      }
      return () => {
        subscribers.delete(cb)
        if (subscribers.size === 0 && pollTimers) {
          clearInterval(pollTimers)
          pollTimers = null
          polling = false
        }
      }
    },
  }

  window.jazz = api
}
