import { describe, expect, it } from 'vitest'
import {
  SYNC_CONFIG_PREFIX,
  SYNC_TOKEN_LENGTH,
  generateSyncToken,
  isValidSyncToken,
  encodeSyncConfig,
  decodeSyncConfig,
} from '../../../shared/syncConfig'

describe('syncConfig', () => {
  it('generates 12-char tokens from the safe charset', () => {
    for (let i = 0; i < 50; i++) {
      const token = generateSyncToken()
      expect(token).toHaveLength(SYNC_TOKEN_LENGTH)
      expect(token).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]+$/)
    }
  })

  it('generates distinct tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSyncToken()))
    expect(tokens.size).toBeGreaterThan(90)
  })

  it('validates tokens', () => {
    expect(isValidSyncToken('abc23456789x')).toBe(true)
    expect(isValidSyncToken('abc23456789')).toBe(false)
    expect(isValidSyncToken('ABCDEFGHJKLM')).toBe(false)
    expect(isValidSyncToken('0xbcdefghjklm')).toBe(false)
  })

  it('round-trips via the jazznote:// URI', () => {
    const config = { url: 'https://rentgen.su/git/jazz-notes-vault.git', user: 'vault', token: generateSyncToken() }
    const encoded = encodeSyncConfig(config)
    expect(encoded.startsWith(`${SYNC_CONFIG_PREFIX}?`)).toBe(true)
    expect(decodeSyncConfig(encoded)).toEqual(config)
  })

  it('round-trips via url|user|token fallback', () => {
    const config = { url: 'https://rentgen.su/git/jazz-notes-vault.git', user: 'vault', token: generateSyncToken() }
    const raw = `${config.url}|${config.user}|${config.token}`
    expect(decodeSyncConfig(raw)).toEqual(config)
  })

  it('rejects garbage and malformed configs', () => {
    expect(decodeSyncConfig('')).toBeNull()
    expect(decodeSyncConfig('hello')).toBeNull()
    expect(decodeSyncConfig('jazznote://sync')).toBeNull()
    expect(decodeSyncConfig('https://x|vault|short')).toBeNull()
    expect(decodeSyncConfig(`${SYNC_CONFIG_PREFIX}?url=x&token=abc`)).toBeNull()
  })
})
