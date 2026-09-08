import { useEffect, useRef, useState } from 'react'
import { Howl } from 'howler'
import { SlidersHorizontal, X, Volume2 } from 'lucide-react'
import type { LockdownPreset } from '../../lib/types'
import { useLockdownStore } from '../../stores/lockdownStore'
import { SOUNDSCAPE_LAYERS, soundscapeLoopUrl, type SoundscapeLayerId } from '../../lib/audio'
import { Slider, Button } from '../ui'

/**
 * Soundscape mixer (§8.2): procedurally generated ambient layers (rain, fire,
 * white noise, café, wind) rendered once offline, mixed independently via
 * Howler.js. The saved mix is part of the preset and survives relaunch.
 */
export function Mixer({ preset }: { preset: LockdownPreset }) {
  const setMix = useLockdownStore((s) => s.setMix)
  const [open, setOpen] = useState(false)
  const [muted, setMuted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [master, setMaster] = useState(0.8)
  const howls = useRef<Map<SoundscapeLayerId, Howl>>(new Map())

  const mix = preset.soundscape.layers
  const anyOn = Object.values(mix).some((v) => v > 0)

  const ensure = (layer: SoundscapeLayerId): Howl => {
    let h = howls.current.get(layer)
    if (!h) {
      h = new Howl({
        src: [soundscapeLoopUrl(layer)],
        loop: true,
        volume: 0,
        html5: true,
        onplay: () => setPlaying(true),
        onplayerror: () => setPlaying(false),
        onloaderror: () => setPlaying(false)
      })
      howls.current.set(layer, h)
    }
    return h
  }

  useEffect(() => {
    // sync layer volumes to the preset mix
    for (const layer of Object.keys(SOUNDSCAPE_LAYERS) as SoundscapeLayerId[]) {
      const target = muted ? 0 : Math.min(1, (mix[layer] ?? 0) * master)
      const h = target > 0 ? ensure(layer) : howls.current.get(layer)
      if (h) {
        h.volume(target)
        if (target > 0 && !h.playing()) h.play()
        if (target === 0 && h.playing()) h.stop()
      }
    }
  }, [mix, master, muted, preset.id])

  useEffect(
    () => () => {
      howls.current.forEach((h) => h.unload())
      howls.current.clear()
    },
    []
  )

  const setLayer = (layer: SoundscapeLayerId, v: number) => {
    ensure(layer).volume(muted ? 0 : Math.min(1, v * master))
    const h = howls.current.get(layer)!
    if (v > 0 && !muted && !h.playing()) h.play()
    if (v === 0 && h.playing()) h.stop()
    void setMix(preset.id, { layers: { ...mix, [layer]: v } })
  }

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    howls.current.forEach((h, layer) => {
      h.volume(next ? 0 : Math.min(1, (mix[layer] ?? 0) * master))
      if (next && h.playing()) h.mute(true)
      if (!next) h.mute(false)
    })
  }

  return (
    <div className="absolute bottom-3 right-3 z-30">
      {!open ? (
        <div className="flex items-center gap-1">
          {anyOn && !muted && playing && (
            <span className="glass-panel flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[0.78em] text-ink-muted">
              <Volume2 size={13} className="text-primary" />
              Soundscape on
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="glass-panel"
            icon={<SlidersHorizontal size={13} />}
            onClick={() => setOpen(true)}
          >
            Soundscape
          </Button>
        </div>
      ) : (
        <div className="glass-panel elev-overlay w-64 rounded-token-lg border border-line p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.85em] font-semibold">Soundscape mixer</span>
            <div className="flex items-center gap-0.5">
              <button
                className="focus-ring rounded p-1 text-ink-muted hover:text-ink"
                aria-label={muted ? 'Unmute' : 'Mute all'}
                onClick={toggleMute}
              >
                <Volume2 size={14} style={{ opacity: muted ? 0.4 : 1 }} />
              </button>
              <button
                className="focus-ring rounded p-1 text-ink-muted hover:text-ink"
                aria-label="Close mixer"
                onClick={() => setOpen(false)}
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="space-y-3">
            <Slider label="Master" value={master} min={0} max={1} step={0.01} onChange={setMaster} />
            {(Object.keys(SOUNDSCAPE_LAYERS) as SoundscapeLayerId[]).map((layer) => (
              <Slider
                key={layer}
                label={SOUNDSCAPE_LAYERS[layer]}
                value={mix[layer] ?? 0}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => setLayer(layer, v)}
              />
            ))}
          </div>
          <p className="mt-2 text-[0.68em] leading-relaxed text-ink-faint">
            Layers are generated on-device — no audio files, fully offline. Your mix is saved with this
            preset.
          </p>
        </div>
      )}
    </div>
  )
}
