/// <reference lib="webworker" />
import {
  pipeline,
  env as transformersEnv,
  type AutomaticSpeechRecognitionPipeline
} from '@xenova/transformers'
import { InferenceSession, Tensor, env as ortEnv } from 'onnxruntime-web'
import wasmUrl from 'onnxruntime-web/dist/ort-wasm.wasm?url'
import simdUrl from 'onnxruntime-web/dist/ort-wasm-simd.wasm?url'
import type { VoiceOptions, VoiceProgress } from './types'

// No runtime CDN dependency; WASM is served with the app and precached by PWA.
const wasmPaths = { 'ort-wasm.wasm': wasmUrl, 'ort-wasm-simd.wasm': simdUrl }
ortEnv.wasm.wasmPaths = wasmPaths
ortEnv.wasm.numThreads = 1
transformersEnv.allowLocalModels = false
transformersEnv.useBrowserCache = true
transformersEnv.backends.onnx.wasm.wasmPaths = wasmPaths
transformersEnv.backends.onnx.wasm.numThreads = 1

let vad: Promise<InferenceSession> | null = null
let recognizer: AutomaticSpeechRecognitionPipeline | null = null
let loadedModel: string | null = null
let busy = false

async function loadVad(url: string) {
  if (!vad)
    vad = InferenceSession.create(url, { executionProviders: ['wasm'], logSeverityLevel: 3 }).catch(
      (error) => {
        vad = null
        throw error
      }
    )
  return vad
}

/** Silero's 16 kHz, 512-sample input, 64-sample context, recurrent state.
 * Trims speech bounds with padding, rejecting silence before ASR is loaded. */
async function trimSpeech(audio: Float32Array, vadUrl: string) {
  if (audio.length < 4000) return new Float32Array()
  let max = 0
  for (let i = 0; i < audio.length; i++) max = Math.max(max, Math.abs(audio[i]))
  if (max < 0.0001) return new Float32Array() // digital silence; no model needed
  const session = await loadVad(vadUrl)
  let state: Tensor = new Tensor('float32', new Float32Array(256), [2, 1, 128])
  let context = new Float32Array(64)
  let first = -1,
    last = 0,
    speechFrames = 0
  const sr = new Tensor('int64', BigInt64Array.from([16000n]), [])
  for (let offset = 0; offset < audio.length; offset += 512) {
    const window = new Float32Array(576)
    window.set(context)
    window.set(audio.subarray(offset, Math.min(offset + 512, audio.length)), 64)
    const feeds: Record<string, Tensor> = { input: new Tensor('float32', window, [1, 576]), state }
    if (session.inputNames.includes('sr')) feeds.sr = sr
    const output = await session.run(feeds)
    const probability = Number(output.output.data[0])
    state = output.stateN ?? output.state
    context = window.slice(-64)
    if (probability >= 0.5) {
      if (first < 0) first = offset
      last = offset + 512
      speechFrames++
    }
  }
  if (first < 0 || speechFrames < 3) return new Float32Array()
  return audio.slice(Math.max(0, first - 2560), Math.min(audio.length, last + 2560))
}

async function loadRecognizer(options: VoiceOptions, progress: (p: VoiceProgress) => void) {
  if (recognizer && loadedModel === options.model) return recognizer
  if (recognizer) await recognizer.dispose()
  recognizer = null
  loadedModel = null
  progress({ label: 'Preparing offline speech model' })
  const next = await pipeline('automatic-speech-recognition', options.model, {
    quantized: true,
    progress_callback: (event: { status: string; progress?: number; file?: string }) => {
      if (event.status === 'progress')
        progress({ label: 'Downloading speech model', percent: Math.round(event.progress ?? 0) })
    }
  })
  recognizer = next
  loadedModel = options.model
  return next
}

self.onmessage = async (
  event: MessageEvent<{
    id: number
    kind: 'prepare' | 'transcribe' | 'vad'
    audio?: Float32Array
    options: VoiceOptions
    vadUrl: string
  }>
) => {
  const { id, kind, audio, options, vadUrl } = event.data
  if (busy) {
    self.postMessage({
      id,
      kind: 'error',
      error: 'Another recording is processing. Wait or cancel it first.'
    })
    return
  }
  busy = true
  const progress = (value: VoiceProgress) => self.postMessage({ id, kind: 'progress', progress: value })
  try {
    if (kind === 'prepare') {
      await loadVad(vadUrl)
      await loadRecognizer(options, progress)
      self.postMessage({ id, kind: 'result', text: '' })
    } else {
      progress({ label: 'Finding speech with Silero VAD' })
      const trimmed = await trimSpeech(audio ?? new Float32Array(), vadUrl)
      if (kind === 'vad') self.postMessage({ id, kind: 'result', samples: trimmed.length })
      else if (!trimmed.length) self.postMessage({ id, kind: 'result', text: '' })
      else {
        const asr = await loadRecognizer(options, progress)
        progress({ label: 'Transcribing on this device' })
        const result = (await asr(trimmed, {
          chunk_length_s: 30,
          stride_length_s: 5,
          return_timestamps: false,
          task: 'transcribe',
          ...(options.language !== 'auto' ? { language: options.language } : {})
        })) as { text: string }
        self.postMessage({ id, kind: 'result', text: result.text.trim() })
      }
    }
  } catch (error) {
    self.postMessage({ id, kind: 'error', error: error instanceof Error ? error.message : String(error) })
  } finally {
    busy = false
  }
}
