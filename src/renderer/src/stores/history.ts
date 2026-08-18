import { create } from 'zustand'
import { parseNote } from '../utils/frontmatter'

const MAX_STEPS = 1000
const SEED_LIMIT = 500

export interface HistoryStacks {
  undo: string[]
  redo: string[]
}

interface ToastState {
  toast: { message: string; nonce: number } | null
  showToast: (message: string) => void
  clearToast: () => void
}

export const useHistoryToast = create<ToastState>((set) => ({
  toast: null,
  showToast: (message) => set({ toast: { message, nonce: Date.now() } }),
  clearToast: () => set({ toast: null }),
}))

const stacks = new Map<string, HistoryStacks>()

function getStacks(relPath: string): HistoryStacks {
  let s = stacks.get(relPath)
  if (!s) {
    s = { undo: [], redo: [] }
    stacks.set(relPath, s)
  }
  return s
}

function cap(arr: string[]): string[] {
  return arr.length > MAX_STEPS ? arr.slice(arr.length - MAX_STEPS) : arr
}

export const historyStore = {
  init(): void {
    stacks.clear()
  },

  async seedFromGit(relPath: string, repoDir: string): Promise<void> {
    try {
      const items = await window.jazz.gitHistory(repoDir, relPath, SEED_LIMIT)
      if (items.length === 0) return
      const bodies: string[] = []
      for (const item of items) {
        const content = await window.jazz.gitShow(repoDir, relPath, item.hash)
        if (content === null) continue
        bodies.push(parseNote(content).content)
      }
      // Every commit is a full file state; the newest one matches the current
      // saved content, so only the older ones belong on the undo stack.
      stacks.set(relPath, { undo: cap(bodies.slice(0, -1)), redo: [] })
    } catch {
      // Git may be unavailable — in-session undo still works via push().
    }
  },

  push(relPath: string, before: string): void {
    const s = getStacks(relPath)
    s.undo = cap([...s.undo, before])
    s.redo = []
  },

  undo(
    relPath: string,
    current: string
  ): { body: string; remainingUndo: number } | null {
    const s = getStacks(relPath)
    const prev = s.undo.pop()
    if (prev === undefined) return null
    s.redo = cap([...s.redo, current])
    return { body: prev, remainingUndo: s.undo.length }
  },

  redo(
    relPath: string,
    current: string
  ): { body: string; remainingRedo: number } | null {
    const s = getStacks(relPath)
    const next = s.redo.pop()
    if (next === undefined) return null
    s.undo = cap([...s.undo, current])
    return { body: next, remainingRedo: s.redo.length }
  },

  remainingUndo(relPath: string): number {
    return getStacks(relPath).undo.length
  },

  remainingRedo(relPath: string): number {
    return getStacks(relPath).redo.length
  },
}
