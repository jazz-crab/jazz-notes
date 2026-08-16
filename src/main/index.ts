import { app, BrowserWindow, ipcMain, dialog, Menu, session } from 'electron'
import { join } from 'path'
import { readdir, readFile, writeFile, unlink, mkdir, rm, rename } from 'fs/promises'
import { existsSync } from 'fs'
import { watch } from 'chokidar'
import {
  ensureRepo,
  commitAll,
  sync as gitSync,
  resolveConflicts as gitResolveConflicts,
  history as gitHistory,
  show as gitShow,
  restore as gitRestore,
  type SyncResult,
  type GitCommitInfo,
  type GitAuth,
} from './git'
import { saveNotes, updateNote } from './save'

let mainWindow: BrowserWindow | null = null
let watcher: ReturnType<typeof watch> | null = null

const isDev = !!process.env.ELECTRON_RENDERER_URL

let commitTimer: ReturnType<typeof setTimeout> | null = null

function scheduleCommit(repoDir: string) {
  if (commitTimer) clearTimeout(commitTimer)
  commitTimer = setTimeout(() => {
    commitTimer = null
    commitAll(repoDir).catch(() => {})
  }, 300)
}

function getDefaultNotesPath(): string {
  return join(app.getPath('documents'), 'jazz-notes-vault')
}

async function ensureNotesDir(notesPath: string) {
  if (!existsSync(notesPath)) {
    await mkdir(notesPath, { recursive: true })
  }
}

function startWatching(notesPath: string) {
  if (watcher) watcher.close()
  watcher = watch(notesPath, {
    persistent: true,
    ignoreInitial: true,
    depth: 10,
    ignored: /(^|[\/\\])\.git(\/|$)/,
  })
  watcher.on('all', (_event, filePath) => {
    const rel = filePath.replace(notesPath, '').replace(/\\/g, '/')
    mainWindow?.webContents.send('notes:changed', rel)
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 700,
    minHeight: 500,
    title: 'JazzNote',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  Menu.setApplicationMenu(null)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc() {
  ipcMain.handle('notes:getPath', () => {
    const p = app.getPath('documents')
    return join(p, 'jazz-notes-vault')
  })

  ipcMain.handle('notes:readFile', async (_event, relPath: string, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    const fullPath = join(notesPath, relPath)
    const content = await readFile(fullPath, 'utf-8')
    return content
  })

  ipcMain.handle('notes:writeFile', async (_event, relPath: string, content: string, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    const fullPath = join(notesPath, relPath)
    await ensureNotesDir(notesPath)
    await writeFile(fullPath, content, 'utf-8')
    scheduleCommit(notesPath)
    return true
  })

  ipcMain.handle('notes:deleteFile', async (_event, relPath: string, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    const fullPath = join(notesPath, relPath)
    await unlink(fullPath)
    return true
  })

  ipcMain.handle('notes:createFile', async (_event, relPath: string, content: string, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    const fullPath = join(notesPath, relPath)
    await ensureNotesDir(notesPath)
    await writeFile(fullPath, content, 'utf-8')
    scheduleCommit(notesPath)
    return true
  })

  ipcMain.handle('notes:createDir', async (_event, relPath: string, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    const fullPath = join(notesPath, relPath)
    await mkdir(fullPath, { recursive: true })
    scheduleCommit(notesPath)
    return true
  })

  ipcMain.handle('notes:deleteDir', async (_event, relPath: string, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    const fullPath = join(notesPath, relPath)
    await rm(fullPath, { recursive: true, force: true })
    scheduleCommit(notesPath)
    return true
  })

  ipcMain.handle('notes:rename', async (_event, relPath: string, newRelPath: string, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    const fullPath = join(notesPath, relPath)
    const newFullPath = join(notesPath, newRelPath)
    await ensureNotesDir(notesPath)
    await mkdir(join(newFullPath, '..'), { recursive: true })
    await rename(fullPath, newFullPath)
    scheduleCommit(notesPath)
    return true
  })

  ipcMain.handle('notes:readDirRecursive', async (_event, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    await ensureNotesDir(notesPath)
    startWatching(notesPath)

    const result: string[] = []
    async function walk(dir: string, prefix: string) {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          await walk(join(dir, entry.name), rel)
          result.push(rel + '/')
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          result.push(rel)
        }
      }
    }
    await walk(notesPath, '')
    return result
  })

  ipcMain.handle('history:read', async () => {
    const historyPath = join(app.getPath('userData'), 'jazz-notes-history.json')
    try {
      return JSON.parse(await readFile(historyPath, 'utf-8'))
    } catch {
      return {}
    }
  })

  ipcMain.handle('history:write', async (_event, data: unknown) => {
    const historyPath = join(app.getPath('userData'), 'jazz-notes-history.json')
    await writeFile(historyPath, JSON.stringify(data), 'utf-8')
    return true
  })

  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory']
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })

  ipcMain.handle('notes:createNoteDraft', async (_event, draft, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    const result = await saveNotes([draft], notesPath, () => scheduleCommit(notesPath))
    return result.saved[0]
  })

  ipcMain.handle('notes:updateNoteDraft', async (_event, relPath: string, draft, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    const result = await updateNote(relPath, draft, notesPath, () => scheduleCommit(notesPath))
    return result.saved[0]
  })

  ipcMain.handle('git:ensure', async (_event, repoDir: string, remoteUrl: string) => {
    await ensureRepo(repoDir, remoteUrl)
    return true
  })

  ipcMain.handle('git:commit', async (_event, repoDir: string, message?: string) => {
    return commitAll(repoDir, message)
  })

  ipcMain.handle('git:sync', async (_event, repoDir: string, auth?: GitAuth): Promise<SyncResult> => {
    return gitSync(repoDir, auth)
  })

  ipcMain.handle(
    'git:resolveConflicts',
    async (
      _event,
      repoDir: string,
      picks: Array<{ file: string; source: 'local' | 'remote' }>,
      auth?: GitAuth
    ): Promise<SyncResult> => {
      return gitResolveConflicts(repoDir, picks, auth)
    }
  )

  ipcMain.handle('git:history', async (_event, repoDir: string, relPath: string, limit?: number): Promise<GitCommitInfo[]> => {
    return gitHistory(repoDir, relPath, limit)
  })

  ipcMain.handle('git:show', async (_event, repoDir: string, relPath: string, hash: string): Promise<string | null> => {
    return gitShow(repoDir, relPath, hash)
  })

  ipcMain.handle('git:restore', async (_event, repoDir: string, relPath: string, hash: string): Promise<string | null> => {
    return gitRestore(repoDir, relPath, hash)
  })
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(['media', 'camera'].includes(permission))
    })
    createWindow()
    registerIpc()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
