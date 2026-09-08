import type { Block, BlockType } from './types'

/** Explicit migration coverage. Everything else is preserved, not flattened. */
export const NATIVE_TEXT_TYPES = new Set<BlockType>([
  'paragraph',
  'text',
  'heading1',
  'heading2',
  'heading3',
  'quote',
  'bullet',
  'numbered',
  'todo',
  'code',
  'divider'
])
export function nativeFlavour(block: Block) {
  if (['bullet', 'numbered', 'todo'].includes(block.type)) return 'affine:list'
  if (block.type === 'code') return 'affine:code'
  if (block.type === 'divider') return 'affine:divider'
  if (NATIVE_TEXT_TYPES.has(block.type)) return 'affine:paragraph'
  return 'elion:embedded'
}
export function nativeTextType(block: Block): string {
  if (block.type.startsWith('heading')) return `h${block.type.slice(-1)}`
  if (block.type === 'quote') return 'quote'
  if (['bullet', 'numbered', 'todo'].includes(block.type))
    return block.type === 'bullet' ? 'bulleted' : block.type
  return 'text'
}
export function projectedType(flavour: string, type?: string): BlockType {
  if (flavour === 'affine:code') return 'code'
  if (flavour === 'affine:divider') return 'divider'
  if (flavour === 'affine:list') return type === 'todo' ? 'todo' : type === 'numbered' ? 'numbered' : 'bullet'
  if (type === 'h1') return 'heading1'
  if (type === 'h2') return 'heading2'
  if (['h3', 'h4', 'h5', 'h6'].includes(type ?? '')) return 'heading3'
  return type === 'quote' ? 'quote' : 'paragraph'
}
export function descendantsOf(block: Block, blocks: Block[]): Block[] {
  const ids = new Set([block.id])
  let grew = true
  while (grew) {
    grew = false
    for (const candidate of blocks)
      if (candidate.parentId && ids.has(candidate.parentId) && !ids.has(candidate.id)) {
        ids.add(candidate.id)
        grew = true
      }
  }
  return blocks.filter((candidate) => candidate.id !== block.id && ids.has(candidate.id))
}

/** Minimal replacement preserves rich-text formatting outside the changed span. */
export function textPatch(before: string, after: string) {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++
  let endBefore = before.length,
    endAfter = after.length
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--
    endAfter--
  }
  return { start, deleteCount: endBefore - start, insert: after.slice(start, endAfter) }
}
export function encodeNativeState(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(binary)
}
export function decodeNativeState(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}
