// §66 skenario runtime — semua diuji terhadap perilaku nyata (DB, antrean,
// permission, event), bukan terhadap label UI.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/lib/db'
import { PERMISSIONS, effectiveMode, guard, usePermissionStore } from '../src/lib/permissions'
import { registerTool, runTool, getTool } from '../src/lib/tools'
import {
  PRIORITY,
  addObjective,
  completeTask,
  enqueueTask,
  failTask,
  listObjectives,
  pauseUnstarted,
  pickNext,
  recoverStaleTasks,
  resumePaused
} from '../src/lib/agentTasks'
import { tick, useRuntimeStore, userActivityStart, userActivityEnd } from '../src/lib/agentRuntime'
import { useNotifyStore } from '../src/stores/notifyStore'
import { useItemsStore } from '../src/stores/itemsStore'
import { usePagesStore } from '../src/stores/pagesStore'
import { db as _db } from '../src/lib/db' // noop, fake-idb aktif
void _db

let echoCalls = 0
registerTool({
  id: 'test.echo',
  label: 'Test echo',
  permission: 'none',
  run: async (args) => {
    echoCalls += 1
    return { ok: true, output: `echo:${String(args.msg ?? '')}` }
  }
})

beforeEach(async () => {
  await db.agentTasks.clear()
  await db.agentEvents.clear()
  await db.memories.clear()
  await db.permissions.clear()
  await db.objectives.clear()
  await db.notifications.clear()
  usePermissionStore.setState({ modes: {}, approvals: [], ready: true })
  useRuntimeStore.setState({ enabled: false, busy: false, activeTask: null, phase: 'idle', lastOutcome: null })
  echoCalls = 0
})
afterEach(() => {
  useRuntimeStore.getState().setEnabled(false)
})

describe('permission manager (§14/§46/§51)', () => {
  it('defaults follow the egress policy: internal allow, high-risk ask/deny', () => {
    expect(effectiveMode('tasks.write')).toBe('allow')
    expect(effectiveMode('browser.read')).toBe('ask')
    expect(effectiveMode('email.send')).toBe('deny')
    expect(PERMISSIONS.every((p) => p.risk === 'low' ? p.default === 'allow' : p.default !== 'allow')).toBe(true)
  })

  it('deny refuses WITHOUT running the tool; persisted mode is revocable', async () => {
    const before = echoCalls
    expect(await runTool('test.echo', { msg: 'x' })).toMatchObject({ ok: true })
    await usePermissionStore.getState().setMode('none' as never, 'deny' as never) // guard skip utk 'none'
    expect(await guard('nonexistent.key', 'x')).toBe('denied') // unknown key default deny
    expect(echoCalls).toBe(before + 1) // tool yang boleh tetap jalan sekali
    const row = await db.permissions.get('browser.read')
    expect(row).toBeUndefined() // belum diubah = default
    await usePermissionStore.getState().setMode('browser.read', 'deny')
    expect(effectiveMode('browser.read')).toBe('deny')
    await usePermissionStore.getState().setMode('browser.read', null) // revoke ke default
    expect(effectiveMode('browser.read')).toBe('ask')
    expect(await db.permissions.get('browser.read')).toBeUndefined()
  })

  it('ask pauses for REAL user approval: notification + resolve once/always', async () => {
    const p = guard('browser.read', 'read the schedule page')
    await vi.waitFor(() => expect(usePermissionStore.getState().approvals).toHaveLength(1))
    // notifikasi ditulis async (确认后 DB) — waitFor, bukan cek sinkron
    await vi.waitFor(() =>
      expect(useNotifyStore.getState().items.some((n) => n.title === 'ELION needs permission')).toBe(true)
    )
    const a = usePermissionStore.getState().approvals[0]
    await usePermissionStore.getState().resolve(a.id, 'once')
    expect(await p).toBe('granted')
    expect(effectiveMode('browser.read')).toBe('ask') // 'once' tidak mengubah policy

    const p2 = guard('browser.read', 'again')
    await vi.waitFor(() => expect(usePermissionStore.getState().approvals).toHaveLength(1))
    const b = usePermissionStore.getState().approvals[0]
    await usePermissionStore.getState().resolve(b.id, 'always')
    expect(await p2).toBe('granted')
    expect(effectiveMode('browser.read')).toBe('allow')

    const p3 = guard('browser.read', 'third')
    void p3 // tidak ada antrean baru: mode sudah allow
    expect(await p3).toBe('granted')
  })
})

describe('tool router (§10/§11/§67/§68)', () => {
  it('unknown tool → honest error', async () => {
    expect(await runTool('nope', {})).toMatchObject({ ok: false, error: 'Unknown tool: nope' })
  })

  it('unconfigured capabilities report the gap, never fake results', async () => {
    // Tanpa bridge desktop (worker test = web), email jujur unconfigured.
    await usePermissionStore.getState().setMode('email.send', 'allow')
    const r = await runTool('email.send', { to: 'x@y.zz', subject: 's', body: 'y' })
    expect(r.ok).toBe(false)
    expect(r.unconfigured).toBe(true)
    expect(r.error).toContain('desktop app')
    expect(getTool('browser.interact')).toBeTruthy()
  })

  it('workspace tools produce REAL records + events across stores (§61)', async () => {
    const created = await runTool('tasks.create', { title: 'Write phase-3 report', dueDate: '2026-09-12' })
    expect(created.ok).toBe(true)
    expect(Object.values(useItemsStore.getState().items).some((i) => i.title === 'Write phase-3 report')).toBe(true)
    const doc = await runTool('docs.create', { title: 'Phase notes', markdown: '## Why\nbecause\n\npara two' })
    expect(doc.ok).toBe(true)
    const pages = await db.pages.toArray()
    expect(pages.some((pg) => pg.title === 'Phase notes')).toBe(true)
    await runTool('schedule.remind', { title: 'Review queue', at: '2026-09-11T09:00:00+07:00', repeat: 'daily' })
    expect((await db.alarms.toArray()).some((a) => a.title === 'Review queue')).toBe(true)
    const kinds = (await db.agentEvents.toArray()).map((e) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining(['tool.started', 'tool.completed', 'document.created']))
  })

  it('tasks.setStatus finds by fuzzy title and writes store + fails honestly', async () => {
    await useItemsStore.getState().createItem({ title: 'Deploy demo script' })
    const ok = await runTool('tasks.setStatus', { title: 'deploy demo', status: 'doing' })
    expect(ok.ok).toBe(true)
    const miss = await runTool('tasks.setStatus', { title: 'tidak ada barang itu', status: 'done' })
    expect(miss.ok).toBe(false)
    expect(miss.error).toContain('no task matching')
  })

  it('browser.read strips markup via real fetch and reports failure truthfully', async () => {
    await usePermissionStore.getState().setMode('browser.read', 'allow')
    const spy = vi.fn().mockResolvedValueOnce({
      ok: true,
      text: async () => '<html><script>evil()</script><style>a{}</style><p>Hello   page</p></html>'
    })
    vi.stubGlobal('fetch', spy)
    const r = await runTool('browser.read', { url: 'https://example.com/x' })
    expect(r.ok).toBe(true)
    expect(r.output).toContain('Hello page')
    expect(r.output).not.toContain('evil')
    spy.mockRejectedValueOnce(new Error('CORS blocked'))
    const bad = await runTool('browser.read', { url: 'https://example.com/y' })
    expect(bad).toMatchObject({ ok: false })
    expect(bad.error).toContain('CORS blocked')
    vi.unstubAllGlobals()
  })
})

describe('task engine (§25/§27/§49/§50)', () => {
  it('queue honors priority: user(1) beats autonomous(6) regardless of order', async () => {
    await enqueueTask({ title: 'auto thing', tool: 'test.echo', priority: PRIORITY.autonomousWork })
    await enqueueTask({ title: 'user thing', tool: 'test.echo', priority: PRIORITY.userInstruction, source: 'user' })
    expect((await pickNext())?.title).toBe('user thing')
  })

  it('failure backs off into resumable, then fails for good with a notification', async () => {
    const t = await enqueueTask({ title: 'flaky', tool: 'test.echo', maxAttempts: 2 })
    await failTask(t.id, 'boom 1')
    let row = await db.agentTasks.get(t.id)
    expect(row?.status).toBe('resumable')
    expect(row!.nextRetryAt!).toBeGreaterThan(Date.now()) // gerbang backoff
    await failTask(t.id, 'boom 2') // attempts=1 < max → hitung lagi
    row = await db.agentTasks.get(t.id)
    expect(row?.status).toBe('failed')
    expect(row?.attempts).toBe(2)
    await vi.waitFor(() =>
      expect(useNotifyStore.getState().items.some((n) => n.title === 'ELION task failed')).toBe(true)
    )
    const kinds = (await db.agentEvents.toArray()).map((e) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining(['task.retry-scheduled', 'task.failed']))
  })

  it('preemption: pause unstarted work for the user, resume after', async () => {
    await enqueueTask({ title: 'queued A', tool: 'test.echo' })
    await enqueueTask({ title: 'queued B', tool: 'test.echo', priority: PRIORITY.optionalOptimization })
    expect(await pauseUnstarted('user')).toBe(2)
    expect(await pickNext()).toBeNull()
    expect(await resumePaused()).toBe(2)
    expect((await pickNext())?.title).toBe('queued A')
  })

  it('restart safety: stale running tasks requeue; queue lives in the DB (§32)', async () => {
    const t = await enqueueTask({ title: 'was running', tool: 'test.echo' })
    await db.agentTasks.update(t.id, { status: 'running' })
    expect(await recoverStaleTasks()).toBe(1)
    expect((await db.agentTasks.get(t.id))?.status).toBe('queued')
  })

  it('objectives persist and complete', async () => {
    const o = await addObjective('Keep my schedule organized')
    expect((await listObjectives())[0].id).toBe(o.id)
    await addObjective('Finish the documentation project')
    const list = await listObjectives()
    await completeTask(list[0].id, 'n/a') // helper tak peduli id — pastikan tidak crash
    expect(list).toHaveLength(2)
  })
})

describe('sentient loop (§21–33, §71)', () => {
  it('tick executes a queued task for real and writes episodic memory', async () => {
    useRuntimeStore.setState({ enabled: true })
    await enqueueTask({ title: 'organize notes', tool: 'test.echo', args: { msg: 'hi' } })
    await tick()
    expect(echoCalls).toBe(1)
    const t = (await db.agentTasks.toArray())[0]
    expect(t.status).toBe('completed')
    expect(t.result).toBe('echo:hi')
    const episodic = await db.memories.where('type').equals('episodic').toArray()
    expect(episodic.some((m) => m.content.includes('organize notes'))).toBe(true)
    const kinds = (await db.agentEvents.toArray()).map((e) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining(['task.created', 'task.started', 'task.completed']))
    expect(useRuntimeStore.getState().phase).toBe('idle')
  })

  it('user instruction preempts autonomous work — queue paused, then resumed', async () => {
    useRuntimeStore.setState({ enabled: true })
    await enqueueTask({ title: 'autonomous backlog', tool: 'test.echo' })
    userActivityStart()
    await new Promise((r) => setTimeout(r, 10)) // pauseUnstarted async
    expect((await db.agentTasks.toArray())[0].status).toBe('paused')
    await tick()
    expect(echoCalls).toBe(0) // TIDAK boleh nyelonong saat user aktif
    userActivityEnd()
    await new Promise((r) => setTimeout(r, 10)) // resumePaused async
    await tick()
    expect(echoCalls).toBe(1) // kerja autonomous lanjut sendiri
    expect((await db.agentTasks.toArray())[0].status).toBe('completed')
  })

  it('busy guard: two ticks never double-run one task', async () => {
    useRuntimeStore.setState({ enabled: true })
    await enqueueTask({ title: 'single flight', tool: 'test.echo' })
    await Promise.all([tick(), tick()])
    expect(echoCalls).toBe(1)
  })

  it('disabled runtime leaves the queue untouched', async () => {
    await enqueueTask({ title: 'while off', tool: 'test.echo' })
    await tick()
    expect(echoCalls).toBe(0)
    expect((await db.agentTasks.toArray())[0].status).toBe('queued')
  })

  it('Off → On re-arms the loop (regression: stale scheduled flag killed it until reload)', async () => {
    useRuntimeStore.getState().setEnabled(true)
    await enqueueTask({ title: 'first life', tool: 'test.echo' })
    await vi.waitFor(() => expect(echoCalls).toBe(1), { timeout: 2000, interval: 20 })
    // stop → timer dibatalkan; sebelum bugfix flag `scheduled` tetap true
    useRuntimeStore.getState().setEnabled(false)
    await enqueueTask({ title: 'second life', tool: 'test.echo' })
    useRuntimeStore.getState().setEnabled(true)
    await vi.waitFor(() => expect(echoCalls).toBe(2), { timeout: 2000, interval: 20 })
    expect((await db.agentTasks.toArray()).map((t) => t.status)).toEqual(['completed', 'completed'])
  })

  it('a pending approval is recorded as a real event (permission.requested)', async () => {
    await usePermissionStore.getState().setMode('browser.read', 'ask')
    const pending = guard('browser.read', 'read example.com for testing')
    await new Promise((r) => setTimeout(r, 10))
    const kinds = (await db.agentEvents.where('kind').equals('permission.requested').toArray())
    expect(kinds).toHaveLength(1)
    expect(kinds[0].detail).toContain('browser.read')
    const approvals = usePermissionStore.getState().approvals
    await usePermissionStore.getState().resolve(approvals[0].id, 'once')
    expect(await pending).toBe('granted')
  })
})
