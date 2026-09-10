import { create } from 'zustand'
import { providerPreset, streamChatCompletion, type ChatTurn } from '../lib/aiProviders'
import { AGENT_SYSTEM_SUFFIX, runAgentTurn, type AgentToolCall } from '../lib/agentChat'
import { buildMemoryContext, captureFromUserText, reinforce } from '../lib/memory'
import { userActivityEnd, userActivityStart } from '../lib/agentRuntime'
import { aiIsConfigured, effectivePersona, useAiStore } from './aiStore'
import { appendSessionMessage, clearSession, loadLatestSession } from '../lib/agentSessions'

/**
 * Agent chat (/elion) — Elion sebagai agent tool-capable, BUKAN chat biasa.
 * Provider function-calling (OpenAI-compatible / Anthropic) → giliran agent
 * penuh: model boleh memanggil tool terdaftar, dieksekusi nyata via runTool().
 * MiniCPM/gateway lokal tanpa function calling → fallback chat biasa yang
 * JUJUR (flag plainFallback tampil di UI, tidak pura-pura memakai tool).
 */

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  at: string
  toolCalls: AgentToolCall[]
  interrupted?: boolean
}

interface AgentChatState {
  messages: AgentMessage[]
  busy: boolean
  /** nama tool yang sedang dieksekusi — untuk indikator §11 */
  activeTool: string | null
  error: string | null
  plainFallback: boolean
  /** sesi persisten — chat selamat dari refresh */
  sessionId: string
  send: (text: string) => void
  cancel: () => void
  clear: () => void
}

let activeRequest: AbortController | null = null

export const useAgentChatStore = create<AgentChatState>()((set, get) => ({
  messages: [],
  busy: false,
  activeTool: null,
  error: null,
  plainFallback: false,
  sessionId: '',
  send: (text) => {
    const prompt = text.trim().slice(0, 4000)
    if (!prompt || activeRequest) return
    // §7/§25: instruksi user = prioritas 1 — tahan antrean autonomous.
    userActivityStart()
    const ai = useAiStore.getState()
    const preset = providerPreset(ai.settings.providerId)
    if (!aiIsConfigured(ai.settings)) {
      set({ error: 'Set the AI provider, key and model in Settings › AI assistant first.' })
      userActivityEnd()
      return
    }
    const agentCapable = preset.api !== 'minicpm'
    const user: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      at: new Date().toISOString(),
      toolCalls: []
    }
    const assistant: AgentMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      at: new Date().toISOString(),
      toolCalls: []
    }
    const previous = get().messages.filter((m) => m.content.trim() && !m.interrupted).slice(-12)
    const controller = new AbortController()
    activeRequest = controller
    // Sesi persisten: lanjutkan sesi terakhir, atau buka yang baru.
    const sessionId = get().sessionId || crypto.randomUUID()
    set({ messages: [...previous, user, assistant], busy: true, error: null, plainFallback: !agentCapable, sessionId })
    void appendSessionMessage(sessionId, { ...user, toolCalls: [] }).catch(() => undefined)
    const history: ChatTurn[] = [...previous, user].map(({ role, content }) => ({ role, content }))
    const patchAssistant = (patch: (m: AgentMessage) => AgentMessage) =>
      set((state) => ({
        messages: state.messages.map((m) => (m.id === assistant.id ? patch(m) : m))
      }))
    void (async () => {
      let memBlock = ''
      try {
        const mem = await buildMemoryContext(prompt)
        memBlock = mem.block
        void captureFromUserText(prompt).catch(() => undefined)
        if (mem.ids.length) void reinforce(mem.ids).catch(() => undefined)
      } catch {
        /* memory offline — chat tetap jalan */
      }
      const system = `${effectivePersona(ai.settings)}\n${AGENT_SYSTEM_SUFFIX}${memBlock}`
      try {
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        if (!agentCapable) {
          await streamChatCompletion(preset.api, ai.settings, system, history, (chunk) =>
            patchAssistant((m) => ({ ...m, content: (m.content + chunk).slice(0, 20000) }))
          , controller.signal)
        } else {
          await runAgentTurn({
            api: preset.api,
            cfg: ai.settings,
            system,
            history,
            signal: controller.signal,
            onEvent: (event) => {
              if (controller.signal.aborted) return
              if (event.type === 'text')
                patchAssistant((m) => ({ ...m, content: (m.content + event.text).slice(0, 20000) }))
              else if (event.type === 'tool-start') set({ activeTool: event.name })
              else if (event.type === 'tool-done') {
                patchAssistant((m) => ({ ...m, toolCalls: [...m.toolCalls, event.call] }))
                set({ activeTool: null })
              }
            }
          })
        }
      } catch (error) {
        set((state) => ({
          error: controller.signal.aborted
            ? null
            : error instanceof Error
              ? error.message
              : 'The agent turn failed. Retry the message.',
          messages: state.messages.map((m) => (m.id === assistant.id ? { ...m, interrupted: true } : m))
        }))
      } finally {
        if (activeRequest === controller) {
          activeRequest = null
          set({ busy: false, activeTool: null })
          // Simpan balasan akhir (isi + tool calls) — sesi selamat dari refresh.
          const final = get().messages.find((m) => m.id === assistant.id)
          if (final && (final.content.trim() || final.toolCalls.length))
            void appendSessionMessage(get().sessionId || sessionId, { ...final }).catch(() => undefined)
          userActivityEnd()
        }
      }
    })()
  },
  cancel: () => {
    activeRequest?.abort()
    activeRequest = null
    set({ busy: false, activeTool: null })
  },
  clear: () => {
    get().cancel()
    set({ messages: [], error: null, plainFallback: false })
    // Sesi baru — riwayat lama tetap di Dexie (prune menjaga 10 sesi terakhir).
    void clearSession()
      .then((sessionId) => set({ sessionId }))
      .catch(() => undefined)
  }
}))

// Hydrate sesi terakhir saat app dibuka — chat tidak hilang saat refresh.
void loadLatestSession()
  .then(({ sessionId, messages }) =>
    useAgentChatStore.setState({
      sessionId,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        at: m.at,
        toolCalls: m.toolCalls ?? [],
        interrupted: m.interrupted
      }))
    })
  )
  .catch(() => undefined)
