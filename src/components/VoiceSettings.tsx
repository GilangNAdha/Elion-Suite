import { Download, Mic } from 'lucide-react'
import { useSettingsStore } from '../stores/settingsStore'
import { voiceDictation, useVoiceDictation } from '../lib/voice/VoiceDictationService'
import type { VoiceModel } from '../lib/voice/types'
import { Button, Select, Textarea, Toggle } from './ui'

export function VoiceSettings() {
  const settings = useSettingsStore((s) => s.stt)
  const set = useSettingsStore((s) => s.setStt)
  const voice = useVoiceDictation()
  const busy = !['idle', 'error'].includes(voice.phase)
  const desktop = !!(window as unknown as { elion?: { isElectron?: boolean } }).elion?.isElectron
  return (
    <div className="voice-settings">
      <Toggle
        label="Enable dictation"
        hint="One local speech service for your editor, notes, task and habit titles, and search."
        checked={settings.enabled}
        onChange={(enabled) => set({ enabled })}
      />
      <div className="voice-settings-grid">
        <label>
          <span>Speech model</span>
          <Select
            value={settings.model}
            disabled={busy}
            aria-label="STT model"
            onChange={(e) => set({ model: e.target.value as VoiceModel })}
          >
            <option value="Xenova/whisper-tiny">Whisper Tiny — fastest</option>
            <option value="Xenova/whisper-base">Whisper Base — balanced</option>
            <option value="Xenova/whisper-small">Whisper Small — higher accuracy, slower</option>
          </Select>
        </label>
        <label>
          <span>Language</span>
          <Select
            value={settings.language}
            aria-label="Dictation language"
            onChange={(e) => set({ language: e.target.value })}
          >
            <option value="auto">Detect language</option>
            <option value="en">English</option>
            <option value="id">Indonesian</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="ja">Japanese</option>
            <option value="de">German</option>
          </Select>
        </label>
        <label>
          <span>Microphone control</span>
          <Select
            value={settings.mode}
            aria-label="Dictation activation"
            onChange={(e) => set({ mode: e.target.value as 'toggle' | 'hold' })}
          >
            <option value="toggle">Click to start and stop</option>
            <option value="hold">Hold to talk</option>
          </Select>
        </label>
        <label>
          <span>In-app keyboard shortcut</span>
          <Select
            value={settings.shortcut}
            aria-label="Dictation shortcut"
            onChange={(e) => set({ shortcut: e.target.value as typeof settings.shortcut })}
          >
            <option value="mod+shift+space">Ctrl / Cmd + Shift + Space</option>
            <option value="mod+alt+d">Ctrl / Cmd + Alt + D</option>
          </Select>
        </label>
      </div>
      <label className="dictionary-field">
        <span>Custom spelling dictionary</span>
        <Textarea
          value={settings.dictionary.join('\n')}
          aria-label="Custom dictation dictionary"
          rows={3}
          placeholder="Elion\nGilang\nPadang"
          onChange={(e) => set({ dictionary: e.target.value.split('\n').slice(0, 100) })}
        />
        <small>
          One name or phrase per line. Matching phrases are corrected after transcription; this is not
          acoustic model training.
        </small>
      </label>
      {desktop && (
        <Toggle
          label="Register desktop dictation shortcut"
          checked={settings.desktopShortcut}
          onChange={(desktopShortcut) => set({ desktopShortcut })}
          hint="Optional Electron hotkey, active only while Elion is focused. The desktop hotkey uses toggle mode."
        />
      )}
      <div className="offline-model-action">
        <Button icon={<Download size={14} />} disabled={busy} onClick={() => void voiceDictation.prepare()}>
          Prepare offline model
        </Button>
        <span>Download once. Transcribe locally afterwards.</span>
      </div>
      <p className="voice-privacy">
        Silero VAD removes silence before Whisper runs in a dedicated Web Worker. Audio and transcripts are
        never uploaded. The initial model download requires a connection and can be large; allow extra time
        for Small.
      </p>
      <p className="voice-capability-note">
        This build uses CPU-based WASM in both web and Electron. Native GPU inference, Medium / Large / Turbo,
        and Parakeet are not installed. Browser shortcuts work only while Elion is focused; model files are
        cached by the browser and can be evicted if device storage runs low.
      </p>
    </div>
  )
}
