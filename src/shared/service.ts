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
} from '../main/git'

export type { NoteDraft, SavedNoteInfo } from './note'
export type { GitAuth, GitCommitInfo, SyncResult } from './types'
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