import { contextBridge, ipcRenderer } from 'electron'
import type { SyncResult, GitCommitInfo, GitAuth } from '../shared/types'
import type { NoteDraft, SavedNoteInfo } from '../shared/note'

const api = {
  getPath: (): Promise<string> => ipcRenderer.invoke('notes:getPath'),
  readDirRecursive: (dirPath?: string): Promise<string[]> =>
    ipcRenderer.invoke('notes:readDirRecursive', dirPath),
  readFile: (relPath: string, dirPath?: string): Promise<string> =>
    ipcRenderer.invoke('notes:readFile', relPath, dirPath),
  writeFile: (relPath: string, content: string, dirPath?: string): Promise<boolean> =>
    ipcRenderer.invoke('notes:writeFile', relPath, content, dirPath),
  deleteFile: (relPath: string, dirPath?: string): Promise<boolean> =>
    ipcRenderer.invoke('notes:deleteFile', relPath, dirPath),
  createFile: (relPath: string, content: string, dirPath?: string): Promise<boolean> =>
    ipcRenderer.invoke('notes:createFile', relPath, content, dirPath),
  createDir: (relPath: string, dirPath?: string): Promise<boolean> =>
    ipcRenderer.invoke('notes:createDir', relPath, dirPath),
  deleteDir: (relPath: string, dirPath?: string): Promise<boolean> =>
    ipcRenderer.invoke('notes:deleteDir', relPath, dirPath),
  rename: (relPath: string, newRelPath: string, dirPath?: string): Promise<boolean> =>
    ipcRenderer.invoke('notes:rename', relPath, newRelPath, dirPath),
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectDirectory'),
  createNoteDraft: (draft: NoteDraft, dirPath?: string): Promise<SavedNoteInfo> =>
    ipcRenderer.invoke('notes:createNoteDraft', draft, dirPath),
  updateNoteDraft: (relPath: string, draft: NoteDraft, dirPath?: string): Promise<SavedNoteInfo> =>
    ipcRenderer.invoke('notes:updateNoteDraft', relPath, draft, dirPath),
  indexInit: (dirPath?: string): Promise<number> => ipcRenderer.invoke('index:init', dirPath),
  indexSearch: (query: string, limit?: number): Promise<Array<{ relPath: string; title: string; snippet: string }>> =>
    ipcRenderer.invoke('index:search', query, limit),
  indexClose: (): Promise<boolean> => ipcRenderer.invoke('index:close'),
  readHistory: (): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('history:read'),
  writeHistory: (data: unknown): Promise<boolean> =>
    ipcRenderer.invoke('history:write', data),

  gitEnsure: (repoDir: string, remoteUrl: string): Promise<boolean> =>
    ipcRenderer.invoke('git:ensure', repoDir, remoteUrl),
  gitCommit: (repoDir: string, message?: string): Promise<boolean> =>
    ipcRenderer.invoke('git:commit', repoDir, message),
  gitSync: (repoDir: string, auth?: GitAuth): Promise<SyncResult> =>
    ipcRenderer.invoke('git:sync', repoDir, auth),
  gitResolveConflicts: (
    repoDir: string,
    picks: Array<{ file: string; source: 'local' | 'remote' }>,
    auth?: GitAuth
  ): Promise<SyncResult> => ipcRenderer.invoke('git:resolveConflicts', repoDir, picks, auth),
  gitHistory: (repoDir: string, relPath: string, limit?: number): Promise<GitCommitInfo[]> =>
    ipcRenderer.invoke('git:history', repoDir, relPath, limit),
  gitShow: (repoDir: string, relPath: string, hash: string): Promise<string | null> =>
    ipcRenderer.invoke('git:show', repoDir, relPath, hash),
  gitRestore: (repoDir: string, relPath: string, hash: string): Promise<string | null> =>
    ipcRenderer.invoke('git:restore', repoDir, relPath, hash),

  onNotesChanged: (cb: (relPath: string) => void) => {
    const handler = (_event: any, relPath: string) => cb(relPath)
    ipcRenderer.on('notes:changed', handler)
    return () => ipcRenderer.removeListener('notes:changed', handler)
  }
}

contextBridge.exposeInMainWorld('jazz', api)
