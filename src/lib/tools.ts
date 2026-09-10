import { logActivity } from './activity'
import { guard } from './permissions'
import { remember, recall } from './memory'
import { useItemsStore } from '../stores/itemsStore'
import { usePagesStore } from '../stores/pagesStore'
import { useNotifyStore } from '../stores/notifyStore'
import { db } from './db'
import { uid, type Alarm, type Block, type BlockType } from './types'

/**
 * Tool router (§10–§11): satu tempat daftar tool, satu pintu eksekusi.
 * Alur: router → permission → tool → hasil nyata → event → memori/task state.
 * Aturan §68: `ok:true` hanya kalau operasi bawahnya benar-benar resolve.
 * Integrasi yang belum ada di platform ini TERSEDIA TAPI TERGUNCI dengan
 * alasan jujur (§67) — tidak pernah mengembalikan hasil palsu.
 */

export interface ToolResult {
  ok: boolean
  output?: string
  error?: string
  /** integrasi memang belum terpasang (butuh Electron host / credential user) */
  unconfigured?: boolean
}

export interface ToolDef {
  id: string
  label: string
  permission: string
  /** bisa dipanggil Elion autonomous; tool ber-`unconfigured` hanya tampil
   * sebagai "known gap" di monitor */
  run: (args: Record<string, unknown>) => Promise<ToolResult>
}

const registry = new Map<string, ToolDef>()

export function registerTool(def: ToolDef): void {
  registry.set(def.id, def)
}
export const listTools = (): ToolDef[] => [...registry.values()]
export const getTool = (id: string) => registry.get(id)

/** Satu-satunya jalan eksekusi — dipakai chat, sentient loop, dan UI. */
export async function runTool(
  id: string,
  args: Record<string, unknown>,
  ctx: { taskId?: string } = {}
): Promise<ToolResult> {
  const tool = registry.get(id)
  if (!tool) return { ok: false, error: `Unknown tool: ${id}` }
  if (tool.permission !== 'none') {
    const decision = await guard(tool.permission, `${tool.label} for “${(args as { title?: string; url?: string }).title ?? (args as { url?: string }).url ?? 'agent work'}”`)
    if (decision === 'denied') {
      await logActivity('tool.denied', { taskId: ctx.taskId, detail: id })
      return { ok: false, error: `Denied by permission policy (${tool.permission})` }
    }
  }
  await logActivity('tool.started', { taskId: ctx.taskId, detail: id })
  try {
    const result = await tool.run(args)
    await logActivity(result.ok ? 'tool.completed' : 'tool.failed', {
      taskId: ctx.taskId,
      detail: `${id}${result.error ? ` — ${result.error.slice(0, 120)}` : ''}`
    })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await logActivity('tool.failed', { taskId: ctx.taskId, detail: `${id} — ${message.slice(0, 120)}` })
    return { ok: false, error: message }
  }
}

const str = (args: Record<string, unknown>, key: string, max = 4000): string =>
  String(args[key] ?? '').slice(0, max).trim()

// ---------------- tool nyata ----------------

registerTool({
  id: 'memory.remember',
  label: 'Store a memory',
  permission: 'memory.write',
  run: async (args) => {
    const content = str(args, 'content', 500)
    if (!content) return { ok: false, error: 'content required' }
    const rec = await remember({
      content,
      type: (str(args, 'type', 20) || 'user') as never,
      factKey: str(args, 'factKey', 80) || undefined,
      source: 'tool',
      importance: typeof args.importance === 'number' ? args.importance : 0.55
    })
    return { ok: true, output: `stored ${rec.id} (${rec.type})` }
  }
})

registerTool({
  id: 'memory.recall',
  label: 'Recall memories',
  permission: 'workspace.read',
  run: async (args) => {
    const hits = await recall(str(args, 'query', 300), { limit: 6 })
    return { ok: true, output: hits.length ? hits.map((m) => `[${m.type}] ${m.content}`).join('\n') : 'no relevant memories' }
  }
})

registerTool({
  id: 'tasks.create',
  label: 'Create a workspace task',
  permission: 'tasks.write',
  run: async (args) => {
    const title = str(args, 'title', 200)
    if (!title) return { ok: false, error: 'title required' }
    const item = await useItemsStore.getState().createItem({
      title,
      dueDate: str(args, 'dueDate', 10) || undefined,
      priority: (str(args, 'priority', 10) || 'medium') as never,
      description: str(args, 'description', 2000) || undefined
    })
    return { ok: true, output: `task ${item.id} created` }
  }
})

registerTool({
  id: 'tasks.setStatus',
  label: 'Set task status',
  permission: 'tasks.write',
  run: async (args) => {
    const status = str(args, 'status', 40)
    if (!status) return { ok: false, error: 'status required' }
    const needle = (str(args, 'title', 200) || str(args, 'id', 60)).toLowerCase()
    const items = Object.values(useItemsStore.getState().items)
    const match = items.find((i) => i.id === needle || i.title.toLowerCase() === needle) ?? items.find((i) => i.title.toLowerCase().includes(needle))
    if (!needle || !match) return { ok: false, error: `no task matching “${needle || '?'}”` }
    await useItemsStore.getState().updateItem(match.id, { status })
    return { ok: true, output: `“${match.title}” → ${status}` }
  }
})

registerTool({
  id: 'docs.create',
  label: 'Create a document',
  permission: 'workspace.write',
  run: async (args) => {
    const title = str(args, 'title', 120)
    if (!title) return { ok: false, error: 'title required' }
    const body = str(args, 'markdown', 12000)
    // §17: ini DOCUMENT terstruktur (heading + paragraf), bukan canvas.
    const blocks: Block[] = body
      .split(/\n{2,}/)
      .filter(Boolean)
      .slice(0, 60)
      .map((para, index): Block =>
        /^#{1,3}\s/.test(para)
          ? { id: uid(), type: (para.startsWith('## ') ? 'heading2' : 'heading1') as BlockType, content: para.replace(/^#{1,3}\s/, ''), parentId: null, order: index + 2, props: {} }
          : { id: uid(), type: 'paragraph' as BlockType, content: para, parentId: null, order: index + 2, props: {} }
      )
    const page = await usePagesStore.getState().createPage({ title, blocks })
    return { ok: true, output: `document ${page.id} “${page.title}” (${blocks.length} blocks)` }
  }
})

registerTool({
  id: 'schedule.remind',
  label: 'Create a reminder',
  permission: 'schedule.write',
  run: async (args) => {
    const title = str(args, 'title', 120)
    const at = str(args, 'at', 40)
    if (!title || !at) return { ok: false, error: 'title and at (ISO) required' }
    const when = new Date(at)
    if (isNaN(when.getTime())) return { ok: false, error: 'unparseable date' }
    const alarm: Alarm = { id: uid(), title, at: when.toISOString(), repeat: str(args, 'repeat', 10) === 'daily' ? 'daily' : 'none', enabled: true }
    await db.alarms.add(alarm)
    await logActivity('schedule.created', { detail: `${title} @ ${alarm.at}` })
    return { ok: true, output: `reminder at ${alarm.at}` }
  }
})

registerTool({
  id: 'notifications.send',
  label: 'Notify the user',
  permission: 'notifications.send',
  run: async (args) => {
    await useNotifyStore.getState().push({
      kind: 'system',
      title: str(args, 'title', 120) || 'ELION',
      body: str(args, 'body', 400),
      link: str(args, 'link', 60) || undefined
    })
    return { ok: true, output: 'delivered' }
  }
})

/** Baca halaman web yang DIIZINKAN user (§13, tanpa automation palsu).
 * Web build: fetch + ekstrak teks. Hasil apa adanya, termasuk kegagalan CORS
 * — tidak pernah dikarang. */
registerTool({
  id: 'browser.read',
  label: 'Read a web page',
  permission: 'browser.read',
  run: async (args) => {
    const url = str(args, 'url', 500)
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'absolute http(s) url required' }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'text/html,text/plain' } })
      if (!response.ok) return { ok: false, error: `HTTP ${response.status}` }
      const raw = await response.text()
      const text = raw
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 6000)
      return { ok: true, output: text || '(empty page)' }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? `fetch failed: ${error.message}` : 'fetch failed' }
    }
  }
})

// ---------------- capability gap TERBUKA (jangan pernah pura-pura) ----------------

const UNCONFIGURED = (why: string): ToolDef['run'] => async () => ({
  ok: false,
  unconfigured: true,
  error: `${why} — isolated behind this interface until the Electron host/provider is configured (§67). No simulated result.`
})

registerTool({ id: 'browser.interact', label: 'Interact with websites', permission: 'browser.interact', run: UNCONFIGURED('requires the Electron host (webContents automation)') })
registerTool({ id: 'email.read', label: 'Read email', permission: 'email.read', run: UNCONFIGURED('requires user-provided Gmail OAuth in the Electron main process') })
registerTool({ id: 'email.send', label: 'Send email', permission: 'email.send', run: UNCONFIGURED('requires user-provided Gmail OAuth in the Electron main process') })
registerTool({ id: 'files.read', label: 'Read local files', permission: 'files.read', run: UNCONFIGURED('requires the Electron host') })
registerTool({ id: 'system.action', label: 'System commands', permission: 'system.action', run: UNCONFIGURED('requires the Electron host and an explicit policy') })
