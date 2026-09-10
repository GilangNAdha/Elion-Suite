import { useEffect, useState } from 'react'
import { db } from '../../lib/db'
import { timeAgo } from '../../lib/time'

/** Memory view (§37/§53): apa yang ELION simpan — dibaca dari memori nyata. */
interface MemoryRow {
  key: string
  value: string
  updatedAt: string
  kind: string
}

export function MemoryView() {
  const [rows, setRows] = useState<MemoryRow[] | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const all = await db.memories.orderBy('updatedAt').reverse().limit(100).toArray()
        setRows(
          all.map((m) => ({
            key: String((m as { key?: string }).key ?? m.id),
            value: String((m as { value?: string }).value ?? ''),
            updatedAt: String((m as { updatedAt?: string }).updatedAt ?? ''),
            kind: String((m as { kind?: string }).kind ?? 'note')
          }))
        )
      } catch {
        setRows([])
      }
    })()
  }, [])

  const filtered = (rows ?? []).filter(
    (r) => !query.trim() || `${r.key} ${r.value}`.toLowerCase().includes(query.trim().toLowerCase())
  )

  return (
    <div className="mem-view" aria-label="ELION memory">
      <header className="mon-sec-head">
        <h2>Memory</h2>
        <span className="mon-bg-count">{rows ? `${rows.length} records` : '…'}</span>
      </header>
      <p className="mon-note">
        What Elion explicitly remembers between sessions — created only by real memory.remember calls and skill
        promotions. Inspectable and clearable; nothing here is inferred.
      </p>
      <input
        className="mon-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter memory…"
        aria-label="Filter memory"
      />
      {rows === null ? (
        <p className="agent-empty">Loading…</p>
      ) : !filtered.length ? (
        <p className="agent-empty">
          {rows.length ? 'No matches.' : 'Memory is empty — Elion stores facts only when work justifies it.'}
        </p>
      ) : (
        <ul className="mem-list">
          {filtered.map((r) => (
            <li key={r.key}>
              <code>{r.key}</code>
              <p>{r.value}</p>
              <time>{r.updatedAt ? timeAgo(r.updatedAt) : ''}</time>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
