import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/lib/db'
import { useActivityFeed } from '../src/lib/activity'
import {
  createSkill,
  deleteSkill,
  getSkillByName,
  listSkills,
  runSkill,
  setSkillEnabled,
  validateSteps
} from '../src/lib/agentSkills'
import { listSkills as ledgerRows } from '../src/lib/skills'
import { registerTool } from '../src/lib/tools'

/**
 * Executable skills (agent core) — langkah nyata lewat runTool
 * yang sama (permission tetap jalan), ledger terisi untuk skill buatan agent.
 */

registerTool({
  id: 'test.step',
  label: 'Test step',
  permission: 'none',
  run: async (args) => {
    if (args.fail === 'yes') return { ok: false, error: 'step exploded' }
    return { ok: true, output: `did:${String(args.label ?? '')}` }
  }
})

beforeEach(async () => {
  await db.agentSkills.clear()
  await db.skills.clear()
  await db.agentEvents.clear()
  useActivityFeed.setState({ events: [] })
})

describe('step validation', () => {
  it('rejects empty/unknown/oversized steps', () => {
    expect(validateSteps([]).error).toContain('at least one step')
    expect(validateSteps([{ tool: 'nope.tool', args: {} }]).error).toContain('unknown tool')
    expect(validateSteps('not-a-list').error).toBeDefined()
    expect(validateSteps(new Array(13).fill({ tool: 'test.step', args: {} })).error).toContain('12 steps')
  })

  it('normalizes valid steps and tolerates missing args', () => {
    const { steps, error } = validateSteps([{ tool: 'test.step', args: { label: 'x' } }, { tool: 'test.step' }])
    expect(error).toBeUndefined()
    expect(steps).toHaveLength(2)
    expect(steps[1].args).toEqual({})
    expect(steps[0].title).toBe('test.step') // default title = tool id
  })
})

describe('skill lifecycle', () => {
  it('creates, lists, renames-proof (no duplicates), deletes', async () => {
    await createSkill({ name: 'standup', steps: [{ tool: 'test.step', args: { label: 'a' } }] })
    await expect(createSkill({ name: 'standup', steps: [{ tool: 'test.step', args: {} }] })).rejects.toThrow('already exists')
    expect((await listSkills()).map((s) => s.name)).toEqual(['standup'])
    expect(await getSkillByName('standup')).toBeTruthy()
    await deleteSkill((await getSkillByName('standup'))!.id)
    expect(await listSkills()).toEqual([])
  })

  it('runs steps for real through runTool and records runCount/status/events', async () => {
    const skill = await createSkill({
      name: 'two-step',
      steps: [
        { tool: 'test.step', args: { label: 'one' }, title: 'first' },
        { tool: 'test.step', args: { label: 'two' }, title: 'second' }
      ]
    })
    const run = await runSkill('two-step')
    expect(run.ok).toBe(true)
    expect(run.steps.map((s) => `${s.ok ? '✓' : '✕'} ${s.title}`)).toEqual(['✓ first', '✓ second'])
    const updated = (await db.agentSkills.get(skill.id))!
    expect(updated.runCount).toBe(1)
    expect(updated.lastStatus).toBe('ok')
    const kinds = (await db.agentEvents.toArray()).map((e: { kind: string }) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining(['agent.skill.started', 'agent.skill.completed']))
  })

  it('stops at the first failing step by default and marks partial after a retry with one success', async () => {
    await createSkill({
      name: 'fragile',
      steps: [
        { tool: 'test.step', args: { fail: 'yes' }, title: 'boom' },
        { tool: 'test.step', args: {}, title: 'unreached' }
      ]
    })
    const run = await runSkill('fragile')
    expect(run.ok).toBe(false)
    expect(run.steps).toHaveLength(1) // berhenti di langkah gagal
    expect(run.steps[0].error).toContain('exploded')
    const updated = (await db.agentSkills.get((await getSkillByName('fragile'))!.id))!
    expect(updated.lastStatus).toBe('failed')
  })

  it('disabled skills refuse to run, honestly', async () => {
    const skill = await createSkill({ name: 'off', steps: [{ tool: 'test.step', args: {} }] })
    await setSkillEnabled(skill.id, false)
    const run = await runSkill('off')
    expect(run.ok).toBe(false)
    expect(run.error).toContain('disabled')
  })

  it('agent-authored skills land in the permanent Skill Ledger; user ones do not', async () => {
    await createSkill({ name: 'by-agent', steps: [{ tool: 'test.step', args: {} }], origin: 'agent' })
    await createSkill({ name: 'by-user', steps: [{ tool: 'test.step', args: {} }], origin: 'user' })
    const ledger = await ledgerRows()
    expect(ledger.map((r) => r.name)).toEqual(['by-agent'])
    expect(ledger[0].origin).toBe('authored')
    const events = await db.agentEvents.where('kind').equals('skill.promoted').toArray()
    expect(events).toHaveLength(1)
  })
})
