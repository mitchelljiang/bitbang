---
name: add-page
description: Add a new interactive topic page to bitbang (a Bits/Memory/Concurrency page under src/topics), wired up end to end — module, registration, scoped CSS, verify checks, and the Obsidian text mirror. Use when asked to build, add or create an interactive topic/diagram page, or to fill in a "soon" topic.
---

# Add an interactive topic page

bitbang's Bits/Memory/Concurrency pages each live in `src/topics/<id>.ts` and export a `mount(root)` function. Build
one end to end: module, registration, CSS, accuracy checks, and the prose mirror. Match the existing pages exactly —
read two or three neighbours first (`mmio.ts`, `alignment.ts`, `caches.ts`, `frames.ts`) so the new page is
indistinguishable in structure and voice.

## 1. Know where it goes

The sidebar entry already exists (or needs adding) in `src/bits.ts` / `src/memory.ts` / `src/concurrency.ts` as a
`Category` entry `{ id, name, blurb }`. A `soon` page is one listed there with no module yet. The `id` you build must
match that entry's `id`.

## 2. Write `src/topics/<id>.ts`

Follow the house pattern:

- A top doc comment explaining the concept and the interaction.
- Export the **pure logic** as standalone functions/consts (e.g. `regionOf`, `access`, `translate`) — these are what
  `verify.ts` tests. Keep them free of DOM.
- `export function mountX(root) {`:
  1. Read initial state from `new URLSearchParams(location.search)`.
  2. `root.innerHTML = \`<section class="intro"><p class="crumbs">…</p><h1>…</h1><p>…</p></section> <section class="debugger <mem? > <page>" aria-label="…"><header class="dbg-bar">…controls…</header><div class="<page>-body">…</div><p class="dbg-status" aria-live="polite"></p></section> <section class="prose"><h2>…</h2><p>…</p></section>\``
  3. `function draw(note?) { … set innerHTML of the dynamic parts …; status(root, note ?? …); syncUrl({…}); }`
  4. `draw(); root.addEventListener('click', e => { …dispatch on data-* …; draw(); });`

Use helpers from `./dbg` (`code`, `bits`, `seg`/`markSeg`, `oneOf`, `status`, `syncUrl`, `hexN`, `readHex`). **Do not**
use `wire()` on a page with hand-built controls — it wipes custom HTML; call `draw()` and add the listener yourself.

**Theme:** a Memory page's debugger section must carry the `mem` class (`class="debugger mem <page>"`) so it picks up
the bench-instrument re-theme. Bits pages omit `mem`. A Concurrency page is a trace instead: build it with
`traceHtml` + `stepper` from `./timeline` (lanes, bars, steps from an exported simulator; see `interrupts.ts`,
`priorities.ts`, `locks.ts`). Keep color semantic (gold = selected, mint = valid, coral =
fault).

## 3. Register it

In `src/topics/index.ts` add `import { mountX } from './<id>'` and `<id>: mountX` to the `topics` record. The page's
status flips to **live** automatically.

## 4. Style it

Append a small scoped block to `src/style.css` under the Memory-section area, keyed on the page's class
(`.<page>-body`, `.<page> …`). Use the `--dbg-*` / instrument tokens, never raw one-off colors where a token exists.
Keep the panel **fixed size**: reserve height for the status line and any growing list so interaction never resizes
the box (see `visual-check`).

## 5. Add accuracy checks

Import the page's exported pure functions into `scripts/verify.ts` and add a `check(...)` block (memory checks live in
sections `3j`/`3k`). Assert against an **independent** reference (a known value, hand-computed result, or spec), not the
page's own output restated. Then:

```sh
npm run build && npm run verify
```

Both must pass (strict `tsc`; verify exits non-zero on any failure).

## 6. Refresh the prose mirror

New page text was written straight into `src`, so regenerate the Obsidian vault so it mirrors it:

```sh
npm run export-text
```

## 7. Changelog + check

Add a user-visible line to `src/changelog.ts` (newest-dated block). Screenshot the page at desktop and 390 px to
confirm it renders and does not overflow or jump (use the `visual-check` skill). Report what you built; **push only
when asked**, and never add Claude attribution to the commit.
