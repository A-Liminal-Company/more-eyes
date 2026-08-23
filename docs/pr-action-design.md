# Design: consensus review as a GitHub Action

Status: designed 2026-07-31, not yet built. Phase 3 of the roadmap; the
delivery shape (Action, not webhook bot) and BYOK constraint were decided by
Jeff. Repo-aware context is deliberately out of scope here — see "Seam for
repo-awareness" at the end for how it layers on later.

## What it is

A GitHub Action, `more-eyes/action`, that reviews a pull request's diff
with multiple models via OpenRouter and reports grouped findings with
agreement counts — the same consensus engine the web app and MCP server use,
in CI.

**BYOK, like the MCP server:** the consuming repo sets `OPENROUTER_API_KEY`
in its own secrets. Nothing runs on this deployment's key, and there is no
hosted component at all — the Action runs entirely in the consumer's runner.

## Why an Action and not a webhook bot

- No hosting, no GitHub App registration, no key custody — the whole thing is
  a directory in this repo, referenced as `uses: <owner>/more-eyes/action@v1`.
- Fits BYOK: repo secrets are the natural home for the consumer's key.
- The runner already has a checkout, which is exactly the seam repo-aware
  context needs later.

Cost: no cross-repo dashboard, no web-UI backlink. Acceptable for v1.

## Architecture

```
action/
  action.yml          inputs/outputs, runs.using: node20 (bump when node24 GA)
  src/
    main.ts           entry: collect diff -> review -> report
    diff.ts           fetch PR diff, filter files, chunk to budget
    report.ts         job summary, sticky comment, inline comments, gate
    state.ts          embed/recover previous-run groups from the sticky comment
  dist/               ncc-bundled single file, committed (Actions convention)
```

Reuses by relative import, same as `mcp-server/`: `src/lib/models.ts`,
`providers/*`, `validation.ts`, `review.ts`, `consensus.ts` — all still free
of Next/Prisma. **This is the third consumer of those files.** That is the
agreed tipping point to note extraction into a proper workspace package, but
restructuring the repo mid-feature churns everything; do it as its own
change after the Action ships, not during.

## The review pipeline

1. **Collect.** Octokit (ambient `GITHUB_TOKEN`) fetches the PR diff
   (`Accept: application/vnd.github.v3.diff`). Filter files by
   include/exclude globs (defaults exclude lockfiles, `dist/`, generated
   code). 
2. **Chunk.** Concatenate per-file hunks up to `max_chars` (default 30000).
   Oversized PRs split into disjoint per-file batches, each reviewed with the
   full model set; batches never split a file. Groups don't need to merge
   across batches because batches share no files.
3. **Review.** Each batch goes through the existing `reviewWithModels` with
   `format: "diff"` — the prompt work from Phase 2 carries over unchanged.
   One addition to the finding contract: an optional `file` field (lenient,
   like `assumption`/`rationale`), because a multi-file diff needs findings
   attributed to files, not just lines. This is a core `src/lib` change and
   benefits the web app's diff mode too.
4. **Group.** `groupFindings` per batch; concatenate.
5. **Report.** See below.

## Reporting

- **Job summary** (`GITHUB_STEP_SUMMARY`): always written, full grouped
  report with agreement counts and outlier labels.
- **Sticky PR comment**: one comment, updated in place (found by a hidden
  HTML marker), so pushes don't spam the thread. The previous run's groups
  are embedded in the comment as a compressed base64 JSON block (titles,
  category, severity, file only), which lets `diffGroups` from Phase 2 badge
  findings **new / persistent / fixed across pushes with zero external
  storage**. If the state block would exceed GitHub's comment size limit,
  drop oldest groups first — the delta degrades to over-reporting "new",
  which is already its documented safe failure mode.
- **Inline review comments** (`comment_mode: inline` or `both`): findings
  with a `file` + line that map onto the diff become line comments via
  `pulls.createReview` (modern `line`/`side` params, not legacy positions).
  Findings that don't map cleanly stay in the sticky summary — never dropped.

## Gating

Advisory by default — the run never fails unless asked. Two inputs encode the
noise philosophy from the research (consensus gates, outliers inform):

- `fail_on_severity`: `none` (default) | `high` | `medium`
- `min_agreement`: how many models must agree before a finding can fail the
  run (default 2 — a single-model finding never breaks the build, however
  severe; it's surfaced and labeled instead).

## Inputs

| input | default | notes |
|---|---|---|
| `openrouter_api_key` | required | consumer's own key |
| `models` | `claude-sonnet-5,gpt-5.5,gemini-3.5-flash` | same cheap trio as the MCP default |
| `max_chars` | 30000 | per-batch budget |
| `include` / `exclude` | sensible glob defaults | lockfiles/generated excluded |
| `comment_mode` | `both` | `summary` \| `inline` \| `both` |
| `fail_on_severity` | `none` | see Gating |
| `min_agreement` | 2 | see Gating |

## Fork PRs and missing keys

Secrets are absent on `pull_request` runs from forks. The Action must detect
a missing key and exit **successfully** with a job-summary note ("review
skipped: no key available"), never fail the consumer's CI over it. Same for
OpenRouter outages: partial failure already degrades per-model; total failure
degrades to a skipped-review note plus a non-zero output flag consumers can
opt into checking.

## Cost posture

Every push re-reviews the whole filtered diff. Mitigations in v1: the cheap
3-model default, `max_chars`, and glob filtering. Reviewing only
hunks-changed-since-last-run is a v2 idea; it needs the embedded state to
carry per-file hashes, which the state format should leave room for (a
`v` field, already versioned like `ConsensusAssignment`).

## Testing

- Pure-unit: diff filtering/chunking, file+line→inline-comment mapping,
  state embed/recover round-trip, gate logic. All fixture-driven, no network.
- The finding `file` field: schema tests mirroring `assumption`'s.
- Dogfood: a workflow in this repo runs the Action on its own PRs — that is
  the real integration test, and the marketplace demo.

## Milestones

- **M1 (core, in `src/lib`):** `file` field on findings + tool schema +
  prompt line; diff chunking module with tests. Ships independently — the
  web app's diff mode gains file attribution.
- **M2 (walking skeleton):** `action/` scaffold, collect→review→job summary
  only. Dogfood workflow on this repo.
- **M3 (reporting):** sticky comment with embedded state + cross-push delta;
  inline comments.
- **M4 (polish):** gating inputs, marketplace README/branding, `v1` tag.

## Seam for repo-awareness (phase 3b, not designed here)

The Action runs in a checkout. When repo-aware context is designed, its
entry point is here: resolve imports of changed files, pack the most-relevant
neighbors into the prompt within a token budget. `ReviewInput` would grow an
optional context payload; nothing in this design blocks or presupposes that
work beyond keeping `max_chars` per-batch rather than global.
