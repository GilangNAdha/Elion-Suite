# Elion Suite

**Local-first personal productivity suite** — Web (PWA) + Windows desktop (Electron).

One item model, one page/block model. Every surface is a *merged view* over the same stores (the “Merge Matrix”), so a note edited in a Lockdown widget is the identical, already-updated record when you open it from the Notes page — no sync step, no silos.

> Working name in the build spec: *Aurora Suite*; shipped in this repository as **Elion Suite**.

---

## Modules

| Module | What it is |
|---|---|
| **Workspace** (flagship) | Block pages + Jira-style project databases. Six views over one dataset: Table, Board (kanban + WIP limits, swimlanes), Calendar, Timeline (Gantt), Gallery, List. Custom properties (select / multi-select / number / date / checkbox / person / URL / **relation** / **rollup**), templates, saved filters with a visual AND/OR query builder (+ optional raw mode), sprints, per-status automations, burndown / velocity / cumulative-flow reports, `[[page]]` links + backlinks, per-block comments with @mentions. |
| **Immersive editor** (`/workspace/:pageId/edit`) | Full-screen editing mode that bypasses the app shell: auto-hiding toolbar, dockable/floatable **left panel** (outline + draggable block library) and **right inspector**, visible **history stack** (plain-language actions, jump to any point), local **Time Machine** version snapshots, **command palette** (Ctrl/Cmd+K), **Page ↔ Edgeless** toggle with pan/zoom (zoom-to-fit, zoom-to-selection), shape/pen/arrow tools, marquee multi-select, and the three drag mechanics: **drag-to-insert**, **drag-to-replace-in-place** (content preserved across compatible type conversions), **drag-to-layout** (edge-drop composes two-column blocks). Every drag has a keyboard-operable equivalent (block menu → *Convert to…*). |
| **Lockdown Mode** (flagship, `/lockdown`) | Full-screen focus: three-tier wallpapers (static / looping video / 3D scenes via R3F with static reduced-motion fallbacks), **soundscape mixer** (rain, fire crackle, white noise, café hum, wind — generated on-device, mixed via Howler, saved per preset), **Pomodoro work/break cycles** with transition cues and cycle goals, widget dashboard (clock, timer, music, notes, pet, weather — draggable/resizable, layout saved per preset), **session analytics** (Focus history; mirrored to Profile), optional **multi-monitor fullscreen**, and a clearly-caveated **best-effort distraction guard** (soft nudge only). |
| **Tasks** | Saved Board/List views over items that live *outside any project* — the same `WorkspaceItem` records. |
| **Habits** | Recurring items (`type: 'habit'` + recurrence rules) with streaks, week strips, and 12-week heatmaps. |
| **Calendar** | One calendar engine, four data sources: item due dates, habit recurrences, alarm times, manual events. |
| **Notes** | The pinned “personal” branch of the Workspace page tree — same editor, same store, live-synced with the Lockdown notes widget. |
| **Alarms** | One reminder pipeline: alarms (and due/overdue items, @mentions) all surface in the top-bar Notification Center. |
| **Music** | Shared player core (local files + YouTube embeds, disc/minimal skins); the Lockdown widget mounts the same player state. |
| **Pet** | One shared mood state (Dashboard + Lockdown), driven by real activity: focus sessions, completions, overdue items, time of day. |
| **Theming engine** | Seed color → HSL harmony (complementary / analogous / triadic / split-complementary / monochromatic) → full semantic token set → **live WCAG contrast check with auto-correction**, density / radius / glass controls, named presets, JSON export/import. Propagates to every surface in one render cycle. |
| **Speech-to-text** | Offline Whisper (WASM) dictation in the editor — see below. |

---

## Development setup

Requirements: Node 18+.

```bash
npm install
npm run dev            # web app at http://localhost:5173
```

Other scripts:

```bash
npm run typecheck      # strict TS
npm test               # Vitest unit tests (theming, block engine, streaks, filters)
npm run build          # typecheck + production web build (dist/)
npm run electron:dev   # web + Electron (downloads the Electron binary on first run)
npm run dist:win       # production build + Windows NSIS installer & portable .exe (release/)
```

> **Sandbox note:** in restricted network sandboxes `npm install --ignore-scripts` may be needed (the `sharp`
> transitive of `electron-builder` downloads a libvips binary from GitHub). On a normal machine a plain
> `npm install` is all you need.

### Windows packaging

`npm run dist:win` produces, in `release/`:

- `Elion Setup <version>.exe` — NSIS installer (user-selectable install directory)
- `Elion Suite-Portable.exe` — portable

The Windows build is **unsigned**, so SmartScreen will warn on first launch. Sign the artifacts to suppress this.

---

## Design tokens & theming pipeline

- **8px spacing grid**, **4-layer elevation** (`sunken` / `default` / `raised` / `overlay`), heading/body/**metric** type scale — `src/tokens/tokens.ts`.
- **Theming engine** — `src/tokens/theme.ts`: seed HSL → `harmonize()` → semantic tokens (surfaces, ink, primary/accent, semantic ok/warn/bad/info, 6-color chart palette, shadows, radius, glass) → `autoFixContrast()` nudges text lightness until WCAG AA (4.5:1 body, 3:1 UI) is met. The Settings page shows the live pair-by-pair report.
- Resolved tokens are applied as CSS variables on `<html>`; Tailwind maps to those variables (`tailwind.config.ts`). Density scales the root font size (everything is rem-based); glass controls backdrop blur/alpha.
- Only Lockdown presets may override the theme per session (`themeOverride`), restored on exit.
- Reduced motion: system `prefers-reduced-motion` **and** the in-app toggle both force static fallbacks, including for 3D wallpapers (QA gate #4).

### Re-running the `ui-ux-pro-max` skill

If you re-run the original `ui-ux-pro-max` skill pass, preserve these invariants:

1. Output must be **design tokens + component primitives only** (never overwrite store/domain code).
2. Tokens must land in `src/tokens/` and map through `tailwind.config.ts` — never hardcode hex values in components (use `var(--…)` / Tailwind token colors).
3. Keep the 4-layer elevation model and the status-pill component; they are referenced by every module.
4. Run `npm test` + `npm run typecheck` after a pass — the contrast assertions catch regressions.

---

## Speech-to-text (adapted from [Handy](https://github.com/cjpais/Handy))

[Handy](https://github.com/cjpais/Handy) is a fully-offline speech-to-text app: Tauri + React frontend with a Rust sidecar running **whisper.cpp** (GGML/GGUF Whisper models), **Silero VAD** for silence filtering, push-to-talk, and paste-into-focused-field. No audio ever leaves the machine.

Elion Suite is React/Electron with no native sidecar, so the architecture is adapted while keeping the same posture:

| Handy | Elion Suite |
|---|---|
| whisper.cpp in a Rust sidecar | **Whisper as WASM/ONNX in the renderer** (`@xenova/transformers`, q8) |
| Silero VAD | Energy-gated silence trim (`trimSilence`) around the recorded buffer |
| Global push-to-talk + system paste | Dictation into the **focused block** (block menu → *Dictate (voice)*), transcription appended with a history entry |
| Model download from Hugging Face (GGML) | Model download from Hugging Face (ONNX q8), **cached for offline use** afterwards |

- First use of a model downloads it (tiny ≈ 40 MB, base ≈ 75 MB) and caches it; everything is local after that.
- The microphone requires a secure context and user permission; a denied/unavailable mic produces a clear error toast, never a silent dead-end.
- Settings → Speech-to-text lets you enable/disable dictation and pick the model.

## Architecture notes (Merge Matrix)

- **One `items` store** (Dexie `items` + in-memory map): Workspace databases, Tasks, habits, calendar due dates, search. Status changes write `statusHistory` rows that drive all reports; automations run on transition.
- **One `pages` store**: Workspace pages, Notes (personal branch), the Lockdown notes widget, editor blocks, snapshots, templates, comments, saved filters.
- **One reminder pipeline**: alarms + due/overdue items + @mentions → Notification Center (top-bar bell).
- **One player core / one pet state / one calendar engine** shared across their mount points.

## Known Limitations

- **Unsigned Windows build** triggers SmartScreen warnings until the artifacts are code-signed.
- **No cloud sync anywhere.** All Workspace data (including version snapshots) is local (IndexedDB) by design — there is no backend in this build.
- **The Lockdown distraction guard is a soft nudge, not OS-level enforcement.** It brings the window back / shows a “still locked down?” prompt after a configurable blur threshold; it cannot block other applications or websites (that would require elevated system permissions this build does not request).
- **3D wallpapers use built-in scenes** (particle field, gradient mesh, orbit shape). Imported `.glb`/`.gltf` files have no in-app scene editor yet.
- **Workspace automations are simple transition-triggered rules** (set priority / add label / due-in-days / notify), not a general scripting engine.
- **Local file music tracks** use object URLs and don't survive a full relaunch (the files live on your disk, not in app storage); YouTube tracks persist and need a connection (clear offline state shown).
- **Whisper dictation** is English-tuned; accuracy on noisy audio is best-effort.
- **Web Speech**: the app never uses a cloud speech API — all transcription is local.

## Testing

- `npm test` — Vitest + jsdom unit tests: theming (harmony, WCAG contrast, auto-correction), block engine (convert/drag-to-replace content preservation, drop-intent geometry, drag-to-layout), recurrence/streak math, focus analytics, filter engine + raw query parser.
- E2E for the editor's drag-to-replace and undo/redo is specified via Playwright (drag simulation, not manual spot-checks) — see `tests/e2e/` when adding a browser to the environment.
