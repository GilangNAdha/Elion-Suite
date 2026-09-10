import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { mailStatus } from '../src/lib/mailClient'

const require = createRequire(import.meta.url)
const email = require('../electron/email.cjs') as {
  buildRawMessage: (input: { to: string; subject: string; body: string }) => string
  decodeBase64Url: (data: string) => string
  simplifyMessage: (msg: unknown, withBody: boolean) => { id: string; from: string; subject: string; date: string; snippet: string; body?: string }
}
const { buildRawMessage, decodeBase64Url, simplifyMessage } = email

const b64url = (text: string) => Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

describe('Gmail adapter (main process)', () => {
  it('builds a valid base64url RFC2822 message and rejects bad input', () => {
    const raw = buildRawMessage({ to: 'gilang@example.com', subject: 'Hi', body: 'Hello.' })
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    expect(decoded).toContain('To: gilang@example.com')
    expect(decoded).toContain('Subject: Hi')
    expect(decoded).toContain('Hello.')
    expect(() => buildRawMessage({ to: 'not-an-email', subject: 'x', body: 'y' })).toThrow('invalid')
    expect(() => buildRawMessage({ to: 'a@b.c', subject: '  ', body: 'y' })).toThrow('Subject is required')
  })

  it('decodes base64url bodies', () => {
    expect(decodeBase64Url(b64url('halo elion'))).toBe('halo elion')
  })

  it('simplifies metadata responses to from/subject/date/snippet', () => {
    const msg = simplifyMessage(
      {
        id: 'm1',
        snippet: 'see you',
        payload: { headers: [{ name: 'From', value: 'a@x.io' }, { name: 'Subject', value: 'Meet' }, { name: 'Date', value: 'Thu' }] }
      },
      false
    )
    expect(msg).toEqual({ id: 'm1', from: 'a@x.io', subject: 'Meet', date: 'Thu', snippet: 'see you' })
  })

  it('extracts the plain-text part from multipart bodies', () => {
    const msg = simplifyMessage(
      {
        id: 'm2',
        snippet: '',
        payload: {
          mimeType: 'multipart/alternative',
          headers: [],
          parts: [
            { mimeType: 'text/plain', body: { data: b64url('plain wins') } },
            { mimeType: 'text/html', body: { data: b64url('<b>html</b>') } }
          ]
        }
      },
      true
    )
    expect(msg.body).toBe('plain wins')
  })

  it('falls back to stripped HTML when no plain part exists', () => {
    const msg = simplifyMessage(
      {
        id: 'm3',
        snippet: '',
        payload: {
          mimeType: 'multipart/alternative',
          headers: [],
          parts: [{ mimeType: 'text/html', body: { data: b64url('<p>Hi <b>there</b></p>') } }]
        }
      },
      true
    )
    expect(msg.body).toBe('Hi there')
  })
})

describe('mail client without the desktop bridge', () => {
  it('reports itself honestly unconfigured on web', async () => {
    const status = await mailStatus()
    expect(status.configured).toBe(false)
    expect(status.desktop).toBe(false)
    expect(status.reason).toContain('desktop app')
  })
})
