import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  DEFAULT_SETTINGS,
  DEFAULT_SYNC_REMOTE,
  UI_ZOOM_MIN,
  UI_ZOOM_MAX,
  EDITOR_WIDTH_MIN,
  EDITOR_WIDTH_MAX,
  clampUiZoom,
  clampEditorWidth,
  normalizeSettings,
  settingsFilePath,
  loadSettings,
  saveSettings,
  JAZZ_DIR_NAME,
} from './settings'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'jazz-settings-test-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('normalizeSettings', () => {
  it('returns defaults for an empty object', () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('clamps uiZoom', () => {
    expect(normalizeSettings({ uiZoom: 0.5 }).uiZoom).toBe(UI_ZOOM_MIN)
    expect(normalizeSettings({ uiZoom: 5 }).uiZoom).toBe(UI_ZOOM_MAX)
    expect(normalizeSettings({ uiZoom: NaN }).uiZoom).toBe(1)
    expect(normalizeSettings({ uiZoom: Infinity }).uiZoom).toBe(1)
  })

  it('clamps editorWidth, keeping null as null', () => {
    expect(normalizeSettings({ editorWidth: 100 }).editorWidth).toBe(EDITOR_WIDTH_MIN)
    expect(normalizeSettings({ editorWidth: 9999 }).editorWidth).toBe(EDITOR_WIDTH_MAX)
    expect(normalizeSettings({ editorWidth: null }).editorWidth).toBeNull()
    expect(normalizeSettings({ editorWidth: NaN }).editorWidth).toBe(EDITOR_WIDTH_MAX)
  })

  it('clears the legacy syncRemote value', () => {
    expect(normalizeSettings({ syncRemote: 'rentgen:git/jazz-notes.git' }).syncRemote).toBe(DEFAULT_SYNC_REMOTE)
  })

  it('falls back to defaults for wrong types', () => {
    const s = normalizeSettings({
      palette: 42,
      lang: '',
      font: null as unknown as string,
      isDark: 1 as unknown as boolean,
      showCountdown: 'yes' as unknown as boolean,
      showDone: 0 as unknown as boolean,
      autoSync: 'no' as unknown as boolean,
      syncRemote: 7 as unknown as string,
      syncUser: null as unknown as string,
      syncPass: undefined as unknown as string,
      notesPath: 3.14 as unknown as string,
      uiZoom: 'x' as unknown as number,
    })
    expect(s.palette).toBe(DEFAULT_SETTINGS.palette)
    expect(s.lang).toBe(DEFAULT_SETTINGS.lang)
    expect(s.font).toBe(DEFAULT_SETTINGS.font)
    expect(s.isDark).toBe(true)
    expect(s.showCountdown).toBe(true)
    expect(s.showDone).toBe(false)
    expect(s.autoSync).toBe(true)
    expect(s.syncRemote).toBe(DEFAULT_SYNC_REMOTE)
    expect(s.syncUser).toBe('')
    expect(s.syncPass).toBe('')
    expect(s.notesPath).toBe('')
    expect(s.uiZoom).toBe(1)
  })

  it('coerces present boolean fields with !!', () => {
    expect(normalizeSettings({ isDark: false as unknown as boolean }).isDark).toBe(false)
    expect(normalizeSettings({ showDone: 'anything' as unknown as boolean }).showDone).toBe(true)
  })

  it('keeps valid values', () => {
    const s = normalizeSettings({
      palette: 'everforest',
      lang: 'en',
      font: 'serif',
      uiZoom: 1.3,
      editorWidth: 800,
      notesPath: '/x',
      syncRemote: 'https://example.com/repo.git',
      syncUser: 'u',
      syncPass: 'p',
      autoSync: false,
    })
    expect(s.palette).toBe('everforest')
    expect(s.lang).toBe('en')
    expect(s.font).toBe('serif')
    expect(s.uiZoom).toBe(1.3)
    expect(s.editorWidth).toBe(800)
    expect(s.notesPath).toBe('/x')
    expect(s.syncRemote).toBe('https://example.com/repo.git')
    expect(s.syncUser).toBe('u')
    expect(s.syncPass).toBe('p')
    expect(s.autoSync).toBe(false)
  })
})

describe('clampUiZoom', () => {
  it('clamps and falls back for non-finite input', () => {
    expect(clampUiZoom(UI_ZOOM_MIN)).toBe(0.75)
    expect(clampUiZoom(UI_ZOOM_MAX)).toBe(2)
    expect(clampUiZoom(0.5)).toBe(UI_ZOOM_MIN)
    expect(clampUiZoom(5)).toBe(UI_ZOOM_MAX)
    expect(clampUiZoom(NaN)).toBe(1)
  })
})

describe('clampEditorWidth', () => {
  it('clamps and falls back for non-finite input', () => {
    expect(clampEditorWidth(100)).toBe(EDITOR_WIDTH_MIN)
    expect(clampEditorWidth(9999)).toBe(EDITOR_WIDTH_MAX)
    expect(clampEditorWidth(NaN)).toBe(EDITOR_WIDTH_MAX)
  })
})

describe('settings file round-trip', () => {
  it('load and save settings in a temp directory', async () => {
    expect(await loadSettings(dir)).toEqual(DEFAULT_SETTINGS)

    const saved = await saveSettings(dir, { palette: 'everforest', uiZoom: 0.5, syncPass: 'secret' })
    expect(saved.palette).toBe('everforest')
    expect(saved.uiZoom).toBe(UI_ZOOM_MIN)
    expect(saved.syncPass).toBe('secret')

    const loaded = await loadSettings(dir)
    expect(loaded).toEqual(saved)
    expect(loaded.syncPass).toBe('secret')

    const onDisk = JSON.parse(await readFile(settingsFilePath(dir), 'utf-8'))
    expect(onDisk.palette).toBe('everforest')
  })

  it('merge keeps unrelated fields when saving a patch', async () => {
    await saveSettings(dir, { syncUser: 'u' })
    const loaded = await loadSettings(dir)
    expect(loaded.syncUser).toBe('u')
    expect(loaded.syncRemote).toBe(DEFAULT_SYNC_REMOTE)
    expect(loaded.palette).toBe(DEFAULT_SETTINGS.palette)
  })

  it('returns defaults when the file is missing or broken', async () => {
    expect(await loadSettings(dir)).toEqual(DEFAULT_SETTINGS)

    await mkdir(join(dir, JAZZ_DIR_NAME), { recursive: true })
    await writeFile(settingsFilePath(dir), '{not json', 'utf-8')
    expect(await loadSettings(dir)).toEqual(DEFAULT_SETTINGS)

    const content = await readFile(settingsFilePath(dir), 'utf-8')
    expect(content).toBe('{not json')
  })
})