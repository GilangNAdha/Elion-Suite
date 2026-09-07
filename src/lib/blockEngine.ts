// Block engine: pure functions over the block tree — type conversion with
// content preservation (drag-to-replace), insert/reorder, layout composition
// (drag-to-columns), and drop-intent geometry. Unit-testable, framework-free.

import { uid, type Block, type BlockType } from './types'

export const TEXT_BLOCK_TYPES: BlockType[] = [
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'bullet',
  'numbered',
  'todo',
  'quote',
  'code',
  'callout',
  'text'
]

export const BLOCK_CATEGORIES: { name: string; types: BlockType[] }[] = [
  { name: 'Text', types: ['paragraph', 'heading1', 'heading2', 'heading3', 'bullet', 'numbered', 'todo', 'quote', 'code'] },
  { name: 'Media', types: ['image', 'gallery'] },
  { name: 'Layout', types: ['columns', 'divider', 'frame'] },
  { name: 'Database', types: ['database'] },
  { name: 'Advanced', types: ['callout', 'text', 'duel'] }
]

export const BLOCK_LABEL: Record<BlockType, string> = {
  paragraph: 'Text',
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  bullet: 'Bulleted list',
  numbered: 'Numbered list',
  todo: 'To-do list',
  quote: 'Quote',
  code: 'Code',
  callout: 'Callout',
  divider: 'Divider',
  image: 'Image',
  gallery: 'Gallery',
  columns: 'Two columns',
  database: 'Database',
  text: 'Text note',
  shape: 'Shape',
  arrow: 'Arrow',
  pen: 'Pen stroke',
  frame: 'Frame',
  edge: 'Edge',
  duel: 'Duel arena'
}

export function makeBlock(type: BlockType, partial?: Partial<Block>): Block {
  const b: Block = {
    id: uid(),
    type,
    content: '',
    parentId: null,
    order: 1000,
    props: {}
  }
  if (type === 'columns') b.props = { cols: [[], []] }
  if (type === 'gallery') b.props = { items: [] }
  if (type === 'shape') b.props = { kind: 'rect', fill: 'var(--primary-soft)' }
  if (type === 'frame') b.props = { title: '' }
  if (type === 'edge') b.props = { from: '', to: '' }
  return { ...b, ...partial }
}

/**
 * Convert a block to a new type in place, preserving content where compatible
 * (the drag-to-replace contract, §9.1):
 *  - text types keep their text
 *  - image → gallery keeps the image as the first gallery item
 *  - gallery → image keeps the first item
 *  - columns/text → text types join child text with newlines
 */
export function convertBlock(block: Block, to: BlockType, allBlocks: Block[]): Block {
  const next: Block = { ...block, type: to, props: {} }
  const byId = new Map(allBlocks.map((b) => [b.id, b]))
  if (to === 'columns') next.props = { cols: [[], []] }
  if (to === 'gallery') next.props = { items: [] }
  if (to === 'shape') next.props = { kind: 'rect', fill: 'var(--primary-soft)' }
  if (to === 'frame') next.props = { title: block.content }
  // structural blocks carry no portable content (frame keeps it as its title)
  if (block.type === 'edge' || block.type === 'frame' || block.type === 'duel' || to === 'edge' || to === 'duel') {
    next.content = ''
    return next
  }

  if (to === 'database') {
    // database blocks are created by the shell (needs a dbId); keep empty
    return next
  }

  const src = block
  if (src.type === 'image' && to === 'gallery') {
    next.content = src.content
    next.props = {
      items: [{ src: String(src.props.src ?? ''), caption: String(src.props.caption ?? '') }]
    }
    return next
  }
  if (src.type === 'gallery' && to === 'image') {
    const items = (src.props.items as { src: string; caption: string }[] | undefined) ?? []
    next.content = items[0]?.caption ?? ''
    next.props = { src: items[0]?.src ?? '', caption: '' }
    return next
  }

  if (TEXT_BLOCK_TYPES.includes(src.type) && TEXT_BLOCK_TYPES.includes(to)) {
    next.content = src.content
    next.checked = to === 'todo' ? src.checked : undefined
    return next
  }

  if (src.type === 'columns' && TEXT_BLOCK_TYPES.includes(to)) {
    const cols = (src.props.cols as string[][] | undefined) ?? [[], []]
    const text = cols
      .flat()
      .map((id) => byId.get(id)?.content ?? '')
      .filter(Boolean)
      .join('\n')
    next.content = text
    return next
  }

  if (src.type === 'image' && TEXT_BLOCK_TYPES.includes(to)) {
    next.content = String(src.props.caption ?? '')
    return next
  }
  return next
}

// --- Tree operations ---------------------------------------------------------

export interface TreeResult {
  blocks: Block[]
  labels: string[] // changed ids, for UI
}

export function childrenOf(blocks: Block[], parentId: string | null): Block[] {
  return blocks
    .filter((b) => b.parentId === parentId)
    .sort((a, b) => a.order - b.order)
}

function orderBetween(blocks: Block[], parentId: string | null, targetId: string | null): number {
  const sibs = childrenOf(blocks, parentId)
  if (!targetId) {
    const last = sibs[sibs.length - 1]
    return last ? last.order + 1000 : 1000
  }
  const target = sibs.find((b) => b.id === targetId)
  if (!target) return 1000
  const prev = [...sibs].reverse().find((b) => b.order < target.order)
  return prev ? (prev.order + target.order) / 2 : target.order / 2
}

/** Insert a new block: before `targetId`, or at end of `parentId`. */
export function insertBlock(blocks: Block[], block: Block, targetId: string | null, parentId: string | null): TreeResult {
  const b = { ...block, parentId: parentId ?? block.parentId }
  b.order = orderBetween(blocks, b.parentId, targetId)
  return { blocks: [...blocks, b], labels: [b.id] }
}

/** Delete blocks (and, for columns, recursively the children inside them). */
export function deleteBlocks(blocks: Block[], ids: string[]): TreeResult {
  const toDelete = new Set<string>(ids)
  let grew = true
  while (grew) {
    grew = false
    for (const b of blocks) {
      if (b.parentId && toDelete.has(b.parentId) && !toDelete.has(b.id)) {
        toDelete.add(b.id)
        grew = true
      }
      // edges referencing a deleted endpoint die with it
      if (b.type === 'edge' && !toDelete.has(b.id)) {
        const from = String(b.props.from ?? '')
        const to = String(b.props.to ?? '')
        if (toDelete.has(from) || toDelete.has(to)) {
          toDelete.add(b.id)
          grew = true
        }
      }
    }
  }
  return { blocks: blocks.filter((b) => !toDelete.has(b.id)), labels: [...toDelete] }
}

/** Move existing block(s) before target (same parent or across parents). */
export function moveBlocks(blocks: Block[], ids: string[], targetId: string | null, parentId: string | null): TreeResult {
  if (ids.includes(parentId ?? '')) return { blocks, labels: [] } // no parent-move into self
  const order = orderBetween(blocks, parentId ?? null, targetId)
  const next = blocks.map((b) => (ids.includes(b.id) ? { ...b, parentId: parentId ?? null, order } : b))
  return { blocks: next, labels: ids }
}

/**
 * Drag-to-layout (§9.1): compose dragged + target into a two-column block.
 * side='left' puts the dragged block in the left column.
 */
export function layoutColumns(
  blocks: Block[],
  draggedId: string[],
  targetId: string,
  side: 'left' | 'right'
): TreeResult {
  const dragged = blocks.find((b) => b.id === draggedId[0])
  const target = blocks.find((b) => b.id === targetId)
  if (!dragged || !target || dragged.parentId !== target.parentId) return { blocks, labels: [] }
  const cols = side === 'left' ? [[dragged.id], [target.id]] : [[target.id], [dragged.id]]
  const container = makeBlock('columns', {
    parentId: target.parentId,
    order: target.order,
    props: { cols }
  })
  const next = blocks
    .filter((b) => b.id !== draggedId[0] && b.id !== targetId)
    .map((b) => (b.id === draggedId[0] || b.id === targetId ? { ...b, parentId: container.id, order: 1000 } : b))
  // map step: dragged/target were filtered out; re-add them as children
  next.push(
    { ...dragged, parentId: container.id, order: 1000 },
    { ...target, parentId: container.id, order: 1000 }
  )
  next.push(container)
  return { blocks: next, labels: [container.id] }
}

// --- Drop intent geometry (§9.1) ---------------------------------------------

export type DropIntent =
  | { kind: 'replace'; blockId: string }
  | { kind: 'insert-before'; blockId: string }
  | { kind: 'insert-after'; blockId: string }
  | { kind: 'layout-left'; blockId: string }
  | { kind: 'layout-right'; blockId: string }
  | { kind: 'append' } // dropped on empty canvas area
  | { kind: 'none' }

export interface RectLike {
  top: number
  left: number
  width: number
  height: number
}

export function computeDropIntent(rects: Record<string, RectLike>, point: { x: number; y: number }): DropIntent {
  let best: { id: string; dist: number; r: RectLike } | null = null
  for (const [id, r] of Object.entries(rects)) {
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const dist = Math.hypot(point.x - cx, point.y - cy)
    if (!best || dist < best.dist) best = { id, dist, r }
  }
  if (!best) return { kind: 'append' }
  const r = best.r
  const left = r.left
  const top = r.top
  const right = left + r.width
  const bottom = top + r.height
  const inX = point.x >= left - 8 && point.x <= right + 8
  const inY = point.y >= top - 8 && point.y <= bottom + 8
  if (!inX && !inY) return { kind: 'append' }
  const relX = (point.x - left) / Math.max(1, r.width)
  const relY = (point.y - top) / Math.max(1, r.height)
  // Center target = replace-in-place (the block itself is the drop zone)
  if (relY > 0.25 && relY < 0.75 && relX > 0.25 && relX < 0.75) return { kind: 'replace', blockId: best.id }
  const band = Math.max(r.height * 0.3, 12)
  // Above / below the block → insert before / after
  if (point.y < top + band && relY > -0.6) return { kind: 'insert-before', blockId: best.id }
  if (point.y > bottom - band && relY < 1.6) return { kind: 'insert-after', blockId: best.id }
  // Left / right — inside the block edges OR within a band outside → two-column layout
  const outer = 80
  const zone = 60
  if (point.y >= top - band && point.y <= bottom + band && point.x >= left - outer && point.x <= right + outer) {
    if (point.x < left + zone) return { kind: 'layout-left', blockId: best.id }
    if (point.x > right - zone) return { kind: 'layout-right', blockId: best.id }
  }
  // Fallback: side of the block
  if (point.y < top + r.height / 2) return { kind: 'insert-before', blockId: best.id }
  return { kind: 'insert-after', blockId: best.id }
}

export function blockText(block: Block): string {
  return block.content
}

export function topLevelBlocks(blocks: Block[]): Block[] {
  return blocks.filter((b) => b.parentId === null).sort((a, b) => a.order - b.order)
}
