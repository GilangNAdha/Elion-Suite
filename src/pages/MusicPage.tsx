import { useEffect, useState } from 'react'
import { Music2, Play, Pause, SkipBack, SkipForward, Plus, Link as LinkIcon, Disc3, Trash2, WifiOff } from 'lucide-react'
import { useMusicStore, type PlayerSkin } from '../stores/musicStore'
import { useThemeStore } from '../stores/themeStore'
import { Button, EmptyState, IconBtn, Input, Slider, Tabs } from '../components/ui'
import { uid } from '../lib/types'

/**
 * Music — shared player core; the Lockdown music widget mounts the same
 * store/skin, so playback state is one (§7).
 */
export function MusicPage() {
  const { tracks, currentId, playing, volume, skin, setSkin, setVolume, setPlaying, select, addFiles, addYoutube, removeTrack } =
    useMusicStore()
  const [ytUrl, setYtUrl] = useState('')
  const [offline, setOffline] = useState(!navigator.onLine)
  const current = tracks.find((t) => t.id === currentId)

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const onFiles = (files: FileList | null) => {
    if (!files) return
    const list = Array.from(files).map((f) => ({
      id: uid(),
      name: f.name.replace(/\.[^.]+$/, ''),
      src: URL.createObjectURL(f),
      kind: 'file' as const
    }))
    addFiles(list)
  }

  const step = (dir: 1 | -1) => {
    if (tracks.length === 0) return
    const i = tracks.findIndex((t) => t.id === currentId)
    select(tracks[(i + dir + tracks.length) % tracks.length].id)
  }

  return (
    <div className="mx-auto max-w-4xl p-6 pb-24">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[1.7em] font-bold tracking-tight">
            <Music2 size={26} className="text-primary" />
            Music
          </h1>
          <p className="text-[0.88em] text-ink-muted">
            Local files (private, never uploaded) + YouTube embeds. The same player runs in Lockdown.
          </p>
        </div>
        <span className="flex-1" />
        <Tabs
          tabs={[
            { id: 'disc', label: 'Disc skin' },
            { id: 'turntable', label: 'Turntable' },
            { id: 'minimal', label: 'Minimal' }
          ]}
          value={skin}
          onChange={(v) => setSkin(v as PlayerSkin)}
        />
      </div>

      {offline && (
        <div className="mb-4 flex items-center gap-2 rounded-token border border-warn/40 bg-warn/10 px-3 py-2 text-[0.85em] text-warn">
          <WifiOff size={14} />
          Offline — YouTube tracks need a connection. Local files keep playing.
        </div>
      )}

      <div className="elev-raised overflow-hidden rounded-token-lg border border-line bg-raised">
        {skin === 'turntable' && (
          <TurntableHeader
            name={current?.name ?? 'Nothing playing'}
            kindLabel={current ? (current.kind === 'youtube' ? 'YouTube embed' : 'Local file') : `${tracks.length} in queue`}
            playing={playing}
            hasTrack={!!current}
            onPlay={() => current && setPlaying(!playing)}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            volume={volume}
            setVolume={setVolume}
          />
        )}
        {skin !== 'turntable' && (
        <div className="flex items-center gap-4 border-b border-line p-4">
          <div
            className={`relative h-24 w-24 shrink-0 rounded-full ${playing ? 'spin-slow' : ''}`}
            style={{
              background:
                skin === 'disc'
                  ? 'conic-gradient(var(--c1), var(--c2), var(--c5), var(--c3), var(--c1))'
                  : 'var(--sunken)'
            }}
          >
            <div className="absolute inset-3 rounded-full bg-raised" />
            {skin === 'disc' && <div className="absolute inset-0 m-auto h-6 w-6 rounded-full bg-primary" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[1.2em] font-semibold">
              {current?.name ?? 'Nothing playing'}
            </div>
            <div className="text-[0.8em] text-ink-muted">
              {current ? (current.kind === 'youtube' ? 'YouTube embed' : 'Local file') : `${tracks.length} in queue`}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <IconBtn label="Previous" onClick={() => step(-1)}>
                <SkipBack size={16} />
              </IconBtn>
              <button
                className="focus-ring flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-on transition-transform hover:scale-105"
                aria-label={playing ? 'Pause' : 'Play'}
                onClick={() => current && setPlaying(!playing)}
                disabled={!current}
              >
                {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
              </button>
              <IconBtn label="Next" onClick={() => step(1)}>
                <SkipForward size={16} />
              </IconBtn>
              <span className="w-24">
                <Slider label="" value={volume} min={0} max={1} step={0.01} onChange={setVolume} />
              </span>
            </div>
          </div>
        </div>
        )}

        {current?.kind === 'youtube' && (
          <div className="border-b border-line bg-sunken">
            <iframe
              key={current.src}
              title={current.name}
              src={`${current.src}&autoplay=${playing ? 1 : 0}&enablejsapi=1`}
              className="h-52 w-full border-0"
              allow="autoplay; encrypted-media"
            />
          </div>
        )}

        <div className="p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="cursor-pointer">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-token-sm border border-line px-3 text-[0.85em] text-ink-muted hover:text-ink">
                <Plus size={14} /> Add local files
              </span>
              <input type="file" accept="audio/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </label>
            <Input
              placeholder="YouTube URL"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              className="h-8 w-56"
              aria-label="YouTube URL"
            />
            <Button
              size="sm"
              variant="outline"
              icon={<LinkIcon size={13} />}
              disabled={!ytUrl.trim()}
              onClick={() => {
                const m = ytUrl.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{6,})/)
                if (m) {
                  addYoutube(`https://www.youtube.com/embed/${m[1]}`, 'YouTube track')
                  setYtUrl('')
                }
              }}
            >
              Add
            </Button>
          </div>

          {tracks.length === 0 ? (
            <EmptyState icon={<Disc3 size={20} />} title="Queue is empty" hint="Add local audio files (they stay on this device) or a YouTube URL." />
          ) : (
            <ul className="max-h-64 space-y-0.5 overflow-y-auto">
              {tracks.map((t, i) => (
                <li
                  key={t.id}
                  className={`group flex items-center gap-2 rounded-token-sm px-2 py-1.5 ${t.id === currentId ? 'bg-primary-soft' : 'hover:bg-surface'}`}
                >
                  <span className="w-5 text-center font-mono text-[0.7em] text-ink-faint">{i + 1}</span>
                  <button
                    className="focus-ring min-w-0 flex-1 truncate rounded text-left text-[0.9em]"
                    style={{ color: t.id === currentId ? 'var(--primary)' : undefined }}
                    onClick={() => select(t.id)}
                  >
                    {t.name}
                  </button>
                  <span className="text-[0.7em] text-ink-faint">{t.kind === 'file' ? 'file' : 'youtube'}</span>
                  <IconBtn label={`Remove ${t.name}`} className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => removeTrack(t.id)}>
                    <Trash2 size={12} />
                  </IconBtn>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-3 text-[0.75em] leading-relaxed text-ink-faint">
        Local file tracks use object URLs and intentionally do not survive a full relaunch (they live in your files,
        not in app storage). YouTube tracks persist; both degrade gracefully offline.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// §16.3 Turntable skin — pure CSS/SVG over the shared musicStore:
// the record spins iff playing (animation-play-state), the tonearm swings
// on/off the platter, reduced-motion freezes the spin.
// ---------------------------------------------------------------------------
function TurntableHeader({
  name,
  kindLabel,
  playing,
  hasTrack,
  onPlay,
  onPrev,
  onNext,
  volume,
  setVolume
}: {
  name: string
  kindLabel: string
  playing: boolean
  hasTrack: boolean
  onPlay: () => void
  onPrev: () => void
  onNext: () => void
  volume: number
  setVolume: (v: number) => void
}) {
  const reduced = useReducedMotionSetting()
  return (
    <div className="border-b border-line bg-sunken p-5">
      <style>{`
        @keyframes tt-spin { to { transform: rotate(360deg); } }
        .tt-vinyl { animation: tt-spin 3.2s linear infinite; }
        .tt-arm { transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1); }
      `}</style>
      <div className="mx-auto max-w-sm">
        <div
          className="relative aspect-square rounded-token-lg border border-line-strong"
          style={{ background: 'linear-gradient(145deg, var(--raised), var(--sunken))' }}
          aria-hidden
        >
          {/* corner screws */}
          {[
            'left-2 top-2',
            'right-2 top-2',
            'left-2 bottom-2',
            'right-2 bottom-2'
          ].map((c) => (
            <span key={c} className={`absolute ${c} h-2 w-2 rounded-full bg-line-strong`} />
          ))}
          {/* vinyl */}
          <div
            className={`tt-vinyl absolute inset-[9%] rounded-full ${playing && !reduced ? '' : 'animation-none'}`}
            style={{
              background:
                'repeating-radial-gradient(circle at center, var(--ink) 0 1.5px, var(--sunken) 1.5px 4px), var(--sunken)',
              boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
              ...(playing && !reduced ? {} : { animation: 'none' })
            }}
          >
            {/* label with track name */}
            <div
              className="absolute inset-[30%] flex items-center justify-center rounded-full border border-line-strong text-center"
              style={{ background: 'var(--primary)' }}
            >
              <span className="px-2 text-[0.55em] font-semibold leading-tight" style={{ color: 'var(--on-primary)' }}>
                {name}
              </span>
            </div>
            <div className="absolute inset-0 m-auto h-2.5 w-2.5 rounded-full" style={{ background: 'var(--raised)' }} />
          </div>
          {/* tonearm */}
          <div
            className="tt-arm absolute -right-1 -top-1 origin-top"
            style={{ transform: `rotate(${playing ? 32 : 8}deg)` }}
          >
            <div className="relative h-24 w-24" aria-hidden>
              <span className="absolute right-3 top-0 h-6 w-6 rounded-full border border-line-strong bg-raised" />
              <div
                className="absolute right-6 top-4 h-20 w-1.5 rounded-full bg-raised"
                style={{ boxShadow: '0 1px 3px rgba(0, 0, 0, 0.4)' }}
              >
                <span className="absolute -bottom-1.5 -left-0.5 h-4 w-2.5 rounded-sm bg-raised" />
              </div>
            </div>
          </div>
        </div>

        {/* transport */}
        <div className="mt-4 flex items-center justify-center gap-3">
          <IconBtn label="Previous" onClick={onPrev}>
            <SkipBack size={16} />
          </IconBtn>
          <button
            className="focus-ring flex h-11 w-11 items-center justify-center rounded-full bg-primary transition-transform hover:scale-105"
            style={{ color: 'var(--on-primary)' }}
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={onPlay}
            disabled={!hasTrack}
          >
            {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
          <IconBtn label="Next" onClick={onNext}>
            <SkipForward size={16} />
          </IconBtn>
          <span className="w-28">
            <Slider label="Volume" value={volume} min={0} max={1} step={0.01} onChange={setVolume} />
          </span>
        </div>
        <p className="mt-2 text-center text-[0.78em] text-ink-muted">
          {kindLabel}
          {playing ? ' · now spinning' : ''}
        </p>
      </div>
    </div>
  )
}

function useReducedMotionSetting(): boolean {
  return useThemeStore((s) => s.reducedMotion)
}
