import fs from 'node:fs'
import path from 'node:path'

const failures = []
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'tokens') walk(file)
      continue
    }
    if (!/\.(tsx?|css)$/.test(file)) continue
    const source = fs.readFileSync(file, 'utf8')
    source.split('\n').forEach((line, index) => {
      // Numeric art geometry, chart coordinates, custom user seed values and
      // responsive breakpoints aren't UI paint. Literal colors always are.
      if (/#[\da-f]{3,8}\b|rgba?\(\s*\d|hsla?\(\s*\d/i.test(line))
        failures.push(`${file}:${index + 1}: use a paint token, not a literal color`)
      if (file.endsWith('.css') && /\b\d+(\.\d+)?px\b/.test(line) && !line.includes('transform-origin:'))
        failures.push(`${file}:${index + 1}: put static UI lengths in foundation.css`)
      if (
        file.endsWith('.tsx') &&
        /\buppercase\b|\btracking-wid(?:e|er|est)\b/.test(line) &&
        !line.trim().startsWith('//')
      )
        failures.push(`${file}:${index + 1}: tracked uppercase belongs only to the CSS Lozenge`)
      if (file.endsWith('.tsx') && /var\(--dusk\)/.test(line) && !file.endsWith('FocusTimer.tsx'))
        failures.push(`${file}:${index + 1}: Dusk must stay paired with Current in the signature`)
    })
  }
}
walk('src')
if (failures.length) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else
  console.log(
    'Design checks passed: token-based paint/static CSS lengths; no decorative uppercase; rationed Dusk.'
  )
