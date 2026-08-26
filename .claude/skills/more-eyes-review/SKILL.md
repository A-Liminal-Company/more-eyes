---
name: more-eyes-review
description: Re-audit the More Eyes repo. Re-verifies every finding in CODE_REVIEW.md against the current code, sweeps for new issues across security, reliability, accessibility, test coverage, and code quality, confirms the GitHub security tooling is still enabled, runs the test suite and build for ground truth, and updates CODE_REVIEW.md's summary table and changelog. Report-only by default. Use when asked to re-review, re-audit, or check the health of this repo, or when CODE_REVIEW.md is mentioned.
---

# Re-review More Eyes

Audit this repo against `CODE_REVIEW.md` and update that document.

**Default to report-only.** Do not edit source files unless the person invoking
this explicitly asks for fixes. Updating `CODE_REVIEW.md` itself is always in
scope — that is the deliverable.

## 1. Ground truth first

Run these before reading anything. Never infer status from the document.

```bash
npx tsc --noEmit && npx eslint . && npm test && npm run check:models && npm run build
```

Then the two subpackages and the bundle-sync check, which the root build does
not cover:

```bash
npm run build --prefix mcp-server
npm run build --prefix action && git diff --stat -- action/dist
```

A non-empty diff on `action/dist` means the committed bundle does not match its
source. That is a finding, not a chore — see C-8 for why it is load-bearing.

Record what actually passed or failed. A failure here outranks any claim in the
doc — if `CODE_REVIEW.md` says T-1 is ✅ Fixed and the suite fails, the suite is
right.

## 2. Confirm the security net is still on

S-10 is the only finding whose status lives outside the repository, so it cannot
be verified by reading files. Check it directly:

```bash
gh api repos/A-Liminal-Company/more-eyes --jq '.security_and_analysis'
gh api repos/A-Liminal-Company/more-eyes/vulnerability-alerts   # 204 = enabled, 404 = disabled
gh api repos/A-Liminal-Company/more-eyes/code-scanning/analyses --jq '.[0].created_at'
npm audit
```

Expect `secret_scanning`, `secret_scanning_push_protection`, and
`dependabot_security_updates` all `enabled`, vulnerability alerts on, and a
recent CodeQL analysis. **Any of these being off is a High-priority regression**
— report it above new findings. Also confirm `.github/dependabot.yml` and
`.github/workflows/codeql.yml` still exist and still cover all three npm
manifests (root, `mcp-server`, `action`).

`npm audit` is the other half: a new high-severity advisory is a finding even
when the tooling that should have caught it is working, because Dependabot
opening a PR is not the same as that PR being merged.

## 3. Re-verify every existing finding

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
more urgent.

Two findings need checking against live external state, not just the source
tree, because the code can be unchanged and the answer still wrong:

- **S-13** — `npm run check:models` re-derives which providers actually serve
  each rostered model from OpenRouter's catalogue. A model can pick up an
  out-of-policy provider with nothing in this repo changing.
- **C-8** — `action/dist` can only be verified by rebuilding and diffing.

## 4. Sweep for new issues

Independently scan the current tree — not only previously-flagged files. Cover
the same five categories:

- **Security** — auth gaps, injection (SQL, prompt, XSS), secret handling, unsafe
  deserialization, new unauthenticated surfaces, dependency advisories, and
  **where data goes**: any new outbound call is a jurisdiction question as well
  as a correctness one.
- **Reliability** — unhandled rejections, missing error boundaries, silent
  catches, race conditions, unbounded growth, missing timeouts.
- **Accessibility** — unlabeled controls, focus management, live regions, colour
  contrast (**compute ratios, do not eyeball** — A11Y-5 was found this way and
  would have been missed by inspection), keyboard traps, heading order.
- **Test coverage** — untested routes/components/branches, tests asserting
  nothing meaningful, mocks that hide real behaviour, and tests that hardcode
  values derivable from source (a hardcoded model list silently became invalid
  input when the roster shrank).
- **Code quality** — duplication, dead code, leaked abstractions, inconsistent
  error handling, stale docs.

Pay particular attention to anything added since the last pass: new routes, new
components, new env vars, new dependencies, schema changes, and **new provider
or model entries**.

Assign new IDs continuing the existing per-category numbering. **Never reuse or
renumber existing IDs** — the changelog references them. Note that `A11Y-4`,
`C-1`, and `C-2` are burned: they appear in history but never in the table, so
the next accessibility finding is `A11Y-6`, not `A11Y-4`.

## 5. Update CODE_REVIEW.md

- Rewrite the summary table with current statuses and add rows for new findings.
- Update the fixed/partial/open counts and the `Last updated` / `Pass N` line.
- Add a Details block for each new finding, matching the existing structure:
  Priority · Status, Files, Found, Why it matters, Done, Remains.
- Append a dated Changelog entry: what was re-verified, what regressed, what is
  new, and the ground-truth results from steps 1–2. Include a "Not verified"
  list — what the pass could not establish is as useful as what it could.
- Always write the file, even in report-only mode with nothing new to add — a
  pass that confirms everything still holds is a useful record.

## 6. Report

Summarize in chat: ground-truth results, security-tooling status, regressions
(if any), new findings by priority, and what still stands open. Keep it short —
the detail belongs in the document.

## If asked to fix

Only when explicitly requested:

- High priority first, one small targeted diff per finding. No unrelated
  refactoring.
- Re-run the full ground-truth command after each fix.
- Commit each fix separately, referencing the finding ID
  (e.g. `S-11: fence model-authored text in the job summary`).
- If the change touches `action/src` or `src/lib`, rebuild the Action bundle in
  the same commit: `npm run build --prefix action && git add action/dist`.
  Otherwise the fix does not reach anyone using the Action.
- Stop and ask before moving from High to Medium.
- Update `CODE_REVIEW.md` to reflect what actually landed.

## Repo notes

Verified 2026-08-26. Correct these if they drift — wrong notes here are worse
than none, because they send the next pass looking for the wrong things.

- **Stack:** Next.js 16 App Router (16.3.3) + TypeScript + Tailwind v4, Prisma
  over **Postgres** (not SQLite — that migration happened in `018f1b9`),
  OpenRouter via the `openai` SDK with forced `tool_choice` for structured
  output.
- **Three shipping surfaces share `src/lib`:** the web app, `mcp-server/`
  (stdio MCP server), and `action/` (GitHub Action). A change in `src/lib`
  affects all three, and only the first one is exercised by `npm test`.
- **Keys:** `OPENROUTER_API_KEY` is the required one and powers every reviewer
  including Claude. `ANTHROPIC_API_KEY` is **optional**, used only if the Claude
  entry in `models.ts` is repointed at the direct Anthropic API.
- **`APP_ACCESS_SECRET` gates everything.** If unset, `proxy.ts` returns 503 for
  every route, which looks like a broken app rather than a config problem —
  check this before chasing a phantom bug.
- **Jurisdiction policy is load-bearing.** `src/lib/provider-policy.ts` pins
  `provider.only` on every OpenRouter call. Do not widen `ALLOWED_PROVIDERS` to
  make `check:models` go green; drop the model instead, or change the policy
  deliberately and say so.
- **`npm test` is vitest.** `vitest.setup.ts` wires RTL cleanup — required,
  since vitest only auto-cleans when globals are enabled.
- **The happy path needs a real key.** If none is set, verify the graceful-error
  path and say plainly in the report that the happy path went unverified. A
  captured fixture (`src/lib/__fixtures__/real-review.json`) is often the better
  target anyway — one call instead of seven, on the exact data where the
  behaviour was originally observed.
