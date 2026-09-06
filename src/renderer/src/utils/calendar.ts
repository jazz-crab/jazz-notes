import type { Note } from '../stores/notes'

export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function dayKey(d: Date): string {
  const x = startOfDay(d)
  const mm = String(x.getMonth() + 1).padStart(2, '0')
  const dd = String(x.getDate()).padStart(2, '0')
  return `${x.getFullYear()}-${mm}-${dd}`
}

export function localDateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function dayKeyOffset(offset: number, now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + offset)
  return dayKey(d)
}

export interface CalendarColumn {
  key: string
  offset: number
  notes: Note[]
}

export interface CalendarData {
  columns: CalendarColumn[]
  overdue: Note[]
  noDate: Note[]
}

export interface OverdueMigration {
  relPath: string
  newDue: string
  movedFrom: string
}

export function overdueMigrations(
  notes: Note[],
  now: Date = new Date()
): OverdueMigration[] {
  const today = startOfDay(now).getTime()
  const migrations: OverdueMigration[] = []
  for (const n of notes) {
    if (n.meta.done || !n.meta.due) continue
    const due = new Date(n.meta.due)
    if (Number.isNaN(due.getTime())) continue
    if (startOfDay(due).getTime() >= today) continue
    migrations.push({
      relPath: n.relPath,
      newDue: dayKeyOffset(0, now),
      movedFrom: dayKey(due),
    })
  }
  return migrations
}

export interface CalendarOptions {
  visibleOffsets: number[]
  showDone: boolean
  now?: Date
}

export function partitionByDay(
  notes: Note[],
  { visibleOffsets, showDone, now = new Date() }: CalendarOptions
): CalendarData {
  const today = startOfDay(now).getTime()
  const DAY = 86400000
  const offsets = [...visibleOffsets].sort((a, b) => a - b)
  const byOffset = new Map<number, Note[]>()
  const columns: CalendarColumn[] = offsets.map((offset) => {
    const arr: Note[] = []
    byOffset.set(offset, arr)
    return { key: dayKeyOffset(offset, now), offset, notes: arr }
  })
  const overdue: Note[] = []
  const noDate: Note[] = []

  for (const n of notes) {
    if (n.meta.done && !showDone) continue
    const due = n.meta.due ? new Date(n.meta.due) : null
    if (!due || Number.isNaN(due.getTime())) {
      noDate.push(n)
      continue
    }
    const t = startOfDay(due).getTime()
    if (t < today) {
      overdue.push(n)
      continue
    }
    const offset = Math.round((t - today) / DAY)
    const target = byOffset.get(offset)
    if (target) target.push(n)
  }

  if (offsets.includes(0)) {
    const todayCol = byOffset.get(0)!
    todayCol.push(...overdue)
    overdue.length = 0
  }

  return { columns, overdue, noDate }
}
