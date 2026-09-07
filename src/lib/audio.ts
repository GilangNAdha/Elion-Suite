// Audio utilities: UI chimes + procedurally generated soundscape loops.
// Loops are rendered once with OfflineAudioContext (fully offline, no assets),
// then played through Howler with independent volume per layer (§8.2).

let ctx: AudioContext | null = null
function audioCtx(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function playChime(kind: 'reminder' | 'transition' | 'break'): void {
  try {
    const ac = audioCtx()
    const now = ac.currentTime
    const freqs =
      kind === 'reminder' ? [660, 880] : kind === 'break' ? [523, 659, 784] : [784, 988]
    freqs.forEach((f, i) => {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      const t = now + i * 0.18
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.16, t + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
      osc.connect(gain).connect(ac.destination)
      osc.start(t)
      osc.stop(t + 0.55)
    })
  } catch {
    /* audio unavailable */
  }
}

export type SoundscapeLayerId = 'rain' | 'fire' | 'white' | 'cafe' | 'wind'

export const SOUNDSCAPE_LAYERS: Record<SoundscapeLayerId, string> = {
  rain: 'Rain',
  fire: 'Fire crackle',
  white: 'White noise',
  cafe: 'Café hum',
  wind: 'Wind'
}

const LOOP_SECONDS = 6
const SR = 16000

function mulberry(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeNoise(rand: () => number): Float32Array {
  const n = SR * LOOP_SECONDS
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = rand() * 2 - 1
  return out
}

function lowpass(buf: Float32Array, cutoff: number): Float32Array {
  const out = new Float32Array(buf.length)
  const rc = 1 / (2 * Math.PI * cutoff)
  const dt = 1 / SR
  const alpha = dt / (rc + dt)
  let y = 0
  for (let i = 0; i < buf.length; i++) y += alpha * (buf[i] - y)
  out[0] = y
  for (let i = 1; i < buf.length; i++) {
    y += alpha * (buf[i] - y)
    out[i] = y
  }
  return out
}

function normalize(buf: Float32Array, peak: number): Float32Array {
  let max = 0
  for (let i = 0; i < buf.length; i++) max = Math.max(max, Math.abs(buf[i]))
  const k = max > 0 ? peak / max : 1
  const out = new Float32Array(buf.length)
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] * k
  return out
}

function fadeEnds(buf: Float32Array, ms: number): Float32Array {
  const n = Math.floor((ms / 1000) * SR)
  const out = new Float32Array(buf)
  for (let i = 0; i < n && i < out.length; i++) out[i] *= i / n
  for (let i = 0; i < n && i < out.length; i++) out[out.length - 1 - i] *= i / n
  return out
}

function render(layer: SoundscapeLayerId): Float32Array {
  const n = SR * LOOP_SECONDS
  const rand = mulberry(layer.length * 7919 + 13)
  const noise = makeNoise(rand)
  let out: Float32Array
  switch (layer) {
    case 'white':
      out = normalize(noise, 0.25)
      break
    case 'rain': {
      const base = lowpass(noise, 1800)
      // random raindrops
      for (let i = 0; i < n; i += SR / 4) {
        if (rand() < 0.3) {
          const amp = 0.05 + rand() * 0.12
          const len = SR / 30
          const start = i + Math.floor(rand() * (SR / 4))
          for (let j = 0; j < len && start + j < n; j++) {
            const env = Math.sin((Math.PI * j) / len)
            base[start + j] += (rand() * 2 - 1) * amp * env
          }
        }
      }
      out = normalize(base, 0.5)
      break
    }
    case 'fire': {
      const base = lowpass(noise, 900)
      // crackle pops
      for (let i = 0; i < n; i += SR / 8) {
        if (rand() < 0.12) {
          const amp = 0.15 + rand() * 0.3
          const len = SR / 60
          const start = i + Math.floor(rand() * (SR / 8))
          for (let j = 0; j < len && start + j < n; j++) {
            const env = Math.exp(-j / (SR / 240))
            base[start + j] += (rand() * 2 - 1) * amp * env
          }
        }
      }
      out = normalize(base, 0.55)
      break
    }
    case 'cafe': {
      const hum = lowpass(noise, 400)
      // speech-like murmur: amplitude modulated
      const murmur = new Float32Array(n)
      let lfo = 0
      for (let i = 0; i < n; i++) {
        lfo += (noise[i] * 0.0004) * 3
        const env = 0.35 + 0.3 * Math.sin(lfo * 2 * Math.PI)
        murmur[i] = noise[i] * env
      }
      const mid = lowpass(murmur, 1200)
      out = new Float32Array(n)
      for (let i = 0; i < n; i++) out[i] = hum[i] * 0.7 + mid[i] * 0.5
      out = normalize(out, 0.5)
      break
    }
    case 'wind': {
      const filtered = lowpass(noise, 500)
      const out2 = new Float32Array(n)
      let phase = 0
      for (let i = 0; i < n; i++) {
        phase += 0.0009 + 0.0006 * Math.sin(i / (SR * 1.7))
        const env = 0.5 + 0.5 * Math.sin(phase)
        out2[i] = filtered[i] * (0.4 + 0.6 * env)
      }
      out = normalize(out2, 0.6)
      break
    }
  }
  return fadeEnds(out, 120)
}

const loopCache = new Map<SoundscapeLayerId, string>()

export function soundscapeLoopUrl(layer: SoundscapeLayerId): string {
  let url = loopCache.get(layer)
  if (!url) {
    const samples = render(layer)
    // encode 16-bit PCM WAV
    const n = samples.length
    const buffer = new ArrayBuffer(44 + n * 2)
    const view = new DataView(buffer)
    const writeStr = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i))
    }
    writeStr(0, 'RIFF')
    view.setUint32(4, 36 + n * 2, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, SR, true)
    view.setUint32(28, SR * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeStr(36, 'data')
    view.setUint32(40, n * 2, true)
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    }
    url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
    loopCache.set(layer, url)
  }
  return url
}
