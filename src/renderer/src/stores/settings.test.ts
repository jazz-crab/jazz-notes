import { describe, it, expect } from 'vitest'
import { clampUiZoom, UI_ZOOM_MIN, UI_ZOOM_MAX } from './settings'

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
