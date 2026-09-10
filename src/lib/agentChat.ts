import {
  assertHttpUrl,
  joinUrl,
  readThroughBridge,
  requestHeadersForChat,
  type AiApiKind,
  type AiChatConfig,
  type ChatTurn
} from './aiProviders'
import { listAvailableTools, runTool } from './tools'

/**
 * Agent chat loop (§10–§11, Part III spek v4.3) — Elion sebagai agent yang
 * BENAR-BENAR bisa memakai tool, bukan sekadar menjawab teks.
 *
 * Tiap giliran: model boleh memanggil tool terdaftar (function calling
 * OpenAI-compatible / Anthropic) → dieksekusi lewat runTool() yang sama
 * dengan sentient loop (permission guard + event + hasil nyata) →
 * hasilnya dikembalikan ke model → ulangi sampai model selesai menjawab
 * atau batas iterasi tercapai. Tidak ada simulasi: `ok` hanya kalau tool
 * benar-benar resolve (aturan §68 di tools.ts).
 */

export interface AgentToolCall {
  name: string
  args: Record<string, unknown>
  ok: boolean
  output?: string
  error?: string
}

export type AgentStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool-start'; name: string; args: Record<string, unknown> }
  | { type: 'tool-done'; call: AgentToolCall }
  | { type: 'done' }

interface JsonSchema {
  type: 'object'
  properties: Record<string, { type: string; description: string; items?: { type: string } }>
  required: string[]
}

/** Skema parameter per tool — satu sumber untuk format OpenAI & Anthropic. */
const TOOL_SCHEMAS: Record<string, { description: string; parameters: JsonSchema }> = {
  'memory.remember': {
    description: 'Store a durable fact, preference, or observation about the user.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The fact to remember (one clear sentence).' },
        type: { type: 'string', description: 'user | episodic | semantic | preference | entity' },
        factKey: { type: 'string', description: 'Stable key so repeats reinforce instead of duplicating.' }
      },
      required: ['content']
    }
  },
  'memory.recall': {
    description: 'Recall relevant stored memories for the current task.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for in memory.' }
      },
      required: ['query']
    }
  },
  'tasks.create': {
    description: 'Create a workspace task.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title.' },
        dueDate: { type: 'string', description: 'Due date as YYYY-MM-DD.' },
        priority: { type: 'string', description: 'low | medium | high' },
        description: { type: 'string', description: ' Longer detail.' }
      },
      required: ['title']
    }
  },
  'tasks.setStatus': {
    description: 'Change the status of a workspace task found by title.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title (or id) to find.' },
        status: { type: 'string', description: 'New status, e.g. todo, doing, done.' }
      },
      required: ['title', 'status']
    }
  },
  'docs.create': {
    description: 'Create a structured document with the given markdown body.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Document title.' },
        markdown: { type: 'string', description: 'Body in markdown (paragraphs, # headings).' }
      },
      required: ['title', 'markdown']
    }
  },
  'schedule.remind': {
    description: 'Create a reminder (alarm) for a specific time.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Reminder title.' },
        at: { type: 'string', description: 'ISO datetime, e.g. 2026-09-12T09:00:00.' },
        repeat: { type: 'string', description: 'none | daily' }
      },
      required: ['title', 'at']
    }
  },
  'notifications.send': {
    description: 'Show a notification to the user.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Notification title.' },
        body: { type: 'string', description: 'Notification body.' }
      },
      required: ['title', 'body']
    }
  },
  'browser.read': {
    description: 'Read the text content of a public web page.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http(s) URL.' }
      },
      required: ['url']
    }
  },
  'email.read': {
    description: "Read mail from Elion's own mailbox.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text (sender, subject, words).' },
        max: { type: 'string', description: 'Max messages to return (default 5).' }
      },
      required: []
    }
  },
  'email.send': {
    description: 'Send an email. Needs user approval unless the recipient is the user themselves.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient address.' },
        subject: { type: 'string', description: 'Subject.' },
        body: { type: 'string', description: 'Plain-text body.' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  'files.read': {
    description: 'Read a local text file (desktop app only).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute file path.' }
      },
      required: ['path']
    }
  },
  'system.action': {
    description: 'Run an allow-listed system command (desktop app only). Anything not on the allow-list is denied.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Executable, exactly as allow-listed.' },
        args: { type: 'string', description: 'Space-separated arguments, exactly as allow-listed (or empty).' }
      },
      required: ['command']
    }
  },
  'hermes.status': {
    description: 'Check the local Hermes agent gateway (online, skills, toolsets, scheduled jobs).',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  'hermes.ask': {
    description: "Delegate a task to the local Hermes agent runtime and return its final answer. Hermes has its own server-side tools (terminal, files, web, skills) — use for work beyond this app and report the answer as Hermes' answer.",
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The task for Hermes, one clear instruction.' },
        context: { type: 'string', description: 'Optional short context Hermes needs.' }
      },
      required: ['prompt']
    }
  },
  'hermes.skills.import': {
    description: 'Import the skills known to the Hermes gateway into the Elion Skill Ledger (duplicates are skipped).',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  'hermes.job.create': {
    description: 'Schedule an unattended job on the Hermes gateway (hermes cron). Runs even when this app is closed.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What Hermes should do on each run.' },
        schedule: { type: 'string', description: 'Schedule in hermes cron form, e.g. "daily 09:00" or a cron expression.' },
        name: { type: 'string', description: 'Short name for the job.' }
      },
      required: ['prompt', 'schedule']
    }
  },
  'hermes.jobs.list': {
    description: 'List the jobs currently scheduled on the Hermes gateway.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  'agent.jobs.create': {
    description: 'Schedule a recurring IN-APP agent job (in-app cron). Runs inside this app while it is open and the runtime is on — no external gateway needed.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short job name.' },
        prompt: { type: 'string', description: 'The instruction future-Elion executes on each run (it has the same tools you have).' },
        kind: { type: 'string', description: 'daily | interval | once' },
        at: { type: 'string', description: "For daily: local time 'HH:MM' (e.g. 09:00). For once: 'YYYY-MM-DDTHH:MM'." },
        intervalMin: { type: 'string', description: 'For interval jobs: minutes between runs.' }
      },
      required: ['prompt', 'kind']
    }
  },
  'agent.jobs.list': {
    description: 'List the in-app scheduled agent jobs.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  'skills.create': {
    description: 'Author a reusable, named skill: an ordered list of registered tool steps Elion can re-run later. Additive self-improvement — recorded in the Skill Ledger.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short skill name (kebab-case).' },
        description: { type: 'string', description: 'What the skill does, one sentence.' },
        steps: {
          type: 'string',
          description: 'JSON array of steps: [{"title":"...","tool":"tasks.create","args":{"title":"..."}}]. Every tool must be registered.'
        }
      },
      required: ['name', 'steps']
    }
  },
  'skills.run': {
    description: 'Run a stored executable skill by name — executes its tool steps for real (each step still passes its own permission gate).',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Skill name.' } },
      required: ['name']
    }
  },
  'skills.list': {
    description: 'List the stored executable skills.',
    parameters: { type: 'object', properties: {}, required: [] }
  }
}

export const AGENT_SYSTEM_SUFFIX =
  'You are operating as an agent inside the Elion Suite app: you CAN act — call the provided tools to do real work (create tasks, documents, reminders, read memory, read pages) instead of only describing what to do. Only report an action as done after its tool result confirms it. If a tool errors or is denied, say what happened and what the user can do (e.g. approve the permission, connect the integration). Never claim to have done something you did not call a tool for. The hermes.* tools reach the local Hermes agent runtime — a separate agent with its own server-side tools; use hermes.ask for work beyond this app and report its answer as Hermes\' answer.'

const MAX_ITERATIONS = 6
const MAX_TOOL_OUTPUT = 4000
// Agent turns (dan job cron yang memakainya) boleh makan waktu menit-melintang —
// timeout request default 15 detik jelas tidak cukup untuk kerja beneran.
const AGENT_TURN_TIMEOUT_MS = 180_000

function truncate(text: string): string {
  return text.length > MAX_TOOL_OUTPUT ? `${text.slice(0, MAX_TOOL_OUTPUT)}…(truncated)` : text
}

async function executeCall(name: string, rawArgs: unknown, onEvent: (e: AgentStreamEvent) => void): Promise<string> {
  let args: Record<string, unknown> = {}
  try {
    args = (typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs ?? {})) as Record<string, unknown>
    if (!args || typeof args !== 'object') args = {}
  } catch {
    const call: AgentToolCall = { name, args: {}, ok: false, error: 'model sent invalid JSON arguments' }
    onEvent({ type: 'tool-start', name, args: {} })
    onEvent({ type: 'tool-done', call })
    return `ERROR: ${call.error}`
  }
  onEvent({ type: 'tool-start', name, args })
  // runTool = pintu yang sama dengan sentient loop: guard permission →
  // eksekusi nyata → event. Tidak ada jalur pintas khusus chat.
  const result = await runTool(name, args)
  const call: AgentToolCall = { name, args, ok: result.ok, output: result.output, error: result.error }
  onEvent({ type: 'tool-done', call })
  return result.ok ? truncate(result.output ?? 'done') : `ERROR: ${result.error ?? 'tool failed'}`
}

interface AgentTurnOpts {
  api: AiApiKind
  cfg: AiChatConfig
  system: string
  history: ChatTurn[]
  signal: AbortSignal
  onEvent: (e: AgentStreamEvent) => void
}

/** Skema tool yang tersedia SEKARANG, dalam format OpenAI `tools`. */
async function openAiTools(): Promise<unknown[]> {
  const available = await listAvailableTools()
  return available
    .filter((t) => TOOL_SCHEMAS[t.id])
    .map((t) => ({
      type: 'function' as const,
      function: { name: t.id, description: TOOL_SCHEMAS[t.id].description, parameters: TOOL_SCHEMAS[t.id].parameters }
    }))
}

async function anthropicTools(): Promise<unknown[]> {
  const available = await listAvailableTools()
  return available
    .filter((t) => TOOL_SCHEMAS[t.id])
    .map((t) => ({ name: t.id, description: TOOL_SCHEMAS[t.id].description, input_schema: TOOL_SCHEMAS[t.id].parameters }))
}

async function runOpenAiTurn({ cfg, system, history, signal, onEvent }: AgentTurnOpts): Promise<void> {
  const url = assertHttpUrl(joinUrl(cfg.baseUrl, 'chat/completions'))
  const headers = requestHeadersForChat(cfg, 'openai', true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [{ role: 'system', content: system }, ...history]
  const tools = await openAiTools()
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
    const res = (await readThroughBridge(
      url,
      'POST',
      headers,
      JSON.stringify({
        model: cfg.model,
        messages,
        tools: tools.length ? tools : undefined,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens
      }), AGENT_TURN_TIMEOUT_MS)
    ) as { choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[] }
    const msg = res.choices?.[0]?.message
    if (!msg) throw new Error('The provider returned an empty reply.')
    if (msg.content) onEvent({ type: 'text', text: msg.content })
    const calls = msg.tool_calls ?? []
    if (!calls.length) return
    messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: calls })
    for (const call of calls) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      const content = await executeCall(call.function.name, call.function.arguments, onEvent)
      messages.push({ role: 'tool', tool_call_id: call.id, content })
    }
  }
}

async function runAnthropicTurn({ cfg, system, history, signal, onEvent }: AgentTurnOpts): Promise<void> {
  const url = assertHttpUrl(joinUrl(cfg.baseUrl, 'messages'))
  const headers = requestHeadersForChat(cfg, 'anthropic', true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = history.map((h) => ({ role: h.role, content: h.content }))
  const tools = await anthropicTools()
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
    const res = (await readThroughBridge(
      url,
      'POST',
      headers,
      JSON.stringify({
        model: cfg.model,
        system,
        messages,
        tools: tools.length ? tools : undefined,
        temperature: cfg.temperature,
        max_tokens: Math.min(cfg.maxTokens, 8192)
      }), AGENT_TURN_TIMEOUT_MS)
    ) as { content?: ({ type: string; text?: string; id?: string; name?: string; input?: unknown } | null)[]; stop_reason?: string }
    const blocks = (res.content ?? []).filter((b): b is { type: string; text?: string; id?: string; name?: string; input?: unknown } => !!b)
    for (const b of blocks) if (b.type === 'text' && b.text) onEvent({ type: 'text', text: b.text })
    const uses = blocks.filter((b) => b.type === 'tool_use' && b.id && b.name)
    if (!uses.length) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages.push({ role: 'assistant', content: blocks as any })
    const results = []
    for (const u of uses) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      const content = await executeCall(u.name as string, u.input, onEvent)
      results.push({ type: 'tool_result', tool_use_id: u.id, content })
    }
    messages.push({ role: 'user', content: results })
  }
  // Budget giliran habis saat model masih minta tool — jujur, jangan diam.
  onEvent({ type: 'text', text: `\n\n(Stopped after ${MAX_ITERATIONS} tool rounds — ask me to continue.)` })
}

/**
 * Satu giliran agent. MiniCPM/gateway lokal tanpa function calling TIDAK
 * didukung di sini — store mem-fallback ke chat biasa (jujur, tanpa
 * pura-pura memanggil tool).
 */
export async function runAgentTurn(opts: AgentTurnOpts): Promise<void> {
  if (opts.api === 'minicpm') throw new Error('AGENT_TOOLS_UNSUPPORTED')
  if (opts.api === 'anthropic') await runAnthropicTurn(opts)
  else await runOpenAiTurn(opts)
  opts.onEvent({ type: 'done' })
}
