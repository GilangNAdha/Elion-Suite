import { describe, expect, it } from 'vitest'
import { petBounds, petPopover, pointToPosition, positionToPoint } from '../src/lib/companionPosition'

describe('floating pet geometry', () => {
  it.each([
    { width: 375, height: 812 },
    { width: 1440, height: 900 },
    { width: 375, height: 320 }
  ])('keeps pet and popovers on screen at $width x $height', (viewport) => {
    const size = viewport.width < 600 ? 88 : 112
    const bounds = petBounds(viewport, size)
    for (const position of [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0.4, y: 0.5 }
    ]) {
      const point = positionToPoint(position, bounds)
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.x + size).toBeLessThanOrEqual(viewport.width)
      for (const chat of [true, false]) {
        const popup = petPopover(viewport, point, size, chat)
        expect(popup.x).toBeGreaterThanOrEqual(0)
        expect(popup.y).toBeGreaterThanOrEqual(0)
        expect(popup.x + popup.width).toBeLessThanOrEqual(viewport.width)
        expect(popup.y + popup.height).toBeLessThanOrEqual(viewport.height)
      }
    }
  })
  it('roundtrips a saved normalized position without accumulating offsets', () => {
    const bounds = petBounds({ width: 1440, height: 900 }, 112)
    const position = { x: 0.72, y: 0.49 }
    const restored = pointToPosition(positionToPoint(position, bounds), bounds)
    expect(restored.x).toBeCloseTo(position.x)
    expect(restored.y).toBeCloseTo(position.y)
  })
  it('clamps dragged coordinates and corrupt saved preferences', () => {
    const bounds = petBounds({ width: 768, height: 900 }, 112)
    expect(pointToPosition({ x: -10000, y: 10000 }, bounds)).toEqual({ x: 0, y: 1 })
    const point = positionToPoint({ x: NaN, y: Infinity }, bounds)
    expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
  })
})
