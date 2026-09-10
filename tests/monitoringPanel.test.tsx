import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { db } from '../src/lib/db'
import { useActivityFeed } from '../src/lib/activity'
import { MonitoringDashboard } from '../src/components/settings/MonitoringDashboard'

describe('MonitoringDashboard (§13 UI)', () => {
  it('renders all four panels with honest empty states on a fresh database', async () => {
    await db.agentTasks.clear()
    await db.objectives.clear()
    await db.skills.clear()
    await db.agentEvents.clear()
    useActivityFeed.setState({ events: [], ready: true })
    render(<MonitoringDashboard />)
    expect(screen.getByText('Monitoring')).toBeTruthy()
    expect(screen.getByLabelText('Sentient Mode monitor')).toBeTruthy()
    expect(screen.getByLabelText('Performance')).toBeTruthy()
    expect(screen.getByLabelText('Growth and self-improvement')).toBeTruthy()
    expect(screen.getByLabelText('Skill ledger')).toBeTruthy()
    // Aturan Part VIII: tanpa data nyata → "Not enough data yet", bukan nol.
    expect(screen.getAllByText('Not enough data yet').length).toBeGreaterThan(0)
    expect(screen.getByText('Sentient Mode is off')).toBeTruthy()
    // Permission yang tampil = policy efektif nyata, bukan hardcode.
    expect(screen.getByText('Send email')).toBeTruthy()
  })
})
