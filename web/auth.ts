import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'

let users: Record<string, string> = {}
let usersPath = ''

export function loadUsers(path: string) {
  usersPath = path
  try {
    users = JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    users = {}
  }
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function timingSafe(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

function checkUser(user: string, password: string): boolean {
  const hash = users[user]
  if (!hash) return false
  return timingSafe(sha256(password), hash)
}

function send(res: ServerResponse, code: number, body: unknown) {
  const data = JSON.stringify(body)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(data)
}

/** Read body and extract auth. Returns null if auth fails (response already sent). */
export async function authenticate(
  req: IncomingMessage,
  res: ServerResponse
): Promise<{ user: string; body: Record<string, unknown> } | null> {
  // 1. Check Authorization: Basic header (nginx forwards this)
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8')
    const colon = decoded.indexOf(':')
    if (colon > 0) {
      const user = decoded.slice(0, colon)
      const pass = decoded.slice(colon + 1)
      if (checkUser(user, pass)) {
        const body = await readBody(req)
        return { user, body }
      }
    }
    send(res, 401, { error: 'unauthorized' })
    return null
  }

  // 2. Check user/password in JSON body
  const body = await readBody(req)
  const user = String(body.user || '')
  const password = String(body.password || '')
  if (user && password && checkUser(user, password)) {
    // Strip auth fields from body so route handlers don't see them
    delete body.user
    delete body.password
    return { user, body }
  }

  send(res, 401, { error: 'unauthorized' })
  return null
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString('utf-8')
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}
