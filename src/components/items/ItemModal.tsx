import { useMemo, useRef, useState } from 'react'
import { Trash2, ImagePlus } from 'lucide-react'
import type { ItemType, Priority, RecurrenceRule, WorkspaceDatabase, WorkspaceItem } from '../../lib/types'
import { Modal, Button, Input, Select, Textarea, Toggle, MenuSep, useToasts } from '../ui'
import { useItemsStore } from '../../stores/itemsStore'
import { usePetStore } from '../../stores/petStore'
import { DictationButton } from '../Dictation'
import { todayISO } from '../../lib/time'
import { DEFAULT_STATUSES } from '../views/views'

const PRIORITIES: Priority[] = ['lowest', 'low', 'medium', 'high', 'highest']
const TYPES: ItemType[] = ['task', 'story', 'epic', 'subtask', 'habit']

type ItemModalProps = {
  db: WorkspaceDatabase | null
  databaseId: string | null
  editing: WorkspaceItem | null
  creating: Partial<WorkspaceItem> | null
  onClose: () => void
}

/**
 * §44 object-switch correctness: the ITEM ID is the source of truth.
 * Switching to another object (or external update of the same one) remounts
 * the form AND always hydrates from the live store copy — so no save can ever
 * write a stale snapshot onto a different object.
 */
export function ItemModal(props: ItemModalProps) {
  return <ItemModalForm key={props.editing?.id ?? (props.creating ? 'create' : 'none')} {...props} />
}

function ItemModalForm({
  db,
  databaseId,
  editing: editingProp,
  creating,
  onClose
}: ItemModalProps) {
  // Ambil salinan TERBARU dari store (bukan snapshot saat caller mengklik).
  const editing = useItemsStore((s) => (editingProp ? s.items[editingProp.id] ?? editingProp : null))
  const createItem = useItemsStore((s) => s.createItem)
  const updateItem = useItemsStore((s) => s.updateItem)
  const deleteItem = useItemsStore((s) => s.deleteItem)
  const sprints = useItemsStore((s) => s.sprints)
  const bumpHappy = usePetStore((s) => s.bumpHappy)

  const statuses = db?.statuses ?? DEFAULT_STATUSES
  const titleRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState(editing?.title ?? creating?.title ?? '')
  const [type, setType] = useState<ItemType>(editing?.type ?? creating?.type ?? db?.defaultType ?? 'task')
  const [status, setStatus] = useState(
    editing?.status ??
      creating?.status ??
      (db ? (statuses.find((s) => !s.isBacklog)?.id ?? statuses[0].id) : 'todo')
  )
  const [priority, setPriority] = useState<Priority>(editing?.priority ?? 'medium')
  const [assignee, setAssignee] = useState(editing?.assignee ?? '')
  const [labels, setLabels] = useState((editing?.labels ?? []).join(', '))
  const [dueDate, setDueDate] = useState(editing?.dueDate ?? creating?.dueDate ?? '')
  const [startDate, setStartDate] = useState(editing?.startDate ?? '')
  const [storyPoints, setStoryPoints] = useState(editing?.storyPoints?.toString() ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [sprintId, setSprintId] = useState(editing?.sprintId ?? '')
  const [freq, setFreq] = useState<RecurrenceRule['freq']>(editing?.recurrence?.freq ?? 'daily')
  const [weekDays, setWeekDays] = useState<number[]>(editing?.recurrence?.days ?? [1, 3, 5])
  const [cover, setCover] = useState(editing?.cover ?? '')
  const [cf, setCf] = useState<Record<string, unknown>>(editing?.customFields ?? {})

  const dbSprints = useMemo(
    () => Object.values(sprints).filter((s) => s.databaseId === (db?.id ?? null)),
    [sprints, db?.id]
  )

  const save = async () => {
    const trimmed = title.trim()
    if (!trimmed) return
    const recurrence: RecurrenceRule | undefined =
      type === 'habit'
        ? {
            freq,
            days: freq === 'weekly' ? weekDays : undefined
          }
        : undefined
    const payload: Partial<WorkspaceItem> = {
      title: trimmed,
      type,
      status,
      priority,
      assignee: assignee.trim() || undefined,
      labels: labels
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean),
      dueDate: dueDate || undefined,
      startDate: startDate || undefined,
      storyPoints: storyPoints ? Number(storyPoints) : undefined,
      description,
      sprintId: sprintId || undefined,
      recurrence,
      customFields: cf,
      cover: cover || undefined
    }
    if (editing) {
      await updateItem(editing.id, payload)
    } else {
      await createItem({ ...payload, title: trimmed, databaseId })
    }
    useToasts
      .getState()
      .push(editing ? 'Changes saved' : type === 'habit' ? 'Habit created' : 'Task created', 'success')
    onClose()
  }

  const remove = async () => {
    if (editing) {
      await deleteItem(editing.id)
      onClose()
    }
  }

  const doneToday = editing?.type === 'habit' && (editing.completions ?? []).includes(todayISO())

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit item' : 'New item'}
      footer={
        <>
          {editing && (
            <>
              <Button variant="danger" icon={<Trash2 size={13} />} onClick={() => void remove()}>
                Delete
              </Button>
              <span className="flex-1" />
            </>
          )}
          {editing?.type === 'habit' && (
            <Button
              variant="soft"
              onClick={async () => {
                await useItemsStore.getState().toggleHabitCompletion(editing.id, todayISO())
                bumpHappy()
              }}
            >
              {doneToday ? 'Undo today' : 'Mark done today'}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!title.trim()} onClick={() => void save()}>
            {editing ? 'Save changes' : type === 'habit' ? 'Create habit' : 'Create task'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="voice-input">
          <Input
            ref={titleRef}
            placeholder="Item title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            aria-label="Title"
          />
          <DictationButton
            label={type === 'habit' ? 'Dictate habit title' : 'Dictate task title'}
            getTarget={() => titleRef.current}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[0.78em] text-ink-muted">Type</span>
            <Select value={type} onChange={(e) => setType(e.target.value as ItemType)} aria-label="Type">
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.78em] text-ink-muted">Status</span>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.78em] text-ink-muted">Priority</span>
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              aria-label="Priority"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.78em] text-ink-muted">Assignee</span>
            <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.78em] text-ink-muted">Start date</span>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Start date"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[0.78em] text-ink-muted">Due date</span>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Due date"
            />
          </label>
          {db && (
            <label className="block">
              <span className="mb-1 block text-[0.78em] text-ink-muted">Story points</span>
              <Input
                type="number"
                min={0}
                value={storyPoints}
                onChange={(e) => setStoryPoints(e.target.value)}
                aria-label="Story points"
              />
            </label>
          )}
          {db && dbSprints.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-[0.78em] text-ink-muted">Sprint</span>
              <Select value={sprintId} onChange={(e) => setSprintId(e.target.value)} aria-label="Sprint">
                <option value="">No sprint</option>
                {dbSprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-[0.78em] text-ink-muted">Labels (comma-separated)</span>
            <Input
              value={labels}
              onChange={(e) => setLabels(e.target.value)}
              aria-label="Labels"
              placeholder="design, q3"
            />
          </label>
        </div>

        {type === 'habit' && (
          <div className="rounded-token border border-ok/30 bg-ok/5 p-3">
            <div className="mb-2 text-[0.8em] font-semibold text-ok">Recurrence</div>
            <div className="grid grid-cols-2 gap-3">
              <Select
                value={freq}
                onChange={(e) => setFreq(e.target.value as RecurrenceRule['freq'])}
                aria-label="Recurrence"
              >
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekly">Weekly</option>
              </Select>
              {freq === 'weekly' && (
                <div className="flex flex-wrap gap-1">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <button
                      key={i}
                      className={`focus-ring h-8 w-8 rounded-full text-[0.78em] font-semibold ${
                        weekDays.includes(i) ? 'bg-ok text-[var(--on-ok)]' : 'bg-sunken text-ink-muted'
                      }`}
                      aria-pressed={weekDays.includes(i)}
                      onClick={() =>
                        setWeekDays((wd) => (wd.includes(i) ? wd.filter((x) => x !== i) : [...wd, i].sort()))
                      }
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <span className="mb-1 block text-[0.78em] text-ink-muted">Description</span>
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="Description"
          />
        </div>

        {/* custom fields (Notion-style property system) */}
        {db && db.properties.length > 0 && (
          <div className="rounded-token border border-line bg-surface/40 p-3">
            <div className="mb-2 text-[0.78em] font-semibold text-ink-muted">Properties</div>
            <div className="grid grid-cols-2 gap-3">
              {db.properties.map((p) => (
                <CustomFieldEditor
                  key={p.id}
                  p={p}
                  value={cf[p.id]}
                  onChange={(v) => setCf((c) => ({ ...c, [p.id]: v }))}
                />
              ))}
            </div>
          </div>
        )}

        <div>
          <span className="mb-1 block text-[0.78em] text-ink-muted">Cover image (Gallery view)</span>
          <div className="flex items-center gap-2">
            {cover ? (
              <img src={cover} alt="cover" className="h-14 w-24 rounded-token object-cover" />
            ) : (
              <span className="flex h-14 w-24 items-center justify-center rounded-token border border-dashed border-line text-ink-faint">
                <ImagePlus size={16} />
              </span>
            )}
            <label className="cursor-pointer text-[0.85em] text-ink-muted hover:text-ink">
              Upload…
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const r = new FileReader()
                  r.onload = () => setCover(String(r.result))
                  r.readAsDataURL(f)
                }}
              />
            </label>
            {cover && (
              <button
                className="focus-ring text-[0.8em] text-bad hover:underline"
                onClick={() => setCover('')}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {databaseId === null && (
          <p className="text-[0.75em] text-ink-faint">
            This item lives outside any Workspace project — it appears on the Tasks page.
          </p>
        )}
        <MenuSep />
      </div>
    </Modal>
  )
}

function CustomFieldEditor({
  p,
  value,
  onChange
}: {
  p: WorkspaceDatabase['properties'][number]
  value: unknown
  onChange: (v: unknown) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.75em] text-ink-muted">{p.name}</span>
      {p.type === 'select' ? (
        <Select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || undefined)}
          aria-label={p.name}
        >
          <option value="">—</option>
          {(p.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : p.type === 'multiSelect' ? (
        <div className="flex flex-wrap gap-1">
          {(p.options ?? []).map((o) => {
            const list = Array.isArray(value) ? (value as string[]) : []
            const on = list.includes(o)
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                className={`focus-ring rounded-full px-2 py-0.5 text-[0.78em] ${
                  on ? 'bg-primary text-primary-on' : 'bg-sunken text-ink-muted'
                }`}
                onClick={() => onChange(on ? list.filter((x) => x !== o) : [...list, o])}
              >
                {o}
              </button>
            )
          })}
        </div>
      ) : p.type === 'number' ? (
        <Input
          type="number"
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          aria-label={p.name}
        />
      ) : p.type === 'date' ? (
        <Input
          type="date"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || undefined)}
          aria-label={p.name}
        />
      ) : p.type === 'checkbox' ? (
        <Toggle label={value ? 'Checked' : 'Unchecked'} checked={!!value} onChange={onChange} />
      ) : p.type === 'url' ? (
        <Input
          type="url"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || undefined)}
          aria-label={p.name}
        />
      ) : (
        <Input
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || undefined)}
          aria-label={p.name}
        />
      )}
    </label>
  )
}
