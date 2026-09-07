// Speech-to-text — offline, local-first Whisper, adapted from the Handy
// architecture (github.com/cjpais/Handy).
//
// Handy runs whisper.cpp in a Tauri Rust sidecar with Silero VAD. This codebase
// is React/Electron (no native sidecar), so the equivalent is Whisper running
// as WASM/ONNX in the renderer via @xenova/transformers: same model family,
// same privacy posture (audio never leaves the machine; after first download
// the model is cached and everything works offline), plus a light energy-based
// silence trim standing in for Silero VAD.

import { pipeline, env, type AutomaticSpeechRecognitionPipeline } from '@xenova/transformers'

env.allowLocalModels = false
env.useBrowserCache = true

let asrPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null

export type SttModelId = 'Xenova/whisper-tiny' | 'Xenova/whisper-base'

export function loadASR(model: SttModelId): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!asrPromise || (asrPromise as unknown as { model?: string }).model !== model) {
    // Xenova's whisper-* repos ship quantized ONNX weights; q8 is the default.
    asrPromise = pipeline('automatic-speech-recognition', model, {
      progress_callback: () => undefined
    })
    ;(asrPromise as unknown as { model?: string }).model = model
  }
  return asrPromise
}

const TARGET_SR = 16000

export interface Recording {
  stop: () => Promise<Float32Array>
  cancel: () => void
  stream: MediaStream
}

export async function startRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
  })
  const ac = new AudioContext({ sampleRate: TARGET_SR })
  const srcNode = ac.createMediaStreamSource(stream)
  const processor = ac.createScriptProcessor(4096, 1, 1)
  const chunks: Float32Array[] = []
  processor.onaudioprocess = (e) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)))
  }
  srcNode.connect(processor)
  processor.connect(ac.destination)
  let stopped = false
  return {
    stream,
    cancel: () => {
      if (stopped) return
      stopped = true
      stream.getTracks().forEach((t) => t.stop())
      void ac.close()
    },
    stop: async () => {
      if (stopped) return new Float32Array(0)
      stopped = true
      stream.getTracks().forEach((t) => t.stop())
      // give the processor one last tick
      await new Promise((r) => setTimeout(r, 120))
      const total = chunks.reduce((a, c) => a + c.length, 0)
      const all = new Float32Array(total)
      let off = 0
      for (const c of chunks) {
        all.set(c, off)
        off += c.length
      }
      processor.disconnect()
      srcNode.disconnect()
      await ac.close()
      return trimSilence(all, TARGET_SR)
    }
  }
}

/** Energy-gated silence trim (the local stand-in for Handy's Silero VAD). */
export function trimSilence(samples: Float32Array, sr: number): Float32Array {
  if (samples.length === 0) return samples
  const frame = Math.floor(sr * 0.03)
  const threshold = 0.008
  let first = 0
  let last = samples.length
  for (let i = 0; i < samples.length - frame; i += frame) {
    let sum = 0
    for (let j = i; j < i + frame; j++) sum += Math.abs(samples[j])
    const rms = sum / frame
    if (rms > threshold) {
      first = Math.max(0, i - frame * 2)
      break
    }
  }
  for (let i = samples.length - frame; i > 0; i -= frame) {
    let sum = 0
    for (let j = i; j < i + frame; j++) sum += Math.abs(samples[j])
    const rms = sum / frame
    if (rms > threshold) {
      last = Math.min(samples.length, i + frame * 2)
      break
    }
  }
  return samples.slice(first, last)
}

export interface TranscribeProgress {
  status: string
}

export async function transcribe(
  audio: Float32Array,
  model: SttModelId,
  onProgress?: (p: TranscribeProgress) => void
): Promise<string> {
  if (audio.length < sr16(0.25)) return ''
  const asr = await loadASR(model)
  onProgress?.({ status: 'transcribing' })
  const result = (await asr(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: false,
    language: 'en',
    task: 'transcribe'
  })) as { text: string }
  return result.text.trim()
}

function sr16(sec: number): number {
  return TARGET_SR * sec
}

export const sttSupported = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
