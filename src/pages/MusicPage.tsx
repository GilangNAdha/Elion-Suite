import { useEffect, useState } from 'react'
import { Music2, Play, Pause, SkipBack, SkipForward, Plus, Link as LinkIcon, Disc3, Trash2, WifiOff } from 'lucide-react'
import { useMusicStore, type PlayerSkin } from '../stores/musicStore'
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
              <IconBtn
                label="Previous"
                onClick={() => {
                  if (tracks.length === 0) return
                  const i = tracks.findIndex((t) => t.id === currentId)
                  select(tracks[(i - 1 + tracks.length) % tracks.length].id)
                }}
              >
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
              <IconBtn
                label="Next"
                onClick={() => {
                  if (tracks.length === 0) return
                  const i = tracks.findIndex((t) => t.id === currentId)
                  select(tracks[(i + 1) % tracks.length].id)
                }}
              >
                <SkipForward size={16} />
              </IconBtn>
              <span className="w-24">
                <Slider label="" value={volume} min={0} max={1} step={0.01} onChange={setVolume} />
              </span>
            </div>
          </div>
        </div>

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
