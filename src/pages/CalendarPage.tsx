import { useEffect, useMemo, useState } from 'react'
import { Plus, CalendarDays } from 'lucide-react'
import { useItemsStore } from '../stores/itemsStore'
import { usePagesStore } from '../stores/pagesStore'
import { db } from '../lib/db'
import type { CalEvent } from '../lib/types'
import { uid } from '../lib/types'
import { CalendarView } from '../components/views/views'
import { ItemModal } from '../components/items/ItemModal'
import { Button, Input } from '../components/ui'
import type { WorkspaceItem, Alarm } from '../lib/types'

/**
 * Calendar — one calendar engine, four data sources (§7): item due dates,
 * habit recurrences, alarm times, manual events.
 */
export function CalendarPage() {
  const items = useItemsStore((s) => s.items)
  const [month, setMonth] = useState(new Date())
  const [events, setEvents] = useState<CalEvent[]>([])
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [editing, setEditing] = useState<WorkspaceItem | null>(null)
  const [title, setTitle] = useState('')
  const [at, setAt] = useState(() => new Date().toISOString().slice(0, 16))

  useEffect(() => {
    void db.events.toArray().then((e) => setEvents(e.sort((a, b) => a.at.localeCompare(b.at))))
    void db.alarms.toArray().then((a) => setAlarms(a))
    const t = setInterval(() => {
      void db.alarms.toArray().then((a) => setAlarms(a))
    }, 30000)
    return () => clearInterval(t)
  }, [])

  const allItems = useMemo(() => Object.values(items), [items])
  const habits = allItems.filter((i) => i.type === 'habit')

  return (
    <div className="mx-auto max-w-6xl p-6 pb-24">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[1.7em] font-bold tracking-tight">
            <CalendarDays size={26} className="text-primary" />
            Calendar
          </h1>
          <p className="text-[0.88em] text-ink-muted">
            Due dates, habit recurrences, alarms, and events — one engine, four sources.
          </p>
        </div>
        <span className="flex-1" />
        <div className="flex items-center gap-2 rounded-token border border-line bg-surface/40 p-1.5">
          <Input
            placeholder="Event title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8 w-40"
            aria-label="Event title"
          />
          <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="h-8" aria-label="Event time" />
          <Button
            size="sm"
            variant="primary"
            icon={<Plus size={13} />}
            disabled={!title.trim()}
            onClick={async () => {
              const ev: CalEvent = { id: uid(), title: title.trim(), at: new Date(at).toISOString() }
              await db.events.add(ev)
              setEvents((e) => [...e, ev].sort((a, b) => a.at.localeCompare(b.at)))
              setTitle('')
            }}
          >
            Add
          </Button>
        </div>
      </div>

      <CalendarView
        month={month}
        onMonth={setMonth}
        sources={{
          items: allItems,
          habits,
          alarms: alarms.filter((a) => a.enabled),
          events
        }}
        onPickItem={(i) => setEditing(i)}
      />

      {editing && (
        <ItemModal db={null} databaseId={editing.databaseId} editing={editing} creating={null} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
