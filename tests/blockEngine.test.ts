import { describe, expect, it } from 'vitest'
import {
  convertBlock,
  computeDropIntent,
  insertBlock,
  deleteBlocks,
  layoutColumns,
  makeBlock,
  topLevelBlocks
} from '../src/lib/blockEngine'
import type { Block } from '../src/lib/types'

const para: Block = { id: 'p1', type: 'paragraph', content: 'Hello world', parentId: null, order: 1000, props: {} }
const img: Block = {
  id: 'i1',
  type: 'image',
  content: 'a caption',
  parentId: null,
  order: 2000,
  props: { src: 'data:image/png;base64,xyz', caption: 'cap' }
}
const gallery: Block = {
  id: 'g1',
  type: 'gallery',
  content: '',
  parentId: null,
  order: 3000,
  props: { items: [{ src: 'data:one', caption: '' }, { src: 'data:two', caption: '' }] }
}

describe('block engine (§9.1 mechanics)', () => {
  it('converts text types preserving content (drag-to-replace)', () => {
    const h = convertBlock(para, 'heading1', [para])
    expect(h.type).toBe('heading1')
    expect(h.content).toBe('Hello world')
    const back = convertBlock(h, 'paragraph', [h])
    expect(back.content).toBe('Hello world')
  })

  it('image → gallery keeps the image as first gallery item', () => {
    const g = convertBlock(img, 'gallery', [img])
    expect(g.type).toBe('gallery')
    const items = g.props.items as { src: string; caption: string }[]
    expect(items[0].src).toBe('data:image/png;base64,xyz')
    expect(items).toHaveLength(1)
  })

  it('gallery → image keeps the first item', () => {
    const i = convertBlock(gallery, 'image', [gallery])
    expect(i.props.src).toBe('data:one')
  })

  it('computeDropIntent: center = replace, top = insert-before, edges = layout', () => {
    const rects = {
      p1: { top: 100, left: 10, width: 400, height: 40 }
    }
    // center
    expect(computeDropIntent(rects, { x: 210, y: 120 })).toEqual({ kind: 'replace', blockId: 'p1' })
    // top band
    expect(computeDropIntent(rects, { x: 210, y: 103 })).toEqual({ kind: 'insert-before', blockId: 'p1' })
    // bottom band
    expect(computeDropIntent(rects, { x: 210, y: 137 })).toEqual({ kind: 'insert-after', blockId: 'p1' })
    // left edge
    expect(computeDropIntent(rects, { x: 20, y: 120 })).toEqual({ kind: 'layout-left', blockId: 'p1' })
    // right edge
    expect(computeDropIntent(rects, { x: 485, y: 120 })).toEqual({ kind: 'layout-right', blockId: 'p1' })
  })

  it('append when dropping on empty space', () => {
    expect(computeDropIntent({}, { x: 0, y: 0 })).toEqual({ kind: 'append' })
    expect(computeDropIntent({ p1: { top: 100, left: 10, width: 400, height: 40 } }, { x: 600, y: 600 })).toEqual({
      kind: 'append'
    })
  })

  it('insert + delete keep the tree consistent', () => {
    let blocks = [para]
    const inserted = makeBlock('heading1', { content: 'Title' })
    blocks = insertBlock(blocks, inserted, null, null).blocks
    expect(topLevelBlocks(blocks)).toHaveLength(2)
    const after = insertBlock(blocks, makeBlock('paragraph', { content: 'x' }), para.id, null)
    expect(after.blocks).toHaveLength(3)
    const del = deleteBlocks(after.blocks, [inserted.id])
    expect(del.blocks).toHaveLength(2)
  })

  it('drag-to-layout composes two blocks into a columns block', () => {
    const blocks = [para, { ...img, id: 'i2' }]
    const res = layoutColumns(blocks, [para.id], 'i2', 'left')
    const cols = res.blocks.find((b) => b.type === 'columns')
    expect(cols).toBeTruthy()
    const colIds = (cols!.props.cols as string[][]).flat()
    expect(colIds).toContain(para.id)
    expect(colIds).toContain('i2')
    // children now point at the container
    expect(res.blocks.find((b) => b.id === para.id)!.parentId).toBe(cols!.id)
    expect(res.blocks.find((b) => b.id === 'i2')!.parentId).toBe(cols!.id)
    // the two originals are no longer top-level
    expect(topLevelBlocks(res.blocks).some((b) => b.id === para.id)).toBe(false)
  })

  it('v5: converting a text block to a frame keeps its content as the title', () => {
    const next = convertBlock(para, 'frame', [para])
    expect(next.type).toBe('frame')
    expect(next.props.title).toBe('Hello world')
  })

  it('v5: edge/frame/duel conversions drop content (structural blocks)', () => {
    expect(convertBlock(para, 'duel', [para]).content).toBe('')
    expect(convertBlock(makeBlock('edge', { props: { from: 'a', to: 'b' } }), 'paragraph', []).content).toBe('')
  })

  it('v5: deleting an edge endpoint deletes the edge too', () => {
    const edge = makeBlock('edge', { props: { from: 'p1', to: 'i1' } })
    const res = deleteBlocks([para, img, edge], ['i1'])
    expect(res.blocks.find((b) => b.id === 'i1')).toBeUndefined()
    expect(res.blocks.find((b) => b.type === 'edge')).toBeUndefined()
    // deleting an unrelated block keeps the edge
    const other = makeBlock('paragraph', { id: 'p9', content: '' })
    const keep = deleteBlocks([para, img, other, edge], ['p9'])
    expect(keep.blocks.find((b) => b.type === 'edge')).toBeTruthy()
  })

  it('v5: makeBlock defaults for the new block types', () => {
    expect(makeBlock('frame').props.title).toBe('')
    expect(makeBlock('edge').props).toEqual({ from: '', to: '' })
    expect(makeBlock('duel').type).toBe('duel')
  })
})
