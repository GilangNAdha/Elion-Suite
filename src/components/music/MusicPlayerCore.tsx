import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useMusicStore } from '../../stores/musicStore'
import { useToasts } from '../ui'

/** One audio element and one YouTube embed above routes; neither is remounted
 * when a dashboard / Lockdown / Music control changes the shared player. */
export function MusicPlayerCore() {
  const audio = useRef<HTMLAudioElement>(null)
  const video = useRef<HTMLIFrameElement>(null)
  const [videoClosed, setVideoClosed] = useState(false)
  const { tracks, currentId, playing, volume, seekSignal, setPosition, setDuration, setPlaying } =
    useMusicStore()
  const current = tracks.find((t) => t.id === currentId)
  const currentRef = useRef(current)
  currentRef.current = current
  const next = () => {
    const state = useMusicStore.getState()
    const index = state.tracks.findIndex((t) => t.id === state.currentId)
    if (state.tracks.length > 1) state.select(state.tracks[(index + 1) % state.tracks.length].id)
    else state.setPlaying(false)
  }
  const command = (func: string, args: unknown[] = []) => {
    if (!video.current || currentRef.current?.kind !== 'youtube') return
    const origin = new URL(currentRef.current.src).origin
    video.current.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), origin)
  }
  useEffect(() => {
    const element = audio.current
    if (!element) return
    if (current?.kind === 'file') {
      if (element.src !== current.src) {
        element.src = current.src
        setPosition(0)
        setDuration(0)
      }
      if (playing)
        void element.play().catch(() => {
          setPlaying(false)
          useToasts
            .getState()
            .push('Audio could not play — choose the file again or press Play to retry.', 'error')
        })
      else element.pause()
    } else element.pause()
    if (current?.kind === 'youtube') command(playing ? 'playVideo' : 'pauseVideo')
  }, [current?.id, current?.src, playing, setPlaying, setPosition, setDuration])
  useEffect(() => {
    setVideoClosed(false)
  }, [currentId])
  useEffect(() => {
    if (playing) setVideoClosed(false)
  }, [playing])
  useEffect(() => {
    if (audio.current && current?.kind === 'file' && seekSignal > 0)
      audio.current.currentTime = useMusicStore.getState().position
  }, [seekSignal, current?.kind])
  useEffect(() => {
    if (audio.current) audio.current.volume = volume
    command('setVolume', [volume * 100])
  }, [volume])
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        currentRef.current?.kind !== 'youtube' ||
        event.source !== video.current?.contentWindow ||
        event.origin !== new URL(currentRef.current.src).origin
      )
        return
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
        if (data.event === 'onReady') {
          command('setVolume', [useMusicStore.getState().volume * 100])
          command(useMusicStore.getState().playing ? 'playVideo' : 'pauseVideo')
        }
        if (data.event === 'onStateChange') {
          if (data.info === 1) setPlaying(true)
          else if (data.info === 2) setPlaying(false)
          else if (data.info === 0) next()
        }
        if (data.event === 'onError') {
          setPlaying(false)
          useToasts
            .getState()
            .push('This YouTube video cannot play here — try another video or a local audio file.', 'error')
        }
        if (data.event === 'infoDelivery' && data.info) {
          if (Number.isFinite(data.info.currentTime)) setPosition(data.info.currentTime)
          if (Number.isFinite(data.info.duration)) setDuration(data.info.duration)
        }
      } catch {
        /* Ignore unrelated / malformed cross-origin player events. */
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [setPlaying, setPosition, setDuration])
  let embed = ''
  if (current?.kind === 'youtube') {
    try {
      const url = new URL(current.src)
      url.searchParams.set('enablejsapi', '1')
      url.searchParams.set('origin', window.location.origin)
      url.searchParams.set('autoplay', playing ? '1' : '0')
      embed = url.href
    } catch {
      /* invalid old queue entry */
    }
  }
  // Keep src stable across play/pause; commands preserve position.
  const embedRef = useRef({ id: '', src: '' })
  if (currentId && embedRef.current.id !== currentId) embedRef.current = { id: currentId, src: embed }
  return (
    <>
      <audio
        ref={audio}
        className="hidden"
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onDurationChange={(e) =>
          setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)
        }
        onEnded={next}
      />
      {current?.kind === 'youtube' && embed && !videoClosed && (
        <aside className="shared-video-player" aria-label="Shared YouTube player">
          <div>
            <span>{current.name}</span>
            <button
              aria-label="Stop and close video"
              onClick={() => {
                command('pauseVideo')
                setPlaying(false)
                setVideoClosed(true)
              }}
            >
              <X size={13} />
            </button>
          </div>
          <iframe
            ref={video}
            key={current.id}
            src={embedRef.current.src}
            title={current.name}
            allow="autoplay; encrypted-media"
            onLoad={() => {
              video.current?.contentWindow?.postMessage(
                JSON.stringify({ event: 'listening', id: 'elion-shared-player' }),
                new URL(current.src).origin
              )
              command('addEventListener', ['onStateChange'])
              command('addEventListener', ['onError'])
              command('setVolume', [useMusicStore.getState().volume * 100])
              command(useMusicStore.getState().playing ? 'playVideo' : 'pauseVideo')
            }}
          />
        </aside>
      )}
    </>
  )
}
