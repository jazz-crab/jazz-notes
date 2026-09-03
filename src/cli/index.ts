import * as svc from '../shared/service'
import * as gitUsers from '../../web/git-users'

const VAULT = process.env.JAZZ_VAULT || ''

function usage(): string {
  return [
    `Usage: node dist/cli.js <command> [options]`,
    ``,
    `Commands:`,
    `  path                          print vault path`,
    `  list                          list notes as relPath<TAB>title`,
    `  read <rel>                    print raw note content`,
    `  write <rel> [--content <t>]   write raw content (stdin if no --content)`,
    `  create <title> [--text <t>] [--folder <f>] [--due <d>] [--color <c>] [--priority <0-4>] [--tags <a,b>]`,
    `  delete <rel>                  delete a file`,
    `  mkdir <rel>                   create a directory`,
    `  rmdir <rel>                   remove a directory recursively`,
    `  mv <from> <to>                rename/move within the vault`,
    `  git commit [--message <m>]    commit changes (default message 'autosave')`,
    `  git sync [--user <u>] [--password <p>]`,
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

    case 'git': {
      const sub = rest[0]
      if (!sub) fail('usage: git <commit|sync|history|show|restore>')
      await svc.gitEnsure(VAULT, '')
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
