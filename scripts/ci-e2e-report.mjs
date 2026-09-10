// Pembaca ringkas laporan JSON Playwright untuk CI: tiap test gagal jadi satu
// annotation GitHub. Dipakai karena sandbox/CI mirror tidak selalu bisa
// mengunduh log mentah, sedangkan annotation lewat API selalu bisa dibaca.
import { readFileSync } from 'node:fs'

const report = JSON.parse(readFileSync(process.argv[2] ?? 'pw-e2e.json', 'utf8'))
const failed = []
const flaky = []
const walk = (suite, titlePath) => {
  for (const spec of suite.specs ?? [])
    for (const test of spec.tests ?? []) {
      const results = test.results ?? []
      // Hanya hasil TERAKHIR yang menentukan vonis; kegagalan sebelumnya di
      // test yang akhirnya lolos = flaky (notice), bukan merah.
      const result = results.at(-1)
      if (!result) continue
      if (result.status === 'failed' || result.status === 'timedOut')
        failed.push({
          where: [...titlePath, spec.title].join(' › '),
          message: (result.error?.message ?? result.error?.value ?? 'no error message')
            .replace(/\u001b\[[0-9;]*m/g, '')
            .split('\n')
            .slice(0, 4)
            .join(' | ')
            .slice(0, 400)
        })
      else if (results.length > 1)
        flaky.push(`${[...titlePath, spec.title].join(' › ')} (lolos di percobaan ke-${results.length})`)
    }
  for (const child of suite.suites ?? []) walk(child, [...titlePath, suite.title ?? ''])
}
for (const suite of report.suites ?? []) walk(suite, [])
const stats = report.stats ?? {}
// Playwright kadang exit 1 hanya karena test "flaky" (lolos di percobaan
// ulang). Vonis final diambil dari JSON, bukan exit code CLI: failed = merah,
// flaky = notice kuning biar tetap kelihatan dan tidak dibisukan.
console.log(
  `::notice::e2e summary: ${stats.expected ?? '?'} passed, ${failed.length} failed, ${stats.flaky ?? 0} flaky`
)
for (const f of failed) console.log(`::error::[e2e] ${f.where} — ${f.message}`)
for (const f of flaky) console.log(`::warning::[e2e flaky→retry-ok] ${f}`)
process.exit(failed.length ? 1 : 0)
