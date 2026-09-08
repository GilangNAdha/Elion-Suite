// Regression test: the app must boot to the Dashboard without crashing and
// without console errors.
//
// v6 regression: <App> used to call usePaletteActions() (which needs Router
// context via useNavigate) at the top of the component, ABOVE the
// <BrowserRouter> it renders — so the very first render threw and React
// unmounted the whole tree → a permanently blank screen on every load. The
// actions are now computed inside a child mounted within the Router.
import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeAll } from 'vitest'

// jsdom lacks these browser APIs; they are not part of the SUT.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
beforeAll(() => {
  ;(globalThis as any).ResizeObserver = RO
  // jsdom does not implement HTMLMediaElement.play/pause (browsers do).
  HTMLMediaElement.prototype.pause = () => {}
  HTMLMediaElement.prototype.play = () => Promise.resolve()
})

describe('App boots to Dashboard', () => {
  it('mounts and renders content with no console errors (blank-screen regression)', async () => {
    const errs: string[] = []
    const orig = console.error
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errs.push(a.map(String).join(' '))
      orig(...a)
    })

    const React = await import('react')
    const { render, screen, waitFor } = await import('@testing-library/react')
    const { default: App } = await import('../src/App')

    render(React.createElement(App))

    // Store init + seeding is async; real content (not just the splash) must appear.
    await waitFor(
      () => {
        expect(screen.queryByText(/Welcome to Elion|Elion Suite|Project Aurora|Scratchpad|Dashboard/)).not.toBeNull()
      },
      { timeout: 20000 }
    )
    expect(errs).toEqual([])
  })
})
