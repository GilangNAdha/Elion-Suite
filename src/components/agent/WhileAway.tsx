import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActivityFeed, type AgentEventRecord } from '../../lib/activity'

const LAST_SEEN_KEY = 'elion-last-seen'

/** Ringkas event menjadi baris "while you were away" (§27/§80) — dari event
 * nyata, tidak pernah dikarang. Diekspor supaya /elion dan /agent memakai
 * satu implementasi. */
export function summarizeAway(events: AgentEventRecord[], lastSeen: string): string[] {
  const fresh = events.filter((e) => e.at > lastSeen)
  const lines: string[] = []
  for (const e of fresh) {
    if (e.kind === 'task.completed') lines.push(`Finished: ${e.detail ?? 'a task'}`)
    else if (e.kind === 'task.failed') lines.push(`Failed: ${e.detail ?? 'a task'}`)
    else if (e.kind === 'agent.job.completed') lines.push(`Scheduled job done: ${e.detail ?? ''}`)
    else if (e.kind === 'agent.job.failed') lines.push(`Scheduled job failed: ${e.detail ?? ''}`)
    else if (e.kind === 'objective.surfaced') lines.push(`Still open: ${e.detail ?? 'an objective'}`)
    else if (e.kind === 'permission.granted' || e.kind === 'permission.denied')
      lines.push(`Permission ${e.kind === 'permission.granted' ? 'granted' : 'denied'}: ${e.detail ?? ''}`)
    else if (e.kind === 'permission.requested') lines.push(`Needs approval: ${e.detail ?? ''}`)
    else if (e.kind === 'sentient.stopped') lines.push('Sentient Mode was stopped')
    else if (e.kind === 'sentient.started') lines.push('Sentient Mode resumed')
  }
  return lines.slice(-6)
}

/** "While you were away" — muncul saat user kembali, lalu marker diperbarui. */
export function WhileAway({ linkTo = '/agent' }: { linkTo?: string }) {
  const events = useActivityFeed((s) => s.events)
  const [report, setReport] = useState<string[] | null>(null)

  useEffect(() => {
    let lastSeen = ''
    try {
      lastSeen = localStorage.getItem(LAST_SEEN_KEY) ?? ''
    } catch {
      lastSeen = ''
    }
    if (lastSeen) setReport(summarizeAway(events, lastSeen))
    try {
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString())
    } catch {
      /* storage privat — abaikan */
    }
    // Sekali per kunjungan halaman — marker ditulis saat dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!report || !report.length) return null
  return (
    <section className="elion-mini is-away" aria-label="While you were away">
      <h2>While you were away</h2>
      <ul>
        {report.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <Link to={linkTo}>View activity →</Link>
    </section>
  )
}
