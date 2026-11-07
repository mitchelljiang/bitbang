---
name: add-protocol
description: Add a new protocol page to bitbang (an oscilloscope waveform under src/protocols) end to end — metadata, settings, encoder, walkthrough, catalog entry, verify cases and independent checks. Use when asked to add, build or fill in a protocol, bus or interface (e.g. CAN, LIN, SMBus, MDIO, SDIO), or to turn a "soon"/"wip" protocol live.
---

# Add a protocol

A protocol is one `Protocol` object in `src/protocols/<id>.ts` (type in `src/core/types.ts`). The oscilloscope
(`src/eye.ts`) draws whatever `encode(params)` returns. Read `src/protocols/CLAUDE.md`, then two neighbours of the
same kind before writing: `uart.ts` (asynchronous), `spi.ts` / `i2c.ts` (clocked), `onewire.ts` / `ws2812.ts`
(pulse width), `ethernet.ts` / `usb.ts` (line coded, CRC).

## 1. Place it

`src/catalog.ts` lists every protocol by category as `{ id, name, full?, blurb, wires? }`. If the entry exists as `soon`
or has a `wip` paragraph, reuse that `id` and remove `wip`. Otherwise add an entry in the right category.

## 2. Write `src/protocols/<id>.ts`

- **Metadata:** `name`, `fullName`, `tags` (reuse the shared vocabulary: grep the other files' tags), `summary` (3 short
  sentences: what it is, the wires, the one idea that makes it work), `usedIn` (real parts), `facts` (every `FactKey`:
  clock, wires, drive, duplex, topology, addressing, flow, errors, speed, reach), `strengths` and `limits` (3–4 each,
  concrete numbers), `deepDive` (2–4 topics a curious reader asks next).
- **`params`:** a few settings that change the waveform in an instructive way (data bytes, a mode, an address). Every
  param needs `help` (verify fails on an empty one). Defaults should produce a short, readable capture.
- **`encode(params)`:** build traces with `TraceBuilder` and helpers from `src/core/util.ts` (`parseBytes`, `bin`,
  `hex`, `lsbFirst`, `crc5`/`crc16`, …; never reimplement one). Return `{ traces, bits, fields, notes, duration,
  unitTime }`. Every `bit` needs the time it's sampled, so verify can read the wire there. On bad input
  `throw new Error('<what to type instead>')`.
- Voice: plain, exact, no hype. Numbers come from the spec; cite the spec section in a comment when it's subtle.

## 3. Register and walk through

- Import and add it to the `protocols` array in `src/protocols/index.ts` (keep catalog order). It is live now.
- Add a walkthrough to `TOURS` in `src/tours.ts`: an overview, then one stop per idea in wire order (idle, start,
  address/data, check, end). Reuse `overview`, `stop`, `around`; derive times from the waveform, never hard-code them.
- If an id differs from its file name, add it to `PROTO_FILE` in `scripts/export-obsidian.mjs`.

## 4. Prove it's right

In `scripts/verify.ts`:
1. Add 2–3 entries to `CASES` (default plus edge settings). This runs the bit check (every stated bit matches the
   wire) and the walkthrough check for free.
2. Add an **independent** check. Best: a sigrok decoder (`sigrok-cli -L | grep -i <name>`) through `vcd()` + `run()` +
   `expect()` in the sigrok section, in a `later()` so it runs in parallel. Otherwise: a published check value for its
   CRC, a worked example from the spec or a vendor app note, or Python (`sh('python3', …)`).
3. `npm run build && npm run verify`. If a check fails, decide whether the site or the check is wrong before editing
   either; prefer the independent reference.

Then use `check-accuracy` to review the prose and facts line by line.

## 5. Finish

- Look at it: `visual-check` at 1280 and 390 px (no sideways scroll; labels don't collide at the default settings).
- `npm run export-text` to add its note to the vault (pull any pending vault edits first: `pull-text`).
- Changelog: `['new', '<Name>.']` in today's block of `src/changelog.ts`.
- Add sources to `src/resources.ts` under the id (the spec, a datasheet) if known.
- Protocols are in the entry bundle, so note the entry size in the report (`ls -l dist/assets/index-*.js`).
- Push only when asked.
