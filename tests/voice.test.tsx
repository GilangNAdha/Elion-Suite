import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { VoiceDictationService } from '../src/lib/voice/VoiceDictationService'
import {
  applyDictionary,
  captureVoiceTarget,
  insertTranscript,
  registerDictationEditor
} from '../src/lib/voice/textTarget'
import { resampleAudio } from '../src/lib/voice/recorder'
import { useSettingsStore } from '../src/stores/settingsStore'
import type { VoiceBackend, VoiceOptions } from '../src/lib/voice/types'

const defaults = useSettingsStore.getState().stt
const options: VoiceOptions[] = []
const backend = (): VoiceBackend => ({
  kind: 'wasm',
  prepare: vi.fn(async () => undefined),
  cancel: vi.fn(),
  transcribe: vi.fn(async (_audio, configuration) => {
    options.push(configuration)
    return 'elion in padang'
  })
})
const recording = () => ({ stop: vi.fn(async () => new Float32Array(8000)), cancel: vi.fn() })
beforeEach(() => {
  options.length = 0
  useSettingsStore.setState({ stt: { ...defaults, enabled: true, dictionary: ['Elion', 'Padang'] } })
})
afterEach(() => {
  useSettingsStore.setState({ stt: defaults })
  vi.restoreAllMocks()
})

describe('one shared offline dictation service', () => {
  it('captures until stopped and inserts a dictionary-corrected transcript', async () => {
    const mic = recording(),
      insert = vi.fn(() => true)
    const engine = new VoiceDictationService(backend(), async () => mic)
    await engine.start({ label: 'Task title', insert })
    expect(engine.getSnapshot().phase).toBe('listening')
    expect(mic.stop).not.toHaveBeenCalled()
    await engine.stop()
    expect(insert).toHaveBeenCalledWith('Elion in Padang')
    expect(engine.getSnapshot().label).toBe('Dictation inserted')
  })
  it('uses the same selected model and language for every text surface', async () => {
    const adapter = backend(),
      engine = new VoiceDictationService(adapter, async () => recording())
    for (const surface of ['Editor', 'Note line', 'Task title', 'Habit title', 'Global search']) {
      useSettingsStore.getState().setStt({ model: 'Xenova/whisper-base', language: 'id' })
      await engine.start({ label: surface, insert: () => true })
      await engine.stop()
    }
    expect(options).toHaveLength(5)
    expect(options.every((o) => o.model === 'Xenova/whisper-base' && o.language === 'id')).toBe(true)
    useSettingsStore.getState().setStt({ model: 'Xenova/whisper-small' })
    await engine.start({ label: 'Editor', insert: () => true })
    await engine.stop()
    expect(options.at(-1)?.model).toBe('Xenova/whisper-small')
  })
  it('cancels a late microphone permission response and closes its stream', async () => {
    const mic = recording()
    let resolve!: (value: ReturnType<typeof recording>) => void
    const engine = new VoiceDictationService(
      backend(),
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const pending = engine.start({ label: 'Editor', insert: () => true })
    engine.cancel()
    resolve(mic)
    await pending
    expect(mic.cancel).toHaveBeenCalledOnce()
    expect(engine.getSnapshot().phase).toBe('idle')
  })
  it('never inserts a result received after cancellation', async () => {
    let resolve!: (text: string) => void
    const adapter = backend()
    adapter.transcribe = () =>
      new Promise((done) => {
        resolve = done
      })
    const engine = new VoiceDictationService(adapter, async () => recording())
    const insert = vi.fn(() => true)
    await engine.start({ label: 'Note line', insert })
    const pending = engine.stop()
    await Promise.resolve()
    engine.cancel()
    resolve('late transcript')
    await pending
    expect(insert).not.toHaveBeenCalled()
    expect(adapter.cancel).toHaveBeenCalled()
  })
  it('does not request microphone permission without a valid text target', async () => {
    const request = vi.fn(async () => recording())
    const engine = new VoiceDictationService(backend(), request)
    await engine.start(null)
    expect(request).not.toHaveBeenCalled()
    expect(engine.getSnapshot().error).toContain('Choose a text field')
  })
  it('explains how to fix denied microphone access', async () => {
    const engine = new VoiceDictationService(backend(), async () => {
      throw new DOMException('Denied', 'NotAllowedError')
    })
    await engine.start({ label: 'Search', insert: () => true })
    expect(engine.getSnapshot().phase).toBe('error')
    expect(engine.getSnapshot().error).toContain('enable it in browser or system settings')
  })
  it('rejects insertion into a changed target instead of corrupting another field', async () => {
    const engine = new VoiceDictationService(backend(), async () => recording())
    await engine.start({ label: 'Editor', insert: () => false })
    await engine.stop()
    expect(engine.getSnapshot().error).toContain('text field changed')
  })
})

describe('cursor insertion, dictionary and resampling', () => {
  it('replaces the selected range without merging adjacent words', () => {
    expect(insertTranscript('Hello old world', 6, 9, 'new')).toEqual({ value: 'Hello new world', caret: 9 })
    expect(insertTranscript('HelloWorld', 5, 5, 'quiet')).toEqual({ value: 'Hello quiet World', caret: 12 })
  })
  it('updates a real React-controlled field at its selection', () => {
    function Field() {
      const [value, set] = useState('Write the draft')
      return <input aria-label="Task title" value={value} onChange={(e) => set(e.target.value)} />
    }
    const view = render(<Field />)
    const input = view.getByLabelText('Task title') as HTMLInputElement
    input.focus()
    input.setSelectionRange(10, 15)
    const target = captureVoiceTarget(input)!
    act(() => {
      expect(target.insert('outline')).toBe(true)
    })
    expect(input.value).toBe('Write the outline')
    expect(input.selectionStart).toBe(17)
  })
  it('commits editor insertion through the history adapter, not the clipboard', () => {
    const element = document.createElement('div')
    element.contentEditable = 'true'
    element.textContent = 'A draft'
    element.tabIndex = 0
    Object.defineProperty(element, 'isContentEditable', { value: true })
    document.body.append(element)
    element.focus()
    const range = document.createRange()
    range.setStart(element.firstChild!, 2)
    range.setEnd(element.firstChild!, 7)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    const commit = vi.fn(),
      beforeCapture = vi.fn()
    const unregister = registerDictationEditor(element, { commit, beforeCapture })
    const target = captureVoiceTarget(element)!
    target.insert('plan')
    expect(beforeCapture).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledWith('A plan')
    expect(element.textContent).toBe('A plan')
    unregister()
    element.remove()
  })
  it('escapes dictionary entries and leaves partial word matches alone', () => {
    expect(applyDictionary('elion, preelion, c++ and padang', ['Elion', 'C++', 'Padang'])).toBe(
      'Elion, preelion, C++ and Padang'
    )
  })
  it('normalizes capture rates to the 16 kHz inference contract', () => {
    const samples = new Float32Array(48000).fill(0.1)
    const result = resampleAudio(samples, 48000)
    expect(result).toHaveLength(16000)
    expect(result[200]).toBeCloseTo(0.1)
  })
})
