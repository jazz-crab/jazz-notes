import * as svc from '../shared/service'
import { parseNote } from '../shared/note'
import * as gitUsers from '../../web/git-users'

const VAULT = process.env.JAZZ_VAULT || ''

function usage(): string {
  return [
    `Usage: node dist/cli.js <command> [options]`,
    ``,
    `Commands:`,
    `  path                          print vault path`,
    `  list                          list notes as relPath<TAB>title`,
    `  folders                       list folders (relative paths)`,
    `  read <rel>                    print raw note content`,
    `  write <rel> [--content <t>]   write raw content (stdin if no --content)`,
    `  create <title> [--text <t>] [--folder <f>] [--due <d>] [--color <c>] [--priority <0-4>] [--tags <a,b>]`,
    `  delete <rel>                  delete a file`,
    `  mkdir <rel>                   create a directory`,
    `  rmdir <rel>                   remove a directory recursively`,
    `  mv <from> <to>                rename/move within the vault`,
    `  meta <rel> [--title <t>] [--due <d>] [--color <c>] [--priority <0-4>] [--tags <a,b>] [--done] [--undone]`,
    `                                update note metadata, preserves body`,
    `  search <query> [--limit <n>]  full-text search over all notes`,
    `  settings                    show settings as JSON`,
    `  settings get <key>          print one setting`,
    `  settings set <key> <value>  set a setting (string/boolean/number)`,
    `  git commit [--message <m>]    commit changes (default message 'autosave')`,
    `  git remote [--url <u>]        show or set git remote origin`,
    `  git status                    show git repository status`,
    `  git sync [--user <u>] [--password <p>]`,
    `  git conflicts                list files with unresolved conflicts`,
    `  git resolve <file> (--local|--remote) [--user <u>] [--password <p>]`,
    `  git history [--rel <rel>] [--limit <n>]`,
    `  git show <rel> <hash>`,
    `  git restore <rel> <hash>`,
    `  git-users list`,
    `  git-users add <login> [--password <p>]`,
    `  git-users remove <login>`,
    `  git-users set-password <login> [--password <p>]`,
    `  git-users rename <old> <new>`,
  ].join('\n')
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    process.stdin.on('data', (c) => chunks.push(c as Buffer))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
  })
}

function fail(msg: string): never {
  throw new Error(msg)
}

const SETTINGS_KEYS: Record<string, { type: 'string' | 'boolean' | 'number' }> = {
  palette: { type: 'string' },
  lang: { type: 'string' },
  font: { type: 'string' },
  notesPath: { type: 'string' },
  syncRemote: { type: 'string' },
  syncUser: { type: 'string' },
  syncPass: { type: 'string' },
  isDark: { type: 'boolean' },
  showCountdown: { type: 'boolean' },
  showDone: { type: 'boolean' },
  autoSync: { type: 'boolean' },
  uiZoom: { type: 'number' },
  editorWidth: { type: 'number' },
}

function parseBool(v: string): boolean | null {
  const low = v.toLowerCase()
  if (low === 'true' || low === '1' || low === 'yes' || low === 'on') return true
  if (low === 'false' || low === '0' || low === 'no' || low === 'off') return false
  return null
}

export async function run(args: string[]): Promise<void> {
  const [cmd, ...rest] = args

  switch (cmd) {
    case 'path':
      console.log(VAULT)
      return

    case 'list': {
      const notes = await svc.listNotes(VAULT)
      if (notes.length === 0) fail(`vault not found: ${VAULT}`)
      for (const n of notes) console.log(`${n.relPath}\t${n.title}`)
      return
    }

    case 'folders': {
      if (!svc.vaultExists(VAULT)) fail(`vault not found: ${VAULT}`)
      const entries = await svc.readDirRecursive(VAULT)
      const folders = entries.filter((e) => e.endsWith('/')).map((e) => e.slice(0, -1)).sort()
      for (const f of folders) console.log(f)
      return
    }

    case 'read': {
      const rel = rest[0]
      if (!rel) fail('usage: read <rel>')
      process.stdout.write(await svc.readFile(VAULT, rel))
      return
    }

    case 'write': {
      const rel = rest[0]
      if (!rel) fail('usage: write <rel> [--content <text>]')
      let content: string | undefined
      for (let i = 1; i < rest.length; i++) {
        if (rest[i] === '--content' && rest[i + 1]) {
          content = rest[i + 1]
          i++
        }
      }
      if (content === undefined) content = await readStdin()
      await svc.writeRaw(VAULT, rel, content)
      return
    }

    case 'create': {
      const title = rest[0]
      if (!title) fail('usage: create <title> [options]')
      const draft: svc.NoteDraft = { title }
      for (let i = 1; i < rest.length; i++) {
        const key = rest[i]
        const value = rest[i + 1]
        if (key === '--text' && value) {
          draft.text = value
          i++
        } else if (key === '--folder' && value) {
          draft.folder = value
          i++
        } else if (key === '--due' && value) {
          draft.due = value
          i++
        } else if (key === '--color' && value) {
          draft.color = value
          i++
        } else if (key === '--priority' && value) {
          draft.priority = parseInt(value, 10) as svc.NoteDraft['priority']
          i++
        } else if (key === '--tags' && value) {
          draft.tags = value.split(',')
          i++
        }
      }
      const result = await svc.createNote(VAULT, draft)
      console.log(result.relPath)
      return
    }

    case 'delete': {
      const rel = rest[0]
      if (!rel) fail('usage: delete <rel>')
      await svc.deleteFile(VAULT, rel)
      return
    }

    case 'mkdir': {
      const rel = rest[0]
      if (!rel) fail('usage: mkdir <rel>')
      await svc.mkdir(VAULT, rel)
      return
    }

    case 'rmdir': {
      const rel = rest[0]
      if (!rel) fail('usage: rmdir <rel>')
      await svc.rmdir(VAULT, rel)
      return
    }

    case 'mv': {
      const from = rest[0]
      const to = rest[1]
      if (!from || !to) fail('usage: mv <from> <to>')
      await svc.renameFile(VAULT, from, to)
      return
    }

    case 'git-users': {
      await gitUsers.ensureDefaultUser()
      const sub = rest[0]
      if (!sub) fail('usage: git-users <list|add|remove|set-password|rename>')
      if (sub === 'list') {
        const users = await gitUsers.listUsers()
        console.log(users.map((u) => u.login).join(', '))
        return
      }
      if (sub === 'add') {
        const login = rest[1]
        if (!login) fail('usage: git-users add <login> [--password <p>]')
        let password: string | undefined
        for (let i = 2; i < rest.length; i++) {
          if (rest[i] === '--password' && rest[i + 1]) {
            password = rest[i + 1]
            i++
          } else if (password === undefined) {
            password = rest[i]
          }
        }
        if (password === undefined || password === '') password = (await readStdin()).replace(/\s+$/, '')
        const res = await gitUsers.addUser(login, password)
        if (!res.ok) fail(res.error || 'failed')
        console.log(`added user ${login}`)
        return
      }
      if (sub === 'remove') {
        const login = rest[1]
        if (!login) fail('usage: git-users remove <login>')
        const res = await gitUsers.removeUser(login)
        if (!res.ok) fail(res.error || 'failed')
        console.log(`removed user ${login}`)
        return
      }
      if (sub === 'set-password') {
        const login = rest[1]
        if (!login) fail('usage: git-users set-password <login> [--password <p>]')
        let password: string | undefined
        for (let i = 2; i < rest.length; i++) {
          if (rest[i] === '--password' && rest[i + 1]) {
            password = rest[i + 1]
            i++
          } else if (password === undefined) {
            password = rest[i]
          }
        }
        if (password === undefined || password === '') password = (await readStdin()).replace(/\s+$/, '')
        const res = await gitUsers.setPassword(login, password)
        if (!res.ok) fail(res.error || 'failed')
        console.log(`password updated for ${login}`)
        return
      }
      if (sub === 'rename') {
        const oldLogin = rest[1]
        const newLogin = rest[2]
        if (!oldLogin || !newLogin) fail('usage: git-users rename <old> <new>')
        const res = await gitUsers.renameUser(oldLogin, newLogin)
        if (!res.ok) fail(res.error || 'failed')
        console.log(`renamed ${oldLogin} to ${newLogin}`)
        return
      }
      fail('unknown git-users command')
    }

    case 'meta': {
      const rel = rest[0]
      if (!rel) fail('usage: meta <rel> [--title <t>] [--due <d>] [--color <c>] [--priority <0-4>] [--tags <a,b>] [--done] [--undone]')
      const raw = await svc.readFile(VAULT, rel)
      const parsed = parseNote(raw)
      const existingMeta = parsed.meta
      const content = parsed.content
      const draft: svc.NoteDraft = {
        title: existingMeta.title,
        due: existingMeta.due,
        color: existingMeta.color,
        priority: existingMeta.priority,
        tags: existingMeta.tags,
        done: existingMeta.done,
      }
      let hasFlags = false
      let done: boolean | undefined
      let undone: boolean | undefined
      for (let i = 1; i < rest.length; i++) {
        const key = rest[i]
        const value = rest[i + 1]
        if (key === '--title' && value) {
          draft.title = value
          hasFlags = true
          i++
        } else if (key === '--due' && value) {
          draft.due = value
          hasFlags = true
          i++
        } else if (key === '--color' && value) {
          draft.color = value
          hasFlags = true
          i++
        } else if (key === '--priority' && value) {
          draft.priority = parseInt(value, 10) as svc.NoteDraft['priority']
          hasFlags = true
          i++
        } else if (key === '--tags' && value) {
          draft.tags = value.split(',')
          hasFlags = true
          i++
        } else if (key === '--done') {
          done = true
          hasFlags = true
        } else if (key === '--undone') {
          undone = true
          hasFlags = true
        }
      }
      if (!hasFlags) fail('usage: meta <rel> [--title <t>] [--due <d>] [--color <c>] [--priority <0-4>] [--tags <a,b>] [--done] [--undone]')
      if (done && undone) fail('--done and --undone cannot be used together')
      if (done !== undefined) draft.done = done
      if (undone !== undefined) draft.done = false
      draft.text = content
      const result = await svc.updateNote(VAULT, rel, draft)
      console.log(result.relPath)
      return
    }

    case 'search': {
      const query = rest[0]
      if (!query) fail('usage: search <query> [--limit <n>]')
      let limit = 20
      for (let i = 1; i < rest.length; i++) {
        if (rest[i] === '--limit' && rest[i + 1]) {
          limit = Number(rest[i + 1])
          i++
        }
      }
      const results = await svc.searchNotes(VAULT, query, limit)
      for (const r of results) console.log(`${r.relPath}\t${r.title}\t${r.snippet}`)
      return
    }

    case 'git': {
      const sub = rest[0]
      if (!sub) fail('usage: git <remote|status|commit|sync|conflicts|resolve|history|show|restore>')
      await svc.gitEnsure(VAULT, '')
      if (sub === 'remote') {
        let url: string | undefined
        for (let i = 1; i < rest.length; i++) {
          if (rest[i] === '--url' && rest[i + 1]) {
            url = rest[i + 1]
            i++
          }
        }
        if (url) {
          await svc.gitEnsure(VAULT, url)
          console.log(`remote: ${url}`)
        } else {
          const existing = await svc.gitRemote(VAULT)
          if (!existing) fail('no remote configured')
          console.log(existing)
        }
        return
      }
      if (sub === 'status') {
        const summary = await svc.gitStatusSummary(VAULT)
        if (summary.remote) console.log(`remote: ${summary.remote}`)
        else console.log('remote: none')
        console.log(`branch: ${summary.branch}`)
        if (summary.lastCommit) {
          console.log(`last commit: ${summary.lastCommit.shortHash} ${summary.lastCommit.message} (${summary.lastCommit.date})`)
        } else {
          console.log('last commit: (none)')
        }
        console.log(`uncommitted: ${summary.uncommitted}`)
        return
      }
      if (sub === 'commit') {
        let message = 'autosave'
        for (let i = 1; i < rest.length; i++) {
          if (rest[i] === '--message' && rest[i + 1]) {
            message = rest[i + 1]
            i++
          }
        }
        const ok = await svc.gitCommit(VAULT, message)
        console.log(ok ? 'committed' : 'nothing to commit')
        return
      }
      if (sub === 'sync') {
        let user: string | undefined
        let password: string | undefined
        for (let i = 1; i < rest.length; i++) {
          if (rest[i] === '--user' && rest[i + 1]) {
            user = rest[i + 1]
            i++
          } else if (rest[i] === '--password' && rest[i + 1]) {
            password = rest[i + 1]
            i++
          }
        }
        const result = await svc.gitSync(VAULT, user || password ? { username: user, password } : undefined)
        console.log(JSON.stringify(result))
        return
      }
      if (sub === 'conflicts') {
        const files = await svc.gitListConflicts(VAULT)
        for (const f of files) console.log(f)
        return
      }
      if (sub === 'resolve') {
        const file = rest[1]
        if (!file) fail('usage: git resolve <file> (--local|--remote) [--user <u>] [--password <p>]')
        let source: 'local' | 'remote' | undefined
        let user: string | undefined
        let password: string | undefined
        for (let i = 2; i < rest.length; i++) {
          if (rest[i] === '--local') {
            source = 'local'
          } else if (rest[i] === '--remote') {
            source = 'remote'
          } else if (rest[i] === '--user' && rest[i + 1]) {
            user = rest[i + 1]
            i++
          } else if (rest[i] === '--password' && rest[i + 1]) {
            password = rest[i + 1]
            i++
          }
        }
        if (!source) fail('usage: git resolve <file> (--local|--remote) [--user <u>] [--password <p>]')
        const result = await svc.gitResolveConflicts(
          VAULT,
          [{ file, source }],
          user || password ? { username: user, password } : undefined
        )
        if (result.status === 'synced') console.log('resolved')
        else console.log(JSON.stringify(result))
        return
      }
      if (sub === 'history') {
        let rel = ''
        let limit = 50
        for (let i = 1; i < rest.length; i++) {
          if (rest[i] === '--rel' && rest[i + 1]) {
            rel = rest[i + 1]
            i++
          } else if (rest[i] === '--limit' && rest[i + 1]) {
            limit = Number(rest[i + 1])
            i++
          }
        }
        const items = await svc.gitHistory(VAULT, rel, limit)
        console.log(JSON.stringify(items, null, 2))
        return
      }
      if (sub === 'show') {
        const rel = rest[1]
        const hash = rest[2]
        if (!rel || !hash) fail('usage: git show <rel> <hash>')
        const content = await svc.gitShow(VAULT, rel, hash)
        if (content === null) fail('not found')
        process.stdout.write(content)
        return
      }
      if (sub === 'restore') {
        const rel = rest[1]
        const hash = rest[2]
        if (!rel || !hash) fail('usage: git restore <rel> <hash>')
        const content = await svc.gitRestore(VAULT, rel, hash)
        if (content === null) fail('not found')
        process.stdout.write(content)
        return
      }
      fail('unknown git command')
    }

    case 'settings': {
      const sub = rest[0]
      if (!sub) {
        const s = await svc.loadSettings(VAULT)
        if (!svc.settingsExist(VAULT)) {
          process.stderr.write('note: no settings file yet — run "settings set <key> <value>" to create it\n')
        }
        console.log(JSON.stringify(s, null, 2))
        return
      }

      if (sub === 'get') {
        const key = rest[1]
        if (!key) fail('usage: settings get <key>')
        if (!SETTINGS_KEYS[key]) fail(`unknown settings key: ${key}`)
        const s = await svc.loadSettings(VAULT)
        const value = s[key as keyof svc.Settings]
        console.log(value === null ? 'null' : String(value))
        return
      }

      if (sub === 'set') {
        const key = rest[1]
        const value = rest[2]
        if (!key) fail('usage: settings set <key> <value>')
        if (!SETTINGS_KEYS[key]) fail(`unknown settings key: ${key}`)
        if (value === undefined) fail(`usage: settings set ${key} <value>`)
        const meta = SETTINGS_KEYS[key]
        let parsedValue: string | boolean | number
        if (meta.type === 'boolean') {
          const b = parseBool(value)
          if (b === null) fail(`expected true or false for ${key}`)
          parsedValue = b
        } else if (meta.type === 'number') {
          parsedValue = Number(value)
          if (Number.isNaN(parsedValue)) fail(`expected a number for ${key}`)
        } else {
          parsedValue = value
        }
        let user: string | undefined
        let password: string | undefined
        for (let i = 3; i < rest.length; i++) {
          if (rest[i] === '--user' && rest[i + 1]) {
            user = rest[i + 1]
            i++
          } else if (rest[i] === '--password' && rest[i + 1]) {
            password = rest[i + 1]
            i++
          }
        }
        const patch: Partial<svc.Settings> = { [key]: parsedValue as never }
        if (user) patch.syncUser = user
        if (password) patch.syncPass = password
        const result = await svc.saveSettings(VAULT, patch)
        const finalValue = result[key as keyof svc.Settings]
        console.log(`settings: ${key} = ${finalValue === null ? 'null' : String(finalValue)}`)
        return
      }

      fail('usage: settings <get <key>|set <key> <value>>')
    }

    default:
      console.log(usage())
      fail(`unknown command: ${cmd || '(none)'}`)
  }
}

export async function main(argv: string[]): Promise<void> {
  const isGitUsers = argv[0] === 'git-users'
  if (!VAULT && !isGitUsers) {
    process.stderr.write(
      'JAZZ_VAULT is not set. Point it at your notes folder, e.g. JAZZ_VAULT=/home/user/Documents/jazz-notes-vault node dist/cli.js list\n'
    )
    process.exit(1)
  }
  try {
    await run(argv)
  } catch (e) {
    process.stderr.write((e instanceof Error ? e.message : String(e)) + '\n')
    process.exitCode = 1
  }
}

if (require.main === module) {
  main(process.argv.slice(2))
}
