import { readFile, readdir, mkdir, rm, rename } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve, sep, dirname } from 'path'

export function vaultPath(vault: string, rel: string): string {
  const clean = rel.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  const root = resolve(vault)
  const full = resolve(root, clean)
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error('bad path')
  }
  return full
}

export async function readDirRecursive(vault: string): Promise<string[]> {
  const result: string[] = []
  async function walk(dir: string, prefix: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (entry.name === '.git' || entry.name === '.jazz') continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        await walk(join(dir, entry.name), rel)
        result.push(rel + '/')
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        result.push(rel)
      }
    }
  }
  if (!existsSync(vault)) return []
  await walk(vault, '')
  return result
}

export async function readVaultFile(vault: string, rel: string): Promise<string> {
  return readFile(vaultPath(vault, rel), 'utf-8')
}

export async function mkdirVault(vault: string, rel: string): Promise<void> {
  await mkdir(vaultPath(vault, rel), { recursive: true })
}

export async function rmdirVault(vault: string, rel: string): Promise<void> {
  await rm(vaultPath(vault, rel), { recursive: true, force: true })
}

export async function deleteVaultFile(vault: string, rel: string): Promise<void> {
  await rm(vaultPath(vault, rel), { force: true })
}

export async function renameVault(vault: string, from: string, to: string): Promise<void> {
  const dest = vaultPath(vault, to)
  await mkdir(dirname(dest), { recursive: true })
  await rename(vaultPath(vault, from), dest)
}
