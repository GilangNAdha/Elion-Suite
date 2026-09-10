import { describe, expect, it } from 'vitest'
import { MiniCpmEventStream, type MiniCpmEvent } from '../src/lib/minicpm'

describe('MiniCPM Desk Pet SSE contract', () => {
  it('decodes delta events split across arbitrary network boundaries', () => {
    const events: MiniCpmEvent[] = []
    const stream = new MiniCpmEventStream((event) => events.push(event))
    const raw =
      'data: {"event":"start"}\n\ndata: {"event":"delta","content":"A small step ✨"}\n\ndata: {"event":"end"}\n\n'
    for (let i = 0; i < raw.length; i += 3) stream.feed(raw.slice(i, i + 3))
    stream.finish()
    expect(events.map((event) => event.event)).toEqual(['start', 'delta', 'end'])
    expect(events[1].content).toBe('A small step ✨')
  })
  it('accepts CRLF delimiters split between chunks and a final unterminated event', () => {
    const events: MiniCpmEvent[] = []
    const stream = new MiniCpmEventStream((event) => events.push(event))
    stream.feed('data: {"event":"start"}\r')
    stream.feed('\n\r')
    stream.feed('\ndata: {"event":"end"}')
    stream.finish()
    expect(events).toHaveLength(2)
  })
  it('keeps reasoning events separate from answer content', () => {
    const events: MiniCpmEvent[] = []
    const stream = new MiniCpmEventStream((event) => events.push(event))
    stream.feed(
      'data: {"event":"think","content":"internal"}\n\ndata: {"event":"delta","content":"answer"}\n\ndata: {"event":"end"}\n\n'
    )
    expect(
      events
        .filter((event) => event.event === 'delta')
        .map((event) => event.content)
        .join('')
    ).toBe('answer')
  })
  it('does not present a truncated stream as a finished reply', () => {
    const stream = new MiniCpmEventStream(() => undefined)
    stream.feed('data: {"event":"delta","content":"incomplete"}\n\n')
    expect(() => stream.finish()).toThrow('ended early')
  })
  it('reports malformed stream JSON with an actionable message, not a SyntaxError', () => {
    const stream = new MiniCpmEventStream(() => undefined)
    expect(() => stream.feed('data: {not valid json}\n\n')).toThrow(
      'MiniCPM sent a malformed stream event. Update the gateway and reconnect.'
    )
  })
  it('rejects structurally valid JSON that is not a MiniCPM event', () => {
    const stream = new MiniCpmEventStream(() => undefined)
    expect(() => stream.feed('data: {\"event\":\"teleport\"}\n\n')).toThrow(
      'MiniCPM returned an unsupported stream event. Update the gateway and reconnect.'
    )
    expect(() => stream.feed('data: 42\n\n')).toThrow(
      'MiniCPM returned an unsupported stream event. Update the gateway and reconnect.'
    )
  })
  it('handles a model error without requiring a fake end event', () => {
    const events: MiniCpmEvent[] = []
    const stream = new MiniCpmEventStream((event) => events.push(event))
    stream.feed('data: {"event":"error","message":"Model not loaded"}\n\n')
    expect(() => stream.finish()).not.toThrow()
    expect(events[0].message).toBe('Model not loaded')
  })
})
