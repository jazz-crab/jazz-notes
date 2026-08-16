import fs from 'fs'
import { mkdir, writeFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'
import type { SyncResult, GitCommitInfo } from '../shared/types'

export type { SyncResult, GitCommitInfo } from '../shared/types'

const DEFAULT_BRANCH = 'main'
const AUTHOR = { name: 'jazz-notes', email: 'jazz-notes@local' }
const cache: Record<string, unknown> = {}

export interface GitAuth {
  username?: string
  password?: string
}

class AuthError extends Error {}

const OFFLINE_PATTERNS = [
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'socket hang up',
  'tunnel connection failed',
  'Could not resolve hostname',
  'No route to host',
  'timed out',
  'connection refused',
  'connection reset',
  'network is unreachable',
  'connection closed',
]

export function isOfflineError(message: string): boolean {
  const haystack = message.toLowerCase()
  return OFFLINE_PATTERNS.some((p) => haystack.includes(p.toLowerCase()))
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const e = err as Error & { code?: string }
    const parts = [e.message]
    if (e.code && !parts[0].includes(e.code)) parts.push(e.code)
    const cause = (e as { cause?: unknown }).cause
    if (cause instanceof Error && !parts.some((p) => p.includes(cause.message))) parts.push(cause.message)
    return parts.filter(Boolean).join(' | ')
  }
  return String(err)
}

function isAuthError(err: unknown): boolean {
  if (err instanceof AuthError) return true
  const data = (err as { data?: { statusCode?: number } }).data
  return data?.statusCode === 401 || data?.statusCode === 403
}

function authCallbacks(auth?: GitAuth) {
  return {
    onAuth: () => auth ?? { username: '', password: '' },
    onAuthFailure: () => {
      throw new AuthError()
    },
  }
}

export async function ensureRepo(repoDir: string, remoteUrl: string): Promise<string> {
  await mkdir(repoDir, { recursive: true })
  if (!existsSync(join(repoDir, '.git'))) {
    await git.init({ fs, dir: repoDir, defaultBranch: DEFAULT_BRANCH })
  }
  await git.setConfig({ fs, dir: repoDir, path: 'user.name', value: AUTHOR.name })
  await git.setConfig({ fs, dir: repoDir, path: 'user.email', value: AUTHOR.email })
  if (remoteUrl) {
    const remotes = await git.listRemotes({ fs, dir: repoDir })
    const origin = remotes.find((r) => r.remote === 'origin')
    if (!origin) {
      await git.addRemote({ fs, dir: repoDir, remote: 'origin', url: remoteUrl })
    } else if (origin.url !== remoteUrl) {
      await git.deleteRemote({ fs, dir: repoDir, remote: 'origin' })
      await git.addRemote({ fs, dir: repoDir, remote: 'origin', url: remoteUrl })
    }
  }
  return repoDir
}

export async function commitAll(repoDir: string, message = 'autosave'): Promise<boolean> {
  const status = await git.statusMatrix({ fs, dir: repoDir })
  const headOid = await git.resolveRef({ fs, dir: repoDir, ref: 'HEAD' }).catch(() => null)
  let changed = false
  for (const [filepath, head, workdir] of status) {
    if (workdir === 0) {
      if (head !== 0) {
        await git.remove({ fs, dir: repoDir, filepath })
        changed = true
      }
      continue
    }
    if (head === 0 || headOid === null) {
      await git.add({ fs, dir: repoDir, filepath })
      changed = true
      continue
    }
    const headBlob = await git.readBlob({ fs, dir: repoDir, oid: headOid, filepath }).catch(() => null)
    const work = await readFile(join(repoDir, filepath)).catch(() => null)
    if (headBlob === null || work === null || Buffer.compare(Buffer.from(headBlob.blob), work) !== 0) {
      await git.add({ fs, dir: repoDir, filepath })
      changed = true
    }
  }
  if (!changed) return false
  await git.commit({ fs, dir: repoDir, message, author: AUTHOR })
  return true
}

export async function push(repoDir: string, auth?: GitAuth): Promise<void> {
  await git.push({
    fs,
    dir: repoDir,
    http,
    remote: 'origin',
    ref: DEFAULT_BRANCH,
    cache,
    ...authCallbacks(auth),
  })
}

function remoteRef(): string {
  return `refs/remotes/origin/${DEFAULT_BRANCH}`
}

async function hasRemote(repoDir: string): Promise<boolean> {
  const remotes = await git.listRemotes({ fs, dir: repoDir })
  return remotes.some((r) => r.remote === 'origin')
}

async function adoptRemoteHead(repoDir: string, theirsOid: string): Promise<void> {
  await git.writeRef({ fs, dir: repoDir, ref: `refs/heads/${DEFAULT_BRANCH}`, value: theirsOid })
  await git.checkout({ fs, dir: repoDir, ref: DEFAULT_BRANCH, force: true })
}

export async function sync(repoDir: string, auth?: GitAuth): Promise<SyncResult> {
  try {
    await commitAll(repoDir)
  } catch {
    // commit failures are not fatal; merge may still succeed
  }

  if (!(await hasRemote(repoDir))) {
    return { status: 'synced', merged: false, pushed: 0, pulled: 0 }
  }

  let oursOid: string | null = null
  try {
    oursOid = await git.resolveRef({ fs, dir: repoDir, ref: 'HEAD' })
  } catch {
    oursOid = null
  }

  try {
    await git.fetch({
      fs,
      dir: repoDir,
      http,
      remote: 'origin',
      ref: DEFAULT_BRANCH,
      singleBranch: true,
      cache,
      ...authCallbacks(auth),
    })
  } catch (e) {
    if (isAuthError(e)) return { status: 'error', error: 'Неверный логин или пароль синхронизации' }
    const msg = describeError(e)
    if (isOfflineError(msg)) return { status: 'offline', error: msg }
    return { status: 'error', error: msg }
  }

  let theirsOid: string | null = null
  try {
    theirsOid = await git.resolveRef({ fs, dir: repoDir, ref: remoteRef() })
  } catch {
    theirsOid = null
  }

  if (theirsOid === null) {
    if (oursOid === null) return { status: 'synced', merged: false, pushed: 0, pulled: 0 }
    try {
      await push(repoDir, auth)
      return { status: 'synced', merged: false, pushed: 1, pulled: 0 }
    } catch (e) {
      if (isAuthError(e)) return { status: 'error', error: 'Неверный логин или пароль синхронизации' }
      const msg = describeError(e)
      if (isOfflineError(msg)) return { status: 'offline', error: msg }
      return { status: 'error', error: msg }
    }
  }

  if (oursOid === null) {
    try {
      await adoptRemoteHead(repoDir, theirsOid)
      return { status: 'synced', merged: false, pushed: 0, pulled: 1 }
    } catch (e) {
      return { status: 'error', error: describeError(e) }
    }
  }

  if (theirsOid === oursOid) {
    return { status: 'synced', merged: false, pushed: 0, pulled: 0 }
  }

  let mergeBase: string | null = null
  try {
    const bases = await git.findMergeBase({ fs, dir: repoDir, oids: [oursOid, theirsOid] })
    mergeBase = bases[0] ?? null
  } catch {
    mergeBase = null
  }

  if (mergeBase === null) {
    return { status: 'error', error: 'Локальная и серверная истории несовместимы' }
  }

  if (mergeBase === theirsOid) {
    try {
      await push(repoDir, auth)
      return { status: 'synced', merged: false, pushed: 1, pulled: 0 }
    } catch (e) {
      if (isAuthError(e)) return { status: 'error', error: 'Неверный логин или пароль синхронизации' }
      const msg = describeError(e)
      if (isOfflineError(msg)) return { status: 'offline', error: msg }
      return { status: 'error', error: msg }
    }
  }

  if (mergeBase === oursOid) {
    try {
      await git.merge({ fs, dir: repoDir, ours: 'HEAD', theirs: remoteRef(), fastForwardOnly: true })
      return { status: 'synced', merged: false, pushed: 0, pulled: 1 }
    } catch (e) {
      return { status: 'error', error: describeError(e) }
    }
  }

  try {
    await git.merge({ fs, dir: repoDir, ours: 'HEAD', theirs: remoteRef(), abortOnConflict: false })
    await push(repoDir, auth)
    return { status: 'synced', merged: true, pushed: 1, pulled: 1 }
  } catch (e) {
    const data = (e as { data?: { filepaths?: string[] } }).data
    if (data?.filepaths?.length) {
      return { status: 'conflict', conflictedFiles: data.filepaths }
    }
    if (isAuthError(e)) return { status: 'error', error: 'Неверный логин или пароль синхронизации' }
    const msg = describeError(e)
    if (isOfflineError(msg)) return { status: 'offline', error: msg }
    return { status: 'error', error: msg }
  }
}

export async function resolveConflicts(
  repoDir: string,
  picks: Array<{ file: string; source: 'local' | 'remote' }>,
  auth?: GitAuth
): Promise<SyncResult> {
  const oursOid = await git.resolveRef({ fs, dir: repoDir, ref: 'HEAD' })
  const theirsOid = await git.resolveRef({ fs, dir: repoDir, ref: remoteRef() })
  for (const pick of picks) {
    const filepath = pick.file
    const oid = pick.source === 'remote' ? theirsOid : oursOid
    try {
      const { blob } = await git.readBlob({ fs, dir: repoDir, oid, filepath })
      await mkdir(join(repoDir, filepath, '..'), { recursive: true })
      await writeFile(join(repoDir, filepath), Buffer.from(blob))
      await git.add({ fs, dir: repoDir, filepath })
    } catch {
      try {
        await git.remove({ fs, dir: repoDir, filepath })
      } catch {
        // nothing to remove
      }
    }
  }
  try {
    await git.commit({ fs, dir: repoDir, message: 'sync: resolve conflicts', author: AUTHOR, parent: [oursOid, theirsOid] })
  } catch {
    // nothing left to commit
  }
  if (!(await hasRemote(repoDir))) {
    return { status: 'synced', merged: true, pushed: 0, pulled: 0 }
  }
  try {
    await push(repoDir, auth)
    return { status: 'synced', merged: true, pushed: 1, pulled: 0 }
  } catch (e) {
    if (isAuthError(e)) return { status: 'error', error: 'Неверный логин или пароль синхронизации' }
    const msg = describeError(e)
    if (isOfflineError(msg)) return { status: 'offline', error: msg }
    return { status: 'error', error: msg }
  }
}

export async function history(repoDir: string, relPath: string, limit = 50): Promise<GitCommitInfo[]> {
  const entries = await git.log({ fs, dir: repoDir, filepath: relPath, depth: limit }).catch(() => [])
  return entries.map((entry) => ({
    hash: entry.oid,
    shortHash: entry.oid.slice(0, 7),
    date: new Date(entry.commit.committer.timestamp * 1000).toISOString(),
    message: entry.commit.message.replace(/\n+$/, ''),
  }))
}

export async function show(repoDir: string, relPath: string, hash: string): Promise<string | null> {
  try {
    const { blob } = await git.readBlob({ fs, dir: repoDir, oid: hash, filepath: relPath })
    return Buffer.from(blob).toString('utf-8')
  } catch {
    return null
  }
}

export async function restore(repoDir: string, relPath: string, hash: string): Promise<string | null> {
  const content = await show(repoDir, relPath, hash)
  if (content === null) return null
  const fullPath = join(repoDir, relPath)
  const dir = join(fullPath, '..')
  await mkdir(dir, { recursive: true })
  await writeFile(fullPath, content, 'utf-8')
  await commitAll(repoDir, `restore ${relPath}`)
  return content
}
