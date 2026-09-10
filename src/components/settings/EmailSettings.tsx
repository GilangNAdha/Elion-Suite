import { useEffect, useState } from 'react'
import {
  connectMail,
  disconnectMail,
  isMailDesktop,
  mailStatus,
  saveMailClient,
  saveMyEmail,
  type MailStatus
} from '../../lib/mailClient'
import { Button, Input } from '../ui'

/**
 * Settings › Email — akun Gmail MILIK Elion (Part II §5 spek v4.3).
 * Login di UI: user memasukkan OAuth client-nya sendiri → Connect membuka
 * jendela sign-in Google resmi → token disimpan di vault main process.
 * Client secret & token TIDAK PERNAH tampil di chat / masuk ke model.
 */
export function EmailSettings() {
  const desktop = isMailDesktop()
  const [status, setStatus] = useState<MailStatus | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [myEmail, setMyEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const refresh = async () => {
    try {
      const s = await mailStatus()
      setStatus(s)
      if (s.myEmail) setMyEmail(s.myEmail)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mail status failed.')
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!desktop) {
    return (
      <div className="agent-note">
        <p>
          Elion's mail needs the <strong>desktop app</strong>: sign-in and the token vault live in the
          Electron main process, outside the browser's reach. The web build cannot connect mail — this is
          deliberate, not a missing feature.
        </p>
      </div>
    )
  }

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await fn()
      after?.()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mail action failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="agent-panel">
      <div className="agent-status" role="status">
        <span className={`agent-dot ${status?.configured ? 'is-busy' : ''}`} />
        <strong>
          {status?.configured ? `Connected${status.account ? ` as ${status.account}` : ''}` : 'Not connected'}
        </strong>
      </div>

      <p className="agent-note">
        Elion gets its <em>own</em> Gmail account — never your personal one. Create a Google Cloud OAuth
        client (type <strong>Desktop</strong>), paste the ID + secret here once, then Connect. Steps:{' '}
        <span title="docs/GMAIL-SETUP.md in the repo">see docs/GMAIL-SETUP.md</span>.
      </p>

      <div className="agent-add">
        <Input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="OAuth client ID"
          aria-label="OAuth client ID"
          autoComplete="off"
        />
        <Input
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="OAuth client secret"
          aria-label="OAuth client secret"
          type="password"
          autoComplete="off"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !clientId.trim()}
          onClick={() => void run(() => saveMailClient(clientId.trim(), clientSecret), () => setSaved(true))}
        >
          Save client
        </Button>
      </div>
      {saved && <p className="agent-note">Client saved in the desktop vault (never shown again, never sent to the AI).</p>}

      <div className="agent-add">
        <Input
          value={myEmail}
          onChange={(e) => setMyEmail(e.target.value)}
          placeholder="Your own email (for Elion's reports to you)"
          aria-label="Your own email address"
          type="email"
          autoComplete="off"
        />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => saveMyEmail(myEmail.trim()))}>
          Save
        </Button>
      </div>

      <div className="agent-add">
        {status?.configured ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => disconnectMail())}>
            Disconnect
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !status?.hasClient || status?.configured}
            onClick={() => void run(() => connectMail())}
          >
            {busy ? 'Waiting for Google sign-in…' : 'Connect with Google'}
          </Button>
        )}
      </div>
      {!status?.hasClient && !status?.configured && (
        <p className="agent-note">Save the OAuth client first — Connect unlocks after that.</p>
      )}
      {error && <p className="elion-error">{error}</p>}
    </div>
  )
}
