# MASTER BUILD PROMPT v6 — Elion
### Personal Productivity Desktop App (Web + Windows) — Production Specification

> **How to use this document.** v6 **supersedes v5** (`docs/MASTER-BUILD-PROMPT-v5.md`) and
> v4. Every feature, route, store, component, interaction, and acceptance test from v5
> remains in force **and is incorporated by reference**: the full reproduced v5 text is
> kept git-tracked at `docs/MASTER-BUILD-PROMPT-v5.md` in this same repository, so this
> v6 file does **not** re-type unchanged prose (re-typing would risk drift). **v6 changes
> only the items listed in §0 and §11 below — nothing else.** If a later AI pass is unsure
> whether something is a v5 feature or a new invention, treat it as a v5 feature and do not
> touch it unless this file says so.
>
> **§20 (DO-NOT-CHANGE INVARIANTS, in v5) outranks every other section.** Nothing in v6
> relaxes it. Do not invent features, routes, stores, or dependencies not listed here or in
> the incorporated v5 spec.

---

## 0. What Changed in v6 (the COMPLETE list — do not change anything else)

v6 is a **hardening + regression-fix release**. The flagship modules, the Pixel Duel pet
(Griffith vs. Guts), the AFFiNE/UI-pattern merges, and the Merge Matrix are **unchanged
behaviors**. Two real bugs found during QA were fixed, one regression test was added, and
the build spec + app version were advanced to v6. Specifically:

1. **Fixed: the app could boot to a permanently blank screen.** `src/App.tsx` called
   `usePaletteActions(null)` at the top of `<App>`. That hook calls `useNavigate()`, which
   **requires a `<Router>` ancestor**. `<App>` renders `<BrowserRouter>` as a *descendant*,
   so no Router context ever existed above the hook → the very first render threw an
   uncaught error → React 18 unmounted the whole root → a blank page from the moment of
   load (not even the splash screen showed). **Fix:** the palette actions are computed in a
   new `GlobalPalette` component that is mounted *inside* `<BrowserRouter>`, and `<App>`
   no longer calls the hook. The splash screen (`!ready`) is unaffected.
2. **Fixed: invalid HTML nesting on the Habits page.** Each habit card was a `<button>`
   that *contained* `<IconBtn>` buttons and a `role="button"` span. `<button>` cannot nest
   interactive elements — invalid HTML, React `validateDOMNesting` console warnings, and
   unreliable click handling. **Fix:** the card is now a `<div>`; only true controls are
   buttons (title-select `aria-pressed`, done-toggle `aria-pressed`, Edit, Delete). Card
   body click still selects the card for its 12-week heatmap.
3. **Added a boot regression test** `tests/app-boot.test.tsx` that mounts the real `<App>`,
   waits past the async store/seed init, and asserts real content renders with **zero**
   console errors. This is the guard that would have caught the v6 bug #1 above; it must
   keep passing on every build.
4. **Version advanced to `0.6.0`** (`package.json`), reflecting the v6 hardening release.

---

## 1–19. (unchanged) — incorporated by reference from v5

All of v5's §1–§19 remain in force. Highlights that are **explicitly unchanged and must not
be regressed**:

- **§7 Merge Matrix** — one `items` store, one `pages` store, one reminder pipeline, one
  player core, one pet state, one calendar engine. Editing a note in the Lockdown widget
  must still equal opening it on the Notes page with no sync step.
- **§8 Lockdown** and **§9 Workspace/immersive editor** are the two flagship modules and
  still receive the most QA attention. The immersive editor's drag-to-insert /
  drag-to-replace-in-place / drag-to-layout, visible history, Time Machine snapshots, and
  command palette are unchanged.
- **§17 Pixel Duel pet** — Griffith (White Knight) vs. Guts (Black Knight), optional,
  off by default, toggled in Settings, and insertable anywhere via the `duel` block.
  Unchanged.
- **§18 DO-NOT-CHANGE invariants** — highest priority, unchanged and unrelaxed.

---

## 11. QA Gates — v6 additions to the Definition of Done

The v5 §11 gates still apply. v6 adds these (they are permanent, not one-time):

- **Gate §11.v6.1 — Boot must never blank-screen.** Every build runs
  `npm test`, which now includes `tests/app-boot.test.tsx`: mount the real `<App>`, pass
  the async init, and require rendered content + zero console errors. **Any future code
  that calls a React Router hook (`useNavigate`, `useParams`, `useLocation`,
  `usePaletteActions`) anywhere *outside* a component mounted under `<BrowserRouter>` will
  fail this gate.** Rules to keep it green:
  - Router hooks may only be called from components rendered as (or under) a `<Route>`'s
    element, `<AppShell>`, `MusicPlayerCore`, or `GlobalPalette` — i.e. code that is a
    descendant of `<BrowserRouter>`.
  - `usePaletteActions` is the one hook that needs Router context; compute it only inside
    the Router tree (see the `GlobalPalette` component).
- **Gate §11.v6.2 — No interactive element nests inside another.** A `<button>` (or any
  focusable control) must never be a descendant of another `<button>`. Cards that contain
  multiple controls are `<div>`s, never `<button>`s. No `validateDOMNesting` warnings.
- **Gate §11.v6.3 — Production build.** `npm run build` (typecheck + `vite build`) and
  `npm test` must both pass before any release.

---

## Notes for a future AI build pass

- The repository is **already implemented**. Extend the existing code; never rewrite or
  rename what is listed in v5 §19's implementation map.
- `src/App.tsx` owns the router shell, the async `ready` boot (seed + store init), and now
  the `GlobalPalette` child. `src/pages/HabitsPage.tsx` owns the habit cards. Do not revert
  the two v6 fixes above.
- If `indexedDB`/Dexie misbehaves under a synthetic IndexedDB shim (e.g. fake-indexeddb in
  jsdom) during route navigation, that is a known test-environment artifact — verify with a
  real browser before treating it as an app bug.
