import { describe, expect, it } from 'vitest'
import { applyFilter, parseRawQuery, fieldsFor } from '../src/lib/filterEngine'
import type { WorkspaceItem } from '../src/lib/types'

const mk = (p: Partial<WorkspaceItem>): WorkspaceItem => ({
  id: p.id ?? 'x',
  type: 'task',
  title: p.title ?? 't',
  description: '',
  status: p.status ?? 'todo',
  priority: p.priority ?? 'medium',
  labels: p.labels ?? [],
  databaseId: null,
  dueDate: p.dueDate,
  customFields: p.customFields ?? {},
  rank: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
})

const items: WorkspaceItem[] = [
  mk({ id: '1', title: 'Ship the editor', status: 'doing', priority: 'high', labels: ['editor'], dueDate: '2026-09-10' }),
  mk({ id: '2', title: 'Fix onboarding', status: 'todo', priority: 'low', labels: ['bug'] }),
  mk({ id: '3', title: 'Editor perf pass', status: 'done', priority: 'medium', labels: ['editor', 'perf'] })
]

const fields = fieldsFor([])

describe('saved filters / visual query builder (§9.3)', () => {
  it('evaluates AND predicates', () => {
    const q = {
      op: 'and' as const,
      children: [
        { id: 'a', field: 'status', op: 'equals', value: 'doing' },
        { id: 'b', field: 'labels', op: 'has', value: 'editor' }
      ]
    }
    const out = applyFilter(items, q, fields)
    expect(out.map((i) => i.id)).toEqual(['1'])
  })

  it('evaluates OR predicates', () => {
    const q = {
      op: 'or' as const,
      children: [
        { id: 'a', field: 'status', op: 'equals', value: 'done' },
        { id: 'b', field: 'priority', op: 'equals', value: 'low' }
      ]
    }
    const out = applyFilter(items, q, fields)
    expect(out.map((i) => i.id).sort()).toEqual(['2', '3'])
  })

  it('text contains is case-insensitive', () => {
    const q = {
      op: 'and' as const,
      children: [{ id: 'a', field: 'title', op: 'contains', value: 'EDITOR' }]
    }
    expect(applyFilter(items, q, fields).map((i) => i.id).sort()).toEqual(['1', '3'])
  })

  it('parses the raw power-user expression', () => {
    const q = parseRawQuery('title contains editor AND status = doing')
    expect(q).toBeTruthy()
    const out = applyFilter(items, q!, fields)
    expect(out.map((i) => i.id)).toEqual(['1'])
    expect(parseRawQuery('nonsense !!!')).toBeNull()
  })
})
