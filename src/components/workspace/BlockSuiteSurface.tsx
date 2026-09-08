import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Blocks, FileWarning, RotateCcw } from 'lucide-react'
import { DatabaseBlock } from '../items/DatabaseBlock'
import { useItemsStore } from '../../stores/itemsStore'
import { Button } from '../ui'
import type { NativeEditorHandle, NativeEmbed } from './blockSuiteRuntime'

export type { NativeEditorHandle } from './blockSuiteRuntime'
export function BlockSuiteSurface({
  pageId,
  mode,
  onReady,
  onStatus
}: {
  pageId: string
  mode: 'page' | 'edgeless'
  onReady?: (api: NativeEditorHandle | null) => void
  onStatus?: (status: 'saving' | 'saved' | 'error', message?: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const engine = useRef<NativeEditorHandle | null>(null)
  const [embeds, setEmbeds] = useState<NativeEmbed[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const callbacks = useRef({ onReady, onStatus })
  callbacks.current = { onReady, onStatus }
  const navigate = useNavigate()
  useEffect(() => {
    let cancelled = false
    const mount = host.current!
    setLoading(true)
    setError('')
    setEmbeds([])
    import('./blockSuiteRuntime')
      .then(async ({ mountBlockSuite }) => {
        if (cancelled) return
        const handle = await mountBlockSuite(pageId, mount, {
          status: (status, message) => {
            if (!cancelled) callbacks.current.onStatus?.(status, message)
          },
          embeds: (next) => {
            if (!cancelled) setEmbeds(next)
          }
        })
        if (cancelled) {
          await handle.dispose()
          return
        }
        engine.current = handle
        callbacks.current.onReady?.(handle)
        setLoading(false)
      })
      .catch((error) => {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : 'The editor could not start.')
          setLoading(false)
          callbacks.current.onStatus?.('error')
        }
      })
    return () => {
      cancelled = true
      callbacks.current.onReady?.(null)
      const handle = engine.current
      engine.current = null
      if (handle) void handle.dispose().catch(() => undefined)
    }
  }, [pageId, attempt])
  useEffect(() => {
    engine.current?.setMode(mode)
  }, [mode, loading])
  return (
    <div
      className={`blocksuite-surface is-${mode}`}
      data-editor="blocksuite"
      aria-label="BlockSuite document editor"
    >
      <div ref={host} className="blocksuite-mount" />
      {loading && (
        <div className="native-editor-loading" role="status">
          <Blocks size={22} />
          <span>Opening your document…</span>
          <small>Loading BlockSuite</small>
        </div>
      )}
      {error && (
        <div className="native-editor-error" role="alert">
          <FileWarning size={22} />
          <h2>The editor could not open</h2>
          <p>{error}</p>
          <div>
            <Button icon={<RotateCcw size={13} />} onClick={() => setAttempt((n) => n + 1)}>
              Retry editor
            </Button>
            <Button onClick={() => navigate(`/workspace/${pageId}/legacy-edit`)}>
              Open preserved Elion editor
            </Button>
          </div>
        </div>
      )}
      {embeds.map((embed) =>
        createPortal(<NativeEmbedContent embed={embed} pageId={pageId} />, embed.element, embed.id)
      )}
    </div>
  )
}
function NativeEmbedContent({ embed, pageId }: { embed: NativeEmbed; pageId: string }) {
  const navigate = useNavigate()
  const database = useItemsStore(
    (s) => s.databases[String(embed.source.props.dbId ?? embed.source.props.databaseId ?? '')]
  )
  if (embed.source.type === 'database' && database) return <DatabaseBlock dbId={database.id} />
  const source = embed.source
  return (
    <div className="native-preserved-block">
      <div>
        <Blocks size={16} />
        <strong>
          {source.type === 'database'
            ? 'Linked board'
            : `${source.type[0].toUpperCase()}${source.type.slice(1)} block`}
        </strong>
        <span>Preserved</span>
      </div>
      {source.type === 'image' && typeof source.props.src === 'string' ? (
        <img src={source.props.src} alt={source.content || 'Document image'} />
      ) : (
        source.content && <p>{source.content}</p>
      )}
      <p className="native-preserved-hint">
        This Elion block is kept intact. Use the advanced editor to change its layout or properties.
      </p>
      <Button size="sm" onClick={() => navigate(`/workspace/${pageId}/legacy-edit`)}>
        Edit preserved block
      </Button>
    </div>
  )
}
