import { createHash, timingSafeEqual } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { homedir } from 'node:os'

export interface GitUserInfo {
  login: string
  createdAt?: string
}

export type GitUsersResult = { ok: boolean; error?: string }

const INVALID_LOGIN_RE = /[\s:]/

export function usersFilePath(): string {
  return process.env.JAZZ_GIT_USERS_FILE || `${homedir()}/.config/jazz-notes-git-users.json`
}

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

function compareHashes(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function loadUsers(): Promise<Record<string, string>> {
  const path = usersFilePath()
  try {
    const raw = await readFile(path, 'utf-8')
    if (!raw.trim()) return {}
    const data = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return {}
    return data as Record<string, string>
  } catch (e: any) {
    if (e.code === 'ENOENT') return {}
    throw new Error(`Failed to read git users file: ${e.message}`)
  }
}

export async function saveUsers(users: Record<string, string>): Promise<void> {
  const path = usersFilePath()
  try {
    const dir = dirname(path)
    if (!existsSync(dir)) await mkdir(dir, { recursive: true })
    await writeFile(path, JSON.stringify(users, null, 2) + '\n', 'utf-8')
  } catch (e: any) {
    throw new Error(`Failed to write git users file: ${e.message}`)
  }
}

export async function listUsers(): Promise<GitUserInfo[]> {
  const users = await loadUsers()
  return Object.keys(users).map((login) => ({ login }))
}

export function validateLogin(login: string): GitUsersResult {
  if (!login || !login.trim()) return { ok: false, error: 'login must not be empty' }
  if (INVALID_LOGIN_RE.test(login)) return { ok: false, error: 'login must not contain spaces or colons' }
  return { ok: true }
}

export async function addUser(login: string, password: string): Promise<GitUsersResult> {
  const v = validateLogin(login)
  if (!v.ok) return v
  const users = await loadUsers()
  if (users[login]) return { ok: false, error: `user "${login}" already exists` }
  users[login] = hashPassword(password)
  await saveUsers(users)
  return { ok: true }
}

export async function removeUser(login: string): Promise<GitUsersResult> {
  const users = await loadUsers()
  if (!users[login]) return { ok: false, error: `user "${login}" not found` }
  delete users[login]
  await saveUsers(users)
  return { ok: true }
}

export async function setPassword(login: string, password: string): Promise<GitUsersResult> {
  const users = await loadUsers()
  if (!users[login]) return { ok: false, error: `user "${login}" not found` }
  users[login] = hashPassword(password)
  await saveUsers(users)
  return { ok: true }
}

export async function renameUser(oldLogin: string, newLogin: string): Promise<GitUsersResult> {
  const v = validateLogin(newLogin)
  if (!v.ok) return v
  const users = await loadUsers()
  if (!users[oldLogin]) return { ok: false, error: `user "${oldLogin}" not found` }
  if (users[newLogin]) return { ok: false, error: `user "${newLogin}" already exists` }
  users[newLogin] = users[oldLogin]
  delete users[oldLogin]
  await saveUsers(users)
  return { ok: true }
}

export async function verifyUser(login: string, password: string): Promise<boolean> {
  const users = await loadUsers()
  const hash = users[login]
  if (!hash) return false
  return compareHashes(hash, hashPassword(password))
}

export async function ensureDefaultUser(): Promise<void> {
  const users = await loadUsers()
  if (Object.keys(users).length === 0) {
    users['jc'] = hashPassword('1991')
    await saveUsers(users)
  }
}
