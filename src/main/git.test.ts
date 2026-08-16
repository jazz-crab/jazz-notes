import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import fs from 'fs'
import git from 'isomorphic-git'
import {
  ensureRepo,
  commitAll,
  history,
  show,
  restore,
  sync,
  resolveConflicts,
  isOfflineError,
} from './git'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'jazz-notes-test-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const AUTHOR = { name: 'jazz-notes', email: 'jazz-notes@local' }

describe('isOfflineError', () => {
  it('detects network/offline failures', () => {
    expect(isOfflineError('connect ECONNREFUSED 10.0.0.1:443')).toBe(true)
    expect(isOfflineError('getaddrinfo ENOTFOUND rentgen.su')).toBe(true)
    expect(isOfflineError('Connection timed out')).toBe(true)
    expect(isOfflineError('socket hang up')).toBe(true)
  })

  it('does not flag auth, conflict and ordinary errors', () => {
    expect(isOfflineError('HTTP Error: 401 Unauthorized')).toBe(false)
    expect(isOfflineError('Automatic merge failed with one or more merge conflicts')).toBe(false)
    expect(isOfflineError('')).toBe(false)
  })
})

describe('ensureRepo + commitAll', () => {
  it('creates a git repo and commits changes', async () => {
    await ensureRepo(dir, '')
    expect(fs.existsSync(join(dir, '.git'))).toBe(true)

    expect(await commitAll(dir)).toBe(false)

    fs.writeFileSync(join(dir, 'a.md'), 'hello\n')
    expect(await commitAll(dir)).toBe(true)
    expect(await commitAll(dir)).toBe(false)

    fs.writeFileSync(join(dir, 'a.md'), 'changed\n')
    fs.mkdirSync(join(dir, 'sub'), { recursive: true })
    fs.writeFileSync(join(dir, 'sub/b.md'), 'new\n')
    expect(await commitAll(dir)).toBe(true)

    const log = await git.log({ fs, dir })
    expect(log.length).toBe(2)
  })

  it('commits deletions', async () => {
    await ensureRepo(dir, '')
    fs.writeFileSync(join(dir, 'a.md'), 'x\n')
    await commitAll(dir)
    fs.unlinkSync(join(dir, 'a.md'))
    expect(await commitAll(dir)).toBe(true)
    const entries = await git.log({ fs, dir })
    expect(entries[0].commit.message.trim()).toBe('autosave')
    const head = await git.resolveRef({ fs, dir, ref: 'HEAD' })
    const tree = await git.readTree({ fs, dir, oid: head })
    expect(tree.tree.some((e) => e.path === 'a.md')).toBe(false)
  })
})

describe('history / show / restore', () => {
  it('lists history for a file and restores old content', async () => {
    await ensureRepo(dir, '')
    fs.writeFileSync(join(dir, 'a.md'), 'v1\n')
    await commitAll(dir)
    fs.writeFileSync(join(dir, 'a.md'), 'v2\n')
    await commitAll(dir)
    fs.writeFileSync(join(dir, 'a.md'), 'v3\n')
    await commitAll(dir)

    const hist = await history(dir, 'a.md', 10)
    expect(hist.length).toBe(3)
    expect(hist[0].message).toBe('autosave')
    expect(hist[0].hash).toMatch(/^[0-9a-f]{40}$/)
    expect(hist[0].shortHash).toBe(hist[0].hash.slice(0, 7))
    expect(new Date(hist[0].date).getTime()).not.toBeNaN()

    expect(await show(dir, 'a.md', hist[2].hash)).toBe('v1\n')
    expect(await show(dir, 'missing.md', hist[2].hash)).toBeNull()

    expect(await restore(dir, 'a.md', hist[2].hash)).toBe('v1\n')
    expect(fs.readFileSync(join(dir, 'a.md'), 'utf-8')).toBe('v1\n')

    const after = await history(dir, 'a.md', 10)
    expect(after[0].message).toBe('restore a.md')
  })

  it('returns empty history on a fresh repo', async () => {
    await ensureRepo(dir, '')
    expect(await history(dir, 'a.md', 10)).toEqual([])
  })
})

describe('sync', () => {
  it('works locally when no remote is configured', async () => {
    await ensureRepo(dir, '')
    fs.writeFileSync(join(dir, 'a.md'), 'x\n')
    const result = await sync(dir)
    expect(result.status).toBe('synced')
    const hist = await history(dir, 'a.md', 5)
    expect(hist.length).toBe(1)
  })

  it('reports offline when the server is unreachable', async () => {
    await ensureRepo(dir, 'https://127.0.0.1:1/git/jazz-notes-vault.git')
    fs.writeFileSync(join(dir, 'a.md'), 'x\n')
    await commitAll(dir)
    const result = await sync(dir)
    expect(result.status).toBe('offline')
  })
})

describe('conflict resolution', () => {
  it('picks the local or remote version of a conflicted file', async () => {
    await ensureRepo(dir, '')
    fs.writeFileSync(join(dir, 'a.md'), 'base\n')
    await commitAll(dir)

    await git.branch({ fs, dir, ref: 'local2' })
    fs.writeFileSync(join(dir, 'a.md'), 'local\n')
    await commitAll(dir)
    await git.checkout({ fs, dir, ref: 'local2' })
    fs.writeFileSync(join(dir, 'a.md'), 'remote\n')
    await commitAll(dir)
    await git.checkout({ fs, dir, ref: 'main' })

    const theirsOid = await git.resolveRef({ fs, dir, ref: 'local2' })
    await git.writeRef({ fs, dir, ref: 'refs/remotes/origin/main', value: theirsOid })

    const conflict = await git
      .merge({ fs, dir, ours: 'HEAD', theirs: 'refs/remotes/origin/main', abortOnConflict: false })
      .then(() => null)
      .catch((e) => e)
    expect(conflict?.data?.filepaths).toEqual(['a.md'])

    const result = await resolveConflicts(dir, [{ file: 'a.md', source: 'local' }])
    expect(result.status).toBe('synced')
    expect(fs.readFileSync(join(dir, 'a.md'), 'utf-8')).toBe('local\n')

    const merged = await git.resolveRef({ fs, dir, ref: 'HEAD' })
    const commit = await git.readCommit({ fs, dir, oid: merged })
    expect(commit.commit.parent.length).toBe(2)
  })

  it('keeps the remote version when remote is picked', async () => {
    await ensureRepo(dir, '')
    fs.writeFileSync(join(dir, 'a.md'), 'base\n')
    await commitAll(dir)

    await git.branch({ fs, dir, ref: 'local2' })
    fs.writeFileSync(join(dir, 'a.md'), 'local\n')
    await commitAll(dir)
    await git.checkout({ fs, dir, ref: 'local2' })
    fs.writeFileSync(join(dir, 'a.md'), 'remote\n')
    await commitAll(dir)
    await git.checkout({ fs, dir, ref: 'main' })

    const theirsOid = await git.resolveRef({ fs, dir, ref: 'local2' })
    await git.writeRef({ fs, dir, ref: 'refs/remotes/origin/main', value: theirsOid })

    const conflict = await git
      .merge({ fs, dir, ours: 'HEAD', theirs: 'refs/remotes/origin/main', abortOnConflict: false })
      .then(() => null)
      .catch((e) => e)
    expect(conflict?.data?.filepaths).toEqual(['a.md'])

    const result = await resolveConflicts(dir, [{ file: 'a.md', source: 'remote' }])
    expect(result.status).toBe('synced')
    expect(fs.readFileSync(join(dir, 'a.md'), 'utf-8')).toBe('remote\n')
    expect(AUTHOR).toBeTruthy()
  })
})
