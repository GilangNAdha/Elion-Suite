import 'fake-indexeddb/auto'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AgentPage } from '../src/pages/AgentPage'
import { useActivityFeed } from '../src/lib/activity'
import { db } from '../src/lib/db'
import { useAiStore } from '../src/stores/aiStore'

describe('AgentPage (/agent — hub agent di dock)', () => {
  beforeEach(async () => {
    await db.agentJobs.clear()
    await db.agentSkills.clear()
    await db.agentEvents.clear()
    useActivityFeed.setState({ events: [], ready: true })
    useAiStore.setState({ probeError: null, probeMs: null })
  })

  it('renders chat, connect panel, sentient control and the hub tabs', () => {
    render(
      <MemoryRouter>
        <AgentPage />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: 'Agent' })).toBeTruthy()
    // Connect AI: grid provider + tombol Connect + status jujur
    expect(screen.getByLabelText('Connect an AI provider')).toBeTruthy()
    expect(screen.getByRole('option', { name: 'OpenRouter' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Kimi (Moonshot AI)' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Antigravity (local gateway)' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Claude Code Router (local)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy()
    expect(screen.getByText('Not connected yet')).toBeTruthy()
    // Sentient + tabs + chat
    expect(screen.getByLabelText('Sentient Mode status')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Scheduled jobs' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Skills' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Activity' })).toBeTruthy()
    expect(screen.getByLabelText('Message Elion')).toBeTruthy()
    // jobs panel adalah tab default → empty state jujur
    expect(screen.getByText(/No scheduled jobs/)).toBeTruthy()
  })

  it('activity tab shows the honest empty state', async () => {
    const { getByRole } = render(
      <MemoryRouter>
        <AgentPage />
      </MemoryRouter>
    )
    getByRole('tab', { name: 'Activity' }).click()
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.getByText(/No events yet/)).toBeTruthy()
  })
})
