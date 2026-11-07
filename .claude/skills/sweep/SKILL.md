---
name: sweep
description: Code review and cleanup sweep for bitbang — find and remove dead code (unused exports, CSS rules, duplicate helpers, overridden declarations), tighten what remains for speed and size, raise test coverage, and map the codebase so it stays navigable as it grows. Use when asked to review, clean up, trim, refactor, optimize or audit the codebase, to find where something lives, or periodically after a batch of new pages.
---

# Sweep: trim, tighten, test, map

bitbang grows a page at a time, and each page adds TypeScript, CSS and checks. A sweep keeps it lean without changing
what readers see. **The rule: a sweep changes no pixels and no behavior unless it is fixing a bug.** Every step is
measured before and after, and anything that does change is looked at and justified.

Tools live in this folder. Run them from the repo root.

| Tool | What it does |
|---|---|
| `node .claude/skills/sweep/map.mjs [filter]` | Every page by section: its file, panel type, size, and whether verify tests it; then the CSS section index. **Start here to find anything.** |
| `node .claude/skills/sweep/deadcode.mjs` | Leads for removal: exports nobody imports, CSS classes and ids never referenced, selectors written in several rules. |
| `snap.mjs snap <dir>` / `compare.py <before> <after> <crops>` | Screenshots of every page at 1280 and 390 px, then a before/after comparison sorted into identical / noise / CHANGED, with side-by-side crops. |
| `npm run verify` | Logic checks (~1 s). External references (Python, cc, Clang, sigrok) run in parallel. |
| `npm run smoke` | Every page in headless Chrome: no JS errors with every control clicked, Memory and Concurrency instruments keep their size, nothing scrolls sideways on a phone, navigation and Back work (~90 s). |

## 1. Baseline

```sh
npm run build && npm run verify            # must pass before you start
(lsof -ti :4329 >/dev/null || python3 -m http.server 4329 -d dist >/dev/null 2>&1 &)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --remote-debugging-port=9341 --user-data-dir=/tmp/shot-prof about:blank >/dev/null 2>&1 &
node --experimental-websocket .claude/skills/sweep/snap.mjs snap $SCRATCH/before
```

Note the bundle size (`ls -l dist/assets`, and `gzip -c dist/assets/index-*.js | wc -c`) and `time npm run verify`.

## 2. Find dead code

Run `deadcode.mjs` and check each lead by hand; it is a list of suspects, not verdicts.

- **Exports used only in their own file**: drop `export`. Keep it when the name is a type in an exported signature,
  or when it is logic worth testing (then add the test instead, step 4).
- **Unused even in their own file**: delete.
- **CSS classes never referenced**: the tool already allows names built in templates (`k-${kind}`, `ch${n}`); grep
  once more for string concatenation (`' by-' + x`) before deleting.
- **Selectors in several rules**: usually deliberate (a shared rule, then a tweak). Delete only declarations a later
  rule always overrides: same selector, same property, no media query between them. The `transition` lists in
  "Motion and interaction" (end of `style.css`) own every button's transitions; remove older ones they replace.
- **Duplicate helpers**: `grep -rhoE "^(export )?const \w+ = \(" src | sort | uniq -c | sort -rn`. Hex formatting
  lives in `topics/dbg.ts` (`hexN`, `hex8`), plurals and byte hex in `core/util.ts`. Import, don't redefine.
- `tsc` (strict, `noUnusedLocals`) already catches unused locals and imports, so `npm run build` is the first filter.

## 3. Tighten what stays

- **Bundle**: topic pages are lazy chunks (`src/topics/index.ts` maps id → `() => import(...)`). New pages must be
  registered that way, never imported eagerly from `main.ts` or a shared module. Check the entry chunk did not grow.
  Protocols are still eager (metadata and `encode` together); splitting `encode` out is the next size win.
- **Runtime**: pages must be idle when nothing is happening. Measure with Performance.getMetrics over 2 s of
  idle (TaskDuration ≈ 0); a perpetual `requestAnimationFrame` or interval is a bug.
- **Layout stability**: run `npm run smoke`. A Memory or Concurrency panel that changes height, or anything that
  shifts sideways when only a value changes, gets reserved space (`min-height`, a hidden placeholder row, a
  `min-width` in `ch` for a changing number) rather than a fixed pixel guess.
- **verify speed**: anything that spawns a program goes through `later(name, async () => [ok, detail])` and `sh()` /
  `cc()` / `zlibOk()` so it runs in parallel and still reports in order. Never call `execFileSync` in a check.

## 4. Raise coverage

`map.mjs` marks live pages with `NO TESTS`. For each: pull the page's rule into a small exported pure function
(the page then calls it), and check it in `scripts/verify.ts` against an **independent** reference: a datasheet value,
a published check value, a compiler, Python, sigrok, or a brute-force definition over every input. A test that only
re-runs the page's own code proves nothing. Section 3n holds shared helpers and site structure (every page is in a
sidebar, no duplicate ids).

## 5. Prove nothing moved

```sh
npm run build && npm run verify && npm run smoke
node --experimental-websocket .claude/skills/sweep/snap.mjs snap $SCRATCH/after
python3 -I .claude/skills/sweep/compare.py $SCRATCH/before $SCRATCH/after $SCRATCH/crops
```

`noise` is anti-aliasing jitter at phone width and can be ignored. Read every `CHANGED` crop. Each must be an
intended fix; otherwise undo the change that caused it. The home hero is seeded so it renders the same each run.

## 6. Report and record

- Changelog: user-visible results only (faster load, a fixed jump), as terse fragments; cleanup alone goes under
  "Minor UI/UX fixes and updates".
- Update the "Architecture" / "Known / future work" notes in `CLAUDE.md` when structure changed.
- Tell the user: what was removed, what got faster or smaller (with numbers), coverage added, anything found but
  left alone and why. Push only when asked.
