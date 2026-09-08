import { assetUrl } from '../../lib/assets'
import { useId, useRef } from 'react'
import { Music2, Pause, Play, Plus, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import { useMusicStore } from '../../stores/musicStore'
import { uid } from '../../lib/types'
import { IconBtn } from '../ui'

/** A small physical illustration, built from material tokens, not a screenshot.
 * The platter retains its angle when paused; the arm parks off the record. */
export function Turntable({ playing = false, className = '' }: { playing?: boolean; className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <div
      className={`turntable ${className} ${playing ? 'is-playing' : ''}`}
      role="img"
      aria-label={
        playing
          ? 'Turntable playing: spinning vinyl, tonearm on record'
          : 'Turntable paused: vinyl stopped, tonearm parked'
      }
    >
      <div className="turntable-grain" aria-hidden="true" />
      <span className="turntable-brand" aria-hidden="true">
        <Music2 size={12} strokeWidth={1.5} />
      </span>
      <div className="platter-rim" aria-hidden="true">
        <div className="vinyl" style={{ animationPlayState: playing ? 'running' : 'paused' }}>
          <div className="record-label">
            <img src={assetUrl('wallpapers/nocturne.jpg')} alt="" />
            <span className="record-spindle" />
          </div>
        </div>
      </div>
      <svg viewBox="0 0 240 240" className="tonearm" aria-hidden="true">
        <defs>
          <linearGradient id={`metal-${id}`}>
            <stop offset="0" stopColor="var(--metal-dark)" />
            <stop offset=".45" stopColor="var(--metal-light)" />
            <stop offset="1" stopColor="var(--metal-mid)" />
          </linearGradient>
        </defs>
        <g className="tonearm-assembly">
          <path
            d="M205 29 200 96 Q195 131 173 168L163 184"
            fill="none"
            stroke="var(--metal-shadow)"
            strokeWidth="9"
            transform="translate(3 3)"
          />
          <path
            d="M205 29 200 96 Q195 131 173 168L163 184"
            fill="none"
            stroke={`url(#metal-${id})`}
            strokeWidth="5"
          />
          <path
            d="m163 174-10 14 7 6 12-15Z"
            fill="var(--metal-dark)"
            stroke="var(--metal-light)"
            strokeWidth="1"
          />
          <path d="m161 180-4 5 4 3 4-5Z" fill="var(--vinyl-edge)" />
          <path d="m155 193 7 5" stroke="var(--vinyl-edge)" strokeWidth="2" />
          <path d="M204 30 211 8" stroke="var(--metal-dark)" strokeWidth="8" />
          <path d="m201 14 17 4" stroke={`url(#metal-${id})`} strokeWidth="10" />
        </g>
        <circle cx="205" cy="32" r="13" fill="var(--vinyl-edge)" stroke="var(--metal-dark)" strokeWidth="3" />
        <circle cx="205" cy="32" r="8" fill={`url(#metal-${id})`} stroke="var(--metal-mid)" strokeWidth="1" />
      </svg>
      <span className="turntable-power" aria-hidden="true" />
      <span className="turntable-speed" aria-hidden="true">
        33
      </span>
    </div>
  )
}

export function MusicCard({ compact = false }: { compact?: boolean }) {
  const { tracks, currentId, playing, select, setPlaying, position, duration, requestSeek } = useMusicStore()
  const current = tracks.find((t) => t.id === currentId)
  const file = useRef<HTMLInputElement>(null)
  const step = (direction: number) => {
    if (!tracks.length) return
    const i = tracks.findIndex((t) => t.id === currentId)
    select(tracks[(i + direction + tracks.length) % tracks.length].id)
  }
  const clock = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`
  return (
    <div className={`music-card-content ${compact ? 'is-compact' : ''}`}>
      <Turntable playing={playing && !!current} />
      <div className="music-readout">
        <strong title={current?.name}>{current?.name ?? 'A soundtrack for your flow'}</strong>
        <span>
          {current ? (current.kind === 'file' ? 'Local audio' : 'YouTube') : 'Your music. On your device.'}
        </span>
      </div>
      {current && !compact && (
        <div className="music-seek">
          <input
            type="range"
            aria-label="Track position"
            className="slider"
            min={0}
            max={duration || 1}
            step={1}
            value={Math.min(position, duration || 1)}
            disabled={current.kind !== 'file'}
            onChange={(e) => requestSeek(Number(e.target.value))}
          />
          <span>{clock(position)}</span>
        </div>
      )}
      <div className="music-transport">
        <IconBtn label="Previous track" disabled={!tracks.length} onClick={() => step(-1)}>
          <SkipBack size={15} />
        </IconBtn>
        <button
          className="transport-play"
          type="button"
          aria-label={current ? (playing ? 'Pause music' : 'Play music') : 'Add local music'}
          onClick={() => (current ? setPlaying(!playing) : file.current?.click())}
        >
          {current ? (
            playing ? (
              <Pause size={17} fill="currentColor" />
            ) : (
              <Play size={17} fill="currentColor" />
            )
          ) : (
            <Plus size={17} />
          )}
        </button>
        <IconBtn label="Next track" disabled={!tracks.length} onClick={() => step(1)}>
          <SkipForward size={15} />
        </IconBtn>
      </div>
      <input
        ref={file}
        type="file"
        accept="audio/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Import local music"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).filter(
            (f) => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(f.name)
          )
          useMusicStore
            .getState()
            .addFiles(
              files.map((f) => ({
                id: uid(),
                name: f.name.replace(/\.[^.]+$/, ''),
                kind: 'file',
                src: URL.createObjectURL(f)
              }))
            )
          e.target.value = ''
        }}
      />
    </div>
  )
}
