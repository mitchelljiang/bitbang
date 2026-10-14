---
name: check-accuracy
description: Check that every bitbang protocol diagram and its explanatory text are technically accurate, and optionally push. Use before pushing changes to protocols, encoders, walkthroughs or protocol text, or when asked to check, verify or audit accuracy. Pass "push" to commit and push after everything passes.
---

# Check accuracy

bitbang draws protocol waveforms and explains them. Two things can be wrong: the **waveform** (an encoder bug) and the
**text** (a wrong fact in a summary, spec sheet, trade-off, "Going deeper" topic, bit explanation or walkthrough
caption). Check both, report honestly, and push only if everything passes.

## 1. Build

```sh
npm run build
```

A type error or build failure stops here. Fix it before continuing.

## 2. Automated checks

```sh
npm run verify
```

`scripts/verify.ts` runs four groups of checks and exits non-zero on any failure:

1. **Bit check:** each bit's stated value matches the wire at its sample point, for every case in `CASES`.
2. **Walkthroughs:** every tour stop has a valid range and no `undefined`/`NaN` text.
3. **Protocol-specific checks:** Quad SPI read-back, 1-Wire pulse widths, I²S sample decoding, RS-232 inversion,
   JTAG against an independently written TAP table, SWD request bytes, 10BASE-T FCS against Python's `zlib.crc32`,
   PCIe 8b/10b reference codes and invariants and lane striping, PCI handshake rules.
4. **sigrok:** waveforms are exported as VCD and decoded by `sigrok-cli`'s own decoders (UART, SPI, I²C, I²S, 1-Wire,
   JTAG, SWD, USB, SPI flash). These decoders were written independently of this project, so they catch errors in
   *understanding* a protocol, not just drawing bugs. If `sigrok-cli` is missing, install it with
   `brew install sigrok-cli` rather than skipping this group.

If a check fails, work out whether the **site** or the **check** is wrong before changing anything. Prefer the
independent reference (sigrok, a spec, a known value) over the site's own encoder. Never edit a check just to make it
pass.

**Keep coverage complete.** If a protocol or an option was added, make sure `scripts/verify.ts` exercises it: add
cases to `CASES`, and add a sigrok decode if sigrok has a decoder for it (`sigrok-cli -L` lists them). The first check
fails if any protocol has no cases at all.

## 3. Review the text

Automated checks cannot judge prose. Review the text that changed since the last push:

```sh
git diff origin/main -- src/protocols src/tours.ts src/guide.ts src/catalog.ts src/facts.ts
```

For a full audit, or when asked to check "everything", review every protocol, not just the diff.

For each protocol, read its `summary`, `facts`, `strengths`, `limits`, `deepDive`, bit `info` strings and walkthrough
captions, and check:

- **Numbers:** speeds, timings, voltages, pin counts, command codes, register bits, CRC polynomials. Recompute any
  arithmetic (for example baud rate error, CRC check values, bandwidth figures).
- **Consistency:** the text must agree with what the diagram draws and with the rest of the page. A change to an
  encoder (timing, defaults, options) often leaves an old sentence behind.
- **Categories:** each protocol's group in `src/catalog.ts` must describe what it is.
- **Precision without hedging:** where a statement is a simplification of the diagram (for example, scrambling
  omitted), the page should say so.

Classify every finding as an **error** (factually wrong), **stale** (contradicts the current diagram or page), or
**imprecise** (true but misleading). Fix errors and stale text. For imprecise text, fix it if the fix is small and
clear; otherwise report it.

Be explicit about confidence. Facts confirmed by a check or a known reference are verified. Facts recalled from memory
of a specification are not; list the ones that matter most so the user can confirm them against the spec. The areas
with no independent decoder (I3C HDR-DDR and ENTDAA, PCI, PCIe) deserve the most scrutiny.

## 4. Report

Summarize:

- the build result and the `npm run verify` totals, including any failures and what caused them
- every text finding, with its classification and whether it was fixed
- any remaining unverified claims worth checking against a spec

## 5. Push (only when asked)

Push only if the user asked (for example, by invoking this skill with "push"), the build succeeded, `npm run verify`
passed with zero failures, and no unfixed **error** or **stale** findings remain. Otherwise stop after the report and
say what is blocking the push.

```sh
git add -A
git status --short   # review what is being committed
git commit -m "<summary of the changes>"
git push origin main
```

Then wait for the GitHub Pages deploy and confirm it succeeded:

```sh
gh run watch "$(gh run list -w deploy.yml -L1 --json databaseId -q '.[0].databaseId')" --exit-status
```

Commit messages describe the change in plain language. Do not add Claude attribution or `Co-Authored-By` lines.
