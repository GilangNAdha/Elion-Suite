import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClassicPet } from '../src/components/pet/Pet'
import { duelPose } from '../src/components/pet/PixelSprite'
import { useThemeStore } from '../src/stores/themeStore'
import { usePetStore } from '../src/stores/petStore'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  useThemeStore.getState().setReducedMotion(false)
})
describe('genuine frame-based 2D companion', () => {
  it('changes the source sprite frame while idle', () => {
    vi.useFakeTimers()
    const { container } = render(<ClassicPet mood="idle" />)
    const before = container.querySelector('image')!.getAttribute('x')
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(container.querySelector('image')!.getAttribute('x')).not.toBe(before)
  })
  it('has a deterministic static fallback only when motion is reduced', () => {
    vi.useFakeTimers()
    useThemeStore.getState().setReducedMotion(true)
    const { container } = render(<ClassicPet mood="happy" />)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(container.querySelector('[data-frame]')).toHaveAttribute('data-frame', '0')
    expect(container.querySelector('[data-animated]')).toHaveAttribute('data-animated', 'false')
  })
  it('cheering updates the shared mood immediately', () => {
    usePetStore.setState({ mood: 'idle', happyUntil: 0 })
    usePetStore.getState().bumpHappy()
    expect(usePetStore.getState().mood).toBe('happy')
    expect(usePetStore.getState().happyUntil).toBeGreaterThan(Date.now())
  })
  it('uses anticipation, strike, counter, recovery and idle poses', () => {
    expect(duelPose(27, false).black).toBeGreaterThanOrEqual(6)
    expect(duelPose(37, false).impact).toBe(true)
    expect(duelPose(59, false).white).toBeGreaterThanOrEqual(9)
    for (let tick = 0; tick < 192; tick++) {
      const pose = duelPose(tick, false)
      expect(pose.black).toBeLessThan(24)
      expect(pose.white).toBeLessThan(24)
      expect(pose.travel).toBeGreaterThanOrEqual(0)
      expect(pose.travel).toBeLessThanOrEqual(1)
    }
  })
})
