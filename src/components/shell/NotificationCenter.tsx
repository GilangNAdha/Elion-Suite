import { useNavigate } from 'react-router-dom'
import { AtSign, BellRing, CalendarClock, Repeat, Info, Trash2, CheckCheck } from 'lucide-react'
import { Button, EmptyState } from '../ui'
import { useNotifyStore } from '../../stores/notifyStore'
import { usePagesStore } from '../../stores/pagesStore'
import { timeAgo } from '../../lib/time'

const KIND_ICON = {
  'task-due': CalendarClock,
  mention: AtSign,
  habit: Repeat,
  alarm: BellRing,
  system: Info
} as const

export function NotificationCenter({ onClose }: { onClose: () => void }) {
  const items = useNotifyStore((s) => s.items)
  const markRead = useNotifyStore((s) => s.markRead)
  const markAllRead = useNotifyStore((s) => s.markAllRead)
  const clear = useNotifyStore((s) => s.clear)
  const pages = usePagesStore((s) => s.pages)
  const navigate = useNavigate()

  const open = (n: (typeof items)[number]) => {
    void markRead(n.id)
    onClose()
    if (!n.link) return
    if (n.link.startsWith('pages/')) {
      const page = pages[n.link.slice(6)]
      navigate(page?.branch === 'personal' ? `/notes/${page.id}` : `/workspace/${n.link.slice(6)}`)
      return
    }
    if (n.link.startsWith('items/')) navigate('/tasks')
  }

  return (
    <div className="elev-overlay flex max-h-[70vh] flex-col rounded-token border border-line bg-raised">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-[0.95em] font-semibold">Notifications</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => void markAllRead()}>
            <CheckCheck size={13} /> All read
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void clear()} disabled={items.every((i) => !i.read)}>
            <Trash2 size={13} /> Clear
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {items.length === 0 ? (
          <EmptyState icon={<Info size={20} />} title="All caught up" hint="Due dates, @mentions, alarms and reminders land here." />
        ) : (
          items.map((n) => {
            const Icon = KIND_ICON[n.kind]
            return (
              <button
                key={n.id}
                onClick={() => open(n)}
                className={`focus-ring flex w-full items-start gap-2.5 rounded-token-sm px-2.5 py-2 text-left transition-colors hover:bg-surface ${
                  n.read ? 'opacity-60' : ''
                }`}
              >
                <span className={`mt-0.5 shrink-0 ${n.read ? 'text-ink-faint' : 'text-primary'}`}>
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[0.9em] ${n.read ? '' : 'font-medium'}`}>{n.title}</span>
                  <span className="block truncate text-[0.78em] text-ink-muted">{n.body}</span>
                </span>
                <span className="shrink-0 text-[0.7em] text-ink-faint">{timeAgo(n.at)}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
