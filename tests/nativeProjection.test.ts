import { describe, expect, it } from 'vitest'
import {
  nativeFlavour,
  nativeTextType,
  projectedType,
  descendantsOf,
  textPatch,
  encodeNativeState,
  decodeNativeState
} from '../src/lib/nativeProjection'
import type { Block } from '../src/lib/types'
const block = (type: Block['type'], patch: Partial<Block> = {}): Block => ({
  id: 'original-id',
  type,
  content: 'Keep my text',
  parentId: null,
  order: 1,
  props: {},
  ...patch
})

describe('non-destructive BlockSuite migration adapter', () => {
  it('maps real headings, paragraphs, lists, code and dividers', () => {
    expect(nativeFlavour(block('heading2'))).toBe('affine:paragraph')
    expect(nativeTextType(block('heading2'))).toBe('h2')
    expect(nativeFlavour(block('todo'))).toBe('affine:list')
    expect(nativeTextType(block('bullet'))).toBe('bulleted')
    expect(nativeFlavour(block('code'))).toBe('affine:code')
    expect(nativeFlavour(block('divider'))).toBe('affine:divider')
    expect(projectedType('affine:paragraph', 'h2')).toBe('heading2')
    expect(projectedType('affine:list', 'numbered')).toBe('numbered')
  })
  it('preserves the shared database as an embedded Elion block, not a copied database', () => {
    expect(nativeFlavour(block('database', { props: { dbId: 'one-shared-database' } }))).toBe(
      'elion:embedded'
    )
  })
  it('does not silently flatten unsupported drawings or layouts', () => {
    for (const type of ['columns', 'duel', 'frame', 'shape', 'pen', 'arrow', 'gallery'] as const)
      expect(nativeFlavour(block(type))).toBe('elion:embedded')
  })
  it('keeps all descendants of a preserved layout', () => {
    const root = block('columns')
    const children = [
      root,
      block('paragraph', { id: 'a', parentId: root.id }),
      block('todo', { id: 'b', parentId: 'a' }),
      block('paragraph', { id: 'unrelated' })
    ]
    expect(descendantsOf(root, children).map((item) => item.id)).toEqual(['a', 'b'])
  })
  it('patches only the changed text span so other rich text keeps its marks', () => {
    expect(textPatch('A bold idea', 'A better idea')).toEqual({ start: 3, deleteCount: 3, insert: 'etter' })
    expect(textPatch('unchanged', 'unchanged')).toEqual({ start: 9, deleteCount: 0, insert: '' })
  })
  it('roundtrips binary Yjs state without truncating large chunks', () => {
    const bytes = Uint8Array.from({ length: 20000 }, (_, i) => i % 256)
    expect(decodeNativeState(encodeNativeState(bytes))).toEqual(bytes)
  })
})
