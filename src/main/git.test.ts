import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

// ---- local-remote stub for the pull regression test -------------------------
// sync() fetches over HTTP, which cannot be exercised hermetically. We override
// only `git.fetch` with a stub that copies the object database of a local
// "remote" repo into the device repo and points refs/remotes/origin/main at the
// remote's main. Everything else in isomorphic-git stays real, so the merge /
// checkout paths of sync() are exercised for real. When `fetchStub.remote` is
// unset the stub delegates to the real fetch, keeping the other tests intact.
const fetchStub = vi.hoisted(() => ({ remote: '' }))

vi.mock('isomorphic-git', async (importOriginal) => {
  const actual = await importOriginal<typeof import('isomorphic-git')>()
  const real = (actual as unknown as { default?: Record<string, unknown> }).default ?? actual
  const realFetch = real.fetch as (opts: Record<string, unknown>) => Promise<unknown>
  const fakeFetch = async (opts: Record<string, unknown>): Promise<unknown> => {
    const remoteDir = fetchStub.remote
    if (!remoteDir) return realFetch(opts)
    const src = join(remoteDir, '.git', 'objects')
    if (fs.existsSync(src)) {
      await fs.promises.cp(src, join(opts.dir as string, '.git', 'objects'), { recursive: true, force: true })
    }
    const remoteMain = await (real.resolveRef as (o: Record<string, unknown>) => Promise<string>)({
      fs: opts.fs,
      dir: remoteDir,
      ref: 'refs/heads/main',
    }).catch(() => null)
    if (remoteMain) {
      await (real.writeRef as (o: Record<string, unknown>) => Promise<void>)({
        fs: opts.fs,
        dir: opts.dir,
        ref: 'refs/remotes/origin/main',
        value: remoteMain,
        force: true,
      })
    }
  }
  return { ...actual, default: { ...real, fetch: fakeFetch } }
})

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

describe('sync pull materialises files', () => {
  it('fast-forward pull lands files on disk and keeps the branch attached', async () => {
    const remoteDir = await mkdtemp(join(tmpdir(), 'jazz-notes-remote-'))
    const deviceDir = await mkdtemp(join(tmpdir(), 'jazz-notes-pull-'))
    fetchStub.remote = remoteDir
    try {
      // Seed the remote with a first commit (fresh history).
      await ensureRepo(remoteDir, '')
      fs.writeFileSync(join(remoteDir, 'note.md'), 'v1\n')
      await commitAll(remoteDir)
      const remoteMainV1 = await git.resolveRef({ fs, dir: remoteDir, ref: 'refs/heads/main' })

      // Fresh device: first sync pulls (adoptRemoteHead path).
      await ensureRepo(deviceDir, remoteDir)
      const first = await sync(deviceDir)
      expect(first.status).toBe('synced')
      expect(first.pulled).toBeGreaterThan(0)
      expect(fs.readFileSync(join(deviceDir, 'note.md'), 'utf-8')).toBe('v1\n')
      const head1 = await git.resolveRef({ fs, dir: deviceDir, ref: 'HEAD' })
      const main1 = await git.resolveRef({ fs, dir: deviceDir, ref: 'refs/heads/main' })
      expect(main1).toBe(remoteMainV1)
      expect(head1).toBe(main1)

      // Remote advances with a second commit. A pull must materialise the new
      // content on disk and move the local branch (regression: isomorphic-git's
      // ff-merge left HEAD detached and the working directory stale).
      fs.writeFileSync(join(remoteDir, 'note.md'), 'v2 remote\n')
      await commitAll(remoteDir)
      const remoteMainV2 = await git.resolveRef({ fs, dir: remoteDir, ref: 'refs/heads/main' })

      const second = await sync(deviceDir)
      expect(second.status).toBe('synced')
      expect(second.pulled).toBeGreaterThan(0)
      expect(fs.readFileSync(join(deviceDir, 'note.md'), 'utf-8')).toBe('v2 remote\n')
      const head2 = await git.resolveRef({ fs, dir: deviceDir, ref: 'HEAD' })
      const main2 = await git.resolveRef({ fs, dir: deviceDir, ref: 'refs/heads/main' })
      expect(main2).toBe(remoteMainV2)
      expect(head2).toBe(main2)

      // Remote deletes the note; the pull must remove it from disk too.
      fs.rmSync(join(remoteDir, 'note.md'))
      await commitAll(remoteDir)
      const third = await sync(deviceDir)
      expect(third.status).toBe('synced')
      expect(third.pulled).toBeGreaterThan(0)
      expect(fs.existsSync(join(deviceDir, 'note.md'))).toBe(false)
    } finally {
      fetchStub.remote = ''
      await rm(remoteDir, { recursive: true, force: true })
      await rm(deviceDir, { recursive: true, force: true })
    }
  })
})
