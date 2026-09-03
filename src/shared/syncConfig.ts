const TOKEN_CHARSET = 'abcdefghjkmnpqrstuvwxyz23456789'
const TOKEN_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/

export const SYNC_TOKEN_LENGTH = 12
export const SYNC_CONFIG_PREFIX = 'jazznote://sync'

export function generateSyncToken(): string {
  const buf = new Uint32Array(SYNC_TOKEN_LENGTH)
  crypto.getRandomValues(buf)
  let token = ''
  for (let i = 0; i < SYNC_TOKEN_LENGTH; i++) {
    token += TOKEN_CHARSET[buf[i] % TOKEN_CHARSET.length]
  }
  return token
}

export function isValidSyncToken(token: string): boolean {
  return TOKEN_RE.test(token)
}

export interface SyncConfig {
  url: string
  user: string
  token: string
}

export function encodeSyncConfig(config: SyncConfig): string {
  const params = new URLSearchParams({ url: config.url, user: config.user, token: config.token })
  return `${SYNC_CONFIG_PREFIX}?${params.toString()}`
}

export function decodeSyncConfig(text: string): SyncConfig | null {
  const trimmed = text.trim()
  let url = ''
  let user = ''
  let token = ''
  if (trimmed.startsWith(SYNC_CONFIG_PREFIX)) {
    const q = trimmed.indexOf('?')
    if (q === -1) return null
    const params = new URLSearchParams(trimmed.slice(q + 1))
    url = params.get('url') ?? ''
    user = params.get('user') ?? ''
    token = params.get('token') ?? ''
  } else {
    const parts = trimmed.split('|').map((s) => s.trim())
    if (parts.length !== 3) return null
    ;[url, user, token] = parts
  }
  if (!url || !user || !token) return null
  return { url, user, token }
}
