import { assetUrl } from '../../lib/assets'
import { useEffect, useState } from 'react'
import { useReducedMotion } from '../../lib/useReducedMotion'

export const PIXEL_FPS = 12
export const PIXEL_FRAME_SIZE = 96
export const PIXEL_FRAME_COUNT = 24

/** One discrete sprite clock, suspended while the document is hidden. */
export function usePixelClock(paused = false) {
  const reduced = useReducedMotion() || paused
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (reduced) {
      setTick(0)
      return
    }
    let timer: ReturnType<typeof setInterval> | undefined
    const resume = () => {
      clearInterval(timer)
      if (!document.hidden) timer = setInterval(() => setTick((n) => (n + 1) % 960), 1000 / PIXEL_FPS)
    }
    resume()
    document.addEventListener('visibilitychange', resume)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [reduced])
  return { tick: reduced ? 0 : tick, reduced }
}

export function PixelSprite({
  kind,
  frame = 0,
  mirror = false,
  className = ''
}: {
  kind: 'white' | 'black'
  frame?: number
  mirror?: boolean
  className?: string
}) {
  const index = Math.max(0, Math.min(PIXEL_FRAME_COUNT - 1, frame))
  return (
    <svg
      viewBox="0 0 96 96"
      className={`pixel-sprite ${className}`}
      aria-hidden="true"
      data-frame={index}
      data-knight={kind}
      style={{ transform: mirror ? 'scaleX(-1)' : undefined }}
    >
      <image
        href={assetUrl(`pixel/${kind}-knight-sprites.png`)}
        x={-index * PIXEL_FRAME_SIZE}
        y="0"
        width={PIXEL_FRAME_SIZE * PIXEL_FRAME_COUNT}
        height={PIXEL_FRAME_SIZE}
      />
    </svg>
  )
}

/** Authored pose timeline: anticipation, strike, guard, recoil, counter. */
export function duelPose(
  tick: number,
  calm: boolean
): { black: number; white: number; travel: number; impact: boolean } {
  const t = tick % 96
  const idle = Math.floor(t / 3) % 6
  if (calm || t < 24 || t >= 82) return { black: idle, white: (idle + 2) % 6, travel: 0, impact: false }
  if (t < 33)
    return {
      black: 6 + Math.floor((t - 24) / 3),
      white: 16 + (Math.floor((t - 24) / 3) % 4),
      travel: (t - 24) / 9,
      impact: false
    }
  if (t < 45)
    return {
      black: 9 + Math.floor((t - 33) / 3),
      white: 16 + Math.floor((t - 33) / 3),
      travel: 1,
      impact: t === 37 || t === 38
    }
  if (t < 54)
    return {
      black: 13 + Math.floor((t - 45) / 3),
      white: 6 + Math.floor((t - 45) / 3),
      travel: 1,
      impact: false
    }
  if (t < 66)
    return {
      black: 16 + Math.floor((t - 54) / 3),
      white: 9 + Math.floor((t - 54) / 3),
      travel: 1,
      impact: t === 59 || t === 60
    }
  return {
    black: idle,
    white: 13 + Math.min(2, Math.floor((t - 66) / 5)),
    travel: 1 - (t - 66) / 16,
    impact: false
  }
}
