---
name: ui-polish
description: bitbang's interaction and motion conventions — how controls animate, hover and press, and how panels stay still while values change. Use when adding or changing controls, buttons, toggles, animations or transitions, when something "feels rigid", "jumps", "shifts" or "flickers", or when reviewing a page's UI/UX.
---

# UI polish

The goal is calm, fluid, and never in the way of learning: motion explains a change (what moved, what's selected),
then gets out of the way. Nothing loops, nothing bounces, nothing delays an answer. Every rule below already exists in
code; reuse it rather than inventing a new one.

## How motion works here

Pages redraw by replacing `innerHTML`, so plain CSS transitions on redrawn elements never fire (the old element is
gone). `src/topics/motion.ts` (`animatePanels(root)`, called by `main.ts` for every topic mount) watches each panel
(`.debugger, .trace, .diagram, .instrument`) with a MutationObserver and adds motion after each redraw:

- **Segmented controls** (`.dbg-seg, .mseg, .dbg-ops`): a `.seg-thumb` slides to the checked button. It is remembered
  per `aria-label`, so give each control a unique label. Use `seg()` / `markSeg()` from `dbg.ts`; any control built
  that way gets the thumb for free.
- **Bits**: newly added bits (keyed `data-row:data-bit`) enter staggered, rightmost first. To highlight a bit
  whose value changed, pass `flipped` to `bits()` (it adds `.bit.flipped`, animated in `style.css`).
- **Explain lines** (`.dbg-status, .tr-status, .dg-status, .explain`): fade 0.5→1 only when the text changed.

For an element that persists across redraws (better than re-creating it), render it once and toggle classes:
the Memory map's `.mm-glide` outline and its `grid-template-rows: 0fr → 1fr` expand are the model.

Timing: `--glide: cubic-bezier(0.2, 0.7, 0.2, 1)`, 140–220 ms for movement, 160 ms for fades, ≤ 14 ms stagger.
Everything is off under `prefers-reduced-motion`, and the first placement on load is instant (no animation on
arrival). Pages must be idle at rest: no perpetual `requestAnimationFrame` or interval.

**The one arrival animation:** opening a page from inside the site eases its top-level blocks in, staggered
(`arrive` in `main.ts`: 480 ms each, 70 ms apart, first six blocks; not for home, the first load or reduced motion). The
owner chose it over shorter versions, which felt abrupt. It is the only motion outside these timings; panels still
place themselves instantly.

## Hover and press

The "Motion and interaction" block at the end of `src/style.css` owns every button's `transition`, hover and active
state: a `currentColor` tint overlay under `@media (hover: hover)` and a slight `:active` scale. Don't add per-page
`transition` or `:hover` rules for standard buttons; add the new button's selector to that block. Checked buttons inside
a `.glide` control have a transparent background because the thumb draws it.

## Nothing moves unless it means something

A value changing must not move anything else.

- **Changing numbers:** `min-width` in `ch` sized to the widest value (`table.vars td.val` 14ch, `.nzcv` 17ch, `.ieee`
  48ch), with tabular figures. Never a pixel guess.
- **Button labels that swap** (Play/Pause): `min-width` of the wider label (`.dbg-btn` 63px, `.dg-btn` 70px, `.tr-btn`
  67px, `#play` 86px).
- **Walkthrough readouts:** `readout(root, items, widths)` in `timeline.ts` reserves the widest text over all steps.
- **Rows that appear in some states:** render a hidden placeholder (`visibility: hidden`) or blank lines so the panel
  height is constant (see `bufover.ts`).
- **Explain lines:** fixed `min-height` per theme (numbers in `src/topics/CLAUDE.md`).
- Memory, Concurrency and calls panels must keep their height through every interaction; `npm run smoke` fails if
  they don't. The stack page is the one deliberate exception (`GROWS` in `scripts/smoke.mjs`).

## Check it

1. `npm run build`, then try it in the browser (`npm run dev`) — click quickly through every option, with and without
   reduced motion (DevTools → Rendering → Emulate prefers-reduced-motion).
2. `visual-check` → `measure` for the panel you touched; `npm run smoke` for the whole site.
3. Changelog: big interaction changes get a line; small ones fold into "Minor UI/UX fixes and updates."
