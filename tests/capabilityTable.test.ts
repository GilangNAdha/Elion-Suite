import { describe, expect, it } from 'vitest'
import { effectiveMode } from '../src/lib/permissions'
import { listTools } from '../src/lib/tools'

/**
 * Part IV spek v4.3 — batas kapabilitas sebagai test, bukan sekadar tabel.
 * Kalau baris ini gagal setelah menambah tool/permission, itu sinyal review
 * Part IV — bukan test yang harus "diperbaiki" diam-diam.
 */
describe('capability boundaries (Part IV)', () => {
  it('external/irreversible capabilities default to ask-or-deny, never allow', () => {
    // Emailing others, interacting, touching the system: confirm-first or off.
    expect(['ask', 'deny']).toContain(effectiveMode('email.send'))
    expect(['ask', 'deny']).toContain(effectiveMode('email.read'))
    expect(['ask', 'deny']).toContain(effectiveMode('browser.read'))
    expect(['ask', 'deny']).toContain(effectiveMode('browser.interact'))
    expect(['ask', 'deny']).toContain(effectiveMode('files.read'))
    expect(['ask', 'deny']).toContain(effectiveMode('files.write'))
    expect(['ask', 'deny']).toContain(effectiveMode('system.action'))
    // Hermes bridge: delegation egresses through the gateway's provider and
    // scheduled jobs run unattended → confirm first. Skill import is local
    // and additive (Part VII: new skills may be autonomous) → allow.
    expect(['ask', 'deny']).toContain(effectiveMode('hermes.delegate'))
    expect(['ask', 'deny']).toContain(effectiveMode('hermes.control'))
    expect(effectiveMode('hermes.skills')).toBe('allow')
  })

  it('internal reversible work stays genuinely autonomous', () => {
    expect(effectiveMode('workspace.read')).toBe('allow')
    expect(effectiveMode('workspace.write')).toBe('allow')
    expect(effectiveMode('tasks.write')).toBe('allow')
    expect(effectiveMode('memory.write')).toBe('allow')
    expect(effectiveMode('notifications.send')).toBe('allow')
    expect(effectiveMode('schedule.write')).toBe('allow')
  })

  it('⛔ no tool can rotate or change the AI provider key — rotation is Permission-Center-only', () => {
    const tools = listTools()
    expect(tools.length).toBeGreaterThan(0)
    for (const t of tools) {
      expect(`${t.id} ${t.permission}`.toLowerCase()).not.toMatch(/setting|apikey|api.key|credential|token|secret|password/)
    }
  })

  it('locks the tool registry — adding a tool requires a conscious Part IV review', () => {
    expect(listTools().map((t) => `${t.id} [${t.permission}]`).sort()).toEqual(
      [
        'browser.interact [browser.interact]',
        'browser.read [browser.read]',
        'docs.create [workspace.write]',
        'email.read [email.read]',
        // email.send fondasinya notifications.send (surat ke user sendiri);
        // ke orang lain dijaga guard email.send di DALAM run() (Part IV 🔒).
        'email.send [notifications.send]',
        'files.read [files.read]',
        // Agent core (embedded Hermes lineage): cron + skill packs + reasoning
        // step. Meta-tool agent.reason berisiko di tool DI DALAM turn — semua
        // tetap lewat guard masing-masing.
        'agent.jobs.create [schedule.write]',
        'agent.jobs.list [workspace.read]',
        'agent.reason [none]',
        'skills.create [workspace.write]',
        'skills.list [workspace.read]',
        'skills.run [workspace.write]',
        // Hermes bridge (Part VI): status/jobs-list = baca lokal; delegasi =
        // egress via gateway; job-create = kerja unattended; import = ledger.
        'hermes.ask [hermes.delegate]',
        'hermes.job.create [hermes.control]',
        'hermes.jobs.list [workspace.read]',
        'hermes.skills.import [hermes.skills]',
        'hermes.status [workspace.read]',
        'memory.recall [workspace.read]',
        'memory.remember [memory.write]',
        'notifications.send [notifications.send]',
        'schedule.remind [schedule.write]',
        'system.action [system.action]',
        'tasks.create [tasks.write]',
        'tasks.setStatus [tasks.write]'
      ].sort()
    )
  })
})
