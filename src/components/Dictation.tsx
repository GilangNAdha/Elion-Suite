import { useEffect, useId, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { Mic, Square, X, Download, LoaderCircle } from 'lucide-react'
import { voiceDictation, useVoiceDictation } from '../lib/voice/VoiceDictationService'
import { captureVoiceTarget, rememberVoiceTarget } from '../lib/voice/textTarget'
import { useSettingsStore } from '../stores/settingsStore'
import { Button, IconBtn, useToasts } from './ui'

export function DictationButton({
  getTarget,
  label = 'Dictate into focused field',
  className = '',
  global = false
}: {
  getTarget?: () => HTMLElement | null
  label?: string
  className?: string
  global?: boolean
}) {
  const state = useVoiceDictation()
  const mode = useSettingsStore((s) => s.stt.mode)
  const id = useId()
  const suppressClick = useRef(false)
  const stop = state.phase === 'listening' || state.phase === 'requesting'
  const busy = state.phase === 'processing' || state.phase === 'downloading'
  const active = (state.origin === id || (global && state.origin === 'global')) && (stop || busy)
  const start = () => voiceDictation.start(captureVoiceTarget(getTarget?.()), id)
  return (
    <button
      type="button"
      className={`dictation-mic ${className}`}
      aria-label={stop ? 'Stop dictation' : label}
      title={stop ? 'Stop dictation' : label}
      aria-pressed={active}
      disabled={busy}
      data-active={active}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault() // preserve the insertion point
        if (mode === 'hold') {
          event.currentTarget.setPointerCapture(event.pointerId)
          void start()
        }
      }}
      onPointerUp={() => {
        if (mode === 'hold') {
          suppressClick.current = true
          void voiceDictation.stop()
        }
      }}
      onPointerCancel={() => {
        if (mode === 'hold') voiceDictation.cancel()
      }}
      onKeyDown={(event) => {
        if (mode === 'hold' && event.key === ' ' && !event.repeat) {
          event.preventDefault()
          void start()
        }
      }}
      onKeyUp={(event) => {
        if (mode === 'hold' && event.key === ' ') {
          event.preventDefault()
          suppressClick.current = true
          void voiceDictation.stop()
        }
      }}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false
          return
        }
        void voiceDictation.toggle(captureVoiceTarget(getTarget?.()), id)
      }}
    >
      {active && busy ? (
        <LoaderCircle size={15} />
      ) : active && stop ? (
        <Square size={13} />
      ) : (
        <Mic size={15} />
      )}
    </button>
  )
}

interface DesktopVoiceBridge {
  configureVoiceShortcut?: (enabled: boolean, shortcut: string) => Promise<{ ok: boolean; error?: string }>
  onVoiceToggle?: (handler: () => void) => () => void
}

/** Input tracking, shortcuts, and feedback live above all routes. */
export function DictationBridge() {
  const state = useVoiceDictation()
  const settings = useSettingsStore((s) => s.stt)
  const location = useLocation()
  const route = useRef(location.pathname)
  useEffect(() => {
    if (route.current !== location.pathname) {
      voiceDictation.cancel()
      voiceDictation.dismiss()
      route.current = location.pathname
    }
  }, [location.pathname])
  useEffect(() => {
    const remember = () => rememberVoiceTarget()
    document.addEventListener('focusin', remember)
    document.addEventListener('selectionchange', remember)
    document.addEventListener('keyup', remember)
    return () => {
      document.removeEventListener('focusin', remember)
      document.removeEventListener('selectionchange', remember)
      document.removeEventListener('keyup', remember)
    }
  }, [])
  useEffect(() => {
    const matches = (event: KeyboardEvent) =>
      settings.shortcut === 'mod+alt+d'
        ? (event.ctrlKey || event.metaKey) && event.altKey && event.code === 'KeyD'
        : (event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'Space'
    let held = false
    const keydown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        ['listening', 'requesting', 'processing', 'downloading'].includes(voiceDictation.getSnapshot().phase)
      ) {
        voiceDictation.cancel()
        return
      }
      const native = (window as unknown as { elion?: DesktopVoiceBridge }).elion
      if (settings.desktopShortcut && native?.configureVoiceShortcut) return
      if (!settings.enabled || event.repeat || !matches(event)) return
      event.preventDefault()
      if (settings.mode === 'hold') {
        held = true
        void voiceDictation.start()
      } else void voiceDictation.toggle()
    }
    const keyup = (event: KeyboardEvent) => {
      if (
        held &&
        (event.code === 'Space' ||
          event.code === 'KeyD' ||
          event.key === 'Control' ||
          event.key === 'Meta' ||
          event.key === 'Alt' ||
          event.key === 'Shift')
      ) {
        held = false
        void voiceDictation.stop()
      }
    }
    const blur = () => {
      if (held) {
        held = false
        voiceDictation.cancel()
      }
    }
    document.addEventListener('keydown', keydown)
    document.addEventListener('keyup', keyup)
    window.addEventListener('blur', blur)
    return () => {
      document.removeEventListener('keydown', keydown)
      document.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', blur)
    }
  }, [settings.shortcut, settings.mode, settings.enabled])
  useEffect(() => {
    if (!settings.enabled) voiceDictation.cancel()
  }, [settings.enabled])
  useEffect(() => {
    const bridge = (window as unknown as { elion?: DesktopVoiceBridge }).elion
    if (!bridge?.configureVoiceShortcut) return
    // Native hotkey capture is optional and app-focused; the engine remains
    // the shared local WASM backend until a native adapter is shipped.
    const accelerator =
      settings.shortcut === 'mod+alt+d' ? 'CommandOrControl+Alt+D' : 'CommandOrControl+Shift+Space'
    void bridge
      .configureVoiceShortcut(settings.desktopShortcut && settings.enabled, accelerator)
      .then((result) => {
        if (!result.ok)
          useToasts.getState().push(result.error ?? 'Choose another dictation shortcut in Settings.', 'error')
      })
    return bridge.onVoiceToggle?.(() => {
      void voiceDictation.toggle()
    })
  }, [settings.shortcut, settings.desktopShortcut, settings.enabled])
  useEffect(() => {
    if (!['listening', 'requesting', 'processing'].includes(state.phase)) return
    const target = voiceDictation.currentElement()
    if (!target) return
    const observer = new MutationObserver(() => {
      if (!target.isConnected) voiceDictation.cancel()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [state.phase])
  useEffect(() => () => voiceDictation.cancel(), [])
  useEffect(() => {
    if (state.phase !== 'idle' || !state.label) return
    const timer = setTimeout(() => voiceDictation.dismiss(), 5000)
    return () => clearTimeout(timer)
  }, [state.phase, state.label])
  if (state.phase === 'idle' && !state.label) return null
  const recording = state.phase === 'listening' || state.phase === 'requesting'
  const busy = state.phase === 'processing' || state.phase === 'downloading'
  return (
    <div
      className={`dictation-feedback ${state.phase === 'error' ? 'has-error' : ''}`}
      role={state.phase === 'error' ? 'alert' : 'status'}
    >
      <span className="dictation-feedback-icon">
        {state.phase === 'downloading' ? <Download size={18} /> : <Mic size={18} />}
      </span>
      <div>
        <strong>
          {state.error || state.label}
          {state.percent != null && <span className="dictation-percent"> {state.percent}%</span>}
        </strong>
        <span>
          {state.target ? `Into ${state.target}. ` : ''}
          {recording
            ? 'Audio stays on your device. Stop when you’re finished.'
            : busy
              ? 'Working locally. You can cancel at any time.'
              : 'Elion voice dictation'}
        </span>
      </div>
      {recording && (
        <Button size="sm" icon={<Square size={11} />} onClick={() => void voiceDictation.stop()}>
          Stop dictation
        </Button>
      )}
      <IconBtn
        label={recording || busy ? 'Cancel dictation' : 'Dismiss dictation message'}
        onClick={() => (recording || busy ? voiceDictation.cancel() : voiceDictation.dismiss())}
      >
        <X size={15} />
      </IconBtn>
    </div>
  )
}
