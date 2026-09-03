import { describe, it, expect } from 'vitest'
import { formatCountdown, formatSmartCountdown, nextUpcomingDue } from './countdown'
import type { Note } from '../stores/notes'

const now = Date.now()

function note(due: string | undefined, title: string): Note {
  return {
    relPath: `${title}.md`,
    title,
    meta: { title, due },
    content: '',
    body: '',
  }
}

function noteIn(ms: number, title: string): Note {
  return note(new Date(now + ms).toISOString(), title)
}

describe('nextUpcomingDue', () => {
  it('returns the nearest future due date', () => {
    const notes = [noteIn(2 * 3600_000, 'later'), noteIn(30 * 60_000, 'soon'), noteIn(13 * 3600_000, 'evening')]
    const result = nextUpcomingDue(notes, now)
    expect(result?.note.title).toBe('soon')
  })

  it('ignores overdue notes and notes without a due date', () => {
    const notes = [noteIn(-3600_000, 'overdue'), note(undefined, 'no date'), noteIn(3600_000, 'next')]
    const result = nextUpcomingDue(notes, now)
    expect(result?.note.title).toBe('next')
  })

  it('ignores invalid due dates', () => {
    const notes = [note('not-a-date', 'broken'), noteIn(3600_000, 'ok')]
    const result = nextUpcomingDue(notes, now)
    expect(result?.note.title).toBe('ok')
  })

  it('returns null when nothing is upcoming', () => {
    expect(nextUpcomingDue([noteIn(-3600_000, 'overdue'), note(undefined, 'none')], now)).toBeNull()
    expect(nextUpcomingDue([], now)).toBeNull()
  })
})

describe('formatCountdown', () => {
  it('formats under an hour as mm:ss', () => {
    expect(formatCountdown(90_000)).toBe('01:30')
    expect(formatCountdown(0)).toBe('00:00')
  })

  it('formats hours as hh:mm:ss', () => {
    expect(formatCountdown(3_659_000)).toBe('01:00:59')
  })

  it('prefixes days with a localized day unit', () => {
    expect(formatCountdown(90_600_000, 'ru')).toBe('1д 01:10:00')
    expect(formatCountdown(90_600_000, 'en')).toBe('1d 01:10:00')
  })

  it('clamps negative input to zero', () => {
    expect(formatCountdown(-5_000)).toBe('00:00')
  })
})

describe('formatSmartCountdown', () => {
  it('localizes hours in russian', () => {
    expect(formatSmartCountdown(2 * 3600_000, 'ru')).toBe('2 часа')
    expect(formatSmartCountdown(5 * 3600_000, 'ru')).toBe('5 часов')
    expect(formatSmartCountdown(23 * 3600_000, 'ru')).toBe('23 часа')
    expect(formatSmartCountdown(23 * 3600_000 + 59 * 60_000 + 59_000, 'ru')).toBe('23 часа')
  })

  it('localizes hours in english', () => {
    expect(formatSmartCountdown(2 * 3600_000, 'en')).toBe('2 hours')
    expect(formatSmartCountdown(23 * 3600_000, 'en')).toBe('23 hours')
  })

  it('localizes days in russian', () => {
    expect(formatSmartCountdown(24 * 3600_000, 'ru')).toBe('1 день')
    expect(formatSmartCountdown(2 * 24 * 3600_000, 'ru')).toBe('2 дня')
    expect(formatSmartCountdown(5 * 24 * 3600_000, 'ru')).toBe('5 дней')
    expect(formatSmartCountdown(42 * 24 * 3600_000, 'ru')).toBe('42 дня')
    expect(formatSmartCountdown(42 * 24 * 3600_000 + 18 * 3600_000, 'ru')).toBe('42 дня')
  })

  it('localizes days in english', () => {
    expect(formatSmartCountdown(24 * 3600_000, 'en')).toBe('1 day')
    expect(formatSmartCountdown(5 * 24 * 3600_000, 'en')).toBe('5 days')
    expect(formatSmartCountdown(42 * 24 * 3600_000, 'en')).toBe('42 days')
  })

  it('never falls back to raw countdown for long periods', () => {
    expect(formatSmartCountdown(42 * 24 * 3600_000 + 18 * 3600_000 + 59 * 60_000 + 37_000, 'ru')).not.toBe(
      '42д 18:59:37'
    )
  })

  it('keeps short ranges smart', () => {
    expect(formatSmartCountdown(60_000, 'ru')).toBe('Пара минут')
    expect(formatSmartCountdown(240_000, 'ru')).toBe('5 минут')
    expect(formatSmartCountdown(7_199_000, 'ru')).toBe('2 часа')
  })
})
