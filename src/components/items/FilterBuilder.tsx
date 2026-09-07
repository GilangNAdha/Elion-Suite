import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { FilterNode, SavedFilter, WorkspaceDatabase } from '../../lib/types'
import { uid } from '../../lib/types'
import { OPS_BY_KIND, parseRawQuery, type FieldDef } from '../../lib/filterEngine'
import { usePagesStore } from '../../stores/pagesStore'
import { Modal, Button, Input, Select, Toggle, Textarea } from '../ui'

/**
 * Saved filters / visual query builder (§9.3) — property + operator + value
 * with AND/OR grouping; the accessible path, with an optional raw mode.
 */
export function FilterBuilder({
  db,
  databaseId,
  fields,
  onClose,
  onApply
}: {
  db: WorkspaceDatabase | null
  databaseId: string
  fields: FieldDef[]
  onClose: () => void
  onApply: (name: string, query: FilterNode) => void
}) {
  const upsertFilter = usePagesStore((s) => s.upsertFilter)
  const [name, setName] = useState('')
  const [op, setOp] = useState<'and' | 'or'>('and')
  const [rows, setRows] = useState<FilterNode['children']>([
    { id: uid(), field: 'title', op: 'contains', value: '' }
  ])
  const [rawMode, setRawMode] = useState(false)
  const [raw, setRaw] = useState('')

  const fieldDef = (key: string) => fields.find((f) => f.key === key)

  const build = (): FilterNode | null => {
    const clean = rows.filter((r) => !('field' in r === false))
    if (clean.length === 0) return null
    return { op, children: clean }
  }

  const save = async () => {
    const q = rawMode ? parseRawQuery(raw) : build()
    if (!q) return
    const f: SavedFilter = {
      id: uid(),
      name: name.trim() || 'Untitled filter',
      databaseId: databaseId === 'unassigned' ? null : databaseId,
      query: q,
      createdAt: new Date().toISOString()
    }
    await upsertFilter(f)
    onApply(f.name, q)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Query builder"
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!name.trim() && false}>
            {rawMode ? 'Parse & apply' : 'Apply'}
            {name.trim() ? ' & save' : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Input placeholder="Filter name (to save)" value={name} onChange={(e) => setName(e.target.value)} aria-label="Filter name" />
          <Toggle label="" checked={rawMode} onChange={setRawMode} />
          <span className="whitespace-nowrap text-[0.8em] text-ink-muted">Raw mode</span>
        </div>

        {rawMode ? (
          <>
            <p className="text-[0.78em] text-ink-faint">
              Example: <code className="rounded bg-sunken px-1">title contains ship AND status = todo</code> — joined
              with AND. The visual builder remains the primary path.
            </p>
            <Textarea rows={3} value={raw} onChange={(e) => setRaw(e.target.value)} aria-label="Raw query" />
          </>
        ) : (
          <div className="rounded-token border border-line bg-surface/40 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[0.78em] text-ink-muted">Match</span>
              <div className="flex gap-1">
                {(['and', 'or'] as const).map((o) => (
                  <button
                    key={o}
                    className={`focus-ring rounded-token-sm px-2.5 py-0.5 text-[0.8em] font-semibold ${
                      op === o ? 'bg-primary text-primary-on' : 'bg-sunken text-ink-muted'
                    }`}
                    aria-pressed={op === o}
                    onClick={() => setOp(o)}
                  >
                    {o.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              {rows.map((r, i) => {
                if ('op' in r && !('field' in r)) return null // nested group placeholder (kept flat for v1)
                const p = r as { id: string; field: string; op: string; value: string }
                const fd = fieldDef(p.field)
                const ops = fd ? OPS_BY_KIND[fd.kind] : []
                return (
                  <div key={p.id} className="flex items-center gap-1.5">
                    <Select
                      value={p.field}
                      className="w-40"
                      aria-label="Field"
                      onChange={(e) => {
                        const f = e.target.value
                        const nd = fieldDef(f)
                        setRows((rs) =>
                          rs.map((x, xi) =>
                            xi === i
                              ? { ...(x as typeof p), field: f, op: nd ? OPS_BY_KIND[nd.kind][0].op : 'contains' }
                              : x
                          )
                        )
                      }}
                    >
                      {fields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={p.op}
                      className="w-32"
                      aria-label="Operator"
                      onChange={(e) =>
                        setRows((rs) => rs.map((x, xi) => (xi === i ? { ...(x as typeof p), op: e.target.value } : x)))
                      }
                    >
                      {ops.map((o) => (
                        <option key={o.op} value={o.op}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                    <InputValueRow
                      row={p}
                      fields={fields}
                      db={db}
                      onChange={(value) => setRows((rs) => rs.map((x, xi) => (xi === i ? { ...(x as typeof p), value } : x)))}
                    />
                    <button
                      className="focus-ring rounded-token-sm p-1.5 text-ink-faint hover:text-bad"
                      aria-label="Remove condition"
                      onClick={() => setRows((rs) => rs.filter((_, xi) => xi !== i))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
            <Button size="sm" variant="ghost" className="mt-2" icon={<Plus size={13} />} onClick={() => setRows((rs) => [...rs, { id: uid(), field: 'status', op: 'equals', value: '' }])}>
              Add condition
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

function InputValueRow({
  row,
  fields,
  db,
  onChange
}: {
  row: { field: string; op: string; value: string }
  fields: FieldDef[]
  db: WorkspaceDatabase | null
  onChange: (v: string) => void
}) {
  const fd = fields.find((f) => f.key === row.field)
  if (!fd) return null
  if (fd.kind === 'date')
    return <Input type="date" value={row.value} onChange={(e) => onChange(e.target.value)} className="w-44" aria-label="Value" />
  if (fd.kind === 'number')
    return <Input type="number" value={row.value} onChange={(e) => onChange(e.target.value)} className="w-28" aria-label="Value" />
  if (fd.kind === 'select') {
    if (row.field === 'status')
      return (
        <Select value={row.value} onChange={(e) => onChange(e.target.value)} className="w-40" aria-label="Value">
          <option value="">(any)</option>
          {(db?.statuses ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      )
    if (row.field === 'priority')
      return (
        <Select value={row.value} onChange={(e) => onChange(e.target.value)} className="w-40" aria-label="Value">
          {['lowest', 'low', 'medium', 'high', 'highest'].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
      )
    const prop = db?.properties.find((p) => `cf:${p.id}` === row.field)
    return (
      <Select value={row.value} onChange={(e) => onChange(e.target.value)} className="w-40" aria-label="Value">
        <option value="">(any)</option>
        {(prop?.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    )
  }
  if (fd.kind === 'bool')
    return (
      <Select value={row.value} onChange={(e) => onChange(e.target.value)} className="w-32" aria-label="Value">
        <option value="true">checked</option>
        <option value="false">unchecked</option>
      </Select>
    )
  return <Input value={row.value} onChange={(e) => onChange(e.target.value)} className="flex-1" aria-label="Value" />
}
