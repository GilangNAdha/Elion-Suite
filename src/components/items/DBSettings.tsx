import { useState } from 'react'
import { Plus, Trash2, CopyPlus, X } from 'lucide-react'
import type { Automation, AutomationAction, Priority, PropertyDef, StatusDef, ViewKind, WorkspaceDatabase } from '../../lib/types'
import { uid } from '../../lib/types'

function makeAction(kind: string, value: unknown): AutomationAction {
  if (kind === 'set-priority') return { kind: 'set-priority', value: (value as Priority) || 'medium' }
  if (kind === 'set-due-days') return { kind: 'set-due-days', value: Number(value) || 3 }
  if (kind === 'notify') return { kind: 'notify', value: String(value) }
  return { kind: 'add-label', value: String(value) }
}
import { Drawer } from '../editor/panels'
import { Button, Input, Select, Toggle } from '../ui'
import { useItemsStore } from '../../stores/itemsStore'
import { usePagesStore } from '../../stores/pagesStore'
import { useToasts } from '../ui'

const STATUS_COLORS = ['var(--ink-faint)', 'var(--info)', 'var(--warn)', 'var(--ok)', 'var(--bad)', 'var(--accent)']
const PROP_TYPES: PropertyDef['type'][] = ['select', 'multiSelect', 'number', 'date', 'checkbox', 'person', 'url', 'relation', 'rollup']

export function DBSettings({ db, onClose }: { db: WorkspaceDatabase; onClose: () => void }) {
  const upsertDatabase = useItemsStore((s) => s.upsertDatabase)
  const databases = useItemsStore((s) => s.databases)
  const saveTemplate = usePagesStore((s) => s.saveTemplate)
  const push = useToasts((s) => s.push)

  const [name, setName] = useState(db.name)
  const [statuses, setStatuses] = useState<StatusDef[]>(db.statuses)
  const [properties, setProperties] = useState<PropertyDef[]>(db.properties)
  const [automations, setAutomations] = useState<Automation[]>(db.automations)
  const [views, setViews] = useState(db.views)
  const [tplName, setTplName] = useState('')

  const commit = (patch: Partial<WorkspaceDatabase>) => {
    void upsertDatabase({ ...db, name, statuses, properties, automations, views, ...patch })
  }

  return (
    <Drawer
      title="Database settings"
      icon={<CopyPlus size={15} />}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          className="w-full"
          onClick={() => {
            commit({})
            push('Database saved', 'success')
          }}
        >
          Save changes
        </Button>
      }
    >
      <div className="space-y-5 p-1">
        <div>
          <label className="mb-1 block text-[0.75em] font-semibold uppercase tracking-wider text-ink-faint">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Database name" />
        </div>

        <div>
          <div className="mb-1.5 text-[0.75em] font-semibold uppercase tracking-wider text-ink-faint">
            Workflow (statuses)
          </div>
          <div className="space-y-1.5">
            {statuses.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1.5">
                <select
                  className="h-8 w-6 rounded-token-sm border border-line bg-surface px-1 text-[0.75em]"
                  value={s.color}
                  aria-label="Status color"
                  onChange={(e) =>
                    setStatuses((ss) => ss.map((x, xi) => (xi === i ? { ...x, color: e.target.value } : x)))
                  }
                >
                  {STATUS_COLORS.map((c) => (
                    <option key={c} value={c}>
                      ●
                    </option>
                  ))}
                </select>
                <Input
                  value={s.name}
                  className="h-8"
                  aria-label="Status name"
                  onChange={(e) => setStatuses((ss) => ss.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))}
                />
                <label className="flex items-center gap-1 text-[0.7em] text-ink-muted">
                  <input
                    type="checkbox"
                    className="accent-[var(--primary)]"
                    checked={!!s.isDone}
                    onChange={(e) => setStatuses((ss) => ss.map((x, xi) => (xi === i ? { ...x, isDone: e.target.checked } : x)))}
                  />
                  done
                </label>
                <button
                  className="focus-ring rounded p-1 text-ink-faint hover:text-bad"
                  aria-label={`Delete ${s.name}`}
                  disabled={statuses.length <= 1}
                  onClick={() => setStatuses((ss) => ss.filter((_, xi) => xi !== i))}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1.5"
            icon={<Plus size={13} />}
            onClick={() => setStatuses((ss) => [...ss, { id: uid(), name: `Stage ${ss.length + 1}`, color: 'var(--info)' }])}
          >
            Add status
          </Button>
        </div>

        <div>
          <div className="mb-1.5 text-[0.75em] font-semibold uppercase tracking-wider text-ink-faint">
            Properties (Notion-style)
          </div>
          <div className="space-y-1.5">
            {properties.map((p, i) => (
              <div key={p.id} className="rounded-token border border-line bg-surface/40 p-2">
                <div className="flex items-center gap-1.5">
                  <Input
                    value={p.name}
                    className="h-8"
                    aria-label="Property name"
                    onChange={(e) => setProperties((ps) => ps.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <Select
                    value={p.type}
                    className="h-8 w-32"
                    aria-label="Property type"
                    onChange={(e) =>
                      setProperties((ps) =>
                        ps.map((x, xi) => (xi === i ? { ...x, type: e.target.value as PropertyDef['type'] } : x))
                      )
                    }
                  >
                    {PROP_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                  <button
                    className="focus-ring rounded p-1 text-ink-faint hover:text-bad"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => setProperties((ps) => ps.filter((_, xi) => xi !== i))}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {p.type === 'select' || p.type === 'multiSelect' ? (
                  <Input
                    className="mt-1.5 h-8 text-[0.8em]"
                    placeholder="Options (comma-separated)"
                    value={(p.options ?? []).join(', ')}
                    aria-label="Options"
                    onChange={(e) =>
                      setProperties((ps) =>
                        ps.map((x, xi) =>
                          xi === i
                            ? { ...x, options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) }
                            : x
                        )
                      )
                    }
                  />
                ) : p.type === 'relation' ? (
                  <Select
                    value={p.relationDbId ?? ''}
                    className="mt-1.5 h-8"
                    aria-label="Related database"
                    onChange={(e) =>
                      setProperties((ps) =>
                        ps.map((x, xi) => (xi === i ? { ...x, relationDbId: e.target.value || undefined } : x))
                      )
                    }
                  >
                    <option value="">Pick database…</option>
                    {Object.values(databases)
                      .filter((d) => d.id !== db.id)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </Select>
                ) : p.type === 'rollup' ? (
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                    <Select
                      value={p.rollup?.dbId ?? ''}
                      className="h-8 text-[0.8em]"
                      aria-label="Rollup database"
                      onChange={(e) =>
                        setProperties((ps) =>
                          ps.map((x, xi) =>
                            xi === i
                              ? { ...x, rollup: { dbId: e.target.value, field: p.rollup?.field ?? 'storyPoints', op: p.rollup?.op ?? 'sum' } }
                              : x
                          )
                        )
                      }
                    >
                      <option value="">db…</option>
                      {Object.values(databases)
                        .filter((d) => d.id !== db.id)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                    </Select>
                    <Select
                      value={p.rollup?.field ?? 'storyPoints'}
                      className="h-8 text-[0.8em]"
                      aria-label="Rollup field"
                      onChange={(e) =>
                        setProperties((ps) =>
                          ps.map((x, xi) => (xi === i ? { ...x, rollup: { ...p.rollup!, field: e.target.value } } : x))
                        )
                      }
                    >
                      {['storyPoints', 'dueDate', 'title', 'priority'].map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={p.rollup?.op ?? 'sum'}
                      className="h-8 text-[0.8em]"
                      aria-label="Rollup operation"
                      onChange={(e) =>
                        setProperties((ps) =>
                          ps.map((x, xi) =>
                            xi === i
                              ? { ...x, rollup: { ...p.rollup!, op: e.target.value as 'sum' } }
                              : x
                          )
                        )
                      }
                    >
                      {['sum', 'count', 'avg', 'min', 'max'].map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1.5"
            icon={<Plus size={13} />}
            onClick={() => setProperties((ps) => [...ps, { id: uid(), name: `Property ${ps.length + 1}`, type: 'select' }])}
          >
            Add property
          </Button>
        </div>

        <div>
          <div className="mb-1.5 text-[0.75em] font-semibold uppercase tracking-wider text-ink-faint">
            Automations (transition-triggered)
          </div>
          <div className="space-y-1.5">
            {automations.map((a, i) => (
              <div key={a.id} className="rounded-token border border-line bg-surface/40 p-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[0.75em] text-ink-muted">when →</span>
                  <Select
                    value={a.onStatus}
                    className="h-8 flex-1"
                    aria-label="Trigger status"
                    onChange={(e) =>
                      setAutomations((as) => as.map((x, xi) => (xi === i ? { ...x, onStatus: e.target.value } : x)))
                    }
                  >
                    {statuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <button
                    className="focus-ring rounded p-1 text-ink-faint hover:text-bad"
                    aria-label="Delete automation"
                    onClick={() => setAutomations((as) => as.filter((_, xi) => xi !== i))}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="mt-1.5 space-y-1">
                  {a.actions.map((act, ai) => (
                    <div key={ai} className="flex items-center gap-1.5">
                      <Select
                        value={act.kind}
                        className="h-8 w-32 text-[0.8em]"
                        aria-label="Action kind"
                        onChange={(e) =>
                          setAutomations((as) =>
                            as.map((x, xi) =>
                              xi === i
                                ? {
                                    ...x,
                                    actions: x.actions.map((yy, yi) =>
                                      yi === ai
                                        ? makeAction(e.target.value, e.target.value === 'set-priority' ? 'medium' : e.target.value === 'set-due-days' ? 3 : '')
                                        : yy
                                    )
                                  }
                                : x
                            )
                          )
                        }
                      >
                        <option value="set-priority">set priority</option>
                        <option value="add-label">add label</option>
                        <option value="set-due-days">due in days</option>
                        <option value="notify">notify</option>
                      </Select>
                      <Input
                        value={String(act.value ?? '')}
                        className="h-8 text-[0.8em]"
                        aria-label="Action value"
                        onChange={(e) =>
                          setAutomations((as) =>
                            as.map((x, xi) =>
                              xi === i
                                ? {
                                    ...x,
                                    actions: x.actions.map((yy, yi) =>
                                      yi === ai
                                        ? makeAction(act.kind, e.target.value)
                                        : yy
                                    )
                                  }
                                : x
                            )
                          )
                        }
                      />
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Plus size={12} />}
                    onClick={() =>
                      setAutomations((as) =>
                        as.map((x, xi) =>
                          xi === i ? { ...x, actions: [...x.actions, { kind: 'add-label', value: 'flagged' }] } : x
                        )
                      )
                    }
                  >
                    Action
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1.5"
            icon={<Plus size={13} />}
            onClick={() =>
              setAutomations((as) => [
                ...as,
                { id: uid(), onStatus: statuses[1]?.id ?? statuses[0].id, actions: [{ kind: 'notify', value: 'Moved to new status' }] }
              ])
            }
          >
            Add automation
          </Button>
        </div>

        <div>
          <div className="mb-1.5 text-[0.75em] font-semibold uppercase tracking-wider text-ink-faint">Views</div>
          <div className="space-y-1.5">
            {views.map((v, i) => (
              <div key={v.id} className="rounded-token border border-line bg-surface/40 p-2">
                <div className="flex items-center gap-1.5">
                  <Input
                    value={v.name}
                    className="h-8"
                    aria-label="View name"
                    onChange={(e) => setViews((vs) => vs.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))}
                  />
                  <Select
                    value={v.swimlane ?? 'none'}
                    className="h-8 w-28 text-[0.8em]"
                    aria-label="Swimlanes"
                    onChange={(e) =>
                      setViews((vs) => vs.map((x, xi) => (xi === i ? { ...x, swimlane: e.target.value as 'none' } : x)))
                    }
                  >
                    <option value="none">No lanes</option>
                    <option value="assignee">Assignee</option>
                    <option value="epic">Epic</option>
                  </Select>
                  <button
                    className="focus-ring rounded p-1 text-ink-faint hover:text-bad"
                    aria-label={`Delete view ${v.name}`}
                    onClick={() => setViews((vs) => vs.filter((_, xi) => xi !== i))}
                    disabled={views.length <= 1}
                  >
                    <X size={13} />
                  </button>
                </div>
                {v.kind === 'board' && (
                  <div className="mt-1.5 flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[0.78em] text-ink-muted">
                      WIP limit
                      <input
                        type="number"
                        min={1}
                        className="focus-ring h-7 w-16 rounded-token-sm border border-line bg-surface px-2 text-[0.8em]"
                        value={v.wipLimit ?? ''}
                        onChange={(e) =>
                          setViews((vs) =>
                            vs.map((x, xi) => (xi === i ? { ...x, wipLimit: e.target.value ? Number(e.target.value) : undefined } : x))
                          )
                        }
                      />
                    </label>
                    <Toggle
                      label="Sprint only"
                      checked={!!(v as { sprintOnly?: boolean }).sprintOnly}
                      onChange={(on) => setViews((vs) => vs.map((x, xi) => (xi === i ? { ...x, sprintOnly: on } : x)))}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-1.5"
            icon={<Plus size={13} />}
            onClick={() =>
              setViews((vs) => [
                ...vs,
                {
                  id: uid(),
                  name: `View ${vs.length + 1}`,
                  kind: 'table' as ViewKind,
                  visibleProperties: ['title', 'status'],
                  swimlane: 'none'
                }
              ])
            }
          >
            Add view
          </Button>
        </div>

        <div>
          <div className="mb-1.5 text-[0.75em] font-semibold uppercase tracking-wider text-ink-faint">Template</div>
          <div className="flex gap-1.5">
            <Input placeholder="Template name" value={tplName} onChange={(e) => setTplName(e.target.value)} aria-label="Database template name" />
            <Button
              size="sm"
              variant="outline"
              disabled={!tplName.trim()}
              onClick={async () => {
                await saveTemplate(tplName.trim(), 'database', {
                  database: {
                    name,
                    statuses,
                    properties,
                    views,
                    automations,
                    defaultType: db.defaultType
                  }
                })
                setTplName('')
                push('Database template saved', 'success')
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  )
}
