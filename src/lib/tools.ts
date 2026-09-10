import { logActivity } from './activity'
import { guard } from './permissions'
import { remember, recall } from './memory'
import { isSysDesktop, sysReadFile, sysRun } from './sysClient'
import { isMailDesktop, mailList, mailRead, mailSend, mailStatus } from './mailClient'
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
  /**
   * true kalau backend tool ini TERSEDIA sekarang (host/credential terpasang).
   * Agent chat hanya menawarkan tool yang available — model tidak pernah
   * disuruh memanggil tool yang pasti gagal. Default: selalu tersedia.
   */
  available?: () => boolean | Promise<boolean>
}

/** Tool yang boleh ditawarkan ke model agent saat ini. */
export async function listAvailableTools(): Promise<ToolDef[]> {
  const out: ToolDef[] = []
  for (const t of registry.values()) {
    try {
      if ((await t.available?.()) ?? true) out.push(t)
    } catch {
      /* availability check gagal = anggap tidak tersedia, jujur */
    }
  }
  return out
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
  const startedAt = Date.now()
  try {
    const result = await tool.run(args)
    await logActivity(result.ok ? 'tool.completed' : 'tool.failed', {
      taskId: ctx.taskId,
      detail: `${id}${result.error ? ` — ${result.error.slice(0, 120)}` : ''}`,
      elapsedMs: Date.now() - startedAt
    })
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await logActivity('tool.failed', {
      taskId: ctx.taskId,
      detail: `${id} — ${message.slice(0, 120)}`,
      elapsedMs: Date.now() - startedAt
    })
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

// ---------------- gap yang masih TERBUKA (jangan pernah pura-pura) ----------------
// email/files/system sudah nyata via adapter Electron di atas; browser
// automation (webContents) masih menunggu — tetap unconfigured jujur.

const UNCONFIGURED = (why: string): ToolDef['run'] => async () => ({
  ok: false,
  unconfigured: true,
  error: `${why} — isolated behind this interface until the Electron host/provider is configured (§67). No simulated result.`
})

registerTool({ id: 'browser.interact', label: 'Interact with websites', permission: 'browser.interact', run: UNCONFIGURED('requires the Electron host (webContents automation)') })

registerTool({
  id: 'email.read',
  label: "Read Elion's mail",
  permission: 'email.read',
  available: async () => {
    try {
      return (await mailStatus()).configured
    } catch {
      return false
    }
  },
  run: async (args) => {
    if (!isMailDesktop())
      return { ok: false, unconfigured: true, error: 'Mail needs the desktop app — connect it in Settings › Email.' }
    const id = str(args, 'id', 100)
    try {
      if (id) {
        const m = await mailRead(id)
        return { ok: true, output: `From: ${m.from}\nSubject: ${m.subject}\nDate: ${m.date}\n\n${m.body ?? m.snippet}`.slice(0, 8000) }
      }
      const rows = await mailList(str(args, 'query', 200) || undefined, Number(args.max) || 5)
      if (!rows.length) return { ok: true, output: 'no messages found' }
      return {
        ok: true,
        output: rows.map((m) => `• ${m.from} — “${m.subject}” (${m.date}) [${m.id}]`).join('\n').slice(0, 6000)
      }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'mail read failed' }
    }
  }
})

registerTool({
  id: 'email.send',
  label: 'Send email',
  // Pondasi = notifikasi ke user sendiri (Part IV: email ke Gilang = bebas,
  // sama seperti chat). Ke orang lain = guard email.send di dalam run().
  permission: 'notifications.send',
  available: async () => {
    try {
      return (await mailStatus()).configured
    } catch {
      return false
    }
  },
  run: async (args) => {
    const to = str(args, 'to', 200)
    const subject = str(args, 'subject', 200)
    const body = str(args, 'body', 12000)
    if (!to || !subject || !body) return { ok: false, error: 'to, subject and body are required' }
    if (!isMailDesktop())
      return { ok: false, unconfigured: true, error: 'Mail needs the desktop app — connect it in Settings › Email.' }
    let status: { configured: boolean; myEmail?: string | null }
    try {
      status = await mailStatus()
    } catch (error) {
      return { ok: false, unconfigured: true, error: error instanceof Error ? error.message : 'mail unavailable' }
    }
    if (!status.configured)
      return { ok: false, unconfigured: true, error: 'Mail is not connected — connect it in Settings › Email.' }
    const self = (status.myEmail || '').trim().toLowerCase()
    if (!self || to.toLowerCase() !== self) {
      // Part IV 🔒: email ke orang lain = confirm first. Default policy
      // email.send adalah deny (lebih ketat dari spek) — user yang mengubah
      // ke ask di Permission Center kalau mau aliran approval.
      const decision = await guard('email.send', `Send email to ${to} — “${subject.slice(0, 80)}”`)
      if (decision === 'denied') {
        await logActivity('tool.denied', { detail: 'email.send (external recipient)' })
        return { ok: false, error: 'Denied by permission policy (email.send)' }
      }
    }
    try {
      const id = await mailSend(to, subject, body)
      return { ok: true, output: `sent ${id}` }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'mail send failed' }
    }
  }
})

registerTool({
  id: 'files.read',
  label: 'Read a local file',
  permission: 'files.read',
  available: () => isSysDesktop(),
  run: async (args) => {
    const filePath = str(args, 'path', 500)
    if (!filePath) return { ok: false, error: 'path required' }
    try {
      const { content, truncated } = await sysReadFile(filePath)
      return { ok: true, output: truncated ? `${content}…(truncated)` : content }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'file read failed' }
    }
  }
})

registerTool({
  id: 'system.action',
  label: 'Run an allow-listed command',
  permission: 'system.action',
  available: () => isSysDesktop(),
  run: async (args) => {
    const command = str(args, 'command', 300)
    if (!command) return { ok: false, error: 'command required' }
    const argv = Array.isArray(args.args)
      ? (args.args as unknown[]).map((a) => String(a))
      : str(args, 'args', 1000).split(/\s+/).filter(Boolean)
    try {
      const result = await sysRun(command, argv)
      const out = [`exit ${result.code}`, result.stdout, result.stderr ? `STDERR:\n${result.stderr}` : '']
        .filter(Boolean)
        .join('\n')
      return { ok: true, output: out.slice(0, 8000) || `exit ${result.code}` }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'command failed' }
    }
  }
})
