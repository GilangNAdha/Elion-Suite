import { useEffect, useState } from 'react'
import { isSysDesktop, sysAllowAdd, sysAllowRemove, sysAllowlist, type AllowEntry } from '../../lib/sysClient'
import { Button, Input } from '../ui'

/**
 * Settings › ELION runtime › System access — allow-list perintah yang boleh
 * dijalankan tool system.action. Default KOSONG = semua ditolak; tiap entri
 * cocok persis (executable + seluruh argumen), tanpa shell.
 */
export function SystemAccessSettings() {
  const desktop = isSysDesktop()
  const [rows, setRows] = useState<AllowEntry[]>([])
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (desktop) void sysAllowlist().then(setRows).catch((e) => setError(e instanceof Error ? e.message : 'Failed.'))
  }, [desktop])

  if (!desktop) {
    return <p className="agent-note">System access needs the desktop app. The web build cannot read files or run commands.</p>
  }

  const add = async () => {
    setError(null)
    try {
      const argv = args.trim() ? args.trim().split(/\s+/) : []
      setRows(await sysAllowAdd(command.trim(), argv))
      setCommand('')
      setArgs('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add failed.')
    }
  }

  return (
    <div className="agent-panel">
      <p className="agent-note">
        Only exact matches run — no shell, 30s timeout. File reads are gated separately by the{' '}
        <em>files.read</em> permission (allow by default under the owner policy).
      </p>
      {rows.length === 0 && <p className="agent-empty">Allow-list is empty — every command is denied.</p>}
      {rows.map((r, i) => (
        <div key={i} className="agent-task">
          <code>
            {r.command} {r.args.join(' ')}
          </code>
          <button
            type="button"
            className="mini-inline-action"
            onClick={() => void sysAllowRemove(i).then(setRows).catch((e) => setError(e instanceof Error ? e.message : 'Remove failed.'))}
          >
            remove
          </button>
        </div>
      ))}
      <div className="agent-add">
        <Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Executable (e.g. git)" aria-label="Executable" />
        <Input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="Exact args (e.g. status --short)" aria-label="Exact arguments" />
        <Button size="sm" variant="outline" disabled={!command.trim()} onClick={() => void add()}>
          Add
        </Button>
      </div>
      {error && <p className="elion-error">{error}</p>}
    </div>
  )
}
