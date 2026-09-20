import { existsSync } from 'fs'
import { parseNote, type NoteDraft, type SavedNoteInfo } from './note'
import type { GitAuth, GitCommitInfo, SyncResult } from './types'
import {
  readDirRecursive,
  readVaultFile,
  deleteVaultFile,
  mkdirVault,
  rmdirVault,
  renameVault,
} from './vault-ops'
import {
  saveNotes as coreSaveNotes,
  updateNote as coreUpdateNote,
  writeRaw as coreWriteRaw,
} from '../main/save'
import {
  ensureRepo,
  commitAll,
  sync,
  resolveConflicts,
  history,
  show,
  restore,
  getRemoteUrl,
  getStatusSummary,
  type StatusSummary,
} from '../main/git'

export type { NoteDraft, SavedNoteInfo } from './note'
export type { GitAuth, GitCommitInfo, SyncResult } from './types'
export type { StatusSummary } from '../main/git'
export { readDirRecursive } from './vault-ops'

export async function listNotes(vault: string): Promise<Array<{ relPath: string; title: string }>> {
  const entries = await readDirRecursive(vault)
  const notes: Array<{ relPath: string; title: string }> = []
  for (const rel of entries) {
    if (rel.endsWith('/')) continue
    try {
      const raw = await readVaultFile(vault, rel)
      notes.push({ relPath: rel, title: parseNote(raw).meta.title })
    } catch {
      // skip unreadable files
    }
  }
  return notes
}

export interface SearchResult {
  relPath: string
  title: string
  snippet: string
}

export async function searchNotes(vault: string, query: string, limit = 20): Promise<SearchResult[]> {
  const entries = await readDirRecursive(vault)
  const results: Array<{ relPath: string; title: string; snippet: string; titleMatch: boolean }> = []
  const q = query.toLowerCase()
  for (const rel of entries) {
    if (rel.endsWith('/')) continue
    if (results.length >= limit * 2) break
    try {
      const raw = await readVaultFile(vault, rel)
      const { meta, content } = parseNote(raw)
      const haystackTitle = meta.title.toLowerCase()
      const haystackContent = content.toLowerCase()
      const idxTitle = haystackTitle.indexOf(q)
      const idxContent = idxTitle !== -1 ? -1 : haystackContent.indexOf(q)
      if (idxTitle === -1 && idxContent === -1) continue
      let snippet: string
      if (idxTitle !== -1) {
        snippet = content.replace(/\n/g, ' ').slice(0, 80) || '(empty)'
      } else {
        const start = Math.max(0, idxContent - 40)
        const end = Math.min(content.length, idxContent + query.length + 40)
        snippet = content.slice(start, end).replace(/\n/g, ' ')
      }
      results.push({ relPath: rel, title: meta.title, snippet, titleMatch: idxTitle !== -1 })
    } catch {
      // skip unreadable files
    }
  }
  results.sort((a, b) => {
    if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1
    return 0
  })
  return results.slice(0, limit)
}

export function readFile(vault: string, rel: string): Promise<string> {
  return readVaultFile(vault, rel)
}

export function writeRaw(vault: string, rel: string, content: string, onChanged?: () => void): Promise<void> {
  return coreWriteRaw(rel, content, vault, onChanged)
}

export function createNote(vault: string, draft: NoteDraft, onChanged?: () => void): Promise<SavedNoteInfo> {
  return coreSaveNotes([draft], vault, onChanged).then((r) => r.saved[0])
}

export function updateNote(vault: string, rel: string, draft: NoteDraft, onChanged?: () => void): Promise<SavedNoteInfo> {
  return coreUpdateNote(rel, draft, vault, onChanged).then((r) => r.saved[0])
}

export function deleteFile(vault: string, rel: string): Promise<void> {
  return deleteVaultFile(vault, rel)
}

export function mkdir(vault: string, rel: string): Promise<void> {
  return mkdirVault(vault, rel)
}

export function rmdir(vault: string, rel: string): Promise<void> {
  return rmdirVault(vault, rel)
}

export function renameFile(vault: string, from: string, to: string): Promise<void> {
  return renameVault(vault, from, to)
}

export function vaultExists(vault: string): boolean {
  return existsSync(vault)
}

export function getPath(vault: string): string {
  return vault
}

export function gitEnsure(vault: string, remoteUrl: string): Promise<string> {
  return ensureRepo(vault, remoteUrl)
}

export function gitCommit(vault: string, message?: string): Promise<boolean> {
  return commitAll(vault, message)
}

export function gitSync(vault: string, auth?: GitAuth): Promise<SyncResult> {
  return sync(vault, auth)
}

export function gitResolveConflicts(
  vault: string,
  picks: Array<{ file: string; source: 'local' | 'remote' }>,
  auth?: GitAuth
): Promise<SyncResult> {
  return resolveConflicts(vault, picks, auth)
}

export function gitHistory(vault: string, relPath: string, limit?: number): Promise<GitCommitInfo[]> {
  return history(vault, relPath, limit)
}

export function gitShow(vault: string, relPath: string, hash: string): Promise<string | null> {
  return show(vault, relPath, hash)
}

export function gitRestore(vault: string, relPath: string, hash: string): Promise<string | null> {
  return restore(vault, relPath, hash)
}

export function gitRemote(vault: string): Promise<string | null> {
  return getRemoteUrl(vault)
}

export function gitStatusSummary(vault: string): Promise<StatusSummary> {
  return getStatusSummary(vault)
}
