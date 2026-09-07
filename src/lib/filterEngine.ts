// Saved-filter / visual query builder engine (§9.3) — the accessible
// equivalent of JQL: property + operator + value with AND/OR grouping.

import type { FilterNode, FilterPredicate, PropertyDef, WorkspaceItem } from './types'
import { isPredicate } from './types'

export type FieldDef = { key: string; label: string; kind: 'text' | 'select' | 'date' | 'number' | 'bool' | 'multi' }

export function fieldsFor(properties: PropertyDef[]): FieldDef[] {
  const base: FieldDef[] = [
    { key: 'title', label: 'Title', kind: 'text' },
    { key: 'status', label: 'Status', kind: 'select' },
    { key: 'priority', label: 'Priority', kind: 'select' },
    { key: 'assignee', label: 'Assignee', kind: 'text' },
    { key: 'labels', label: 'Labels', kind: 'multi' },
    { key: 'dueDate', label: 'Due date', kind: 'date' },
    { key: 'storyPoints', label: 'Story points', kind: 'number' },
    { key: 'type', label: 'Type', kind: 'select' }
  ]
  for (const p of properties) {
    const kind: FieldDef['kind'] =
      p.type === 'select'
        ? 'select'
        : p.type === 'multiSelect'
          ? 'multi'
          : p.type === 'number'
            ? 'number'
            : p.type === 'date'
              ? 'date'
              : p.type === 'checkbox'
                ? 'bool'
                : 'text'
    base.push({ key: `cf:${p.id}`, label: p.name, kind })
  }
  return base
}

export const OPS_BY_KIND: Record<FieldDef['kind'], { op: string; label: string }[]> = {
  text: [
    { op: 'contains', label: 'contains' },
    { op: 'equals', label: 'equals' },
    { op: 'starts', label: 'starts with' },
    { op: 'not', label: 'does not contain' }
  ],
  select: [
    { op: 'equals', label: 'is' },
    { op: 'neq', label: 'is not' },
    { op: 'any', label: 'is any of' }
  ],
  date: [
    { op: 'on', label: 'on' },
    { op: 'before', label: 'before' },
    { op: 'after', label: 'after' },
    { op: 'within', label: 'within days' },
    { op: 'empty', label: 'is empty' },
    { op: 'notempty', label: 'is set' }
  ],
  number: [
    { op: 'eq', label: '=' },
    { op: 'gt', label: '>' },
    { op: 'lt', label: '<' },
    { op: 'gte', label: '≥' }
  ],
  bool: [
    { op: 'true', label: 'is checked' },
    { op: 'false', label: 'is unchecked' }
  ],
  multi: [
    { op: 'has', label: 'has label' },
    { op: 'nolabel', label: 'missing label' }
  ]
}

function fieldValue(item: WorkspaceItem, key: string): unknown {
  if (key.startsWith('cf:')) return item.customFields[key.slice(3)]
  return (item as unknown as Record<string, unknown>)[key]
}

function evalPredicate(p: FilterPredicate, item: WorkspaceItem, fields: FieldDef[]): boolean {
  const field = fields.find((f) => f.key === p.field)
  if (!field) return true
  const raw = fieldValue(item, p.field)

  switch (field.kind) {
    case 'text': {
      const v = String(raw ?? '').toLowerCase()
      const needle = p.value.toLowerCase()
      switch (p.op) {
        case 'contains':
          return v.includes(needle)
        case 'equals':
          return v === needle
        case 'starts':
          return v.startsWith(needle)
        case 'not':
          return !v.includes(needle)
        default:
          return true
      }
    }
    case 'select': {
      const v = String(raw ?? '')
      if (p.op === 'equals') return v === p.value
      if (p.op === 'neq') return v !== p.value
      if (p.op === 'any') return p.value.split(',').map((x) => x.trim()).includes(v)
      return true
    }
    case 'date': {
      if (p.op === 'empty') return !raw
      if (p.op === 'notempty') return !!raw
      if (!raw) return false
      const d = String(raw).slice(0, 10)
      if (p.op === 'on') return d === p.value
      if (p.op === 'before') return d < p.value
      if (p.op === 'after') return d > p.value
      if (p.op === 'within') {
        const days = Number(p.value) || 30
        const limit = new Date()
        limit.setDate(limit.getDate() + days)
        return d >= '2000-01-01' && d <= limit.toISOString().slice(0, 10)
      }
      return true
    }
    case 'number': {
      const n = Number(raw)
      const target = Number(p.value)
      if (Number.isNaN(n)) return p.op === 'eq' && Number.isNaN(target)
      switch (p.op) {
        case 'eq':
          return n === target
        case 'gt':
          return n > target
        case 'lt':
          return n < target
        case 'gte':
          return n >= target
        default:
          return true
      }
    }
    case 'bool':
      return p.op === 'true' ? !!raw : !raw
    case 'multi': {
      const arr = Array.isArray(raw) ? (raw as string[]) : []
      return p.op === 'has' ? arr.includes(p.value) : !arr.includes(p.value)
    }
  }
}

export function applyFilter(
  items: WorkspaceItem[],
  query: FilterNode | null,
  fields: FieldDef[]
): WorkspaceItem[] {
  if (!query || query.children.length === 0) return items
  const match = (node: FilterNode | FilterPredicate, item: WorkspaceItem): boolean => {
    if (isPredicate(node)) return evalPredicate(node, item, fields)
    if (node.children.length === 0) return true
    return node.op === 'and'
      ? node.children.every((c) => match(c, item))
      : node.children.some((c) => match(c, item))
  }
  return items.filter((i) => match(query, i))
}

// --- Optional raw-expression power-user mode --------------------------------
// Parses a simple string: `title contains foo AND status = todo`
// (operators: contains, starts, =, !=, >, <, ≥, has; joined by AND/OR)

export function parseRawQuery(raw: string): FilterNode | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // split on AND/OR — non-capturing so the separator never lands in the token list
  const tokens = trimmed.split(/\s+(?:AND|OR)\s+/i)
  const children: FilterPredicate[] = []
  for (const tok of tokens) {
    const m = tok.match(/^\s*(\w[\w:]*)\s+(contains|starts|has|≥|>=|<=|>|<|!=|=)\s*(.+?)\s*$/)
    if (!m) return null
    const key = m[1]
    const op = m[2]
    const value = m[3].replace(/^["']|["']$/g, '')
    const opMap: Record<string, string> = {
      contains: 'contains',
      starts: 'starts',
      has: 'has',
      '=': 'equals',
      '!=': 'neq',
      '>': 'gt',
      '<': 'lt',
      '≥': 'gte',
      '>=': 'gte',
      '<=': 'lt'
    }
    children.push({ id: `raw-${children.length}`, field: key, op: opMap[op] ?? 'contains', value })
  }
  if (children.length === 0) return null
  // join with AND (raw mode keeps it simple; builder is the primary path)
  return { op: 'and', children }
}
