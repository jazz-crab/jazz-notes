import type { IncomingMessage, ServerResponse } from 'http'
import { spawn } from 'child_process'
import { join } from 'path'

const GIT_BIN_DIR = process.env.GIT_BIN_DIR || ''

function gitBin(name: string): string {
  if (GIT_BIN_DIR) return join(GIT_BIN_DIR, name)
  return name
}

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-cache, max-age=0, must-revalidate',
  Expires: 'Fri, 01 Jan 1980 00:00:00 GMT',
  Pragma: 'no-cache',
}

const SERVICE_BANNER: Record<string, string> = {
  'git-upload-pack': '001e# service=git-upload-pack\n',
  'git-receive-pack': '001f# service=git-receive-pack\n',
}

const CONTENT_TYPES: Record<string, string> = {
  'git-upload-pack': 'application/x-git-upload-pack-advertisement',
  'git-receive-pack': 'application/x-git-receive-pack-advertisement',
}

const RESULT_TYPES: Record<string, string> = {
  'git-upload-pack': 'application/x-git-upload-pack-result',
  'git-receive-pack': 'application/x-git-receive-pack-result',
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

function spawnCollect(
  args: string[],
  opts: { cwd?: string; input?: Buffer } = {},
): Promise<{ code: number | null; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const out: Buffer[] = []
    let err = ''
    child.stdout.on('data', (c: Buffer) => out.push(c))
    child.stderr.on('data', (c: Buffer) => {
      err += c.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout: Buffer.concat(out), stderr: err }))
    if (opts.input) child.stdin.write(opts.input)
    child.stdin.end()
  })
}

async function handleInfoRefs(
  req: IncomingMessage,
  res: ServerResponse,
  bareRepoPath: string,
  service: string,
): Promise<void> {
  const child = await spawnCollect([gitBin(service), '--advertise-refs', bareRepoPath])
  if (child.code !== 0) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end(child.stderr || 'git advertise-refs failed')
    return
  }
  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[service],
    ...NO_CACHE_HEADERS,
  })
  res.write(SERVICE_BANNER[service])
  res.write('0000')
  res.end(child.stdout)
}

function handleRpc(
  req: IncomingMessage,
  res: ServerResponse,
  bareRepoPath: string,
  service: string,
  body: Buffer,
): void {
  const child = spawn(gitBin(service), ['--stateless-rpc', bareRepoPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  child.stderr.resume()

  child.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
    }
    res.end(`spawn error: ${err.message}`)
  })

  child.on('close', (code) => {
    if (code !== 0 && !res.writableEnded) {
      res.end()
    }
  })

  res.writeHead(200, {
    'Content-Type': RESULT_TYPES[service],
  })

  child.stdout.pipe(res)

  child.stdin.write(body)
  child.stdin.end()
}

export async function handleGitSmartHttp(
  req: IncomingMessage,
  res: ServerResponse,
  bareRepoPath: string,
): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname

  if (pathname.endsWith('/info/refs') && req.method === 'GET') {
    const service = url.searchParams.get('service')
    if (service === 'git-upload-pack' || service === 'git-receive-pack') {
      await handleInfoRefs(req, res, bareRepoPath, service)
      return true
    }
    return false
  }

  if (pathname.endsWith('/git-upload-pack') && req.method === 'POST') {
    const body = await readBody(req)
    handleRpc(req, res, bareRepoPath, 'git-upload-pack', body)
    return true
  }

  if (pathname.endsWith('/git-receive-pack') && req.method === 'POST') {
    const body = await readBody(req)
    handleRpc(req, res, bareRepoPath, 'git-receive-pack', body)
    return true
  }

  return false
}
