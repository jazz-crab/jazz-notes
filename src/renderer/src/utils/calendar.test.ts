import { describe, it, expect } from 'vitest'
import { partitionByDay, overdueMigrations, dayKeyOffset, startOfDay } from './calendar'
import type { Note } from '../stores/notes'

const NOW = new Date(2026, 8, 6, 12, 0, 0) // 2026-09-06

function mk(relPath: string, due?: string, done?: boolean): Note {
  return { relPath, title: relPath, meta: { title: relPath, due, done }, content: '', body: '' }
}

describe('partitionByDay', () => {
  const todayStart = startOfDay(NOW).getTime()

  it('groups notes into today/tomorrow/day-after-tomorrow by default', () => {
    const notes = [
      mk('a.md', '2026-09-06T10:00'),
      mk('b.md', '2026-09-07T09:00'),
      mk('c.md', '2026-09-08T08:00'),
    ]
    const data = partitionByDay(notes, { visibleOffsets: [0, 1, 2], showDone: true, now: NOW })
    expect(data.columns.map((c) => c.offset)).toEqual([0, 1, 2])
    expect(data.columns[0].notes.map((n) => n.relPath)).toEqual(['a.md'])
    expect(data.columns[1].notes.map((n) => n.relPath)).toEqual(['b.md'])
    expect(data.columns[2].notes.map((n) => n.relPath)).toEqual(['c.md'])
    expect(data.overdue).toEqual([])
    expect(data.noDate).toEqual([])
  })

  it('folds overdue notes into the today column at the end', () => {
    const overdue = mk('old1.md', '2026-09-01T10:00')
    const today = mk('today.md', '2026-09-06T10:00')
    const data = partitionByDay([today, overdue], { visibleOffsets: [0, 1, 2], showDone: true, now: NOW })
    const todayNotes = data.columns[0].notes
    expect(todayNotes.map((n) => n.relPath)).toEqual(['today.md', 'old1.md'])
    expect(data.overdue).toEqual([])
  })

  it('keeps overdue in a separate bucket when today is not visible', () => {
    const overdue = mk('old.md', '2026-09-01T10:00')
    const data = partitionByDay([overdue], { visibleOffsets: [-1, 1, 2], showDone: true, now: NOW })
    expect(data.overdue.map((n) => n.relPath)).toEqual(['old.md'])
    expect(data.columns.every((c) => c.notes.length === 0)).toBe(true)
  })

  it('puts notes without a due date into noDate', () => {
    const data = partitionByDay([mk('nodate.md')], { visibleOffsets: [0, 1, 2], showDone: true, now: NOW })
    expect(data.noDate.map((n) => n.relPath)).toEqual(['nodate.md'])
  })

  it('excludes done notes when showDone is false', () => {
    const done = mk('done.md', '2026-09-06T10:00', true)
    const data = partitionByDay([done], { visibleOffsets: [0, 1, 2], showDone: false, now: NOW })
    expect(data.columns[0].notes).toEqual([])
  })

  it('keeps only notes matching visible offsets; others are dropped', () => {
    const beyond = mk('far.md', '2026-09-30T10:00')
    const data = partitionByDay([beyond], { visibleOffsets: [0, 1, 2], showDone: true, now: NOW })
    expect(data.columns.flatMap((c) => c.notes)).toEqual([])
  })

  it('sorts columns by offset regardless of input order', () => {
    const data = partitionByDay([], { visibleOffsets: [2, 0, 1], showDone: true, now: NOW })
    expect(data.columns.map((c) => c.offset)).toEqual([0, 1, 2])
  })
})

describe('dayKeyOffset', () => {
  it('produces a zero-padded local date key', () => {
    expect(dayKeyOffset(0, NOW)).toBe('2026-09-06')
    expect(dayKeyOffset(1, NOW)).toBe('2026-09-07')
    expect(dayKeyOffset(-1, NOW)).toBe('2026-09-05')
  })
})

describe('overdueMigrations', () => {
  it('returns today as new due + old date as movedFrom for overdue notes', () => {
    const old = mk('old.md', '2026-09-01T10:00')
    const res = overdueMigrations([old], NOW)
    expect(res).toEqual([{ relPath: 'old.md', newDue: '2026-09-06', movedFrom: '2026-09-01' }])
  })

  it('keeps same-day notes unchanged', () => {
    const today = mk('today.md', '2026-09-06T10:00')
    expect(overdueMigrations([today], NOW)).toEqual([])
  })

  it('skips done notes even if overdue', () => {
    const done = mk('done.md', '2026-09-01T10:00', true)
    expect(overdueMigrations([done], NOW)).toEqual([])
  })

  it('skips notes without a due date', () => {
    expect(overdueMigrations([mk('nodate.md')], NOW)).toEqual([])
  })
})
