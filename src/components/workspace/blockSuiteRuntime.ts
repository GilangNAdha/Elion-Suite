// Real BlockSuite standalone editor. Upstream packages retain MPL-2.0 notices.
// Elion owns persistence and the adapter; no AFFiNE backend or cloud services.
import '@toeverything/theme/style.css'
import { DocCollection, Schema, Text, BlockModel, defineBlockSchema, type Doc } from '@blocksuite/store'
import {
  AffineSchemas,
  PageEditorBlockSpecs,
  EdgelessEditorBlockSpecs,
  OverrideThemeExtension,
  type ColorScheme
} from '@blocksuite/blocks'
import { effects as blockEffects } from '@blocksuite/blocks/effects'
import { AffineEditorContainer } from '@blocksuite/presets'
import { effects as editorEffects } from '@blocksuite/presets/effects'
import { GfxControllerIdentifier } from '@blocksuite/block-std/gfx'
import { BlockComponent, BlockViewExtension, TextSelection } from '@blocksuite/block-std'
import { signal } from '@preact/signals-core'
import { html } from 'lit'
import { literal } from 'lit/static-html.js'
import * as Y from 'yjs'
import { db } from '../../lib/db'
import { usePagesStore } from '../../stores/pagesStore'
import { useThemeStore } from '../../stores/themeStore'
import type { Block, PageRecord } from '../../lib/types'
import type { VoiceTarget } from '../../lib/voice/types'
import { registerVoiceResolver, insertTranscript } from '../../lib/voice/textTarget'
import {
  nativeFlavour,
  nativeTextType,
  projectedType,
  NATIVE_TEXT_TYPES,
  descendantsOf,
  textPatch,
  encodeNativeState,
  decodeNativeState
} from '../../lib/nativeProjection'

export interface NativeEmbed {
  id: string
  element: HTMLElement
  source: Block
  descendants: Block[]
}
export type NativeCanvasTool = 'select' | 'pan' | 'note' | 'shape' | 'brush'
export interface NativeEditorHandle {
  editor: AffineEditorContainer
  doc: Doc
  setMode: (mode: 'page' | 'edgeless') => void
  undo: () => void
  redo: () => void
  flush: () => Promise<void>
  dispose: (save?: boolean) => Promise<void>
  captureVoice: () => VoiceTarget | null
  setTool: (tool: NativeCanvasTool) => void
  zoom: (direction: number) => void
  fit: () => void
}
interface EmbeddedProps {
  data: string
}
class EmbeddedModel extends BlockModel<EmbeddedProps> {
  declare data: string
}
const EmbeddedSchema = defineBlockSchema({
  flavour: 'elion:embedded',
  metadata: { role: 'content', version: 1, parent: ['affine:note', 'affine:paragraph', 'affine:list'] },
  props: () => ({ data: '{}' }),
  toModel: () => new EmbeddedModel()
})
declare global {
  namespace BlockSuite {
    interface BlockModels {
      'elion:embedded': EmbeddedModel
    }
  }
}
const hosts = new Map<string, { add: (embed: NativeEmbed) => void; remove: (id: string) => void }>()
class EmbeddedComponent extends BlockComponent<EmbeddedModel> {
  override firstUpdated() {
    const target = this.querySelector<HTMLElement>('.native-react-mount')!
    // Corrupt embed payloads (crashed write, manual tampering) must degrade to
    // an empty embed, never throw inside the Lit lifecycle and blank the editor.
    let source: { block: Block; descendants?: Block[] } | null = null
    try {
      const parsed = JSON.parse(this.model.data) as { block: Block; descendants?: Block[] }
      if (parsed && typeof parsed.block === 'object') source = parsed
    } catch {
      source = null
    }
    if (source)
      hosts.get(this.doc.id)?.add({
        id: this.blockId,
        element: target,
        source: source.block,
        descendants: Array.isArray(source.descendants) ? source.descendants : []
      })
  }
  override disconnectedCallback() {
    hosts.get(this.doc.id)?.remove(this.blockId)
    super.disconnectedCallback()
  }
  override renderBlock() {
    return html`<div
      class="native-elion-embed"
      contenteditable="false"
      @pointerdown=${(event: PointerEvent) => event.stopPropagation()}
    >
      <div class="native-react-mount"></div>
    </div>`
  }
}
if (!customElements.get('affine-editor-container')) {
  blockEffects()
  editorEffects()
}
if (!customElements.get('elion-native-embedded'))
  customElements.define('elion-native-embedded', EmbeddedComponent)
const embedView = BlockViewExtension('elion:embedded', literal`elion-native-embedded`)
const pendingSaves = new Map<string, Promise<void>>()
const blobSource = {
  name: 'elion-dexie-media',
  readonly: false,
  async get(key: string) {
    return (await db.blobs.get(`blocksuite:${key}`))?.data ?? null
  },
  async set(key: string, value: Blob) {
    await db.blobs.put({ id: `blocksuite:${key}`, kind: 'attachment', name: key, data: value })
    return key
  },
  async delete(key: string) {
    await db.blobs.delete(`blocksuite:${key}`)
  },
  async list() {
    return (await db.blobs.filter((blob) => blob.id.startsWith('blocksuite:')).toArray()).map((blob) =>
      blob.id.slice(11)
    )
  }
}

function addLegacy(doc: Doc, block: Block, parent: string, all: Block[]) {
  const flavour = nativeFlavour(block)
  const identity = { id: block.id }
  if (flavour === 'affine:paragraph')
    return doc.addBlock(
      flavour,
      { ...identity, type: nativeTextType(block) as 'text', text: new Text(block.content) },
      parent
    )
  if (flavour === 'affine:list')
    return doc.addBlock(
      flavour,
      {
        ...identity,
        type: nativeTextType(block) as 'bulleted',
        text: new Text(block.content),
        checked: !!block.checked
      },
      parent
    )
  if (flavour === 'affine:code')
    return doc.addBlock(
      flavour,
      { ...identity, text: new Text(block.content), language: String(block.props.language ?? 'plaintext') },
      parent
    )
  if (flavour === 'affine:divider') return doc.addBlock(flavour, { id: block.id }, parent)
  return doc.addBlock(
    'elion:embedded',
    { ...identity, data: JSON.stringify({ block, descendants: descendantsOf(block, all) }) },
    parent
  )
}
function importPage(doc: Doc, page: PageRecord) {
  const titleBlock = page.blocks.find(
    (block) => block.type === 'heading1' && !block.parentId && block.content === page.title
  )
  const root = doc.addBlock('affine:page', { ...{ id: titleBlock?.id }, title: new Text(page.title) })
  doc.addBlock('affine:surface', {}, root)
  const note = doc.addBlock(
    'affine:note',
    { xywh: '[0,0,800,500]', background: '--affine-background-primary-color' },
    root
  )
  const skipped = new Set<string>()
  const expected: string[] = []
  const ordered = [...page.blocks].sort((a, b) => a.order - b.order)
  for (const block of ordered) {
    if (skipped.has(block.id)) continue
    if (block.type === 'heading1' && !block.parentId && block.content === page.title) {
      skipped.add(block.id)
      continue
    }
    const parent = block.parentId && doc.hasBlock(block.parentId) ? block.parentId : note
    addLegacy(doc, block, parent, ordered)
    expected.push(block.id)
    if (!NATIVE_TEXT_TYPES.has(block.type))
      descendantsOf(block, ordered).forEach((child) => skipped.add(child.id))
  }
  if (!doc.getBlocksByFlavour('affine:paragraph').length && !page.blocks.length)
    doc.addBlock('affine:paragraph', { text: new Text() }, note)
  return expected
}

type Projectable = BlockModel & {
  text?: Text
  type?: string
  checked?: boolean
  language?: string
  data?: string
  title?: Text
}
function project(doc: Doc, previous: Block[]): Block[] {
  const output: Block[] = []
  const byId = new Map(previous.map((block) => [block.id, block]))
  const walk = (model: Projectable, parentId: string | null) => {
    if (model.flavour === 'affine:surface') return // rich canvas state is preserved in the Yjs snapshot
    if (model.flavour === 'affine:page' || model.flavour === 'affine:note') {
      model.children.forEach((child) => walk(child as Projectable, null))
      return
    }
    if (model.flavour === 'elion:embedded' && model.data) {
      // A corrupt embed payload must not abort the whole projection (which
      // would drop every block after it). Fall back to the last-known block
      // so the document stays complete and re-saves cleanly.
      try {
        const data = JSON.parse(model.data) as { block: Block; descendants: Block[] }
        if (data && typeof data.block === 'object') {
          output.push(
            { ...data.block, parentId, order: output.length + 1 },
            ...(Array.isArray(data.descendants) ? data.descendants : [])
          )
          return
        }
      } catch {
        /* fall through to the previous-version fallback below */
      }
      const fallback = byId.get(model.id)
      if (fallback) output.push({ ...fallback, parentId, order: output.length + 1 })
      return
    }
    const original = byId.get(model.id)
    const block: Block = {
      ...original,
      id: model.id,
      type: projectedType(model.flavour, model.type),
      content: model.text?.toString() ?? original?.content ?? '',
      parentId,
      order: output.length + 1,
      props: { ...original?.props, ...(model.language ? { language: model.language } : {}) },
      ...(model.checked != null ? { checked: model.checked } : {})
    }
    // Non-text native blocks remain fully represented in the canonical Yjs data.
    if (!['affine:paragraph', 'affine:list', 'affine:code', 'affine:divider'].includes(model.flavour))
      block.props.nativeFlavour = model.flavour
    output.push(block)
    model.children.forEach((child) => walk(child as Projectable, model.id))
  }
  if (doc.root) walk(doc.root as Projectable, null)
  return output
}
function patchText(text: Text, value: string) {
  const patch = textPatch(text.toString(), value)
  if (patch.deleteCount) text.delete(patch.start, patch.deleteCount)
  if (patch.insert) text.insert(patch.insert, patch.start)
}
function applyExternalEdits(doc: Doc, page: PageRecord) {
  const root = doc.root as Projectable | null
  if (root?.title && root.title.toString() !== page.title) patchText(root.title, page.title)
  const projected = project(doc, page.blocks)
  const before = new Map(projected.map((block) => [block.id, block]))
  const after = new Map(page.blocks.map((block) => [block.id, block]))
  const note = doc.getBlocksByFlavour('affine:note')[0]?.model.id
  if (!note) return
  doc.transact(() => {
    for (const block of page.blocks) {
      let model = doc.getBlock(block.id)?.model as Projectable | undefined
      if (!model) {
        if (!block.parentId || doc.hasBlock(block.parentId))
          addLegacy(doc, block, block.parentId ?? note, page.blocks)
        continue
      }
      if (!block.props.nativeFlavour && model.flavour !== nativeFlavour(block) && !model.children.length) {
        const parentId = doc.getParent(model)?.id ?? note
        doc.deleteBlock(model)
        addLegacy(doc, block, parentId, page.blocks)
        model = doc.getBlock(block.id)?.model as Projectable | undefined
      }
      if (!model) continue
      if (model.flavour === 'affine:paragraph' || model.flavour === 'affine:list') {
        const type = nativeTextType(block)
        if (model.type !== type) doc.updateBlock(model, { type })
      }
      if (model.text && before.get(block.id)?.content !== block.content) patchText(model.text, block.content)
      if (model.flavour === 'affine:list' && model.checked !== block.checked)
        doc.updateBlock(model, { checked: !!block.checked })
      if (model.flavour === 'elion:embedded')
        doc.updateBlock(model, {
          data: JSON.stringify({ block, descendants: descendantsOf(block, page.blocks) })
        })
    }
    for (const block of projected)
      if (!after.has(block.id)) {
        const model = doc.getBlock(block.id)?.model
        if (model) doc.deleteBlock(model)
      }
  })
}

export async function mountBlockSuite(
  pageId: string,
  mount: HTMLElement,
  callbacks: {
    status: (status: 'saving' | 'saved' | 'error', message?: string) => void
    embeds: (embeds: NativeEmbed[]) => void
  }
): Promise<NativeEditorHandle> {
  await pendingSaves.get(pageId)
  const page = usePagesStore.getState().pages[pageId]
  if (!page) throw new Error('This document no longer exists.')
  if (!page.native) await usePagesStore.getState().snapshotNow(pageId, 'Before BlockSuite migration', true)
  const compatibleSchemas = AffineSchemas.map((schema) =>
    ['affine:note', 'affine:paragraph', 'affine:list'].includes(schema.model.flavour)
      ? {
          ...schema,
          model: {
            ...schema.model,
            children: [
              ...('children' in schema.model ? (schema.model.children ?? ['*']) : ['*']),
              'elion:embedded'
            ]
          }
        }
      : schema
  )
  const schema = new Schema().register([...compatibleSchemas, EmbeddedSchema])
  const collection = new DocCollection({ id: `elion-${pageId}`, schema, blobSources: { main: blobSource } })
  collection.meta.initialize()
  collection.start()
  const doc = collection.createDoc({ id: pageId })
  if (page.native?.update) Y.applyUpdate(doc.spaceDoc, decodeNativeState(page.native.update))
  const recoveryKey = `elion-native-recovery:${pageId}`
  try {
    const recovery = JSON.parse(localStorage.getItem(recoveryKey) ?? 'null') as {
      update: string
      at: number
    } | null
    if (recovery?.update && recovery.at >= Date.parse(page.updatedAt))
      Y.applyUpdate(doc.spaceDoc, decodeNativeState(recovery.update))
  } catch {
    localStorage.removeItem(recoveryKey)
  }
  let expected: string[] = []
  doc.load(() => {
    if (!doc.root) expected = importPage(doc, page)
  })
  if (expected.some((id) => !doc.hasBlock(id))) {
    doc.dispose()
    collection.dispose()
    throw new Error(
      'A block could not be imported. Your original document is unchanged; open it in the advanced Elion editor.'
    )
  }
  if (page.native?.projectionDirty) applyExternalEdits(doc, page)
  doc.resetHistory()
  const scheme = signal(useThemeStore.getState().theme.mode as ColorScheme)
  const themeExtension = OverrideThemeExtension({ getAppTheme: () => scheme, getEdgelessTheme: () => scheme })
  const editor = new AffineEditorContainer()
  editor.doc = doc
  editor.pageSpecs = [...PageEditorBlockSpecs, embedView, themeExtension]
  editor.edgelessSpecs = [...EdgelessEditorBlockSpecs, embedView, themeExtension]
  editor.mode = page.editorMode ?? 'page'
  editor.autofocus = false
  const embeds = new Map<string, NativeEmbed>()
  hosts.set(pageId, {
    add: (embed) => {
      embeds.set(embed.id, embed)
      callbacks.embeds([...embeds.values()])
    },
    remove: (id) => {
      embeds.delete(id)
      callbacks.embeds([...embeds.values()])
    }
  })
  mount.append(editor)
  await editor.updateComplete
  const labelEditors = () => {
    editor.querySelectorAll<HTMLElement>('[contenteditable="true"][data-v-root]').forEach((element) => {
      element.setAttribute('role', 'textbox')
      element.setAttribute('aria-label', element.closest('doc-title') ? 'Document title' : 'Document text')
      element.setAttribute('aria-multiline', element.closest('doc-title') ? 'false' : 'true')
      element.classList.add('focus-ring')
      if (element.style.outline === 'none') element.style.outline = ''
    })
  }
  labelEditors()
  const accessibilityObserver = new MutationObserver(labelEditors)
  accessibilityObserver.observe(editor, { childList: true, subtree: true })
  let disposed = false,
    external = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let queue = Promise.resolve()
  const flush = () => {
    const capturedAt = new Date().toISOString()
    clearTimeout(timer)
    const native = {
      version: 1 as const,
      update: encodeNativeState(Y.encodeStateAsUpdate(doc.spaceDoc)),
      projectionDirty: false
    }
    const current = usePagesStore.getState().pages[pageId]
    const blocks = project(doc, current?.blocks ?? page.blocks)
    const title = (doc.root as Projectable)?.title?.toString() || 'Untitled'
    callbacks.status('saving')
    queue = queue
      .catch(() => undefined)
      .then(async () => {
        await usePagesStore.getState().saveNative(pageId, native, blocks, title, capturedAt)
        try {
          const recovery = JSON.parse(localStorage.getItem(recoveryKey) ?? 'null')
          if (recovery?.update === native.update) localStorage.removeItem(recoveryKey)
        } catch {
          /* Canonical data is saved; optional recovery cleanup can wait. */
        }
        if (!disposed) callbacks.status('saved')
      })
      .catch((error) => {
        if (!disposed)
          callbacks.status('error', 'The document could not be saved. Check device storage and retry.')
        throw error
      })
    pendingSaves.set(pageId, queue)
    return queue
  }
  const update = () => {
    if (disposed) return
    callbacks.status('saving')
    clearTimeout(timer)
    timer = setTimeout(() => void flush().catch(() => undefined), 200)
  }
  const writeRecovery = () => {
    try {
      const snapshot = encodeNativeState(Y.encodeStateAsUpdate(doc.spaceDoc))
      if (snapshot.length < 2 * 1024 * 1024)
        localStorage.setItem(recoveryKey, JSON.stringify({ update: snapshot, at: Date.now() }))
    } catch {
      /* IndexedDB remains canonical; large docs may exceed the recovery quota. */
    }
  }
  const onPageHide = () => {
    writeRecovery()
    void flush().catch(() => undefined)
  }
  window.addEventListener('pagehide', onPageHide)
  doc.spaceDoc.on('update', update)
  const untheme = useThemeStore.subscribe((state) => {
    scheme.value = state.theme.mode as ColorScheme
  })
  const unpages = usePagesStore.subscribe((state) => {
    const next = state.pages[pageId]
    if (!external && !disposed && next?.native?.projectionDirty) {
      external = true
      try {
        applyExternalEdits(doc, next)
        update()
      } finally {
        external = false
      }
    }
  })
  const captureVoice = (): VoiceTarget | null => {
    const selection = editor.std.selection.find('text')
    if (!selection || !selection.isInSameBlock()) return null
    const { blockId, index, length } = selection.from
    const model = doc.getBlock(blockId)?.model as Projectable | undefined
    if (!model?.text) return null
    const text = model.text,
      original = text.toString()
    const element = editor.std.view.getBlock(blockId) ?? editor
    return {
      label: 'BlockSuite document',
      element,
      insert: (transcript) => {
        if (disposed || text.toString() !== original || !doc.hasBlock(blockId)) return false
        const result = insertTranscript(original, index, index + length, transcript)
        const inserted = result.value.slice(index, result.caret)
        doc.captureSync()
        doc.transact(() => text.replace(index, length, inserted))
        doc.captureSync()
        editor.std.selection.set([
          new TextSelection({ from: { blockId, index: result.caret, length: 0 }, to: null })
        ])
        return true
      }
    }
  }
  const unvoice = registerVoiceResolver(editor, captureVoice)
  await flush()
  return {
    editor,
    doc,
    flush,
    captureVoice,
    setTool: (tool) => {
      if (editor.mode !== 'edgeless') return
      const tools = editor.std.get(GfxControllerIdentifier).tool
      if (tool === 'select') tools.setTool('default')
      else if (tool === 'pan') tools.setTool('pan', { panning: false })
      else if (tool === 'note')
        tools.setTool('affine:note', {
          childFlavour: 'affine:paragraph',
          childType: 'text',
          tip: 'Add a note'
        })
      else if (tool === 'shape') tools.setTool('shape', { shapeName: 'roundedRect' })
      else tools.setTool('brush')
    },
    zoom: (direction) => {
      if (editor.mode !== 'edgeless') return
      const viewport = editor.std.get(GfxControllerIdentifier).viewport
      viewport.setZoom(Math.max(0.1, Math.min(4, viewport.zoom * (direction > 0 ? 1.2 : 1 / 1.2))))
    },
    fit: () => {
      if (editor.mode !== 'edgeless') return
      const gfx = editor.std.get(GfxControllerIdentifier)
      gfx.viewport.setViewportByBound(gfx.elementsBound, [64, 64, 96, 64], false)
    },
    setMode: (mode) => {
      editor.mode = mode
    },
    undo: () => doc.undo(),
    redo: () => doc.redo(),
    dispose: async (save = true) => {
      if (disposed) return
      disposed = true
      clearTimeout(timer)
      window.removeEventListener('pagehide', onPageHide)
      doc.spaceDoc.off('update', update)
      accessibilityObserver.disconnect()
      untheme()
      unpages()
      unvoice()
      if (save) writeRecovery()
      else localStorage.removeItem(recoveryKey)
      const saving = save ? flush() : queue.catch(() => undefined)
      hosts.delete(pageId)
      editor.remove()
      try {
        await saving
      } finally {
        doc.dispose()
        collection.dispose()
      }
    }
  }
}

// Custom elements cannot be redefined by HMR; reload this module's consumers
// so the registered view and its portal registry cannot diverge during development.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())
