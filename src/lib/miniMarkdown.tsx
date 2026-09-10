import { useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'

// Renderer markdown mini untuk balasan chat. Sengaja tidak pakai library:
// kebutuhan chat cuma fenced code, bold/italic/inline code, link http(s),
// list, dan heading — itu semua bisa dengan aturan kecil yang outputnya
// React node (bukan innerHTML), jadi aman dari injection.
// elion: shortcut - renderer minimal khusus chat; ganti react-markdown kalau
// butuh tabel/HTML mentah di masa depan.

const safeHref = (raw: string): string | null => {
  try {
    const url = new URL(raw, window.location.origin)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** Inline: `code`, **bold**, *italic*, [text](url). */
function inline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^\s*][^*\n]*\*)|(\[[^\]\n]+\]\([^)\s]+\))/g
  let cursor = 0
  let match: RegExpExecArray | null
  let i = 0
  while ((match = pattern.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    const token = match[0]
    const key = `${keyBase}-i${i++}`
    if (token.startsWith('`')) nodes.push(<code key={key} className="mini-code">{token.slice(1, -1)}</code>)
    else if (token.startsWith('**')) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('[')) {
      const split = token.indexOf('](')
      const label = token.slice(1, split)
      const href = safeHref(token.slice(split + 2, -1))
      nodes.push(
        href ? (
          <a key={key} className="mini-link" href={href} target="_blank" rel="noreferrer noopener">
            {label}
          </a>
        ) : (
          <span key={key}>{label}</span>
        )
      )
    } else nodes.push(<em key={key}>{token.slice(1, -1)}</em>)
    cursor = match.index + token.length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard ditolak browser — biarkan user select manual */
    }
  }
  return (
    <figure className="mini-codeblock">
      <figcaption>
        <span>{lang || 'code'}</span>
        <button type="button" onClick={copy} aria-label={copied ? 'Copied' : 'Copy code'}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </figcaption>
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  )
}

export function MiniMarkdown({ text: rawText }: { text: string }) {
  // Saat streaming, fence terakhir sering belum ditutup — tutup virtual dulu
  // supaya potongan kode dirender sebagai code block, bukan baris mentah.
  const fences = (rawText.match(/```/g) || []).length
  const text = fences % 2 === 1 ? `${rawText}
\`\`\`` : rawText
  // Split dulu ke blok code/non-code supaya parser baris tidak makan fence.
  const parts = text.split(/```([\w+-]*)\n?([\s\S]*?)```/g)
  const blocks: ReactNode[] = []
  let key = 0
  for (let p = 0; p < parts.length; p += 3) {
    const chunk = parts[p]
    if (chunk.trim()) {
      for (const line of chunk.replace(/\r\n/g, '\n').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed)
        const bullet = /^[-*]\s+(.*)$/.exec(trimmed)
        const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed)
        if (heading) blocks.push(<h4 key={key++} className="mini-heading">{inline(heading[2], `h${key}`)}</h4>)
        else if (bullet) blocks.push(<div key={key++} className="mini-li">• {inline(bullet[1], `b${key}`)}</div>)
        else if (numbered) blocks.push(<div key={key++} className="mini-li">{numbered[0].slice(0, -2)}. {inline(numbered[1], `n${key}`)}</div>)
        else blocks.push(<p key={key++}>{inline(trimmed, `p${key}`)}</p>)
      }
    }
    if (p + 2 < parts.length) {
      const lang = parts[p + 1].trim()
      const code = parts[p + 2].replace(/\n$/, '')
      if (code) blocks.push(<CodeBlock key={key++} code={code} lang={lang} />)
    }
  }
  return <div className="mini-md">{blocks}</div>
}
