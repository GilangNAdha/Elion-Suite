import { PET_LAYOUT } from '../tokens/tokens'

export interface PetViewport {
  width: number
  height: number
}
export interface PetBounds {
  left: number
  right: number
  top: number
  bottom: number
}
export interface Point {
  x: number
  y: number
}
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const normal = (value: number) => (Number.isFinite(value) ? clamp(value, 0, 1) : 0.85)

export function petBounds(viewport: PetViewport, size: number): PetBounds {
  const left = Math.min(PET_LAYOUT.inset, Math.max(0, viewport.width - size))
  const top = Math.min(PET_LAYOUT.topInset, Math.max(0, viewport.height - size - PET_LAYOUT.chromeHeight))
  return {
    left,
    top,
    right: Math.max(left, viewport.width - size - PET_LAYOUT.inset),
    bottom: Math.max(top, viewport.height - size - PET_LAYOUT.chromeHeight - PET_LAYOUT.bottomInset)
  }
}
export function positionToPoint(position: Point, bounds: PetBounds): Point {
  return {
    x: bounds.left + normal(position.x) * (bounds.right - bounds.left),
    y: bounds.top + normal(position.y) * (bounds.bottom - bounds.top)
  }
}
export function pointToPosition(point: Point, bounds: PetBounds): Point {
  return {
    x: bounds.right === bounds.left ? 0 : clamp((point.x - bounds.left) / (bounds.right - bounds.left), 0, 1),
    y: bounds.bottom === bounds.top ? 0 : clamp((point.y - bounds.top) / (bounds.bottom - bounds.top), 0, 1)
  }
}

/** Prefer a bubble beside the pet, or above it on a narrow screen. Always keep
 * the controls in the viewport, even after dragging/resizing or opening a keyboard. */
export function petPopover(viewport: PetViewport, point: Point, size: number, chat: boolean) {
  const inset = Math.min(PET_LAYOUT.inset, Math.max(0, viewport.width / 8), Math.max(0, viewport.height / 8))
  const width = Math.min(
    chat ? PET_LAYOUT.chatWidth : PET_LAYOUT.actionsWidth,
    Math.max(1, viewport.width - inset * 2)
  )
  const height = Math.min(
    chat ? PET_LAYOUT.chatHeight : PET_LAYOUT.actionsHeight,
    Math.max(1, viewport.height - inset * 2)
  )
  const roomLeft = point.x - PET_LAYOUT.gap - width >= inset
  const roomRight = point.x + size + PET_LAYOUT.gap + width <= viewport.width - inset
  const x = roomLeft
    ? point.x - PET_LAYOUT.gap - width
    : roomRight
      ? point.x + size + PET_LAYOUT.gap
      : point.x + size / 2 - width / 2
  const y =
    roomLeft || roomRight
      ? point.y + size + PET_LAYOUT.chromeHeight - height
      : point.y - PET_LAYOUT.gap - height
  return {
    x: clamp(x, inset, Math.max(inset, viewport.width - width - inset)),
    y: clamp(y, inset, Math.max(inset, viewport.height - height - inset)),
    width,
    height
  }
}
