import { useEffect } from 'react'
import { usePetStore } from '../../stores/petStore'
import { useItemsStore } from '../../stores/itemsStore'
import { useLockdownStore } from '../../stores/lockdownStore'
import { todayISO } from '../../lib/time'

/** Mounted above routes, so entering Lockdown does not stop the heartbeat. */
export function PetActivity() {
  const items = useItemsStore((s) => s.items)
  const databases = useItemsStore((s) => s.databases)
  const active = useLockdownStore((s) => s.active)
  const happyUntil = usePetStore((s) => s.happyUntil)
  useEffect(() => {
    const tick = () => {
      const today = todayISO()
      const done = (item: (typeof items)[string]) =>
        item.status === 'done' ||
        !!databases[item.databaseId ?? '']?.statuses.find((s) => s.id === item.status)?.isDone
      usePetStore.getState().tick({
        focusActive: !!active,
        overdueCount: Object.values(items).filter(
          (i) => i.type !== 'habit' && i.dueDate && i.dueDate < today && !done(i)
        ).length,
        doneToday: Object.values(items).some((i) => i.type === 'habit' && i.completions?.includes(today)),
        hour: new Date().getHours()
      })
    }
    tick()
    const timer = setInterval(tick, 30000)
    return () => clearInterval(timer)
  }, [items, databases, active, happyUntil])
  return null
}
