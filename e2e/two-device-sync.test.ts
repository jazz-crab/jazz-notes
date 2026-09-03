import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import fs from 'fs'
import git from 'isomorphic-git'
import { ensureRepo, commitAll, sync } from '../src/main/git'
import type { SyncResult } from '../src/main/git'

// Real sync remote + credentials, overridable via the environment so the test can
// be pointed at another server (or kept away from prod) without editing the file.
const REAL_REMOTE = process.env.JAZZ_E2E_REMOTE ?? 'https://notes.rentgen.su/jazz-notes-vault.git'
const REAL_USER = process.env.JAZZ_E2E_USER ?? 'jc'
const REAL_PASS = process.env.JAZZ_E2E_PASS ?? '1991'
const AUTH = { username: REAL_USER, password: REAL_PASS }

const MARKER = `marker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const BODY = '# e2e sync\n\nbody created on device A\n'
const BODY_EDITED = BODY + `appended on device B: ${MARKER}\n`

let dirA: string
let dirB: string
let noteRel: string

function expectSynced(r: SyncResult): { merged: boolean; pushed: number; pulled: number } {
  expect(r.status).toBe('synced')
  if (r.status !== 'synced') throw new Error(`expected status "synced", got "${r.status}"`)
  return r
}

// sync() now materialises pulled changes onto disk (see src/main/git.ts) and keeps
// the local branch attached, so a successful pull can be asserted by reading the
// vault directory directly instead of reading blobs out of the object database.
beforeAll(async () => {
  dirA = await mkdtemp(join(tmpdir(), 'jazz-e2e-a-'))
  dirB = await mkdtemp(join(tmpdir(), 'jazz-e2e-b-'))
  noteRel = `e2e-sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`

  await ensureRepo(dirA, REAL_REMOTE)
  await ensureRepo(dirB, REAL_REMOTE)
  // First sync adopts the remote HEAD (fresh device), so both vaults share the
  // same history before we start pushing our test note.
  expectSynced(await sync(dirA, AUTH))
  expectSynced(await sync(dirB, AUTH))
}, 60_000)

describe('two-device sync (e2e)', () => {
  it(
    'syncs a note from A to B, back to A, then deletes it everywhere',
    async () => {
      const fileA = join(dirA, noteRel)
      const fileB = join(dirB, noteRel)

      try {
        // 1. Device A creates the note and pushes it.
        await writeFile(fileA, BODY, 'utf-8')
        const r1 = await sync(dirA, AUTH)
        expectSynced(r1)
        expect(r1.pushed, 'A should push the note').toBeGreaterThan(0)

        // 2. Device B pulls and the note is on disk.
        const r2 = await sync(dirB, AUTH)
        expectSynced(r2)
        expect(r2.pulled, 'B should pull the note').toBeGreaterThan(0)
        expect(fs.existsSync(fileB), 'B should have the note on disk').toBe(true)
        expect(await readFile(fileB, 'utf-8')).toBe(BODY)

        // 3. Device B appends a marker to the same note and pushes it.
        await writeFile(fileB, BODY_EDITED, 'utf-8')
        const r3 = await sync(dirB, AUTH)
        expectSynced(r3)
        expect(r3.pushed, 'B should push the edit').toBeGreaterThan(0)

        // 4. Device A pulls and B's edit is on disk.
        const r4 = await sync(dirA, AUTH)
        expectSynced(r4)
        expect(r4.pulled, 'A should pull the edit').toBeGreaterThan(0)
        expect(await readFile(fileA, 'utf-8')).toBe(BODY_EDITED)
        expect(await readFile(fileA, 'utf-8')).toContain(MARKER)

        // 5. Device A deletes the note and pushes the deletion.
        await rm(fileA, { force: true })
        const r5 = await sync(dirA, AUTH)
        expectSynced(r5)
        expect(r5.pushed, 'A should push the deletion').toBeGreaterThan(0)

        // 6. Device B pulls and the note is gone from disk and from HEAD.
        const r6 = await sync(dirB, AUTH)
        expectSynced(r6)
        expect(r6.pulled, 'B should pull the deletion').toBeGreaterThan(0)
        expect(fs.existsSync(fileB), 'B should not have the note on disk').toBe(false)
        const head = await git.resolveRef({ fs, dir: dirB, ref: 'HEAD' })
        const tree = await git.readTree({ fs, dir: dirB, oid: head })
        expect(tree.tree.some((e) => e.path === noteRel), 'note should be gone from B HEAD').toBe(false)
      } finally {
        // Best-effort cleanup: make sure the test note is removed from the server even
        // if an assertion above failed mid-scenario. Converge both devices first so
        // the deletion below is a clean fast-forward push.
        try {
          expectSynced(await sync(dirA, AUTH))
          expectSynced(await sync(dirB, AUTH))
          await rm(fileA, { force: true })
          await rm(fileB, { force: true })
          await commitAll(dirA)
          expectSynced(await sync(dirA, AUTH))
          expectSynced(await sync(dirB, AUTH))
        } catch {
          // cleanup is best-effort; the original error is re-thrown
        }
      }
    },
    120_000
  )
})

afterAll(async () => {
  // Safety sweep: remove any leftover e2e-sync-* file from the server (e.g. from a
  // previous failed run) by pulling HEAD into a throwaway repo, deleting it and pushing.
  try {
    const sweep = await mkdtemp(join(tmpdir(), 'jazz-e2e-sweep-'))
    try {
      await ensureRepo(sweep, REAL_REMOTE)
      await sync(sweep, AUTH)
      const leftovers = (await readdir(sweep)).filter((f) => f.startsWith('e2e-sync-'))
      for (const f of leftovers) {
        await rm(join(sweep, f), { force: true })
      }
      if (leftovers.length > 0) {
        await commitAll(sweep)
        await sync(sweep, AUTH)
        await sync(dirB, AUTH)
      }
    } finally {
      await rm(sweep, { recursive: true, force: true })
    }
  } catch {
    // best-effort
  }
  await rm(dirA, { recursive: true, force: true }).catch(() => {})
  await rm(dirB, { recursive: true, force: true }).catch(() => {})
}, 60_000)
