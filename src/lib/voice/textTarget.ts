import type { VoiceTarget } from './types'

interface EditorAdapter {
  beforeCapture?: () => void
  commit: (value: string) => void
}
const editors = new WeakMap<HTMLElement, EditorAdapter>()
const resolvers = new Map<HTMLElement, () => VoiceTarget | null>()
export function registerVoiceResolver(root: HTMLElement, resolve: () => VoiceTarget | null) {
  resolvers.set(root, resolve)
  return () => {
    resolvers.delete(root)
  }
}
let lastElement: HTMLElement | null = null
const selections = new WeakMap<HTMLElement, { start: number; end: number }>()

export function registerDictationEditor(element: HTMLElement, adapter: EditorAdapter) {
  editors.set(element, adapter)
  return () => {
    editors.delete(element)
  }
}
export function isTextTarget(element: Element | null): element is HTMLElement {
  return (
    (element instanceof HTMLTextAreaElement && !element.disabled && !element.readOnly) ||
    (element instanceof HTMLInputElement &&
      ['text', 'search', 'url', 'email', ''].includes(element.type) &&
      !element.disabled &&
      !element.readOnly) ||
    (element instanceof HTMLElement &&
      element.isContentEditable &&
      element.getAttribute('data-dictation') !== 'off')
  )
}

function textSelection(element: HTMLElement) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
    return {
      start: element.selectionStart ?? element.value.length,
      end: element.selectionEnd ?? element.value.length
    }
  const selection = window.getSelection()
  if (
    selection?.rangeCount &&
    element.contains(selection.anchorNode) &&
    element.contains(selection.focusNode)
  ) {
    const range = selection.getRangeAt(0)
    const before = document.createRange()
    before.selectNodeContents(element)
    before.setEnd(range.startContainer, range.startOffset)
    const start = before.toString().length
    return { start, end: start + range.toString().length }
  }
  return (
    selections.get(element) ?? {
      start: element.textContent?.length ?? 0,
      end: element.textContent?.length ?? 0
    }
  )
}
export function rememberVoiceTarget(element: Element | null = document.activeElement) {
  if (!isTextTarget(element)) return
  lastElement = element
  selections.set(element, textSelection(element))
}
export function lastVoiceElement() {
  return lastElement?.isConnected ? lastElement : null
}

export function insertTranscript(value: string, start: number, end: number, transcript: string) {
  const text = transcript.trim()
  const before = value.slice(0, start),
    after = value.slice(end)
  const lead = before && !/\s$/.test(before) && !/^[,.;:!?)]/.test(text) ? ' ' : ''
  const tail = after && !/^[\s,.;:!?)]/.test(after) ? ' ' : ''
  const inserted = lead + text + tail
  return { value: before + inserted + after, caret: before.length + inserted.length }
}

export function captureVoiceTarget(preferred?: HTMLElement | null): VoiceTarget | null {
  const active =
    preferred ?? (isTextTarget(document.activeElement) ? document.activeElement : lastVoiceElement())
  for (const [root, resolve] of resolvers) {
    if (root === active || root.contains(active)) return resolve()
  }
  const element =
    preferred ?? (isTextTarget(document.activeElement) ? document.activeElement : lastVoiceElement())
  if (!element || !isTextTarget(element)) return null
  const adapter = editors.get(element)
  adapter?.beforeCapture?.()
  const plain = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
  const original = plain ? element.value : (element.textContent ?? '')
  const { start, end } = textSelection(element)
  return {
    element,
    label: element.getAttribute('aria-label') ?? element.getAttribute('placeholder') ?? 'Text field',
    insert: (transcript) => {
      if (!element.isConnected || (plain ? element.value : (element.textContent ?? '')) !== original)
        return false
      const result = insertTranscript(original, start, end, transcript)
      if (plain) {
        // React controlled fields receive a real input event, not a private
        // React API or a clipboard side effect.
        const prototype =
          element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype
        Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, result.value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.focus()
        element.setSelectionRange(result.caret, result.caret)
      } else {
        if (adapter) {
          adapter.commit(result.value)
          element.dataset.dictationEdit = '1'
        }
        element.textContent = result.value
        if (!adapter)
          element.dispatchEvent(
            new InputEvent('input', { bubbles: true, inputType: 'insertText', data: transcript })
          )
        element.focus()
        const node = element.firstChild ?? element.appendChild(document.createTextNode(''))
        const range = document.createRange()
        range.setStart(node, Math.min(result.caret, node.textContent?.length ?? 0))
        range.collapse(true)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
      }
      rememberVoiceTarget(element)
      return true
    }
  }
}

export function applyDictionary(text: string, entries: string[]) {
  let result = text
  for (const line of entries
    .map((v) => v.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)) {
    const escaped = line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu'), () => line)
  }
  return result
}
