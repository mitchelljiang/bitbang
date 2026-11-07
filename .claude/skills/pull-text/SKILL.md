---
name: pull-text
description: Pull prose edits the user made in the bitbang Obsidian vault (obsidian/) back into the TypeScript source. Use when asked to "pull text from obsidian", sync the vault, apply text edits, or after the user says they edited page wording.
---

# Pull text from Obsidian

`obsidian/` mirrors every page's prose, one note per page, generated from the built site by
`scripts/export-obsidian.mjs`. The user edits wording there; this skill finds exactly what they changed and applies it
to the file named in each note's `source:` frontmatter. **Never run `npm run export-text` before pulling**: it wipes
`obsidian/` and the user's edits with it.

## 1. Find what changed

Export a fresh copy of the site's current text to the scratchpad and diff it against the vault. Every difference is
an edit the user made (or prose that changed in `src` since the last export, which the diff also shows):

```sh
npm run build
OBSIDIAN_OUT=$SCRATCH/fresh npm run export-text
diff -ru $SCRATCH/fresh obsidian | grep -v '^Only in' > $SCRATCH/edits.diff
```

`-` lines are what the site says now, `+` lines are what the user wants. Also check `git status obsidian` and
`git diff obsidian` when the vault is committed: it shows edits since the last commit, a useful cross-check.

## 2. Apply each edit to its source

Open the note's `source:` file and find the old sentence (search for a distinctive phrase; long strings are split
with `' +\n'` across lines, so search a few words, not the whole sentence). Field mapping for protocols:

| Note heading | Protocol field |
|---|---|
| intro paragraph / `## Summary` | `summary` |
| `## At a glance` bullets | `facts` (key from the bullet label) |
| `## Used in` | `usedIn` |
| `## Strengths` / `## Limitations` | `strengths[]` / `limits[]` |
| `## Settings` | each param's `help` |
| `## Going deeper` → `### Title` | `deepDive[{ title, body[] }]` |
| walkthrough captions | `src/tours.ts` |

Topic, guide and about pages: headings map to the `<h2>` / `<p>` in the page's HTML template (intro under
`section.intro`, prose under `section.prose`). Keep inline markup in the source (`<code>`, `<b>`, `<a href="?p=…">`)
when the plain-text note dropped it. Typographic quotes and `’` in notes are what the page renders; match what the
source file already uses.

Rules:
- Apply the user's wording exactly. Don't "improve" it on the way in. If an edit introduces a technical error, apply it
  anyway only after asking, and say what's wrong.
- A changed number or fact that `verify.ts` checks (a CRC, a timing) must still match; `npm run verify` decides.
- If a note's `source:` is wrong, fix the mapping in `scripts/export-obsidian.mjs` (`PROTO_FILE`, `TOPIC_FILE`, `srcOf`).

## 3. Confirm

```sh
npm run build && npm run verify
OBSIDIAN_OUT=$SCRATCH/after npm run export-text
diff -ru $SCRATCH/after obsidian
```

The final diff should be empty (or only show whitespace or markup the vault can't represent). Then it is safe to run
`npm run export-text` to refresh the vault. Add a changelog line only if the change is user-visible beyond wording
(a corrected fact: "Fixed: <page> <what>"). Report which pages changed. Push only when asked.
