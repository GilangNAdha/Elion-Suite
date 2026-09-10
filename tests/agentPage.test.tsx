import 'fake-indexeddb/auto'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AgentPage } from '../src/pages/AgentPage'
import { LiveActivity } from '../src/components/agent/Monitor'
import { useActivityFeed } from '../src/lib/activity'
import { db } from '../src/lib/db'
import { useAiStore } from '../src/stores/aiStore'
import { useRuntimeStore } from '../src/lib/agentRuntime'

describe('AgentPage (/agent — permukaan operasi ELION)', () => {
  beforeEach(async () => {
    await db.agentJobs.clear()
    await db.agentSkills.clear()
    await db.agentEvents.clear()
    useActivityFeed.setState({ events: [], ready: true })
    useAiStore.setState({ probeError: null, probeMs: null })
    useRuntimeStore.setState({ enabled: false, busy: false, phase: 'idle', activeTask: null })
  })

  it('monitor-first: header ELION + state, tab Monitor default, honest idle hero', () => {
    render(
      <MemoryRouter>
        <AgentPage />
      </MemoryRouter>
    )
    // Header = ELION + state + kontrol start/stop (§8)
    expect(screen.getByRole('heading', { name: 'ELION' })).toBeTruthy()
    expect(screen.getByText('Sentient Mode is off')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start Elion' })).toBeTruthy()
    // Tab nav baru; Monitor adalah default (§100)
    expect(screen.getByRole('tab', { name: 'Monitor' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Chat' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Jobs & skills' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Monitoring' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Memory' })).toBeTruthy()
    // Saat off: jujur bahwa tidak berjalan (§60)
    expect(screen.getByText(/Not running/)).toBeTruthy()
  })

  it('chat tab masih menyediakan Connect AI dan chat yang sama', async () => {
    render(
      <MemoryRouter>
        <AgentPage />
      </MemoryRouter>
    )
    screen.getByRole('tab', { name: 'Chat' }).click()
    await new Promise((r) => setTimeout(r, 10))
    // Connect AI: grid provider + tombol Connect + status jujur
    expect(screen.getByLabelText('Connect an AI provider')).toBeTruthy()
    expect(screen.getByRole('option', { name: 'OpenRouter' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Kimi (Moonshot AI)' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Antigravity (local gateway)' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Claude Code Router (local)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy()
    expect(screen.getByText('Not connected yet')).toBeTruthy()
    expect(screen.getByLabelText('Message Elion')).toBeTruthy()
  })

  it('live activity menampilkan event nyata, terbaru di atas', () => {
    const now = Date.now()
    useActivityFeed.setState({
      ready: true,
      events: [
        { id: 'e2', at: new Date(now - 1000).toISOString(), kind: 'tool.completed', detail: 'browser.read — fetched page' },
        { id: 'e1', at: new Date(now).toISOString(), kind: 'task.completed', detail: 'Draft weekly report' }
      ]
    })
    render(<LiveActivity />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0].textContent).toContain('task.completed')
    expect(screen.getByText('Draft weekly report')).toBeTruthy()
  })
})
