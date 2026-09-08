export const VOICE_SAMPLE_RATE = 16000
export interface VoiceRecording {
  stop: () => Promise<Float32Array>
  cancel: () => void
}

export function resampleAudio(samples: Float32Array, fromRate: number, toRate = VOICE_SAMPLE_RATE) {
  if (fromRate === toRate) return samples
  const result = new Float32Array(Math.floor((samples.length * toRate) / fromRate))
  const ratio = fromRate / toRate
  for (let i = 0; i < result.length; i++) {
    const at = i * ratio,
      floor = Math.floor(at),
      fraction = at - floor
    result[i] = (samples[floor] ?? 0) * (1 - fraction) + (samples[floor + 1] ?? 0) * fraction
  }
  return result
}

/** Capture only. Silero VAD and transcription run in the worker after stop. */
export async function recordVoice(): Promise<VoiceRecording> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error(
      'Microphone access needs a secure browser connection. Open Elion over HTTPS or in the desktop app.'
    )
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
  })
  let context: AudioContext | undefined
  let source: MediaStreamAudioSourceNode | undefined
  let processor: ScriptProcessorNode | undefined
  const chunks: Float32Array[] = []
  let stopped = false
  const cleanup = () => {
    stream.getTracks().forEach((track) => track.stop())
    if (processor) {
      processor.onaudioprocess = null
      processor.disconnect()
    }
    source?.disconnect()
    if (context && context.state !== 'closed') void context.close()
  }
  try {
    context = new AudioContext({ sampleRate: VOICE_SAMPLE_RATE })
    await context.resume()
    source = context.createMediaStreamSource(stream)
    // Kept for compatibility with the existing Electron/web targets. The
    // expensive neural stages do not run in this audio callback.
    processor = context.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (event) => {
      if (!stopped) chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)))
      event.outputBuffer.getChannelData(0).fill(0) // no microphone monitoring / feedback
    }
    source.connect(processor)
    processor.connect(context.destination)
    const sampleRate = context.sampleRate
    return {
      cancel: () => {
        if (!stopped) {
          stopped = true
          cleanup()
        }
      },
      stop: async () => {
        if (stopped) return new Float32Array()
        stopped = true
        cleanup()
        const all = new Float32Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
        let offset = 0
        for (const chunk of chunks) {
          all.set(chunk, offset)
          offset += chunk.length
        }
        return resampleAudio(all, sampleRate)
      }
    }
  } catch (error) {
    cleanup()
    throw error
  }
}
