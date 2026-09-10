#!/usr/bin/env node
// Pemasang ulang skill agent ke ~/.claude — kalau sandbox/VM di-reset, direktori
// home ikut hilang, tapi repo ini tidak. Jalankan `node scripts/install-agent-skills.mjs`
// untuk mengembalikan semuanya dari sumber kanonik. Idempoten: clone/pull tipis, lalu
// copy timpa. Tidak ada data user yang dihapus.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = os.homedir()
const CACHE = path.join(process.cwd(), '.arena', 'agent-skill-sources')
const SKILLS = path.join(HOME, '.claude', 'skills')
const COMMANDS = path.join(HOME, '.claude', 'commands')

// Sumber skill; `skillsDir` path relatif di dalam repo tempat folder SKILL.md berada.
const SOURCES = [
  { repo: 'https://github.com/obra/superpowers.git', name: 'superpowers', skillsDir: 'skills' },
  { repo: 'https://github.com/browser-act/skills.git', name: 'browser-act-skills', skillsDir: '.' },
  { repo: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git', name: 'ui-ux-pro-max-skill', skillsDir: '.claude/skills' },
  { repo: 'https://github.com/usestrix/strix.git', name: 'strix', skillsDir: 'skills' },
  // Command pack (bukan skill): slash command review/pr/debug dari shannon.
  { repo: 'https://github.com/KeygraphHQ/shannon.git', name: 'shannon', skillsDir: null, commandsDir: '.claude/commands', prefix: 'shannon-' }
]

// Boundary Gilang (docs/ELION-IDENTITY.md §11): skill keamanan strix bersifat
// metodologi lab-only; script ini hanya menyalin teks, tidak menjalankan apa pun.
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' })

fs.mkdirSync(CACHE, { recursive: true })
fs.mkdirSync(SKILLS, { recursive: true })
fs.mkdirSync(COMMANDS, { recursive: true })

for (const src of SOURCES) {
  const dir = path.join(CACHE, src.name)
  if (fs.existsSync(path.join(dir, '.git'))) run('git pull --ff-only -q', dir)
  else run(`git clone --depth 1 -q ${src.repo} ${dir}`)
  if (src.skillsDir) {
    const root = path.join(dir, src.skillsDir)
    // browser-act menaruh skill di level pertama; yang lain juga — pola yang sama.
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const full = path.join(root, entry.name)
      if (!entry.isDirectory()) continue
      if (!fs.existsSync(path.join(full, 'SKILL.md'))) continue
      fs.rmSync(path.join(SKILLS, entry.name), { recursive: true, force: true })
      fs.cpSync(full, path.join(SKILLS, entry.name), { recursive: true })
      console.log(`✓ skill ${entry.name}`)
    }
  }
  if (src.commandsDir) {
    for (const file of fs.readdirSync(path.join(dir, src.commandsDir))) {
      fs.copyFileSync(path.join(dir, src.commandsDir, file), path.join(COMMANDS, `${src.prefix}${file}`))
      console.log(`✓ command ${src.prefix}${file}`)
    }
  }
}
const installed = fs.readdirSync(SKILLS).filter((d) => fs.existsSync(path.join(SKILLS, d, 'SKILL.md')))
console.log(`\n${installed.length} skill siap di ${SKILLS}`)
