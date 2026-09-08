import { useSyncExternalStore } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { recordVoice, type VoiceRecording } from './recorder'
import { WorkerVoiceBackend } from './WorkerVoiceBackend'
import { applyDictionary, captureVoiceTarget } from './textTarget'
import type { VoiceBackend, VoiceOptions, VoiceSnapshot, VoiceTarget } from './types'

const idle: VoiceSnapshot = { phase: 'idle', label: '', target: null, origin: null, error: null }
const errorCopy = (error: unknown) => {
  if (error instanceof DOMException && ['NotAllowedError', 'SecurityError'].includes(error.name))
    return 'Microphone access is off — enable it in browser or system settings to use dictation.'
  if (error instanceof DOMException && error.name === 'NotFoundError')
    return 'No microphone was found — connect one and try again.'
  const message = error instanceof Error ? error.message : String(error)
  if (/fetch|network|download|external data|failed to load/i.test(message))
    return 'The speech model is not available offline yet — connect to the internet, then choose Prepare offline model in Settings.'
  return message || 'Dictation stopped — check your microphone and try again.'
}

/** One engine and one capture owner for all Elion text-entry surfaces.
 * Native implementations can satisfy VoiceBackend; this build ships WASM.
 * A generation token prevents insertion after cancel, unmount, or navigation. */
export class VoiceDictationService {
  private snapshot: VoiceSnapshot = idle
  private listeners = new Set<() => void>()
  private recording: VoiceRecording | null = null
  private target: VoiceTarget | null = null
  private generation = 0
  private options: VoiceOptions | null = null
  private maxDuration: ReturnType<typeof setTimeout> | undefined
  constructor(
    private backend: VoiceBackend = new WorkerVoiceBackend(),
    private recorder = recordVoice
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  getSnapshot = () => this.snapshot
  currentElement = () => this.target?.element ?? null
  private set(patch: Partial<VoiceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((listener) => listener())
  }
  private settings(): VoiceOptions {
    const stt = useSettingsStore.getState().stt
    return { model: stt.model, language: stt.language ?? 'en', dictionary: stt.dictionary ?? [] }
  }
  async start(target: VoiceTarget | null = captureVoiceTarget(), origin = 'global') {
    if (!['idle', 'error'].includes(this.snapshot.phase)) return
    if (!useSettingsStore.getState().stt.enabled) {
      this.set({ phase: 'error', error: 'Dictation is off — enable it in Settings to use the microphone.' })
      return
    }
    if (!target) {
      this.set({
        phase: 'error',
        error: 'Choose a text field or place your cursor in a block, then start dictation.'
      })
      return
    }
    const generation = ++this.generation
    this.target = target
    this.options = this.settings()
    this.set({
      phase: 'requesting',
      label: 'Waiting for microphone permission',
      target: target.label,
      origin,
      error: null,
      percent: undefined
    })
    try {
      const recording = await this.recorder()
      if (generation !== this.generation) {
        recording.cancel()
        return
      }
      this.recording = recording
      this.set({ phase: 'listening', label: 'Listening on this device' })
      this.maxDuration = setTimeout(() => void this.stop(), 120000)
    } catch (error) {
      if (generation === this.generation)
        this.set({ phase: 'error', error: errorCopy(error), label: 'Microphone unavailable' })
    }
  }
  async stop() {
    if (this.snapshot.phase === 'requesting') {
      this.cancel()
      return
    }
    if (!this.recording || this.snapshot.phase !== 'listening' || !this.options) return
    const generation = this.generation
    const target = this.target,
      options = this.options,
      recording = this.recording
    this.recording = null
    clearTimeout(this.maxDuration)
    this.set({ phase: 'processing', label: 'Preparing audio', percent: undefined })
    try {
      const audio = await recording.stop()
      if (generation !== this.generation) return
      const text = await this.backend.transcribe(audio, options, (progress) => {
        if (generation === this.generation) this.set({ label: progress.label, percent: progress.percent })
      })
      if (generation !== this.generation) return
      const corrected = applyDictionary(text, options.dictionary)
      if (corrected && !target?.insert(corrected))
        throw new Error('The text field changed while dictating — place your cursor again and retry.')
      this.target = null
      this.set({
        ...idle,
        label: corrected
          ? 'Dictation inserted'
          : 'No speech detected — try speaking a little closer to the microphone.'
      })
    } catch (error) {
      if (generation === this.generation)
        this.set({ phase: 'error', error: errorCopy(error), label: 'Dictation stopped', percent: undefined })
    }
  }
  toggle(target?: VoiceTarget | null, origin = 'global') {
    return this.snapshot.phase === 'listening' || this.snapshot.phase === 'requesting'
      ? this.stop()
      : this.start(target, origin)
  }
  cancel() {
    this.generation++
    clearTimeout(this.maxDuration)
    this.recording?.cancel()
    this.recording = null
    this.backend.cancel()
    this.target = null
    this.set({ ...idle, label: 'Dictation cancelled' })
  }
  dismiss() {
    if (['idle', 'error'].includes(this.snapshot.phase)) this.set(idle)
  }
  async prepare() {
    if (!['idle', 'error'].includes(this.snapshot.phase)) return
    const generation = ++this.generation
    this.set({
      phase: 'downloading',
      label: 'Preparing offline model',
      error: null,
      target: null,
      percent: undefined
    })
    try {
      await this.backend.prepare(this.settings(), (progress) => {
        if (generation === this.generation) this.set({ label: progress.label, percent: progress.percent })
      })
      if (generation === this.generation) this.set({ ...idle, label: 'Offline model prepared' })
    } catch (error) {
      if (generation === this.generation)
        this.set({ phase: 'error', error: errorCopy(error), percent: undefined })
    }
  }
}
export const voiceDictation = new VoiceDictationService()
export function useVoiceDictation() {
  return useSyncExternalStore(
    voiceDictation.subscribe,
    voiceDictation.getSnapshot,
    voiceDictation.getSnapshot
  )
}
