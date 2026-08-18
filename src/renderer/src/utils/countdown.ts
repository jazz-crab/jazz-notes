import { t, type Lang } from './i18n'
import type { Note } from '../stores/notes'

export interface UpcomingDue {
  note: Note
  due: number
}

export function nextUpcomingDue(notes: Note[], now: number): UpcomingDue | null {
  const upcoming = notes
    .map((n) => {
      const due = n.meta.due ? new Date(n.meta.due).getTime() : NaN
      return { note: n, due }
    })
    .filter((x) => Number.isFinite(x.due) && x.due > now)
    .sort((a, b) => a.due - b.due)
  return upcoming[0] ?? null
}

export function formatCountdown(ms: number, lang: Lang = 'ru'): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (days > 0) return `${days}${lang === 'ru' ? 'д' : 'd'} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  return `${pad(minutes)}:${pad(seconds)}`
}

export function formatSmartCountdown(ms: number, lang: Lang = 'ru'): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  if (total < 2 * 60) return t('timer.couple.minutes', lang)
  if (total < 5 * 60) return t('timer.minutes', lang).replace('{n}', '5')
  if (total < 10 * 60) return t('timer.minutes', lang).replace('{n}', '10')
  if (total < 15 * 60) return t('timer.minutes', lang).replace('{n}', '15')
  if (total < 30 * 60) return t('timer.minutes', lang).replace('{n}', '30')
  if (total < 60 * 60) return t('timer.hour', lang)
  if (total < 90 * 60) return t('timer.hour.half', lang)
  if (total < 120 * 60) return t('timer.hours', lang)
  return formatCountdown(ms, lang)
}
