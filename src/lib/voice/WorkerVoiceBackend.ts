import { assetUrl } from '../assets'
import type { VoiceBackend, VoiceOptions, VoiceProgress } from './types'

export class WorkerVoiceBackend implements VoiceBackend {
  readonly kind = 'wasm' as const
  private worker: Worker | null = null
  private sequence = 0
  private pending: {
    id: number
    resolve: (text: string) => void
    reject: (error: Error) => void
    progress: (p: VoiceProgress) => void
  } | null = null
  private getWorker() {
    if (this.worker) return this.worker
    const worker = new Worker(new URL('./voice.worker.ts', import.meta.url), {
      type: 'module',
      name: 'Elion offline dictation'
    })
    worker.onmessage = (
      event: MessageEvent<{
        id: number
        kind: string
        text?: string
        error?: string
        progress?: VoiceProgress
      }>
    ) => {
      const pending = this.pending
      if (!pending || event.data.id !== pending.id) return
      if (event.data.kind === 'progress' && event.data.progress) pending.progress(event.data.progress)
      else {
        this.pending = null
        if (event.data.kind === 'error') pending.reject(new Error(event.data.error))
        else pending.resolve(event.data.text ?? '')
      }
    }
    worker.onerror = () => {
      this.pending?.reject(new Error('The offline speech worker could not start. Reload Elion and retry.'))
      this.pending = null
      worker.terminate()
      this.worker = null
    }
    this.worker = worker
    return worker
  }
  private request(
    kind: 'prepare' | 'transcribe',
    options: VoiceOptions,
    progress: (p: VoiceProgress) => void,
    audio?: Float32Array
  ) {
    if (this.pending) return Promise.reject(new Error('Another dictation is already processing.'))
    const id = ++this.sequence
    return new Promise<string>((resolve, reject) => {
      this.pending = { id, resolve, reject, progress }
      const vadUrl = assetUrl('models/silero-vad-16k.onnx')
      try {
        this.getWorker().postMessage({ id, kind, options, vadUrl, audio }, audio ? [audio.buffer] : [])
      } catch (error) {
        this.pending = null
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }
  async prepare(options: VoiceOptions, progress: (p: VoiceProgress) => void) {
    await this.request('prepare', options, progress)
  }
  transcribe(audio: Float32Array, options: VoiceOptions, progress: (p: VoiceProgress) => void) {
    return this.request('transcribe', options, progress, audio)
  }
  cancel() {
    this.pending?.reject(new DOMException('Dictation cancelled', 'AbortError'))
    this.pending = null
    this.worker?.terminate()
    this.worker = null
  }
}
