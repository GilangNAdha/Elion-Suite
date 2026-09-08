import { assetUrl } from '../lib/assets'
import { useRef, useState } from 'react'
import {
  Headphones,
  Link as LinkIcon,
  Music2,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2
} from 'lucide-react'
import { useMusicStore, type PlayerSkin } from '../stores/musicStore'
import { uid } from '../lib/types'
import { Button, EmptyState, IconBtn, Input, Slider, Tabs, useToasts } from '../components/ui'
import { Turntable } from '../components/music/Turntable'

export function MusicPage() {
  const player = useMusicStore()
  const { tracks, currentId, playing, volume, skin, position, duration } = player
  const [url, setUrl] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const current = tracks.find((t) => t.id === currentId)
  const step = (direction: number) => {
    if (!tracks.length) return
    player.select(
      tracks[(tracks.findIndex((t) => t.id === currentId) + direction + tracks.length) % tracks.length].id
    )
  }
  const clock = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`
  return (
    <div className="music-page">
      <header className="music-page-heading">
        <div>
          <div className="date-label">
            <Headphones size={14} />
            Your listening space
          </div>
          <h1>Set the mood.</h1>
          <p>A familiar record. A little less noise.</p>
        </div>
        <Tabs
          tabs={[
            { id: 'turntable', label: 'Turntable' },
            { id: 'disc', label: 'Vinyl' },
            { id: 'minimal', label: 'Minimal' }
          ]}
          value={skin}
          onChange={(s) => player.setSkin(s as PlayerSkin)}
        />
      </header>
      <div className="music-page-layout">
        <section className={`now-playing-panel skin-${skin}`} aria-label="Now playing">
          {skin === 'turntable' ? (
            <Turntable playing={!!current && playing} className="large-turntable" />
          ) : skin === 'disc' ? (
            <div className="standalone-record">
              <div
                className="vinyl"
                style={{ animationPlayState: current && playing ? 'running' : 'paused' }}
              >
                <div className="record-label">
                  <img src={assetUrl('wallpapers/nocturne.jpg')} alt="" />
                  <span className="record-spindle" />
                </div>
              </div>
            </div>
          ) : (
            <div className="minimal-music-mark">
              <Music2 size={40} strokeWidth={1} />
            </div>
          )}
          <div className="large-track-readout">
            <h2>{current?.name ?? 'Nothing on the record. Yet.'}</h2>
            <p>
              {current
                ? current.kind === 'file'
                  ? 'Playing from your device'
                  : 'YouTube playback uses a connection'
                : 'Add a song and settle into your own rhythm.'}
            </p>
          </div>
          <div className="large-track-seek">
            <input
              type="range"
              className="slider"
              aria-label="Track position"
              min={0}
              max={duration || 1}
              value={Math.min(position, duration || 1)}
              disabled={!current || current.kind === 'youtube'}
              onChange={(e) => player.requestSeek(Number(e.target.value))}
            />
            <div>
              <time>{clock(position)}</time>
              <time>{clock(duration)}</time>
            </div>
          </div>
          <div className="large-track-controls">
            <IconBtn label="Previous track" disabled={!tracks.length} onClick={() => step(-1)}>
              <SkipBack size={22} />
            </IconBtn>
            <button
              className="transport-play"
              aria-label={current ? (playing ? 'Pause music' : 'Play music') : 'Add local music'}
              onClick={() => (current ? player.setPlaying(!playing) : file.current?.click())}
            >
              {current && playing ? (
                <Pause size={24} fill="currentColor" />
              ) : current ? (
                <Play size={24} fill="currentColor" />
              ) : (
                <Plus size={24} />
              )}
            </button>
            <IconBtn label="Next track" disabled={!tracks.length} onClick={() => step(1)}>
              <SkipForward size={22} />
            </IconBtn>
          </div>
          <div className="large-track-volume">
            <Volume2 size={15} />
            <Slider
              label="Music volume"
              value={volume}
              min={0}
              max={1}
              step={0.01}
              onChange={player.setVolume}
            />
          </div>
        </section>
        <section className="music-library panel" aria-labelledby="queue-title">
          <div className="panel-heading">
            <div className="panel-title">
              <h2 id="queue-title">Your library</h2>
              <span className="count-badge">{tracks.length}</span>
            </div>
            <Button size="sm" icon={<Plus size={13} />} onClick={() => file.current?.click()}>
              Add music
            </Button>
          </div>
          <input
            ref={file}
            className="sr-only"
            tabIndex={-1}
            aria-label="Local audio files"
            type="file"
            accept="audio/*"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              player.addFiles(
                files.map((f) => ({
                  id: uid(),
                  name: f.name.replace(/\.[^.]+$/, ''),
                  src: URL.createObjectURL(f),
                  kind: 'file'
                }))
              )
              e.target.value = ''
              if (files.length) useToasts.getState().push('Music added', 'success')
            }}
          />
          {!tracks.length ? (
            <div className="music-library-empty">
              <Music2 size={28} strokeWidth={1.3} />
              <h3>Your soundtrack starts here.</h3>
              <p>
                Add audio files from your device, or a YouTube link below. Local files are never uploaded.
              </p>
              <Button icon={<Plus size={14} />} onClick={() => file.current?.click()}>
                Choose audio files
              </Button>
            </div>
          ) : (
            <ol className="music-queue">
              {tracks.map((track, i) => (
                <li key={track.id} className={track.id === currentId ? 'is-current' : ''}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <button className="queue-track" onClick={() => player.select(track.id)}>
                    <strong>{track.name}</strong>
                    <small>{track.kind === 'file' ? 'Local audio' : 'YouTube'}</small>
                  </button>
                  {track.id === currentId && playing && (
                    <span className="queue-playing" aria-label="Playing">
                      <Volume2 size={13} />
                    </span>
                  )}
                  <IconBtn label={`Remove ${track.name}`} onClick={() => player.removeTrack(track.id)}>
                    <Trash2 size={13} />
                  </IconBtn>
                </li>
              ))}
            </ol>
          )}
          <form
            className="music-url-form"
            onSubmit={(event) => {
              event.preventDefault()
              try {
                const parsed = new URL(url)
                if (
                  !['www.youtube.com', 'youtube.com', 'youtu.be', 'www.youtube-nocookie.com'].includes(
                    parsed.hostname
                  )
                )
                  throw new Error('Unsupported URL')
                const id =
                  parsed.hostname === 'youtu.be'
                    ? parsed.pathname.slice(1)
                    : (parsed.searchParams.get('v') ?? parsed.pathname.match(/\/embed\/([\w-]+)/)?.[1])
                if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('Invalid video ID')
                player.addYoutube(`https://www.youtube-nocookie.com/embed/${id}`, 'YouTube track')
                setUrl('')
                useToasts.getState().push('YouTube track added', 'success')
              } catch {
                useToasts
                  .getState()
                  .push('This link is not a YouTube video — paste a video or embed URL.', 'error')
              }
            }}
          >
            <label htmlFor="music-url">Add a YouTube video</label>
            <div>
              <Input
                id="music-url"
                placeholder="Paste a video link"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button type="submit" size="sm" disabled={!url.trim()} icon={<LinkIcon size={13} />}>
                Add video
              </Button>
            </div>
          </form>
          <p className="music-local-note">
            The same player follows you into Lockdown. Local files stay in this session; choose them again
            after relaunch. YouTube links are saved, and need a connection.
          </p>
        </section>
      </div>
    </div>
  )
}
