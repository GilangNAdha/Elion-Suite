import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ElionPage } from '../src/pages/ElionPage'
import { useActivityFeed } from '../src/lib/activity'

describe('ElionPage (/elion — agent chat + Sentient di UI)', () => {
  it('renders chat, sentient panel, and honest unconfigured state', async () => {
    useActivityFeed.setState({ events: [], ready: true })
    render(
      <MemoryRouter>
        <ElionPage />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: 'Elion' })).toBeTruthy()
    expect(screen.getByLabelText('Sentient Mode status')).toBeTruthy()
    expect(screen.getByLabelText('Message Elion')).toBeTruthy()
    expect(screen.getByLabelText('Agent conversation')).toBeTruthy()
    // AI belum dikonfigurasi di worker baru → jujur offline + ada jalan keluar.
    expect(screen.getByText('Offline')).toBeTruthy()
    expect(screen.getByText(/Set it in Settings/)).toBeTruthy()
  })
})
