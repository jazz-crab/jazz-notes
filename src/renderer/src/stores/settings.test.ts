import { describe, it, expect } from 'vitest'
import {
  clampUiZoom,
  clampEditorWidth,
  UI_ZOOM_MIN,
  UI_ZOOM_MAX,
  EDITOR_WIDTH_MIN,
  EDITOR_WIDTH_MAX,
} from './settings'

describe('clampUiZoom', () => {
  it('keeps values inside the allowed range', () => {
    expect(clampUiZoom(1)).toBe(1)
    expect(clampUiZoom(1.3)).toBe(1.3)
  })

  it('clamps below the minimum', () => {
    expect(clampUiZoom(0)).toBe(UI_ZOOM_MIN)
    expect(clampUiZoom(0.5)).toBe(UI_ZOOM_MIN)
  })

  it('clamps above the maximum', () => {
    expect(clampUiZoom(3)).toBe(UI_ZOOM_MAX)
  })

  it('falls back to default zoom for non-finite input', () => {
    expect(clampUiZoom(NaN)).toBe(1)
    expect(clampUiZoom(Infinity)).toBe(1)
  })
})

describe('clampEditorWidth', () => {
  it('keeps values inside the allowed range', () => {
    expect(clampEditorWidth(800)).toBe(800)
    expect(clampEditorWidth(320)).toBe(EDITOR_WIDTH_MIN)
    expect(clampEditorWidth(1800)).toBe(EDITOR_WIDTH_MAX)
  })

  it('clamps below the minimum', () => {
    expect(clampEditorWidth(100)).toBe(EDITOR_WIDTH_MIN)
    expect(clampEditorWidth(0)).toBe(EDITOR_WIDTH_MIN)
  })

  it('clamps above the maximum', () => {
    expect(clampEditorWidth(2000)).toBe(EDITOR_WIDTH_MAX)
    expect(clampEditorWidth(5000)).toBe(EDITOR_WIDTH_MAX)
  })

  it('falls back to the maximum width for non-finite input', () => {
    expect(clampEditorWidth(NaN)).toBe(EDITOR_WIDTH_MAX)
    expect(clampEditorWidth(Infinity)).toBe(EDITOR_WIDTH_MAX)
  })
})
