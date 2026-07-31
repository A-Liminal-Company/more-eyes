---
name: code-review-app-review
description: Re-audit the code-review-app repo. Re-verifies every finding in CODE_REVIEW.md against the current code, sweeps for new issues across security, reliability, accessibility, test coverage, and code quality, runs the test suite and build for ground truth, and updates CODE_REVIEW.md's summary table and changelog. Report-only by default. Use when asked to re-review, re-audit, or check the health of this repo, or when CODE_REVIEW.md is mentioned.
---

# Re-review code-review-app

Audit this repo against `CODE_REVIEW.md` and update that document.

**Default to report-only.** Do not edit source files unless the person invoking
this explicitly asks for fixes. Updating `CODE_REVIEW.md` itself is always in
scope — that is the deliverable.

## 1. Ground truth first

Run these before reading anything. Never infer status from the document.

```bash
npx tsc --noEmit && npx eslint . && npm test && npm run build
```

Record what actually passed or failed. A failure here outranks any claim in the
doc — if `CODE_REVIEW.md` says T-1 is ✅ Fixed and the suite fails, the suite is
right.

## 2. Re-verify every existing finding

For each ID in the summary table, open the files it cites and re-derive its
status from the code as it exists now. The doc's own prose is a hypothesis, not
evidence.

- Read the actual file. Do not mark anything ✅ Fixed without seeing the code.
- If a cited file is gone or renamed, that is a finding — note it.
- **Flag regressions loudly.** Anything previously ✅ that no longer holds is the
  most important thing in the report; call it out before new findings.
- If a fix is present but incomplete, mark 🟡 Partial and say precisely what is
  missing.

The "Remains" line in each Details block is where partial fixes and known gaps
live — check whether those gaps still exist, and whether any have quietly become
more urgent (e.g. R-4's missing migration history matters much more once a
shared database exists).

## 3. Sweep for new issues

Independently scan the current tree — not only previously-flagged files. Cover
the same five categories:

- **Security** — auth gaps, injection (SQL, prompt, XSS), secret handling, unsafe
  deserialization, new unauthenticated surfaces, dependency advisories
  (`npm audit`).
- **Reliability** — unhandled rejections, missing error boundaries, silent
  catches, race conditions, unbounded growth, missing timeouts.
- **Accessibility** — unlabeled controls, focus management, live regions, color
  contrast (compute ratios, don't eyeball), keyboard traps, heading order.
- **Test coverage** — untested new routes/components/branches, tests asserting
  nothing meaningful, mocks that hide real behavior.
- **Code quality** — duplication, dead code, leaked abstractions, inconsistent
  error handling, stale docs.

Pay particular attention to anything added since the last pass: new routes, new
components, new env vars, new dependencies, schema changes.

Assign new IDs continuing the existing per-category numbering (if the doc has
`S-4`, the next security finding is `S-5`). **Never reuse or renumber existing
IDs** — the changelog references them.

## 4. Update CODE_REVIEW.md

- Rewrite the summary table with current statuses and add rows for new findings.
- Update the fixed/partial/open counts and the `Last updated` / `Pass N` line.
- Add a Details block for each new finding, matching the existing structure:
  Priority · Status, Files, Found, Why it matters, Done, Remains.
- Append a dated Changelog entry: what was re-verified, what regressed, what is
  new, and the ground-truth results from step 1.
- Always write the file, even in report-only mode with nothing new to add — a
  pass that confirms everything still holds is a useful record.

## 5. Report

Summarize in chat: ground-truth results, regressions (if any), new findings by
priority, and what still stands open. Keep it short — the detail belongs in the
document.

## If asked to fix

Only when explicitly requested:

- High priority first, one small targeted diff per finding. No unrelated
  refactoring.
- Re-run the full ground-truth command after each fix.
- Commit each fix separately, referencing the finding ID
  (e.g. `S-5: escape user input in export path`).
- Stop and ask before moving from High to Medium.
- Update `CODE_REVIEW.md` to reflect what actually landed.

## Repo notes

- Next.js App Router + TypeScript + Tailwind; Prisma over SQLite; Anthropic SDK
  with forced `tool_choice` for structured review output.
- `npm test` is vitest. `vitest.setup.ts` wires RTL cleanup — required, since
  vitest only auto-cleans when globals are enabled.
- Requires `ANTHROPIC_API_KEY` and `APP_ACCESS_SECRET` in `.env`. If
  `APP_ACCESS_SECRET` is unset `proxy.ts` returns 503 for every route, which
  looks like a broken app rather than a config problem — check this before
  chasing a phantom bug.
- The submit → Claude → review happy path needs a real API key to exercise. If
  none is set, verify the graceful-error path and say plainly in the report that
  the happy path went unverified.
