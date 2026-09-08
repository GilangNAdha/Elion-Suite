# Elion Suite

**Local-first personal productivity suite** — Web (PWA) + Windows desktop (Electron).

One item model, one page/block model. Every surface is a *merged view* over the same stores (the “Merge Matrix”), so a note edited in a Lockdown widget is the identical, already-updated record when you open it from the Notes page — no sync step, no silos.

> Working name in the build spec: *Aurora Suite*; shipped in this repository as **Elion Suite**.

> **Build specification (current — v6):**
> [`docs/MASTER-BUILD-PROMPT-v6.md`](docs/MASTER-BUILD-PROMPT-v6.md) supersedes v5. It
> is a hardening/regression-fix release on top of the unchanged v5 spec
> (whose full reproduced detail — AFFiNE-merge, UI-pattern, and Pixel Duel pet
> sections, and the DO-NOT-CHANGE invariants — is kept at
> [`docs/MASTER-BUILD-PROMPT-v5.md`](docs/MASTER-BUILD-PROMPT-v5.md)). v6 fixes a
> boot blank-screen bug (a Router hook called above `<BrowserRouter>`), fixes
> invalid nested-button HTML on the Habits page, and adds a boot regression
> test (`tests/app-boot.test.tsx`). v6 is the single source of truth for any
> future AI-assisted build on this repository. The later visual/voice implementation
> notes below supersede its old visual defaults and document the current backend gaps.

---

## Floating pet (latest interaction update)

Nova now lives **above the app**, not in a separate Companion tab or dashboard
card. Open **Settings > Floating pet** to enable it and control animation. Click
the pet to pat, wave, nap/wake, or open floating chat; drag the pet itself to move
it. It stays active on Settings, Dashboard, Workspace and Lockdown, including
compact layouts. Existing `/pet` bookmarks redirect to the settings section.

[Controls, behavior and animation preview](docs/FLOATING-PET.md).

## Studio update: native workspace and local companion

The latest user-directed pass replaces the default knight showcase with **Nova**,
an original 56-frame animated companion and a real **MiniCPM Desk Pet local API**
connector. No restricted upstream artwork or AGPL app code is copied. Chat needs
the official MiniCPM service and model running locally; the hosted preview cannot
reach the user's PC through browser localhost.

Workspace now mounts the **actual BlockSuite editor** (`@blocksuite/presets`
0.19.5): native rich text, Doc/Canvas switching, drawing, undo/redo, local media and
version snapshots. Existing Elion boards stay connected to the same items store.
Original documents receive a migration snapshot; unsupported Elion blocks retain
their payload and an advanced-editor route.

React Bits SpotlightCard, StarBorder and Dock were adapted for selective glow and
responsive motion. The workspace uses a compact application rail, a document
library and lighter framing. All motion honors OS and app reduced-motion settings.

**Read:** [Studio integration, setup, data migration and limitations](docs/STUDIO-INTEGRATION.md).

## Elion visual system and reference implementation

The supplied **Elion premium dark glass** design is now the factory preset: exact
Void/Depth/Paper/Fog tokens, locally bundled Geist + Geist Mono, restrained
Current–Dusk accents, an asymmetric task-led dashboard, a centered Lockdown
experience, and a dense left-aligned workspace. The music reference is implemented
as a physical turntable with a real rotating platter and parking tonearm. The pet
is **frame-animated 2D pixel art**: Nova is the default; the older two-knight
duel remains optional legacy content, not static reference-image cutouts.

- [Design system, review and production screenshots](docs/ELION-FRONTEND-DESIGN.md)
- [Voice dictation implementation, QA and explicit native-platform gaps](docs/VOICE-DICTATION.md)
- [Third-party licenses and asset attribution](THIRD_PARTY_LICENSES.md)

The original module/store architecture and v6 boot regression guard remain in
place. These notes document this later visual/voice pass; the supplied native GPU
and Parakeet requirements are **not** represented as implemented.

## Modules

| Module | What it is |
|---|---|
| **Workspace** (flagship) | Block pages + Jira-style project databases. Six views over one dataset: Table, Board (kanban + WIP limits, swimlanes), Calendar, Timeline (Gantt), Gallery, List. Custom properties (select / multi-select / number / date / checkbox / person / URL / **relation** / **rollup**), templates, saved filters with a visual AND/OR query builder (+ optional raw mode), sprints, per-status automations, burndown / velocity / cumulative-flow reports, `[[page]]` links + backlinks, per-block comments with @mentions. |
| **Immersive editor** (`/workspace/:pageId/edit`) | Full-screen editing mode that bypasses the app shell: auto-hiding toolbar, dockable/floatable **left panel** (outline + draggable block library + saved-template cards) and **right inspector**, visible **history stack** (plain-language actions, jump to any point), local **Time Machine** version snapshots, **command palette** (Ctrl/Cmd+K), **Page ↔ Edgeless** toggle with pan/zoom (zoom-to-fit, zoom-to-selection), shape/pen/arrow/**frame** tools, **block-to-block edges** (connect tool, curved connectors with labels), **minimap**, marquee multi-select, `/` slash-insert menu, floating **transform bar** (type/align/clear on selection), block `⋯` menu (convert / duplicate / background / border / comments / dictate), and the three drag mechanics: **drag-to-insert**, **drag-to-replace-in-place** (content preserved across compatible type conversions), **drag-to-layout** (edge-drop composes two-column blocks). Every drag has a keyboard-operable equivalent (block menu → *Convert to…*). |
| **Lockdown Mode** (flagship, `/lockdown`) | Full-screen focus: three-tier wallpapers (static / looping video / 3D scenes via R3F with static reduced-motion fallbacks), **soundscape mixer** (rain, fire crackle, white noise, café hum, wind — generated on-device, mixed via Howler, saved per preset), **Pomodoro work/break cycles** with transition cues and cycle goals, widget dashboard (clock, timer, music, notes, pet, weather — draggable/resizable, layout saved per preset), **session analytics** (Focus history; mirrored to Profile), optional **multi-monitor fullscreen**, and a clearly-caveated **best-effort distraction guard** (soft nudge only). |
| **Tasks** | Saved Board/List views over items that live *outside any project* — the same `WorkspaceItem` records. |
| **Habits** | Recurring items (`type: 'habit'` + recurrence rules) with streaks, week strips, and 12-week heatmaps. |
| **Calendar** | One calendar engine, four data sources: item due dates, habit recurrences, alarm times, manual events. |
| **Notes** | The pinned “personal” branch of the Workspace page tree — same editor, same store, live-synced with the Lockdown notes widget. |
| **Alarms** | One reminder pipeline: alarms (and due/overdue items, @mentions) all surface in the top-bar Notification Center. |
| **Music** | Shared player core (local files + YouTube embeds, disc / **turntable** / minimal skins — the turntable's record spins iff playing and its tonearm swings on/off); the Lockdown widget mounts the same player state. |
| **Floating pet / Nova** | Settings-controlled 56-frame pixel companion above the app. Drag, pat, wave, nap/wake and floating chat, with shared focus/completion reactions and an opt-in-context MiniCPM local API connector. No automatic screen capture or fabricated disconnected replies. Legacy Pixel Duel stays available for preserved content. |
| **Dashboard** | Task-led asymmetric layout, real completion/focus actions, weekly calendar and 07:00–22:00 schedule rail, habit streaks, shared physical music player, animated companion, real weather with an offline state, and recent pages. |
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
npm run check:design   # token / signature / decorative-type guards
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

- **Foundation** — `src/tokens/foundation.css` and `tokens.ts`: named palette,
  spacing grid, 6/12/16px radius hierarchy, four elevation levels, Geist typography,
  one easing curve and 150/400ms UI motion.
- **Theme resolution** — `src/tokens/theme.ts`: exact default preset, custom seed
  harmony, separate semantic colors, CSS variables and a live WCAG report. The
  checker handles hex/HSL/RGB and composited glass surfaces, including the limiting
  imported-wallpaper background. Custom themes remain live and import/exportable.
- **Density** scales spacing, not the reading-font size. Tailwind utilities map to
  the CSS tokens; alpha utilities such as `bg-surface/60` are supported explicitly.
- **Signature** only on the active sidebar rule, focus timer ring and listening
  mic. The entry-edge bloom is transient. Buttons and card borders stay quiet.
- **Motion preferences** honor system and app settings, including video/3D
  wallpaper fallbacks and sprite/vinyl animation.
- Only Lockdown may apply a per-session preset override, restored on exit.

### Re-running the `ui-ux-pro-max` skill

If you re-run the original `ui-ux-pro-max` skill pass, preserve these invariants:

1. Output must be **design tokens + component primitives only** (never overwrite store/domain code).
2. Tokens must land in `src/tokens/` and map through `tailwind.config.ts` — never hardcode hex values in components (use `var(--…)` / Tailwind token colors).
3. Keep the 4-layer elevation model and the status-pill component; they are referenced by every module.
4. Run `npm test` + `npm run typecheck` after a pass — the contrast assertions catch regressions.

---

## Voice dictation

One `VoiceDictationService` is shared by editor toolbar/inline/block-menu controls,
Lockdown notes, task/habit title dialogs and global search. It captures locally,
resamples to 16 kHz, runs **Silero VAD** and **Whisper WASM in one worker**, then
inserts at the captured selection. Editor insertions enter the actual undo/history
stack; the clipboard is not used. Permission errors and first-download failures
have actionable messages. Cancel/navigation/target removal cannot insert late text.

Settings provides Tiny/Base/Small, language, toggle/hold mode, shortcut selection,
a custom spelling dictionary and **Prepare offline model**. The app bundles the
small Silero model and WASM runtime; Whisper weights download on demand and are
cached. Audio and transcripts are never uploaded. The dictionary corrects matched
phrases after inference; it does not train the acoustic model.

**Honest platform boundary:** this build ships the CPU WASM backend, not a native
Whisper addon or GPU/Parakeet engine. The optional Electron shortcut is app-focused
and toggle-only. Native Windows and full Whisper accuracy QA remain outstanding.
See [the detailed implementation and QA record](docs/VOICE-DICTATION.md).

[Handy](https://github.com/cjpais/Handy) is credited as an architectural reference,
not embedded or rebranded. Licenses and asset provenance are listed in
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

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
- **Dictation** supports the selected Whisper language, but full known-text accuracy testing with downloaded weights, native GPU/Parakeet backends, and Windows hardware validation are still outstanding.
- **Web Speech**: the app never uses a cloud speech API — all transcription is local.

## Testing

- `npm test` — Vitest + jsdom unit tests: theming (harmony, WCAG contrast, auto-correction), block engine (convert/drag-to-replace content preservation, drop-intent geometry, drag-to-layout), recurrence/streak math, focus analytics, filter engine + raw query parser.
- **App-boot regression** (`tests/app-boot.test.tsx`) mounts the real `<App>` and asserts it renders with zero console errors — this is the v6 guard that a Router hook is never called outside a `<Router>`, so the app can never blank-screen on boot again.
- `npm run test:e2e` — the original nine Playwright checks plus native-workspace/companion integration tests: exact theme/dashboard hierarchy,
  responsive dock centering, real task/habit persistence, changing sprite frames
  and reduced motion, kanban dragging and reload, pause/resume/session save,
  microphone errors, real editor dictation-selection/undo integration with a
  stubbed neural result, and local audio/turntable behavior.
- Browser smoke checks also covered every primary route in the production build.
  Production PWA reload and bundled assets were verified offline; the actual
  production Silero worker processed a known speech recording while offline.

```bash
npx playwright install chromium
npm run dev             # in one terminal
npm run test:e2e         # in another
# Or build, start `npm run preview`, then:
ELION_BASE_URL=http://localhost:4173 npm run test:e2e
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can select an existing Chromium binary in a
restricted environment. Screenshot/trace scratch output is ignored by Git; reviewed
production screenshots live in `docs/screenshots/`. The current pass completed
**89 unit/regression tests and 26 browser checks**. Recognition accuracy is
not implied by the neural-result-stub integration test.
