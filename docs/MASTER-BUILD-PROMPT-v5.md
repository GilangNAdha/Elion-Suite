# MASTER BUILD PROMPT v5 — Elion
### Personal Productivity Desktop App (Web + Windows) — Production Specification (self-contained)

> **How to use this document.** This file is the single source of truth. It is fully
> self-contained: a builder must not need any other document. Every requirement below is
> prescriptive (exact routes, exact component names, exact interaction behavior, exact
> acceptance test). Where a section says "unchanged from v4", the v4 text is reproduced
> inline — nothing is referenced away. **§18 (DO-NOT-CHANGE INVARIANTS) outranks every
> other section.** If any instruction conflicts with §18, §18 wins. Do not invent
> features, routes, stores, or dependencies that are not listed here.

---

## 0. What Changed in v5

1. **AFFiNE workspace merge (§15).** After reviewing `toeverything/AFFiNE`, we adopt
   *mechanics only* (per §12): the block hover toolbar with `⋯` block menu, the `/`
   slash-insert menu, the floating transform/format bar, and in Edgeless mode:
   **edges** (curved connectors between blocks, stored *in the block tree*), **frames**
   (titled containers), a **minimap**, and **zoom presets** (fit / selection / 100%).
2. **UI pattern layer (§16).** Five concrete pattern upgrades distilled from the
   user-provided reference screenshots (a schedule-dashboard concept, a clinical
   timeline, a patient-overview with connector curves, an integration canvas, a
   node-based generator UI, and a turntable music player). Each is specified as a
   mechanic with token-based visuals — **the reference apps' branding, colors,
   layouts, and names are NOT to be copied** (§18).
3. **Pixel Duel pet — Griffith vs. Guts (§17).** A new *optional* pet mode: two
   original 2D pixel characters (a White Knight and a Black Knight wielding a giant
   sword) in an animated duel scene with mystical beats (dragon flyby, slash VFX).
   **Off by default**, toggled in Settings, and insertable anywhere via a new `duel`
   block type.
4. **Implementation status map (§19).** This build already exists in the repository.
   §19 maps every file to its responsibility. Builders must *extend* the existing code,
   never rewrite or rename what is listed there.
5. **Anti-hallucination hardening (§18).** An explicit, prioritized list of things a
   builder must never change, plus acceptance tests for every new mechanic.

The v4 changes (flagship full-screen Workspace editor, the Merge Matrix, Lockdown
depth, unification-not-redundancy) all remain in force and are reproduced below.

---

## 1. Research Notes — condensed

- **Jira/Atlassian:** state legibility at density — Epic→Story→Sub-task hierarchy,
  Scrum board (active-sprint-only) and Kanban board (continuous flow + WIP limits) over
  one item model, rank-ordered backlog, swimlanes, per-type workflows, burndown /
  velocity / cumulative-flow reporting, status-pill ("Lozenge") as the atomic
  scannable unit, 8px spacing grid, 4-layer elevation (sunken/default/raised/overlay).
- **Notion:** every piece of content is a movable block; a database is one dataset
  renderable as six views (table, board, calendar, timeline, gallery, list) that never
  fall out of sync; slash-command insertion is why it feels fast.
- **AFFiNE (`toeverything/AFFiNE`, reviewed for v5):** one document, two views —
  Page mode (linear) and Edgeless mode (the same blocks as movable objects on an
  infinite canvas) — toggled on the same page; per-page Backlinks panel; dated
  Journal entries. **Mechanics adopted in v5 (§15):** block hover toolbar + `⋯` menu
  (convert/duplicate/delete/comment), `/` slash menu, floating transform bar on
  selection, Edgeless *edges* between blocks, *frames*, *minimap*, zoom-to-fit /
  zoom-to-selection. **Explicitly NOT adopted:** multi-user collaboration, cloud
  sync, AI copilot, block marketplace, node-based automation engine — all conflict
  with §18 (local-first, simple automations).
- **Reference screenshots (user-provided, v5):** patterns extracted in §16 —
  day-timeline rail with time chips + "now" marker; metrics with delta badges;
  filter-chip rows with counts; month ruler under a timeline; sparkline stat cards;
  connector curves between a list and a calendar; template-card side panels;
  labeled parameter rows; a vinyl-turntable player skin. None of these references'
  branding is adopted (§18).
- **Design-token takeaway (adapted, not cloned):** 8px grid, 4-layer elevation,
  status-pill component, "metric" type scale for big dashboard numbers. Colors and
  type come ONLY from the §5 generator.

---

## 2. Project Identity

- **Working name:** Aurora Suite (v4 spec name). **UI product name: Elion** (as shipped).
- **Quality bar:** ships like a paid product — no unstyled defaults, no default AI
  gradients, no emoji-as-icons (Lucide only), no dead-end buttons, no console errors,
  60fps interactions, full keyboard accessibility, WCAG AA minimum.
- **Priority order:** Workspace editor and Lockdown Mode are the two flagship modules
  and receive the most engineering and QA attention. Every other page must feel
  equally polished; no novel complexity is invented for them.

---

## 3. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| UI framework | React 18 + TypeScript, strict mode | |
| Routing | React Router v6 | Two dedicated full-screen routes bypass the app shell: `/lockdown` (§8) and `/workspace/:pageId/edit` + `/notes/:pageId/edit` (§9.1). |
| State | Zustand | One store per domain per §7 — domains: `items`, `pages`, `theme`, `settings`, `lockdown`, `music`, `pet`, `notify`. |
| Local persistence | Dexie.js (IndexedDB) | 15 tables (§9.7). No backend exists. |
| Block editor | Custom block engine over our own block model | Content editing (caret, text) + shell mechanics (drag, history, panels) are all in-repo (`src/lib/blockEngine.ts`, `src/components/editor/*`). BlockNote/Slate are NOT used; do not introduce them. |
| Canvas / whiteboard | Custom canvas (transform-based pan/zoom + SVG overlays) in `EdgelessCanvas.tsx` | Powers Edgeless mode; tldraw/Konva/React-Flow are NOT used; do not introduce them. |
| Panel docking | Custom resizable panels (`LeftPanel`, `RightPanel`, drag-handle resize) | react-mosaic/dockview are NOT used; do not introduce them. |
| Drag & drop | `@dnd-kit/core` + `@dnd-kit/sortable` | Powers block drag-to-insert / replace / layout (§9.1), board card DnD, and Lockdown widget repositioning. One DnD system app-wide. |
| Undo/redo | Custom command-pattern log in `useEditorSession` (cap 120, plain-language labels) | Backs the visible history panel (§9.1). zundo is NOT used. |
| Audio mixing | Howler.js | Lockdown soundscape mixer (§8.2). |
| Speech-to-text | `@xenova/transformers` (WASM, Whisper) | Offline dictation (§10). |
| 3D | React Three Fiber + drei | Lockdown 3D wallpaper tier only (§8.3). |
| Charts | Recharts | |
| Icons | Lucide React | |
| Styling | Tailwind CSS on design tokens (§4) | Token classes only (`bg-surface`, `text-ink`, …); no raw hex in components (§18). |
| Desktop shell | Electron + electron-builder | `electron/main.cjs`, `electron/preload.cjs`. |
| Web build | Vite + vite-plugin-pwa | PWA for web; SW registered in PROD only. |
| Testing | Vitest + jsdom | Theme, block engine, time/recurrence, filter engine suites. Playwright e2e is a *future* gate (§11) — no browser in the build sandbox. |

**Dependency rule:** do not add any npm package not already in `package.json` without
a note in the PR description citing which §15–§17 requirement demands it.

---

## 4. Design Token Foundation

8px spacing grid, 4-layer elevation (`sunken`/`default`/`raised`/`overlay`),
heading/body/**metric** type scale, theme-aware status-pill. Full values live in
`src/tokens/tokens.ts`; the immersive editor's panels use `elevation.overlay`, its
canvas floor `elevation.sunken`. Do not add raw spacing/size values outside the grid.

---

## 5. Theming Engine (sole color source)

Seed color → HSL harmony (complementary / analogous / triadic / split-complementary /
monochromatic) → full semantic token set → live WCAG contrast check with auto-correction
(`autoFixContrast`, target ≥ 4.5 body / ≥ 3 large). 6 harmonized chart colors derived
from the seed hue. Live-preview editor, per-token override, font/radius/glass/density
controls, named presets, JSON export/import. Applies globally; **only Lockdown may
override per preset**. Every component reads color exclusively via
`var(--token)` / Tailwind token classes. **No hex, no named CSS colors, no default AI
gradients anywhere in components** (§18).

---

## 6. Global Navigation & Shell

Collapsible sidebar (one route per module), centered bottom dock (verified centered at
375/768/1024/1440px via `translateX(-50%)`; hidden in Lockdown and the immersive
editor; restored on exit), top bar with global search, Notification Center bell, theme
switcher, profile avatar. Global `Ctrl/Cmd+K` opens the app-level Command Palette
(skipped on `/edit` routes — the editor owns its own palette).

---

## 7. Unified Data Architecture — The Merge Matrix

**Rule: the same record must never be represented by two different stores.** Before
building any page, confirm it reads/writes the shared store.

| Overlapping surfaces | Merge decision |
|---|---|
| **Notes page** ↔ **Workspace documents** | Same block renderer, same immersive full-screen editor (§9.1), same `pages` store. Notes is the pinned "Personal" branch of the Workspace page tree. `PageView` takes a `routePrefix` prop so both routes render identically. |
| **Tasks page** ↔ **Workspace items** | Tasks page = Board/List views over `WorkspaceItem` records with `databaseId: null`. One `items` store, one schema, two entry points. |
| **Habit Tracker** ↔ **Workspace items** | Habits = items with `type: "habit"` + `recurrence` rule, rendered through a calendar/streak view. Same model, same streak math (`streakFor` in `src/lib/time.ts`). |
| **Calendar page** ↔ **Workspace Calendar/Timeline views** ↔ **Alarms** | One calendar rendering engine, four sources: item due dates, habit recurrences, alarm times, manual events. |
| **Alarms** ↔ **Notification Center** | Every alarm creates a notification-center entry; overdue items surface there too. One reminder pipeline (`alarmEngine`). |
| **Lockdown Notes widget** ↔ **Notes page** | Same block renderer in a compact frame, same `pages` record — live-identical content. |
| **Lockdown Music widget** ↔ **Music page** | One playback state: a single `<audio>` element in `MusicPlayerCore` at the app root; both surfaces are pure UI over `musicStore`. |
| **Lockdown Pet widget** ↔ **Dashboard pet** ↔ **Pet page** ↔ **`duel` block** | One `petStore` (mood) + one component family (`Pet.tsx` / `DuelPet.tsx`); mood and style are identical wherever the pet renders (§17). |
| **Lockdown session history** ↔ **Profile stats** | Focus sessions write to the same data Profile reads. |
| **Global search** ↔ everything | One index over `items` + `pages`. |

**Acceptance test (QA gate §11.6):** edit a note from the Lockdown widget, reopen it
from the Notes page — identical content, no manual sync. Same check: a task created on
the Tasks page appears in the matching Workspace board; a habit's streak matches
between the Habit page and the underlying item.

---

## 8. Lockdown Mode (flagship #1)

Full-screen route `/lockdown`; all app chrome hidden; single Exit control; Fullscreen
API (web) or `BrowserWindow.setFullScreen` (Electron); Escape or exit restores the
shell exactly.

### 8.1 Presets
```ts
interface LockdownPreset {
  id: string; name: string;
  wallpaper: WallpaperConfig;        // §8.3 static / video / 3D
  ambientEmbedUrl?: string;
  soundscape?: SoundscapeMix;        // §8.2
  pomodoro?: PomodoroConfig;         // §8.2
  widgets: WidgetInstance[];         // §8.4
  themeOverride?: AuroraTheme;
}
```

### 8.2 Focus mechanics
- **Soundscape mixer:** procedural ambient layers (rain, fire, white noise, café,
  wind) rendered once offline into loops, mixed independently via Howler (per-layer
  volume sliders + master + mute); the saved mix is part of the preset.
- **Pomodoro cycles:** configurable work/break durations, automatic transitions,
  distinct audio/visual cue per transition, cycle counter toward a session goal.
- **Session analytics:** every session (start, end, objective, preset, interruption
  count from window blur) logged locally → Focus History (totals, current/longest
  streak, top preset), mirrored into Profile per §7.
- **Distraction guard (soft nudge ONLY, optional):** in Electron, if the user
  alt-tabs away beyond a configurable threshold, main brings the window forward and
  sends a "still locked down?" nudge. **Soft nudge, not enforcement** — cannot and
  must not claim OS-level blocking. Documented in README Known Limitations.
- **Multi-monitor:** if `screen` reports >1 display, the user picks which display
  Lockdown goes fullscreen on (IPC: `display:list`, `lockdown:fullscreen-on`).

### 8.3 Wallpaper — three tiers
1. **Static image** — drop or built-in; IndexedDB blob per preset.
2. **Looping video** — muted by default.
3. **3D (R3F)** — parallax layers / theme-tinted particles / gradient mesh /
   auto-orbit `.glb`; reads `primary`/`accent` from the active theme; **must** ship a
   static fallback under `prefers-reduced-motion`, the in-app toggle, or low-power
   detection.

### 8.4 Widgets
Music, Notes, Pet, Timer/Pomodoro, Weather, Clock — each toggleable, draggable
(`@dnd-kit`), resizable, position/size saved per preset.

### 8.5 Persistence (QA gate §11.3)
Wallpaper (all tiers), soundscape mix, Pomodoro config, widget layout, session
history, theme override survive a full relaunch.

---

## 9. Workspace (flagship #2)

Route `/workspace`; its own page tree; separate from every other page.

### 9.1 The Immersive Full-Screen Editor
Opening a Workspace/Notes page for editing enters `/workspace/:pageId/edit`
(or `/notes/:pageId/edit` for the Notes branch). All app chrome hidden. This is
distraction-free *authoring*; Lockdown is distraction-free *execution*.

**Layout (editing-software chrome):**
- **Auto-hiding top toolbar** — mouse-to-top edge or shortcut reveals it: back, page
  title (editable), mode toggle, Page/Edgeless tabs, undo/redo, History, Snapshots,
  palette, left/right panel toggles, Done.
- **Left panel** (resizable, persisted open/tab/width): Outline tab (page tree,
  navigate nested pages without leaving full-screen) + Library tab (categorized,
  draggable block chips: Text, Media, Layout, Database, Advanced — Advanced includes
  the `duel` block per §17).
- **Right panel** (resizable, persisted): contextual Inspector — block properties
  when a block is selected; database/view settings when a database block is focused.
  Media/duel blocks use labeled **parameter rows** (§16.5).
- **Canvas** — `elevation.sunken` floor; blocks on raised surfaces.

**Drag mechanics (`@dnd-kit`), with measured drop intents (`computeDropIntent`):**
- **Drag-to-insert:** block chip → empty space inserts at the drop position.
- **Drag-to-replace-in-place:** block chip dropped on the *center* (25–75% band) of an
  existing block **converts it in place, preserving compatible content** (paragraph↔
  heading keeps text; image→gallery keeps the image as first gallery item;
  gallery→image keeps the first item). This is the core "real editing software"
  behavior.
- **Drag-to-layout:** dropped on the left/right edge band of a block (including an
  80px band *outside* the block, mid-height) → `composeColumns` creates a `columns`
  block containing both, side by side.
- **Insert bands:** top/bottom bands (30% or 12px min) → insert before/after.
- **Multi-select:** marquee drag on empty canvas, or shift-click; bulk move (Alt+↑/↓
  moves the selection within its sibling list), delete (Delete/Backspace), convert.
- **Keyboard equivalents (hard requirement):** Alt+↑/↓ move, Delete, Escape
  (clear selection / close overlay), Ctrl+Z / Ctrl+Shift+Z, Ctrl+K palette, Enter on
  a selected block opens it for editing, and the block `⋯` menu (§15.1) is a focusable
  button with a menu — every drag behavior has a menu path.

**History, not just Ctrl+Z:**
- **Visible history panel** — plain-language labels ("Converted paragraph to
  heading", "Moved 3 blocks", "Deleted image block"), jump-to-point by clicking any
  entry, cap 120 per page.
- **Local version snapshots ("Time Machine", local-only)** — manual or interval
  snapshots of the full block tree on a timeline, restorable. No cloud.

**Command palette (Ctrl/Cmd+K):** insert any block type, jump to any page, run a saved
filter, apply a template, snapshot now.

**Zoom & pan (Edgeless only):** persistent zoom % readout, zoom-to-fit,
zoom-to-selection, 100% reset (§15.7), Ctrl+scroll zoom, drag-pan.

### 9.2 Page ↔ Edgeless toggle
One document, two views, same blocks: Page (linear) and Edgeless (infinite canvas,
blocks free-positioned with `pos`, bottom toolbar tools: select, frame, connect
(edge, §15.4), arrow, pen, text, eraser). Reading order shared across both.

### 9.3 Item model, six views, query depth
```ts
type ItemType = "epic" | "story" | "task" | "subtask" | "habit";
interface WorkspaceItem {
  id: string; type: ItemType; title: string; description: string;
  status: string; priority: "lowest"|"low"|"medium"|"high"|"highest";
  assignee?: string; labels: string[];
  parentId?: string; sprintId?: string; storyPoints?: number; dueDate?: string;
  startDate?: string; recurrence?: RecurrenceRule;
  customFields: Record<string, CustomFieldValue>;
  rank: number;
}
```
- **Six views over one dataset:** Table, Board, Calendar, Timeline, Gallery, List —
  one dataset-level filter/sort respected by all.
- **Custom properties:** select, multi-select, number, date, checkbox, person, URL,
  **relation** (→ records in another database), **rollup** (aggregate a related field:
  sum/count/avg/min/max).
- **Templates:** any page or database config (views + fields included) savable as a
  named template; applied to a new page in one action. Rendered as template cards in
  the Library panel (§16.4).
- **Saved filters:** property + operator + value builder with AND/OR grouping,
  savable/nameable; optional raw-expression power-user mode
  (`parseRawQuery`: `field op value (AND|OR) …`, ops: `contains starts has = != > < >= <=`).

### 9.4 Project tracking
Scrum board (active sprint) + Kanban (WIP limits) over one model; rank-ordered backlog
(drag-to-reorder, drag-into-sprint); swimlanes (assignee/epic/filter); per-type
workflows with **simple transition-triggered automations** (kind + value:
set-priority / add-label / set-due-days / notify — NOT a scripting engine);
burndown, velocity, cumulative flow from real status-history rows.

### 9.5 Cross-linking, backlinks, comments
`[[page name]]` links; per-page Backlinks panel; per-block comments with @mentions →
Notification Center per §7.

### 9.6 Local-first + Notification Center
All Workspace data in local Dexie. Cloud sync is out of scope — README states it.
Top-bar bell: due-date reminders, @mentions, habit/task reminders — one pipeline.

### 9.7 Persistence (Dexie, 15 tables)
pages, blocks, comments, snapshots, savedFilters, templates, databases, items,
sprints, statusHistory, habits-completions, events, alarms, lockdownPresets, blobs
(+ sessions/notifications per current schema in `src/lib/db.ts` — extend, don't
reorder).

---

## 10. Speech-to-Text (offline, adapted from Handy)

Whisper via `@xenova/transformers` WASM in the renderer (default `Xenova/whisper-tiny`;
optional `base` in Settings). `getUserMedia` 16 kHz recording with energy-based silence
trim as VAD. Mic entry points: immersive editor (inserts transcript into the focused
block), Lockdown notes widget, item-create dialogs. Model downloads once, then
offline-cached. Documented parity vs. Handy (whisper.cpp sidecar → WASM; Silero VAD →
energy trim; global paste → focused-block insert) in README.

---

## 11. QA Gates — Definition of Done

1. **Bottom dock centering** — verified at 375/768/1024/1440px.
2. **Full click-through** — every route, every control, zero console errors, zero
   dead-ends.
3. **Lockdown persistence** — wallpaper (all tiers), soundscape mix, Pomodoro config,
   widget layout, session history survive relaunch.
4. **3D wallpaper fallback** — static fallback under reduced motion, verified.
5. **Theme propagation** — a theme change updates every page, both modes, and editor
   chrome within one render cycle; `deriveTheme` pairs all pass WCAG (tested).
6. **Merge Matrix integrity** — the three live-sync checks in §7.
7. **Editor drag mechanics** — insert / replace-in-place (content preserved) /
   layout produce correct block trees (covered by `tests/blockEngine.test.ts` today;
   Playwright drag simulation when a browser is available).
8. **Undo/redo & snapshots** — every history label reversible; a restored snapshot
   matches its block tree.
9. **Keyboard navigation** — every interactive element, including every drag
   behavior, has a keyboard path with visible focus rings.
10. **Responsive** — all four breakpoints.
11. **Offline** — all local-first features work with no network; only
    YouTube-embedded and model-download features degrade with a clear state.
12. **AFFiNE-merge gates (new, v5)** —
    a. `⋯` menu: Convert-to preserves content where compatible; Duplicate places a
       copy directly below with children; Delete + Comment work; all reachable by
       keyboard.
    b. Slash menu: `/head` + Enter on a paragraph converts it to `heading1` with
       text intact; Escape cancels; works in every text-type block.
    c. Transform bar: selecting a paragraph shows the bar above it; changing type or
       alignment persists to `block.props` and survives undo of *other* actions.
    d. Edges: connect A→B creates an `edge` block; it appears in history as
       "Connected A and B"; deleting it removes only the edge; edges render in
       Edgeless only.
    e. Frames: a frame's children render inside it in Edgeless; in Page mode the
       frame renders as a titled section containing its children in order.
    f. Minimap: clicking the minimap moves the viewport; the viewport rect tracks
       pan/zoom live.
    g. Zoom presets: Fit and Selection produce the expected zoom %; 100% reset works.
13. **UI-pattern gates (new, v5)** —
    a. Today Timeline Rail renders today's due dates, alarms, and events at the
       correct hour positions; the "now" marker advances; clicking a chip opens the
       record.
    b. Timeline view: the month/week ruler aligns with item bars; the filter-chip row
       counts are correct and clicking filters the dataset once (all views respect it).
    c. Turntable skin: the record rotates iff `playing`; pause freezes it; seek and
       queue advance behave identically to the other skins (single `musicStore`).
    d. Pet Duel: default is Classic; toggling to Duel in Settings updates Dashboard,
       Lockdown widget, Pet page, and any `duel` block in the same session;
       reduced-motion renders the static frame; no console errors while looping.
14. **Typecheck + unit tests + production build stay green** after every change.

---

## 12. Design Constraints — "Not AI Slop"

No unstyled defaults, no default AI gradients, no emoji-as-icons, deliberate
hover/focus/active states, glassmorphic-dark baseline extended (never replaced) by
the theming engine. Jira/Notion/AFFiNE and all v5 reference screenshots inform
*mechanics and behavior only* — colors, type, and iconography always come from §5.

---

## 13. Delivery Milestones

1. **Foundation:** tokens (§4) + theming engine (§5) + shell (§6).
2. **Unified data layer first:** `items` + `pages` stores before any consumer page.
3. **Workspace, in depth:** item model + six views → Page/Edgeless → immersive
   editor (§9.1) → **AFFiNE-merge mechanics (§15)** → boards/sprints/reporting →
   backlinks/comments → templates/saved filters/custom fields.
4. **Lockdown, in depth:** three-tier wallpaper → widgets → mixer + Pomodoro →
   analytics → guard + multi-monitor.
5. **Thin merged pages:** Tasks, Habits, Calendar, Notes, Alarms.
6. **Music (incl. turntable skin §16.3), Pet (incl. Duel §17), 3D/motion polish,
   Profile/Settings.**
7. **QA pass (§11) + Windows packaging + PWA + README.**

**Status: milestones 1–6 are implemented at the level described in §19, and the
v5 layers (§15/§16/§17) are implemented as of v0.5 — see the worklist at the
bottom of §19 for the exact file-level status.**

---

## 14. Deliverables

Full source repository; Windows installer (NSIS) + portable `.exe` via
electron-builder; browser/PWA build; README covering dev setup, the theming pipeline,
re-running the `ui-ux-pro-max` skill, the Handy→Elion STT notes, and **Known
Limitations** — at minimum: unsigned Windows build (SmartScreen); no cloud sync
anywhere (local version snapshots only); Lockdown guard is a soft nudge, not
OS-level enforcement; imported `.glb` wallpapers have no in-app scene editor;
Workspace automations are simple transition-triggered rules; file-based music tracks
don't survive a relaunch (paths, not blobs); Whisper is English-tuned; the Pixel Duel
pet is an original-art, opt-in cosmetic with no external assets.

---

## 15. AFFiNE Merge — Precise Specs (v5)

All of this lives inside the existing editor files (`src/components/editor/*`,
`src/lib/blockEngine.ts`). Extend; do not replace.

### 15.1 Block hover toolbar + `⋯` block menu (Page mode)
On hover (and when focused/selected), each block shows a left rail with two buttons:
`⠿` grip (existing drag affordance) and `⋯` (Ellipsis icon). `⋯` opens a Menu:
- **Convert to →** submenu listing every BlockType with its icon; selecting one
  calls the same `convert()` path as drag-to-replace (content preserved per the
  same rules, history label "Converted X to Y").
- **Duplicate** — inserts a copy directly below (children of the copy get new ids;
  `gallery.items` and `columns.cols` arrays are deep-copied with remapped ids),
  label "Duplicated block".
- **Delete** — same as Delete key, label "Deleted block".
- **Comment** — opens the CommentsDrawer anchored to this block.
The `⋯` button is a real focusable `<button>` (keyboard gate §11.9).

### 15.2 Slash menu (`/`)
In any editable text block (paragraph, headings, bullet, numbered, todo, quote,
callout, code): typing `/` opens an anchored menu listing block types (icon + label),
filterable by the text typed after `/` (e.g. `/hea`). Enter/click applies:
- if the current block is a text type → **convert in place** (keep the text after
  the `/query` prefix);
- otherwise → insert a new block of that type after the current one.
Escape closes without change. The menu is part of the block's editing state, not a
global overlay. No network.

### 15.3 Transform bar (floating format bar)
- **Selection mode:** when exactly one text-type block is selected (not being
  edited), a compact bar floats above the block: [block-type select] [align
  left/center/right icons] [clear → paragraph]. Alignment persists to
  `block.props.align` and applies to the block's text in both modes.
- **Caret mode:** while editing a text block with a non-collapsed selection, the
  same bar anchors to the selection rect (via `window.getSelection().getRangeAt(0)`).
- All actions route through `session.commit(label, fn)` so history is consistent.

### 15.4 Edges (Edgeless only)
- New BlockType **`edge`**: `props: { from: string; to: string; label?: string }`.
  Edges live in the block tree (parentId null) so undo/history/snapshots cover them.
- **Connect tool** on the bottom Edgeless toolbar (GitBranch icon): click a source
  block (it highlights), then click a target block → commits edge
  ("Connected A and B"). Clicking an existing edge path selects it (Delete removes
  it). Double-click an edge to edit its label.
- Rendering: SVG cubic bezier from source's bottom-center to target's top-center
  (fallback: nearest-side anchors when blocks overlap), `var(--primary)` stroke,
  arrowhead at the target, optional label at the curve midpoint.
- **Page mode never renders edges** (they are canvas-only). Deleting an endpoint
  block also deletes its edges (same commit).

### 15.5 Frames
- New BlockType **`frame`**: `props: { title?: string }`; in Edgeless it has `pos`
  (free placement) and renders a titled, rounded, 1px-bordered container
  (title chip top-left, editable on double-click).
- Children = blocks whose `parentId` is the frame id (drag-over a frame to
  re-parent; outline panel shows them nested under the frame).
- **Page mode:** the frame renders as a titled section block; its children render
  inside it in `order`.

### 15.6 Minimap (Edgeless only)
160×100 panel, bottom-right of the canvas: all blocks drawn as scaled rects/dots
(content bounds → panel bounds), current viewport as an outlined rect. Click or
drag inside the minimap to reposition the viewport. Updates live during pan/zoom
(throttle to animation frames).

### 15.7 Zoom presets (Edgeless only)
Toolbar cluster: `−` / `+` / readout % / **Fit** / **Selection** / `100%`.
Ctrl+scroll zooms around the cursor; `Fit` = fit content bounds with padding;
`Selection` = fit the current selection.

### 15.8 Block styling (menu additions)
`⋯` menu → **Background:** none / surface / raised / primary-soft / ok-soft /
warn-soft / bad-soft (theme tokens only); **Border:** on/off (1px line). Stored in
`block.props` (`bg`, `border`), applied in both modes.

---

## 16. UI Pattern Layer (v5) — from the reference screenshots

**Rule of the section:** each pattern is specified as *mechanics + token visuals*.
The reference apps' names, brand colors, icon sets, and layouts must NOT appear in
Elion. If a pattern below is ambiguous, the mechanic wins and visuals come from §5.

### 16.1 Today Timeline Rail (Dashboard, top strip)
Horizontal day rail: hour ticks from 07:00–22:00 (configurable in Settings later),
proportional placement. Chips for (a) today's due dates (task color = its status
color), (b) today's alarms (warn token), (c) today's manual events (info token).
A "now" marker line (bad token) with the current time, updated every 60 s. Clicking a
chip opens the underlying record (item modal / alarm / note). Overlapping chips
stack (max 3 visible, "+n" more opens a popover list). This rail REPLACES nothing —
it sits above the existing dashboard metric cards.

### 16.2 Timeline view upgrades (items)
- **Ruler:** top axis showing month bands (week bands when span < 60 days) with the
  today marker; item bars align to it (bars already exist; add the ruler + hover
  tooltip with exact dates).
- **Filter-chip row:** above the view, chips `All (n) / <each status> (n)`; clicking
  sets the dataset-level status filter (respected by all six views per §9.3).

### 16.3 Turntable music skin (Music page)
A third player skin alongside the existing ones, driven by the same `musicStore`
(single `<audio>` in `MusicPlayerCore` — the skin is pure UI): a vinyl record (CSS
radial gradient, `image-rendering: auto`) whose label is the track cover art (or a
theme-derived procedural label), rotating at constant speed iff `playing`
(`animation-play-state`), a tonearm that rotates onto the record when playing, on a
brushed-plate panel. Volume/seek/queue controls remain the shared transport. No
audio changes.

### 16.4 Template cards (Library panel)
The Library tab gains a **Templates** category (below block chips): one card per
saved template — icon (page or database), name, "Apply" button → creates a new page
from the page template (or a database block configured from the DB template). Cards
use `elevation.raised`, 2-column grid. This is the "add-new-from-cards" pattern.

### 16.5 Parameter rows (Inspector)
Media blocks (image, gallery, duel) show their props in the Inspector as labeled
rows: `[label | control]` (e.g. `Source [text input]`, `Caption [text input]`,
`Volume [slider]`). One `ParamRow` component reused everywhere — the
"labeled parameter row" pattern from the generator-UI reference.

---

## 17. Pixel Duel Pet — Griffith (White Knight) vs. Guts (Black Knight) (v5)

A new **opt-in cosmetic pet mode**. User intent: two 2D pixel characters — a White
Knight (Griffith) and a Black Knight (Guts, giant sword) — in an epic duel scene with
mystical beats (dragon, slash VFX). Art is **original pixel art produced for Elion**
in the style of the user-provided references; no third-party assets are bundled.

### 17.1 Assets (local, `public/pixel/`)
- `duel-bg.png` — pixel dusk battlefield (moon, mountains, ground), ~640×360.
- `griffith.png` — chibi white knight (silver/white armor, white cape, golden
  banner motif), transparent background, ~128×160, facing left.
- `guts.png` — chibi black swordsman (dark armor, black cape, oversized greatsword),
  transparent background, ~128×160, facing right.
- `dragon.png` — small pixel dragon silhouette with ember breath, transparent,
  ~256×128.
All rendered with `image-rendering: pixelated`.

### 17.2 The DuelPet scene (`src/components/pet/DuelPet.tsx`)
A 16:9 "screen" card: layers = background → Guts (left) → Griffith (right) → dragon
overlay (top path) → VFX (slash arc, impact flash, ember particles, all CSS) →
optional rain/grey filter layer. Deterministic 8 s loop:
- 0.0–2.0 s: standoff (both idle-bob, breathing).
- 2.0–3.2 s: Guts lunges right; sword-slash arc sweeps.
- 3.2–4.4 s: impact flash + 1-frame screen shake + spark burst at mid-ground.
- 4.4–6.0 s: Griffith counters (cape flutter, blade shimmer).
- 6.0–8.0 s: dragon flies across the top; both return to ready.
**Mood mapping** (shared `petStore` mood, per §7): `calm` → standoff loop only (no
combat beats); `good` → full loop; `energized`/`excited` → full loop + dragon every
cycle; `sad` → full loop with desaturated filter + rain. Reduced motion (system or
in-app) → single static "mid-clash" frame, no animation, no shake.
Sound: none by default (visual-only). A future "SFX" toggle may add a synthesized
clash via WebAudio — off by default, never autoplays.

### 17.3 Toggling & placement
- `settingsStore.petStyle: 'classic' | 'duel'` (persisted; **default `'classic'`**).
- Settings page → Pet section: two option cards (Classic companion / Pixel Duel) with
  live previews; selecting updates every mount point in the same session.
- **Mount points (all show DuelPet when `petStyle === 'duel'`):** Dashboard pet,
  Lockdown pet widget, Pet page, and — new — the **`duel` block** (§17.4), so the
  scene can be placed on any page in either mode.
- The `duel` block is available in the block library (Advanced category, Swords icon)
  and in the slash menu.

### 17.4 `duel` block
BlockType **`duel`**: renders `<DuelPet compact />` (no card chrome, fills the block
width, 16:9). No props beyond standard block fields. Undo/history/snapshot cover it
like any block.

### 17.5 QA (gate §11.13.d)
Default Classic everywhere; one toggle flips all mount points; reduced-motion static
frame; 60 fps (pure CSS transforms, no per-frame JS); zero console errors while
looping.

---

## 18. DO-NOT-CHANGE INVARIANTS (highest priority)

A builder following this prompt must never:
1. Introduce cloud sync, a backend, accounts, or any network feature beyond the
   documented exceptions (YouTube iframe embeds, one-time Whisper model download,
   YouTube/Spotify-adjacent embeds) — local-first is the product.
2. Copy brand visuals (colors, logos, iconography, naming) from Jira, Notion,
   AFFiNE, QQ Music, or any reference screenshot — mechanics only (§12).
3. Re-split any Merge Matrix surface into its own store/schema (§7) — extend the
   shared stores instead; the §11.6 acceptance tests must always pass.
4. Replace the simple transition-triggered automations with a node/scripting engine
   (the reference "integration canvas" is a *pattern* for UI cards only, §16.4).
5. Claim OS-level distraction enforcement; the guard stays a soft nudge, documented.
6. Add hex colors, named CSS colors, default gradients, or emoji-as-icons in
   components — §5 tokens only; the theme test suite must stay green.
7. Rewrite or rename existing files listed in §19 without an explicit §-citing
   reason; extend them.
8. Add npm dependencies not already in `package.json` (exception rule in §3).
9. Change the pet default away from Classic, or bundle the Duel art as remote assets.
10. Remove or weaken any QA gate in §11.
11. Introduce BlockNote/Slate, tldraw/Konva/React-Flow, react-mosaic/dockview, or
    zundo — the existing custom implementations are the chosen architecture (§3).
12. Ship `dist/`, `node_modules/`, or generated pixel art outside `public/pixel/`.

---

## 19. Implementation Status Map (state of the repository, v0.4+)

Everything below **already exists and typechecks/tests/build green**. Extend it.

```
src/
  main.tsx                     entry; imports styles/globals.css; PROD-only SW register
  App.tsx                      router, init (seed → store init → ready), global Ctrl+K
  tokens/                      tokens.ts (values), theme.ts (deriveTheme/harmonize/
                               autoFixContrast), ThemeProvider.tsx
  lib/
    types.ts                   ALL domain types (Block, PageRecord, WorkspaceItem,
                               WorkspaceDatabase, ViewDef, Automation, LockdownPreset, …)
    db.ts                      Dexie, 15 tables, BlobRecord
    blockEngine.ts             block CRUD, moveBlocks, computeDropIntent (bands),
                               convertBlock, layoutColumns, makeBlock, childrenOf,
                               topLevelBlocks, BLOCK_LABEL
    filterEngine.ts            applyFilter (AND/OR tree), parseRawQuery, FIELDS
    time.ts                    todayISO, occursOn (recurrence), streakFor, focusTotals
    audio.ts                   procedural soundscapes (rain/fire/noise/cafe/wind)
    stt.ts                     Whisper WASM wrapper (Xenova)
    search.ts                  index over items + pages
    alarmEngine.ts             due/overdue/alarms → notifications pipeline
    seed.ts                    first-run seed (flag elion-seeded-v1)
  stores/                      itemsStore, pagesStore, themeStore, settingsStore,
                               lockdownStore, musicStore, petStore, notifyStore
  components/
    ui.tsx                     UI kit (Button, Input, Select, Toggle, Slider, Menu,
                               Modal, Drawer, Tabs, StatusPill, Kbd, EmptyState,
                               Toasts, IconBtn, …)
    shell/                     AppShell, TopBar, CommandPalette, NotificationCenter,
                               BottomDock, StatusPill
    editor/                    EditorPage (toolbar, DnD, marquee, shortcuts, panels),
                               useEditorSession (history cap 120, commit(label,fn)),
                               blocks.tsx (BlockView/BlockToolbar/BLOCK_ICON),
                               panels.tsx (LeftPanel/RightPanel/HistoryDrawer/
                               SnapshotsDrawer/CommentsDrawer/Drawer),
                               EdgelessCanvas (pan/zoom, pos blocks, tools)
    views/views.tsx            Table/Board/Calendar/Timeline/Gallery/List +
                               useItemModal, statusColor, useDbFields
    items/                     ItemModal, DatabaseBlock, FilterBuilder, DBSettings,
                               SprintPanel
    lockdown/                  widgets.tsx (WidgetLayer, WIDGET_DEFS), wallpaper.tsx,
                               Scene3D.tsx, Mixer.tsx, FocusHistory.tsx
    pet/Pet.tsx                classic pet (mood-driven)
    music/MusicPlayerCore.tsx  single app-root <audio> synced to musicStore
  pages/                       DashboardPage, WorkspacePage (PageView w/ routePrefix),
                               LockdownPage, TasksPage, HabitsPage, CalendarPage,
                               NotesPage, AlarmsPage, MusicPage, PetPage, ProfilePage,
                               SettingsPage
  styles/globals.css           base styles (imported by main.tsx)
electron/main.cjs + preload.cjs  window, nudge guard, fullscreen/multi-monitor IPC
tests/                         setup.ts, theme.test.ts, blockEngine.test.ts,
                               time.test.ts, filterEngine.test.ts (23 tests)
docs/                          this prompt + refs/ (user-provided reference screenshots)
```

**v5 worklist (implemented in v0.5 — do NOT re-implement; extend if a gate in
§11 fails):**
- §15.1–15.2, §15.8 → `blocks.tsx` (BlockToolbar menu incl. Duplicate +
  Background/Border; slash menu in `Editable`; `BG_CLASS` styling on the
  BlockView wrapper), `useEditorSession.ts` (`duplicate`), `ui.tsx` (MenuItem
  `active`).
- §15.3 → `EditorPage.tsx` (floating transform bar over a single selected
  text block; type select + align + clear).
- §15.4–15.7 → `EdgelessCanvas.tsx` (connect tool, edge bezier overlay with
  arrowheads + double-click labels, frame tool, drop-onto-frame re-parenting,
  minimap, zoom presets), `blockEngine.ts` (edge cascade-delete in
  `deleteBlocks`).
- §16.1 → `DashboardPage.tsx` (`TodayRail`, 07:00–22:00, live now-marker).
- §16.2 → `views.tsx` (`TimelineView` month/week ruler + status filter chips).
- §16.3 → `MusicPage.tsx` (`TurntableHeader`; `PlayerSkin` gains `'turntable'`).
- §16.4 → `panels.tsx` (Templates card category in `BlockLibrary`).
- §16.5 → `panels.tsx` (`ParamRow`; Frame/Duel inspector sections).
- §17 → `settingsStore.ts` (`petStyle`, default `'classic'`),
  `DuelPet.tsx`, `Pet.tsx` (branches to `ClassicPet`), `SettingsPage.tsx`
  (Pet companion section), `duel` block (`types.ts`, `blockEngine.ts`,
  `blocks.tsx`, `BLOCK_CATEGORIES` Advanced, slash list), `public/pixel/*`
  (4 original assets).
- Tests → `tests/blockEngine.test.ts` (v5: frame title conversion, structural
  content drop, edge cascade-delete, new makeBlock defaults). 27 tests green.
