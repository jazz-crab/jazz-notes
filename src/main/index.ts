import { app, BrowserWindow, ipcMain, dialog, Menu, session } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { watch } from 'chokidar'
import * as svc from '../shared/service'
import { getIndexStore } from './index-store'

let mainWindow: BrowserWindow | null = null
let watcher: ReturnType<typeof watch> | null = null

const isDev = !!process.env.ELECTRON_RENDERER_URL

let commitTimer: ReturnType<typeof setTimeout> | null = null

function scheduleCommit(repoDir: string) {
  if (commitTimer) clearTimeout(commitTimer)
  commitTimer = setTimeout(() => {
    commitTimer = null
    svc.gitCommit(repoDir).catch(() => {})
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

  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('app:focus')
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

  ipcMain.handle('notes:vaultExists', () => {
    const dir = getDefaultNotesPath()
    return existsSync(dir)
  })

  ipcMain.handle('notes:readFile', async (_event, relPath: string, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    return svc.readFile(notesPath, relPath)
  })

  ipcMain.handle('notes:writeFile', async (_event, relPath: string, content: string, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    await ensureNotesDir(notesPath)
    await svc.writeRaw(notesPath, relPath, content)
    scheduleCommit(notesPath)
    return true
  })

  ipcMain.handle('notes:deleteFile', async (_event, relPath: string, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    await svc.deleteFile(notesPath, relPath)
    getIndexStore().remove(relPath)
    return true
  })

  ipcMain.handle('notes:createFile', async (_event, relPath: string, content: string, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    await ensureNotesDir(notesPath)
    await svc.writeRaw(notesPath, relPath, content)
    scheduleCommit(notesPath)
    return true
  })

  ipcMain.handle('notes:createDir', async (_event, relPath: string, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    await svc.mkdir(notesPath, relPath)
    scheduleCommit(notesPath)
    return true
  })

  ipcMain.handle('notes:deleteDir', async (_event, relPath: string, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    await svc.rmdir(notesPath, relPath)
    getIndexStore().scan(notesPath)
    scheduleCommit(notesPath)
    return true
  })

  ipcMain.handle('notes:rename', async (_event, relPath: string, newRelPath: string, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    await ensureNotesDir(notesPath)
    await svc.renameFile(notesPath, relPath, newRelPath)
    getIndexStore().rename(relPath, newRelPath)
    scheduleCommit(notesPath)
    return true
  })

  ipcMain.handle('notes:readDirRecursive', async (_event, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    await ensureNotesDir(notesPath)
    startWatching(notesPath)
    return svc.readDirRecursive(notesPath)
  })

  ipcMain.handle('index:init', async (_e, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    const s = getIndexStore()
    s.open(notesPath)
    return s.scan(notesPath)
  })

  ipcMain.handle('index:search', (_e, query: string, limit?: number) =>
    getIndexStore().search(query, limit ?? 50)
  )

  ipcMain.handle('index:close', () => {
    getIndexStore().close()
    return true
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
    return svc.createNote(notesPath, draft, () => scheduleCommit(notesPath))
  })

  ipcMain.handle('notes:updateNoteDraft', async (_event, relPath: string, draft, dirPath?: string) => {
    const notesPath = dirPath || getDefaultNotesPath()
    return svc.updateNote(notesPath, relPath, draft, () => scheduleCommit(notesPath))
  })

  ipcMain.handle('git:ensure', async (_event, repoDir: string, remoteUrl: string) => {
    await svc.gitEnsure(repoDir, remoteUrl)
    return true
  })

  ipcMain.handle('git:commit', async (_event, repoDir: string, message?: string) => {
    return svc.gitCommit(repoDir, message)
  })

  ipcMain.handle('git:sync', async (_event, repoDir: string, auth?: svc.GitAuth): Promise<svc.SyncResult> => {
    return svc.gitSync(repoDir, auth)
  })

  ipcMain.handle(
    'git:resolveConflicts',
    async (
      _event,
      repoDir: string,
      picks: Array<{ file: string; source: 'local' | 'remote' }>,
      auth?: svc.GitAuth
    ): Promise<svc.SyncResult> => {
      return svc.gitResolveConflicts(repoDir, picks, auth)
    }
  )

  ipcMain.handle('git:history', async (_event, repoDir: string, relPath: string, limit?: number): Promise<svc.GitCommitInfo[]> => {
    return svc.gitHistory(repoDir, relPath, limit)
  })

  ipcMain.handle('git:show', async (_event, repoDir: string, relPath: string, hash: string): Promise<string | null> => {
    return svc.gitShow(repoDir, relPath, hash)
  })

  ipcMain.handle('git:restore', async (_event, repoDir: string, relPath: string, hash: string): Promise<string | null> => {
    return svc.gitRestore(repoDir, relPath, hash)
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
