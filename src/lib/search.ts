// One global search index over items + pages (+ saved filters) — falls out
// of the Merge Matrix: because every surface shares stores, search is a single
// pass over those stores, not four per-page implementations (§7).

import type { PageRecord, SavedFilter, WorkspaceItem } from './types'

export interface SearchHit {
  id: string
  kind: 'item' | 'page' | 'filter'
  title: string
  subtitle: string
  route: string
  score: number
}

/** Subsequence fuzzy score; -1 when the query is not a subsequence. */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (!q) return 0
  let qi = 0
  let score = 0
  let streak = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++
      streak++
      score += 1 + streak * 2
      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '-') score += 6
    } else {
      streak = 0
    }
  }
  if (qi < q.length) return -1
  score += Math.max(0, 8 - Math.floor(t.length / 12))
  return score
}

export function globalSearch(
  query: string,
  inputs: {
    items: WorkspaceItem[]
    pages: PageRecord[]
    filters: SavedFilter[]
    databases: Record<string, { name: string; pageId: string }>
  },
  limit = 12
): SearchHit[] {
  const q = query.trim()
  if (!q) return []
  const hits: SearchHit[] = []

  for (const it of inputs.items) {
    const title = fuzzyScore(q, it.title)
    const body = it.description ? fuzzyScore(q, it.description) * 0.6 : -1
    const score = Math.max(title, body)
    if (score >= 0) {
      const db = it.databaseId ? inputs.databases[it.databaseId] : undefined
      hits.push({
        id: it.id,
        kind: 'item',
        title: it.title,
        subtitle: db ? db.name : 'Tasks',
        route: it.databaseId ? `workspace/items/${it.databaseId}` : '/tasks',
        score
      })
    }
  }

  for (const p of inputs.pages) {
    const score = fuzzyScore(q, p.title)
    if (score >= 0) {
      hits.push({
        id: p.id,
        kind: 'page',
        title: p.title,
        subtitle: p.branch === 'personal' ? 'Notes' : 'Workspace',
        route: p.branch === 'personal' ? `/notes/${p.id}` : `/workspace/${p.id}`,
        score: score * 0.95
      })
    }
  }

  for (const f of inputs.filters) {
    const score = fuzzyScore(q, f.name)
    if (score >= 0) {
      hits.push({
        id: f.id,
        kind: 'filter',
        title: f.name,
        subtitle: 'Saved filter',
        route: f.databaseId ? `workspace/items/${f.databaseId}` : '/tasks',
        score: score * 0.8
      })
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}
