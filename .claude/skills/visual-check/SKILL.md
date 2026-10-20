---
name: visual-check
description: Visually verify a bitbang page with headless Chrome — screenshot a panel, detect layout jumps (a box that resizes on interaction), and check for horizontal overflow at mobile width. Use after changing any interactive page, diagram, theme or CSS, when asked how something looks, or to confirm a panel is fixed-size / responsive.
---

# Visual check

bitbang is all interactive diagrams, so changes have to be *seen*. This skill drives headless Chrome over the DevTools
Protocol to screenshot a panel, confirm it doesn't resize as you interact, and confirm it doesn't overflow on a phone.
Use `shot.mjs` in this skill's directory.

## Setup (once per session)

Build and serve the site, and start headless Chrome with a debug port:

```sh
npm run build
(lsof -ti :4329 >/dev/null || python3 -m http.server 4329 -d dist >/dev/null 2>&1 &)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --remote-debugging-port=9341 --user-data-dir=/tmp/shot-prof about:blank >/dev/null 2>&1 &
sleep 2
```

Node needs `--experimental-websocket` (Node ≥ 21 has no global `WebSocket` otherwise).

Let `S=.claude/skills/visual-check/shot.mjs`. URLs are `http://localhost:4329/?p=<id>` (home is `http://localhost:4329/`).

## Screenshot a panel

```sh
node --experimental-websocket $S shot "http://localhost:4329/?p=paging" ".debugger.mem" /tmp/paging.png
```

Then read the PNG. Options: `--w=390` (phone), `--dsf=2` (retina), `--reduced` (emulate reduced-motion — **required for
the home page**, whose intro animation otherwise leaves content hidden), `--click='<js>'` to set up state first, e.g.
`--click="document.querySelector('[data-m=flash]').click()"` or stepping a walkthrough.

Useful selectors: `.debugger.mem` (a Memory panel), `.diagram` (the function-calls chip view), `.instrument` (a
protocol scope), `.cards` (home section cards).

## Detect a layout jump (box resizes on interaction)

A panel must **not** change height when the user interacts — reserve space instead. Measure before vs after a click:

```sh
node --experimental-websocket $S measure "http://localhost:4329/?p=caches" ".debugger.mem" \
  "[...document.querySelectorAll('[data-addr]')].slice(0,6).forEach(b=>b.click())"
# -> "fixed (595px)"  good   |  "JUMPS 384 -> 552"  bad
```

If it JUMPS, find the element that grew (status line, a log/list, an appended row) and give it a `min-height` sized to
its maximum, or render a reserved/hidden placeholder for a row that only appears in a terminal state. Memory explain
lines are already reserved at 92 px; growing lists (`.ca-log`, `.pg-tlb-rows`) and the calls bus-log/asm list reserve
their max. Re-measure until it reports `fixed`.

## Mobile overflow (no horizontal page scroll)

A hard rule: no horizontal scroll at phone width. Check `scrollWidth` vs `innerWidth` at 390 px:

```sh
node --experimental-websocket $S overflow "http://localhost:4329/?p=memmap,http://localhost:4329/?p=caches"
# each line -> "ok"  or  "OVERFLOW 435>390"
```

Fix overflow with responsive CSS (shorter labels, `overflow-x:auto` on a wide table container, stacking a grid at
`max-width: 600px`).

## Gotchas baked into shot.mjs

- Screenshot clip keys are `width`/`height` (not `w`/`h`); capture needs `captureBeyondViewport:true` + `fromSurface:true`.
- Target the real page: `targets.find(x => x.type === 'page')`.
- A 0-width/0-height rect means the element isn't laid out (hidden/animated) — use `--reduced`, a `--click`, or wait.

## Report

Read every screenshot you take and describe what you see (the user can't see your captures — only what you open in
their browser or state). When done, `open "http://localhost:4329/?p=<id>"` so the user can look. Temp PNGs go in the
scratchpad, not the repo.
