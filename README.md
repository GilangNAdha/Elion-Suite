# Elion Suite

Local-first personal productivity suite for Web (PWA) and Windows (Electron), with a built-in personal AI agent.

One item model, one page/block model. Every surface reads and writes the same stores, so a note edited in a Lockdown widget is the same record when you open it from Notes — no sync step, no silos.

## Modules

| Module | What it is |
|---|---|
| **Workspace** | Block pages + project databases. Table, Board, Calendar, Timeline, Gallery and List views over one dataset; custom properties, relations, rollups, sprints, saved filters, comments, `[[page]]` backlinks. |
| **Immersive editor** | Full-screen BlockSuite editing: outline, block library, version history (Time Machine), command palette, Doc ↔ Edgeless canvas, shapes, connectors, minimap, slash menu, drag-to-insert/replace/layout. |
| **Lockdown** | Full-screen focus mode: wallpapers (static / video / 3D), generated soundscape mixer, Pomodoro cycles, draggable widget dashboard, session analytics, best-effort distraction guard. |
| **Tasks / Habits / Calendar / Notes / Alarms** | Saved views, streaks and heatmaps; one calendar engine over item due dates, habit recurrences, alarms and events; notes live-sync with Lockdown; one notification pipeline. |
| **Music** | Local files + YouTube embeds; turntable, disc and minimal skins; the Lockdown widget mounts the same player state. |

## Elion, the agent

Elion is a tool-capable agent embedded in the app — not a chat wrapper:

- **Real work, real gates.** Chat turns can call registered tools (create tasks, documents, reminders, read/write memory, read pages). Every tool passes a permission table (all capabilities default to allow per the owner policy; tighten any of them in Settings › ELION runtime; provider keys are never agent-accessible).
- **Sentient Mode.** A runtime loop (separate from the chat UI) that works the task queue, surfaces due work and objectives, consolidates memory, and preempts for your instructions. State lives in IndexedDB; stopping is always one click.
- **Skills.** Named, executable packs of tool steps. Author them in Settings, run them from chat or the loop, and skills Elion authors itself land in the permanent, auditable Skill Ledger.
- **Scheduled jobs (in-app cron).** "Every morning at 09:00, brief me on today's calendar." Jobs enter the same priority queue as every other task and run while the app is open with the runtime on.
- **Persistent sessions.** Chat history survives refresh.
- **Memory.** A six-layer memory engine with contextual recall, reinforcement, conflict resolution and semantic consolidation — only relevant memories enter a prompt.
- **Agent hub.** A dedicated Agent page in the dock: chat, Sentient control, scheduled jobs, skills, permissions and the live activity timeline in one place — plus a one-click **Connect** panel for any provider's API key.

### AI providers

Settings › AI assistant — or the Connect panel on the Agent page — accepts any of: **OpenRouter** (any key/model), **9Router**, **Anthropic**, **OpenAI / Codex**, **Google Gemini**, **Kimi (Moonshot)**, **Groq**, **Ollama**, **LM Studio**, **Claude Code Router** (local), **Antigravity gateway** (local), the local **MiniCPM** gateway, or any custom OpenAI-compatible endpoint. Models are discovered live, replies stream, keys stay in local storage, and the desktop build routes requests through the Electron main process so CORS never blocks a local gateway.

## Development

```bash
npm install
npm run dev            # web app at http://localhost:5173
npm run test           # unit + integration (vitest)
npm run test:e2e       # Playwright
npm run build          # typecheck + design-token check + production build
npm run electron:dev   # desktop shell
npm run dist:win       # Windows installer + portable
```

## Documentation

- [Master build spec (v6)](docs/MASTER-BUILD-PROMPT-v6.md) — the current build contract
- [Agent program & capability map](docs/ELION-AGENT-PROGRAM.md) · [ELION identity](docs/ELION-IDENTITY.md)
- [Gmail setup](docs/GMAIL-SETUP.md)
- [Design system](docs/ELION-FRONTEND-DESIGN.md) · [Voice dictation](docs/VOICE-DICTATION.md) · [Studio integration](docs/STUDIO-INTEGRATION.md)

## Honest limitations

The web build runs in a browser tab: background work happens only while the app is open, browser automation and local-file access need the Electron desktop build, and integrations that need your own credentials (Gmail, Google Calendar) stay honestly `unconfigured` until you connect them. Nothing simulates success.

## License

MIT — see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for bundled assets and third-party notices.
