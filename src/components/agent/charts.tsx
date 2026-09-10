import type { DayCell, HourBucket, LatencyRow } from '../../lib/monitoring'

/**
 * Grafik mini (Master Prompt §77 + gaya "Activity Monitor"): komponen chart
 * kecil yang dipakai ulang, semuanya dilukis dari token — tanpa pustaka baru,
 * tanpa warna karangan. Angka selalu tabular.
 */

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.round(ms / 60_000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

const pctLabel = (v: number) => `${Math.round(v * 100)}%`

export function StatTile({
  label,
  value,
  sub,
  tone
}: {
  label: string
  value: string
  sub?: string
  tone?: 'ok' | 'warn' | 'bad' | 'info' | 'accent'
}) {
  return (
    <div className="stat-tile" data-tone={tone ?? 'none'}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

/** Bar chart per jam — task yang benar-benar selesai/gagal tiap jam. */
export function HourBars({ buckets, caption }: { buckets: HourBucket[]; caption: string }) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  const total = buckets.reduce((a, b) => a + b.count, 0)
  const fmtHour = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit' }).replace(':00', '')
  return (
    <div className="chart-block">
      <div className="hour-bars" role="img" aria-label={`${caption}. Total ${total}.`}>
        {buckets.map((b) => (
          <div key={b.hourISO} className="hour-bar" title={`${fmtHour(b.hourISO)} — ${b.count} task${b.count === 1 ? '' : 's'}`}>
            <i style={{ height: `${Math.max(3, Math.round((b.count / max) * 100))}%` }} data-empty={b.count === 0} />
          </div>
        ))}
      </div>
      <div className="hour-axis">
        <span>{buckets.length ? fmtHour(buckets[0].hourISO) : ''}</span>
        <span>now</span>
      </div>
      <p className="mon-note">{caption} — total {total} in this window.</p>
    </div>
  )
}

/** Garis tren SVG (success/latency) dengan area tipis dari token. */
export function TrendLine({
  points,
  format = (v: number) => pctLabel(v),
  label
}: {
  points: number[]
  format?: (v: number) => string
  label: string
}) {
  if (points.length < 2) return null
  const w = 100
  const h = 34
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const xy = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w
    const y = h - 3 - ((p - min) / span) * (h - 6)
    return [x, y] as const
  })
  const line = xy.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  const first = points[0]
  const last = points[points.length - 1]
  const delta = last - first
  return (
    <div className="chart-block">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="trend-svg" role="img" aria-label={label}>
        <path d={area} className="trend-area" />
        <path d={line} className="trend-line" />
      </svg>
      <div className="trend-caption">
        <span>
          {format(min)} → {format(max)}
        </span>
        <em data-up={delta >= 0}>
          {delta >= 0 ? '▲' : '▼'} {format(Math.abs(delta))}
        </em>
      </div>
    </div>
  )
}

/** Heatmap aktivitas AI — grid GitHub-style, satu sel = satu hari nyata. */
export function ActivityHeatmap({ cells }: { cells: DayCell[] }) {
  const max = Math.max(1, ...cells.map((c) => c.count))
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, 1 + Math.floor((n / max) * 3.999)))
  const monthTicks: { idx: number; label: string }[] = []
  cells.forEach((c, i) => {
    const d = new Date(`${c.dateISO}T00:00:00Z`)
    const prev = i > 0 ? new Date(`${cells[i - 1].dateISO}T00:00:00Z`) : null
    if (!prev || d.getUTCMonth() !== prev.getUTCMonth())
      monthTicks.push({ idx: Math.floor(i / 7), label: d.toLocaleString([], { month: 'short', timeZone: 'UTC' }) })
  })
  const total = cells.reduce((a, c) => a + c.count, 0)
  return (
    <div className="heatmap-wrap">
      <div className="heatmap-months" aria-hidden>
        {monthTicks.map((t) => (
          <span key={`${t.idx}-${t.label}`} style={{ gridColumnStart: t.idx + 1 }}>
            {t.label}
          </span>
        ))}
      </div>
      <div className="heatmap-scroll">
        <div className="heatmap" role="img" aria-label={`AI activity heatmap — ${total} recorded events over ${cells.length} days`}>
          {cells.map((c) => (
            <div
              key={c.dateISO}
              data-level={level(c.count)}
              className="heat-cell"
              title={`${c.count} event${c.count === 1 ? '' : 's'} — ${c.dateISO}`}
            />
          ))}
        </div>
      </div>
      <div className="heatmap-legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <i key={l} data-level={l} className="heat-cell is-legend" />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}

/** Bar latensi per kategori tool — data elapsedMs nyata. */
export function CatBars({ rows }: { rows: LatencyRow[] }) {
  const max = Math.max(...rows.map((r) => r.avgMs))
  return (
    <ul className="cat-bars">
      {rows.map((r) => (
        <li key={r.category}>
          <code>{r.category}</code>
          <span className="perf-bar" aria-hidden>
            <i style={{ width: `${Math.max(4, Math.round((r.avgMs / max) * 100))}%` }} />
          </span>
          <em>
            {formatMs(r.avgMs)} · {r.samples} sample{r.samples === 1 ? '' : 's'}
          </em>
        </li>
      ))}
    </ul>
  )
}
