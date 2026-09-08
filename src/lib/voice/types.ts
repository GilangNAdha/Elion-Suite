export type VoiceModel = 'Xenova/whisper-tiny' | 'Xenova/whisper-base' | 'Xenova/whisper-small'
export interface VoiceOptions {
  model: VoiceModel
  language: string
  dictionary: string[]
}
export type VoicePhase = 'idle' | 'requesting' | 'listening' | 'processing' | 'downloading' | 'error'
export interface VoiceProgress {
  label: string
  percent?: number
}
export interface VoiceBackend {
  readonly kind: 'wasm' | 'native'
  prepare(options: VoiceOptions, progress: (p: VoiceProgress) => void): Promise<void>
  transcribe(
    audio: Float32Array,
    options: VoiceOptions,
    progress: (p: VoiceProgress) => void
  ): Promise<string>
  cancel(): void
}
export interface VoiceTarget {
  label: string
  element?: HTMLElement
  insert: (text: string) => boolean
}
export interface VoiceSnapshot {
  phase: VoicePhase
  label: string
  percent?: number
  target: string | null
  origin: string | null
  error: string | null
}
