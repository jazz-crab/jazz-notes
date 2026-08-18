import type { SyncResult, GitCommitInfo, GitAuth } from '../shared/types'
import type { NoteDraft, SavedNoteInfo } from '../shared/note'

export interface JazzAPI {
  getPath: () => Promise<string>
  readDirRecursive: (dirPath?: string) => Promise<string[]>
  readFile: (relPath: string, dirPath?: string) => Promise<string>
  writeFile: (relPath: string, content: string, dirPath?: string) => Promise<boolean>
  deleteFile: (relPath: string, dirPath?: string) => Promise<boolean>
  createFile: (relPath: string, content: string, dirPath?: string) => Promise<boolean>
  createDir: (relPath: string, dirPath?: string) => Promise<boolean>
  deleteDir: (relPath: string, dirPath?: string) => Promise<boolean>
  rename: (relPath: string, newRelPath: string, dirPath?: string) => Promise<boolean>
  selectDirectory: () => Promise<string | null>
  createNoteDraft: (draft: NoteDraft, dirPath?: string) => Promise<SavedNoteInfo>
  updateNoteDraft: (relPath: string, draft: NoteDraft, dirPath?: string) => Promise<SavedNoteInfo>
  indexInit: (dirPath?: string) => Promise<number>
  indexSearch: (
    query: string,
    limit?: number
  ) => Promise<Array<{ relPath: string; title: string; snippet: string }>>
  indexClose: () => Promise<boolean>
  readHistory: () => Promise<Record<string, unknown>>
  writeHistory: (data: unknown) => Promise<boolean>
  gitEnsure: (repoDir: string, remoteUrl: string) => Promise<boolean>
  gitCommit: (repoDir: string, message?: string) => Promise<boolean>
  gitSync: (repoDir: string, auth?: GitAuth) => Promise<SyncResult>
  gitResolveConflicts: (
    repoDir: string,
    picks: Array<{ file: string; source: 'local' | 'remote' }>,
    auth?: GitAuth
  ) => Promise<SyncResult>
  gitHistory: (repoDir: string, relPath: string, limit?: number) => Promise<GitCommitInfo[]>
  gitShow: (repoDir: string, relPath: string, hash: string) => Promise<string | null>
  gitRestore: (repoDir: string, relPath: string, hash: string) => Promise<string | null>
  onNotesChanged: (cb: (relPath: string) => void) => () => void
}

declare global {
  interface Window {
    jazz: JazzAPI
  }
}
