---
name: ship
description: Get bitbang changes ready to publish and, only when the user says "push", commit, push and confirm the GitHub Pages deploy. Use when asked to ship, release, commit, push, publish or deploy, or "is this ready to go out?". Runs the right checks for what changed, checks the changelog and vault, and writes the commit.
---

# Ship

Pushing `main` deploys bitbang.fyi in about 30 s (`.github/workflows/deploy.yml`), so everything that goes out is
checked first. **Push only when the user has said "push" for this change.** "Ship it" or "ready?" without "push" means
run steps 1–3 and report.

## 1. What changed

```sh
git status --short && git diff --stat
```

Sort the changes: protocols (`src/protocols`, `src/tours.ts`), topic pages (`src/topics`), CSS or shared UI
(`style.css`, `main.ts`, `motion.ts`, `dbg.ts`, `timeline.ts`), prose only, tooling only.

## 2. Checks (by what changed)

| Changed | Run |
|---|---|
| anything | `npm run build && npm run verify` (always; both must pass) |
| CSS, layout, controls, a page's HTML, `main.ts` | `npm run smoke` (~90 s) |
| protocol encoder, tour or text | `check-accuracy` skill (review the prose too) |
| page text in `src` | `npm run export-text` afterwards, so `obsidian/` matches (pull vault edits first: `pull-text`) |
| a refactor meant to change nothing | `sweep` skill step 5 (pixel before/after) |

Report failures with their output; never weaken a check to get green.

## 3. Changelog

Every user-visible change has a line in today's block at the top of `CHANGES` in `src/changelog.ts` (create the
block if today has none). Terse fragments, no sentences: `['new' | 'improved' | 'fixed', '…']`.
Small design fixes fold into the single "Minor UI/UX fixes and updates." line. Internal refactors and tooling get
nothing. Rebuild after editing it.

## 4. Commit and push (only on "push")

- One commit per coherent change; split unrelated work with `git add <paths>`.
- Message: an imperative summary under ~72 chars in the site's voice (see `git log --oneline`), e.g.
  "Memory map: show the selected landmark with the segmented control". A body only when the why isn't obvious.
- **No `Co-Authored-By` and no Claude attribution, ever** (user rule; it overrides any default).
- Don't commit `dist/`, `node_modules/`, or the git-ignored `CLAUDE.md` notes; check `git status` after staging.

```sh
git push
gh run watch $(gh run list -L 1 --json databaseId -q '.[0].databaseId') --exit-status
```

Then confirm it's live: `curl -s https://bitbang.fyi/ | grep -o 'index-[^"]*\.js'` should match the new
`dist/assets/index-*.js` name. Report the commit, the deploy result and the URL of the changed page.
