import { beforeEach, describe, expect, it, vi } from 'vitest'
const { request, stream } = vi.hoisted(() => ({ request: vi.fn(), stream: vi.fn() }))
vi.mock('../src/lib/minicpm', () => ({ miniCpmRequest: request, streamMiniCpm: stream }))
import { useCompanionStore } from '../src/stores/companionStore'

beforeEach(() => {
  useCompanionStore.getState().setPinned(false)
  useCompanionStore.setState({
    connection: 'disconnected',
    health: null,
    messages: [],
    error: null,
    activity: 'idle',
    shareContext: false,
    pinned: true,
    animations: true,
    resting: false,
    reaction: null,
    controlsOpen: false,
    open: false
  })
  request.mockReset()
  stream.mockReset()
})
describe('local companion state and privacy boundaries', () => {
  it('requires a live loaded model, not just an HTTP 200 gateway', async () => {
    request.mockResolvedValue({ ok: true, alive: false, model_name: null })
    await useCompanionStore.getState().connect()
    expect(useCompanionStore.getState().connection).toBe('setup')
    request.mockResolvedValue({
      ok: true,
      alive: true,
      model_name: 'MiniCPM5.gguf',
      llama_server: { status: 'ok' }
    })
    await useCompanionStore.getState().connect()
    expect(useCompanionStore.getState().connection).toBe('ready')
  })
  it('never fabricates a chat reply when disconnected', async () => {
    await useCompanionStore.getState().send('Help me focus')
    expect(stream).not.toHaveBeenCalled()
    expect(useCompanionStore.getState().messages).toEqual([])
  })
  it('streams real gateway deltas and omits work context by default', async () => {
    useCompanionStore.setState({ connection: 'ready' })
    stream.mockImplementation(async (body, callback) => {
      callback({ event: 'start' })
      callback({ event: 'delta', content: 'One step.' })
      callback({ event: 'end' })
    })
    await useCompanionStore.getState().send('Help me focus', 'Private project title')
    expect(stream.mock.calls[0][0].system).not.toContain('Private project title')
    expect(stream.mock.calls[0][0]).toMatchObject({ stream: true, silent: true, thinking: false })
    expect(useCompanionStore.getState().messages.at(-1)?.content).toBe('One step.')
    expect(useCompanionStore.getState().activity).toBe('idle')
  })
  it('sends limited context only after explicit opt-in', async () => {
    useCompanionStore.setState({ connection: 'ready', shareContext: true })
    stream.mockImplementation(async (_body, callback) => callback({ event: 'end' }))
    await useCompanionStore.getState().send('Help me plan', 'Shared objective')
    expect(stream.mock.calls[0][0].system).toContain('Shared objective')
  })
  it('cancels generation and marks partial output as stopped', async () => {
    useCompanionStore.setState({ connection: 'ready' })
    stream.mockImplementation(
      (_body, callback, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          callback({ event: 'delta', content: 'Partial' })
          signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')))
        })
    )
    const pending = useCompanionStore.getState().send('Question')
    useCompanionStore.getState().cancel()
    await pending
    expect(useCompanionStore.getState().activity).toBe('idle')
    expect(useCompanionStore.getState().messages.at(-1)?.interrupted).toBe(true)
  })
  it('does not persist conversation content in preferences', async () => {
    useCompanionStore.setState({
      messages: [{ id: 'secret', role: 'user', content: 'Private message', at: '' }]
    })
    expect(localStorage.getItem('elion-companion')).not.toContain('Private message')
  })
})

it('disabling the pet closes its controls and cancels an active reply', async () => {
  let signal: AbortSignal | undefined
  useCompanionStore.setState({ connection: 'ready', open: true, controlsOpen: true })
  stream.mockImplementation(
    (_body, _callback, requestSignal: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal = requestSignal
        requestSignal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')))
      })
  )
  const pending = useCompanionStore.getState().send('A question')
  useCompanionStore.getState().setPinned(false)
  await pending
  // Sejak retrieval memori jadi async, pembatalan bisa terjadi SEBELUM stream
  // dimulai — yang penting reply berhenti dan ditandai, signal (kalau sempat
  // dibuat) harus ikut ter-abort.
  const last = useCompanionStore.getState().messages.at(-1)
  expect(last?.interrupted).toBe(true)
  if (signal) expect(signal.aborted).toBe(true)
  expect(useCompanionStore.getState()).toMatchObject({
    pinned: false,
    open: false,
    controlsOpen: false,
    activity: 'idle',
    reaction: null
  })
  useCompanionStore.getState().setOpen(true)
  useCompanionStore.getState().setControlsOpen(true)
  expect(useCompanionStore.getState()).toMatchObject({ open: false, controlsOpen: false })
})

it('pat, wave and sleep work without invoking an AI model', () => {
  useCompanionStore.getState().interact('pat')
  expect(useCompanionStore.getState().reaction?.pose).toBe('happy')
  useCompanionStore.getState().setResting(true)
  expect(useCompanionStore.getState()).toMatchObject({ resting: true, reaction: null })
  useCompanionStore.getState().setResting(false)
  expect(useCompanionStore.getState()).toMatchObject({ resting: false, reaction: { pose: 'wave' } })
  expect(request).not.toHaveBeenCalled()
  expect(stream).not.toHaveBeenCalled()
  useCompanionStore.getState().setPinned(false)
})

it('persists activation and animation choices, not temporary interaction state', () => {
  useCompanionStore.getState().interact('wave')
  useCompanionStore.getState().setControlsOpen(true)
  useCompanionStore.getState().setAnimations(false)
  const saved = JSON.parse(localStorage.getItem('elion-companion')!).state
  expect(saved).toMatchObject({ pinned: true, animations: false })
  expect(saved).not.toHaveProperty('reaction')
  expect(saved).not.toHaveProperty('controlsOpen')
  useCompanionStore.getState().setPinned(false)
})
