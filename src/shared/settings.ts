import { existsSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export type Settings = {
  palette: string
  isDark: boolean
  lang: string
  font: string
  uiZoom: number
  editorWidth: number | null
  notesPath: string
  showCountdown: boolean
  showDone: boolean
  syncRemote: string
  syncUser: string
  syncPass: string
  autoSync: boolean
}

export const DEFAULT_SYNC_REMOTE = ''

export const UI_ZOOM_MIN = 0.75
export const UI_ZOOM_MAX = 2
export const UI_ZOOM_STEP = 0.1

export const EDITOR_WIDTH_MIN = 320
export const EDITOR_WIDTH_MAX = 1800

export const SETTINGS_FILE_NAME = 'settings.json'
export const JAZZ_DIR_NAME = '.jazz'

export const DEFAULT_SETTINGS: Settings = {
  palette: 'tokyonight',
  isDark: true,
  lang: 'ru',
  font: 'neon',
  uiZoom: 1,
  editorWidth: null,
  notesPath: '',
  showCountdown: true,
  showDone: false,
  syncRemote: DEFAULT_SYNC_REMOTE,
  syncUser: '',
  syncPass: '',
  autoSync: true,
}

const LEGACY_SYNC_REMOTE = 'rentgen:git/jazz-notes.git'

export function clampUiZoom(v: number): number {
  if (!Number.isFinite(v)) return 1
  return Math.min(UI_ZOOM_MAX, Math.max(UI_ZOOM_MIN, v))
}

export function clampEditorWidth(v: number): number {
  if (!Number.isFinite(v)) return EDITOR_WIDTH_MAX
  return Math.min(EDITOR_WIDTH_MAX, Math.max(EDITOR_WIDTH_MIN, v))
}

function boolOr(v: unknown, fallback: boolean): boolean {
  return v === undefined ? fallback : !!v
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback
}

function anyStringOr(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}

export function normalizeSettings(raw: Partial<Settings>): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS, ...raw }

  s.uiZoom = clampUiZoom(s.uiZoom)
  s.editorWidth = s.editorWidth == null ? null : clampEditorWidth(s.editorWidth)

  s.palette = stringOr(s.palette, DEFAULT_SETTINGS.palette)
  s.lang = stringOr(s.lang, DEFAULT_SETTINGS.lang)
  s.font = stringOr(s.font, DEFAULT_SETTINGS.font)

  s.isDark = boolOr(raw.isDark, DEFAULT_SETTINGS.isDark)
  s.showCountdown = boolOr(raw.showCountdown, DEFAULT_SETTINGS.showCountdown)
  s.showDone = boolOr(raw.showDone, DEFAULT_SETTINGS.showDone)
  s.autoSync = boolOr(raw.autoSync, DEFAULT_SETTINGS.autoSync)

  s.syncRemote = anyStringOr(s.syncRemote, DEFAULT_SETTINGS.syncRemote)
  s.syncUser = anyStringOr(s.syncUser, DEFAULT_SETTINGS.syncUser)
  s.syncPass = anyStringOr(s.syncPass, DEFAULT_SETTINGS.syncPass)
  s.notesPath = anyStringOr(s.notesPath, DEFAULT_SETTINGS.notesPath)

  if (s.syncRemote === LEGACY_SYNC_REMOTE) {
    s.syncRemote = DEFAULT_SYNC_REMOTE
  }

  return s
}

export function settingsFilePath(vault: string): string {
  return join(vault, JAZZ_DIR_NAME, SETTINGS_FILE_NAME)
}

export async function loadSettings(vault: string): Promise<Settings> {
  try {
    const raw = JSON.parse(await readFile(settingsFilePath(vault), 'utf-8')) as Partial<Settings>
    return normalizeSettings(raw)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(vault: string, patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings(vault)
  const next = normalizeSettings({ ...current, ...patch })
  const file = settingsFilePath(vault)
  await mkdir(join(vault, JAZZ_DIR_NAME), { recursive: true })
  await writeFile(file, JSON.stringify(next, null, 2), 'utf-8')
  return next
}

export function settingsExist(vault: string): boolean {
  return existsSync(settingsFilePath(vault))
}
