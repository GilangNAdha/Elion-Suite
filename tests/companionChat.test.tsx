// Elion: shortcut - smoke render jsdom untuk chat + mini markdown; perilaku
// drag/posisi tetap jadi wilayah test e2e Playwright.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useCompanionStore } from '../src/stores/companionStore'
import { useAiStore } from '../src/stores/aiStore'
import { MiniMarkdown } from '../src/lib/miniMarkdown'
import { CompanionChat } from '../src/components/pet/CompanionChat'

vi.mock('react-router-dom', () => ({ Link: () => null }))

describe('mini markdown', () => {
  it('renders fenced code with a copy button and inline styles', () => {
    const { container } = render(<MiniMarkdown text={'Before\n```ts\nconst a = 1\n```\n**bold** and `x`'} />)
    expect(container.querySelector('pre code')?.textContent).toBe('const a = 1')
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy()
    expect(container.querySelector('strong')?.textContent).toBe('bold')
    expect(container.querySelector('p code')?.textContent).toBe('x')
  })
  it('closes an unterminated fence while streaming instead of showing raw ticks', () => {
    const { container } = render(<MiniMarkdown text={'```python\nprint(1)'} />)
    expect(container.querySelector('pre code')?.textContent).toBe('print(1)')
    expect(container.textContent).not.toContain('```')
  })
  it('refuses javascript: links but keeps http(s)', () => {
    const { container } = render(<MiniMarkdown text={'[bad](javascript:alert(1)) [good](https://example.com/x)'} />)
    const links = container.querySelectorAll('a')
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('https://example.com/x')
    expect(links[0].getAttribute('rel')).toContain('noopener')
    expect(container.textContent).toContain('bad')
  })
})

describe('companion chat panel', () => {
  beforeEach(() => {
    useAiStore.setState({
      settings: {
        providerId: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'sk-or-test',
        model: 'anthropic/claude-sonnet-4.5',
        temperature: 0.7,
        maxTokens: 1024,
        personaId: 'ship',
        systemPrompt: ''
      },
      discovered: ['anthropic/claude-sonnet-4.5', 'openai/gpt-5'],
      discoveredDetails: { 'anthropic/claude-sonnet-4.5': { id: 'anthropic/claude-sonnet-4.5', context: 200000 } },
      discoveredFor: 'https://openrouter.ai/api/v1',
      probing: false,
      probeError: null,
      probeMs: 42,
      probeModels: vi.fn(async () => {})
    })
    useCompanionStore.setState({
      pinned: true,
      connection: 'disconnected',
      activity: 'idle',
      error: null,
      shareContext: false,
      messages: [
        { id: 'u1', role: 'user', content: 'help?', at: new Date().toISOString() },
        { id: 'a1', role: 'assistant', content: 'Sure — `code` here.', at: new Date().toISOString() }
      ]
    })
  })

  it('renders configured state: model badge, markdown bubble, copy + retry actions', () => {
    render(<CompanionChat compact onClose={vi.fn()} />)
    expect(screen.getByText('OpenRouter · anthropic/claude-sonnet-4.5')).toBeTruthy()
    expect(screen.getByText('code', { selector: '.nova-message code' })).toBeTruthy()
    // dua pesan → tombol copy per pesan, plus "Try again" untuk balasan terakhir
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Switch model' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send message to Elion' })).toBeTruthy()
  })

  it('lets the model switch flow patch the store without touching the key', () => {
    render(<CompanionChat compact onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch model' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /openai\/gpt-5/ }))
    expect(useAiStore.getState().settings.model).toBe('openai/gpt-5')
    expect(useAiStore.getState().settings.apiKey).toBe('sk-or-test')
    expect(useAiStore.getState().settings.personaId).toBe('ship')
  })

  it('blocks send when no provider config and shows the setup panel', () => {
    useAiStore.setState((s) => ({ settings: { ...s.settings, apiKey: '', model: '' } }))
    render(<CompanionChat compact onClose={vi.fn()} />)
    expect(screen.getByText('Finish the setup below to chat')).toBeTruthy()
    expect((screen.getByLabelText('Send message to Elion') as HTMLButtonElement).disabled).toBe(true)
  })
})
