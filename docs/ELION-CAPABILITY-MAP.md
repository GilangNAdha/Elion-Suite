# Elion Capability Map — external repos, honestly classified

Gilang asked for six repos to be "implemented into our AI agent". Treating them
uniformly would be a lie — they are five different kinds of thing. Per
`docs/ELION-IDENTITY.md` §14, each gets the response that actually fits what
it is. This map records what was done, on this machine, in this repo.

| Repo | What it actually is | Verdict | What Elion got |
|---|---|---|---|
| [obra/superpowers](https://github.com/obra/superpowers) | Claude Code skills pack (14 workflow skills) | **Installed** | `~/.claude/skills/*` — brainstorming, TDD, debugging, planning, review, verification… |
| [browser-act/skills](https://github.com/browser-act/skills) | Browser-automation skill + skill-forge (needs its own CLI) | **Installed** (skill), CLI pending user approval | 2 skills; runtime via `uv tool install browser-act-cli --python 3.12` when Gilang opts in |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Real, self-contained SKILL.md packs (7: ui-ux-pro-max, design, design-system, ui-styling, brand, banner-design, slides) | **Installed** | `~/.claude/skills/*` — 79 UI styles, 192 palettes, 74 font pairs, 119 UX rules, chart/GSAP presets. Directly useful for this app's design passes |
| [usestrix/strix](https://github.com/usestrix/strix) | Autonomous pentest **tool** (Python, Docker sandbox) that also ships methodology skills | **Skills installed; tool not run** | 9 SKILL.md methodology packs (OWASP Top 10:2025, API sec, secure fix/review workflows). Running `strix` itself needs its own runtime + target authorization — see boundary below |
| [KeygraphHQ/shannon](https://github.com/KeygraphHQ/shannon) | Autonomous web-app pentest **runtime** (Bun, own sandbox, LLM-driven) | **Commands only; runtime left external** | Its 3 Claude slash commands (`/shannon-review`, `/shannon-pr`, `/shannon-debug`) → `~/.claude/commands`. Shannon can't "live inside" a browser app — it's a separate agent runner |
| [The-Art-of-Hacking/h4cker](https://github.com/The-Art-of-Hacking/h4cker) | Cybersecurity **curriculum** (labs, notebooks, reading) — not tooling | **Reference library** | Nothing to install; cited as the study map behind the `mentor` persona pack in Settings › AI assistant |
| [FoundationAgents/MetaGPT](https://github.com/FoundationAgents/MetaGPT) | Multi-agent software-company **framework** (Python, own LLM orchestration) | **Pattern borrowed, not integrated** | Its core idea (SOP roles: PM → architect → engineer → QA) is expressed as the `ship` persona pack + identity §7 loop. Embedding a Python orchestrator into an offline-first React/Electron PWA would violate the app's own architecture and §6's data boundary — MetaGPT runs standalone if Gilang wants it, e.g. `pip install metagpt` |
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | Standalone agent **runtime** with messaging gateways | **Feature-set duplicated natively; no external runtime** | The agent core (skills, cron jobs, persistent sessions, tool permission gating) is implemented natively in `src/lib/agentSkills.ts` / `src/lib/agentJobs.ts` / `src/lib/agentSessions.ts` — Elion does not ship, require, or connect to an external Hermes gateway |

## The security boundary (applies to every row above)

Identity §11 is absolute and independent of any repo installed here:
recon/vuln tooling is **lab-environment only**. The strix/shannon skills teach
methodology for authorized targets — installing a skill document is not
authorization, and Elion (in-app or in Claude Code) must never point any of
them at live or unauthorized systems. Gilang's coursework boundary, enforced by
the prompt AND by the fact that neither tool's runtime was configured here.

## Re-install after a fresh sandbox/VM

```bash
node scripts/install-agent-skills.mjs
```

Idempotent; clones sources to `.arena/agent-skill-sources` and copies skill
folders into `~/.claude/skills` + `~/.claude/commands`. Creates/overwrites
only what it owns; deletes nothing outside its own managed skill folders.

## In-app consequence (this repo)

The chat doesn't "run" these tools — it *thinks* like them. Elion's persona in
`src/stores/aiStore.ts` now follows identity §2 v3 (Restraint trait included)
and Settings › AI assistant ships persona packs that mirror the useful mental
models: `elion` (default), `ship` (MetaGPT-style role pipeline + §7 loop + §8
ladder), `plan` (chief-of-staff scheduling), `guard` (strix/OWASP review
methodology, defensive-only), `mentor` (h4cker-style explanations for study).
