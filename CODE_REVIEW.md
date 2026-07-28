# Code Review — code-review-app

Last updated: 2026-07-28 · Pass 1 complete — all findings resolved

Tracked findings across security, reliability, accessibility, test coverage, and
code quality. Kept current by the `code-review-app-review` skill — run it to
re-verify every item below against the actual code and sweep for new issues.

**ID prefixes:** `S` security · `R` reliability · `A11Y` accessibility ·
`T` test coverage · `C` code quality. IDs are stable forever — never renumbered
or reused, even once resolved, so changelog entries stay meaningful.

**Status:** ✅ Fixed · 🟡 Partial · 🔴 Open

## Summary

| ID | Category | Priority | Title | Status | Files |
|---|---|---|---|---|---|
| S-1 | Security | High | No auth/authz on app or API routes | ✅ Fixed | `src/middleware.ts` |
| S-2 | Security | High | No rate limiting on review submissions | ✅ Fixed | `src/lib/rate-limit.ts`, `src/app/api/reviews/route.ts` |
| R-1 | Reliability | High | No error boundaries | ✅ Fixed | `src/app/error.tsx`, `src/app/global-error.tsx` |
| T-1 | Test coverage | High | No API route tests | ✅ Fixed | `src/app/api/reviews/route.test.ts`, `src/app/api/reviews/[id]/route.test.ts` |
| S-3 | Security | Medium | Prompt injection via submitted content | ✅ Fixed | `src/lib/providers/shared.ts` |
| R-2 | Reliability | Medium | No server-side logging | ✅ Fixed | `src/lib/providers/*.ts`, `src/lib/review.ts`, `src/app/api/reviews/route.ts` |
| A11Y-1 | Accessibility | Medium | No focus management or live region on submit | ✅ Fixed | `src/app/submit/page.tsx` |
| A11Y-2 | Accessibility | Medium | Severity badge contrast unverified | ✅ Fixed | `src/app/review/[id]/page.tsx` |
| T-2 | Test coverage | Medium | No component tests | ✅ Fixed | `src/app/submit/page.test.tsx` |
| C-3 | Code quality | Medium | Findings stored as a JSON string column | ✅ Fixed | `prisma/schema.prisma`, `src/lib/types.ts` |
| T-3 | Test coverage | Low | No CI configuration | ✅ Fixed | `.github/workflows/ci.yml` |
| S-4 | Security | Low | No security headers / CSP | ✅ Fixed | `src/middleware.ts` |
| R-3 | Reliability | Low | No request-size guard before body parse | ✅ Fixed | `src/app/api/reviews/route.ts` |
| R-4 | Reliability | Low | No Prisma migration history | ✅ Fixed | `prisma/migrations/`, `.github/workflows/ci.yml` |
| A11Y-3 | Accessibility | Low | No skip-link, minor landmark polish | ✅ Fixed | `src/app/layout.tsx` |
| C-4 | Code quality | Low | README is create-next-app boilerplate | ✅ Fixed | `README.md` |
| C-5 | Code quality | Low | Default model string duplicated | ✅ Fixed | `src/lib/models.ts` |
| S-5 | Security | Medium | Second API key broadens credential exposure | ✅ Fixed | `src/lib/rate-limit.ts`, `.env.example` |
| R-5 | Reliability | Medium | No timeout on provider requests | ✅ Fixed | `src/lib/providers/shared.ts` |
| C-6 | Code quality | Low | Model catalogue can drift from OpenRouter | ✅ Fixed | `scripts/check-models.ts` |

**20 fixed · 0 partial · 0 open** — every tracked finding is resolved.

## Details

### S-1 — No auth/authz on app or API routes
- **Priority:** High · **Status:** ✅ Fixed
- **Files:** `src/middleware.ts`, `.env.example`
- **Found:** Every page and both API routes were reachable by anyone with network
  access. Any visitor could read the code in every past submission and trigger
  billed Anthropic calls.
- **Why it matters:** The repo was about to be pushed to GitHub and possibly
  deployed. Submitted code is by definition unreleased work.
- **Done:** Middleware gates all routes behind `APP_ACCESS_SECRET`, accepted via
  `x-access-secret` header or `?secret=` query param, then persisted in an
  httpOnly cookie. Returns 503 rather than failing open when the secret is
  unset. Verified in-browser: blocked by default, unlocked with the secret,
  cookie persists.
- **Remains:** Shared-secret auth means no per-user identity or audit trail. If
  this ever serves more than a small trusted team, move to real accounts.

### S-2 — No rate limiting on review submissions
- **Priority:** High · **Status:** ✅ Fixed
- **Files:** `src/lib/rate-limit.ts`, `src/app/api/reviews/route.ts`
- **Found:** `POST /api/reviews` had no throttle, and every request triggers a
  billed Anthropic call.
- **Why it matters:** An open-ended cost vector — one runaway loop could run up a
  large bill.
- **Done:** In-memory sliding window returning 429 with `Retry-After`, covered by
  tests. Originally 5 submissions per minute; now a budget of 30 **model calls**
  per minute — see S-5 for why the unit changed.
- **Remains:** In-memory state is per-process — it resets on restart and does not
  coordinate across instances. Fine for single-instance deployment; needs Redis
  or similar if this ever scales horizontally.

### R-1 — No error boundaries
- **Priority:** High · **Status:** ✅ Fixed
- **Files:** `src/app/error.tsx`, `src/app/global-error.tsx`
- **Found:** No `error.tsx` or `global-error.tsx` anywhere.
- **Why it matters:** Any unhandled exception — notably the DB write failing
  *after* a successful, already-billed Claude call — surfaced the raw Next.js
  crash page with no recovery path and nothing logged.
- **Done:** Route-level and global boundaries that log server-side and offer a
  retry.
- **Remains:** Nothing.

### T-1 — No API route tests
- **Priority:** High · **Status:** ✅ Fixed
- **Files:** `src/app/api/reviews/route.test.ts`, `src/app/api/reviews/[id]/route.test.ts`
- **Found:** All 13 original tests were lib-level. Nothing exercised the actual
  request/response contract.
- **Why it matters:** The route layer holds the validation, error mapping, and
  persistence logic most likely to regress silently.
- **Done:** Tests for 400 (invalid body and malformed JSON), 502 with no
  persistence on review failure, 201 with persistence on success, 429 past the
  rate limit, and 404 for a missing id.
- **Remains:** Prisma is mocked, so these do not exercise real DB behavior. No
  end-to-end test against a live database.

### S-3 — Prompt injection via submitted content
- **Priority:** Medium · **Status:** ✅ Fixed
- **Files:** `src/lib/providers/shared.ts` (moved from `review.ts` in the
  multi-model refactor), covered by `src/lib/providers/shared.test.ts`
- **Found:** Title, description, language, and code were interpolated directly
  into a single user-message template literal.
- **Why it matters:** Forced `tool_choice` constrains the response *shape*, not
  its *content*. Crafted input could suppress genuine findings or fabricate a
  clean summary — which a teammate would then trust before shipping. This
  defeats the app's entire purpose.
- **Done:** Reviewer instructions moved into the system prompt; submitted content
  wrapped in `<submission>` tags explicitly marked untrusted, with angle
  brackets escaped so input cannot close the delimiters. The system prompt
  instructs the model to report injection attempts as findings rather than obey
  them.
- **Remains:** Defense-in-depth, not a guarantee — prompt injection has no
  complete fix. No test asserts injection resistance (would need a live API
  call). Treat reviews as advisory, never as a security gate.

### R-2 — No server-side logging
- **Priority:** Medium · **Status:** ✅ Fixed
- **Files:** `src/lib/review.ts`, `src/app/api/reviews/route.ts`
- **Found:** Errors only ever reached the client response body.
- **Why it matters:** Fine while someone is watching a terminal; near-impossible
  to diagnose once deployed.
- **Done:** `console.error` on Anthropic request failure and on review failure in
  the route.
- **Remains:** `console.error` only — no structured logging, levels, or
  aggregation. Worth revisiting if this gets deployed somewhere real.

### A11Y-1 — No focus management or live region on submit
- **Priority:** Medium · **Status:** ✅ Fixed
- **Files:** `src/app/submit/page.tsx`
- **Found:** The error banner had `role="alert"`, but focus never moved to it and
  the "Reviewing…" pending state was not announced.
- **Why it matters:** A screen reader user could submit and not learn whether it
  succeeded or failed.
- **Done:** Focus moves to the error on failure, submit button is `aria-busy`,
  and a polite live region announces the in-progress state. Focus behavior is
  covered by a test.
- **Remains:** Not verified with an actual screen reader (VoiceOver/NVDA).

### A11Y-2 — Severity badge contrast unverified
- **Priority:** Medium · **Status:** ✅ Fixed (verified, no change needed)
- **Files:** `src/app/review/[id]/page.tsx`
- **Found:** Badge colors had never been checked against WCAG.
- **Why it matters:** Severity is the most important signal on the page.
- **Done:** Computed contrast ratios — high 6.80:1, medium 6.37:1, low 9.37:1,
  all passing WCAG AA (≥4.5:1). Severity is also conveyed by a text label, so
  there is no color-only dependency. Error text bumped `red-600` → `red-700`
  (4.83:1 → 6.47:1) while nearby.
- **Remains:** Nothing.

### T-2 — No component tests
- **Priority:** Medium · **Status:** ✅ Fixed
- **Files:** `src/app/submit/page.test.tsx`, `vitest.setup.ts`
- **Found:** Testing Library was installed but entirely unused.
- **Why it matters:** Nothing verified the form's behavior — the app's only
  interactive surface.
- **Done:** Tests for accessible labels, success navigation, server-error and
  network-error handling, and focus movement. Added RTL `cleanup` between tests,
  which vitest only wires up automatically when globals are enabled — without it
  renders leak across tests.
- **Remains:** `review/[id]/page.tsx` and `page.tsx` are async server components
  and remain untested; their findings logic is covered indirectly via
  `src/lib/types.test.ts`.

### C-3 — Findings stored as a JSON string column
- **Priority:** Medium · **Status:** ✅ Fixed
- **Files:** `prisma/schema.prisma`, `src/lib/types.ts`, `src/app/api/reviews/route.ts`
- **Found:** `findings` was a `String` holding stringified JSON, so
  `parseFindings` had to parse defensively and silently return `[]` on any
  corruption.
- **Why it matters:** Silent data loss on corruption, and findings could not be
  queried without loading every row into app code.
- **Done:** Column changed to native `Json`; `parseFindings` reduced to an array
  check. Verified in-browser with a seeded row: findings render sorted, and the
  home page count reads correctly.
- **Remains:** Applied via `db push` — see R-4.

### T-3 — No CI configuration
- **Priority:** Low · **Status:** ✅ Fixed
- **Files:** `.github/workflows/ci.yml`
- **Found:** No CI. Fixed opportunistically once the repo was pushed to GitHub.
- **Done:** Workflow running typecheck, lint, tests, and build on pushes to
  `main` and on PRs.
- **Remains:** No coverage reporting or branch protection.

### S-4 — No security headers / CSP
- **Priority:** Low · **Status:** ✅ Fixed
- **Files:** `src/middleware.ts`
- **Found:** No CSP, HSTS, `X-Frame-Options`, or related headers.
- **Why it matters:** Low while access is gated and usage is internal; matters
  more if this becomes publicly reachable.
- **Done:** CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options`,
  `Referrer-Policy`, and `Permissions-Policy` on every response, with HSTS added
  only in production. The policy splits by environment — development needs
  `'unsafe-eval'` and a websocket for hot reload, and granting those in
  production would defeat the point. Verified both ways in a browser: dev logs
  `[HMR] connected`, and a production build renders and hydrates with no CSP
  violations.
- **Remains:** `script-src` still allows `'unsafe-inline'` because Next inlines
  hydration scripts. Removing it needs nonce plumbing through the middleware —
  worth doing if this is ever exposed publicly.

### R-3 — No request-size guard before body parse
- **Priority:** Low · **Status:** ✅ Fixed
- **Files:** `src/app/api/reviews/route.ts`
- **Found:** `request.json()` parsed the entire body before zod's length caps
  applied.
- **Why it matters:** Minor memory-pressure surface, and the guard is what makes
  it safe to parse before charging the rate limit (see S-5).
- **Done:** Rejects with 413 from the `content-length` header when the body
  exceeds the code cap plus headroom, before parsing. Verified live: a 60KB body
  returns 413, a valid one still succeeds. Covered by a test.
- **Remains:** Trusts the declared `content-length`. A lying header would still
  be parsed, though Next imposes its own body limits underneath.

### R-4 — No Prisma migration history
- **Priority:** Low · **Status:** ✅ Fixed
- **Files:** `prisma/migrations/`, `.github/workflows/ci.yml`
- **Found:** Schema applied via `prisma db push`; no `prisma/migrations/`.
- **Why it matters:** No reproducible schema history. Earlier schema changes were
  applied with `--accept-data-loss`, fine against a local dev database and not
  against a shared one.
- **Done:** Initial migration checked in, and CI now runs `prisma migrate deploy`
  instead of `db push` so a missing or broken migration fails there rather than
  on a real database.
- **Remains:** Nothing. Use `prisma migrate dev` for future schema changes.

### A11Y-3 — No skip-link, minor landmark polish
- **Priority:** Low · **Status:** ✅ Fixed
- **Files:** `src/app/layout.tsx`, all four page components
- **Found:** No skip-to-content link, and no id on the `main` landmarks.
- **Why it matters:** Minor given shallow navigation, but a skip link is the
  cheapest possible win for keyboard users.
- **Done:** Visually-hidden link that appears on focus, with an `id="main"`
  target on every page. Verified in-browser that it is the **first focusable
  element** — a skip link users reach late is useless.
- **Remains:** Nothing.

### C-4 — README is create-next-app boilerplate
- **Priority:** Low · **Status:** ✅ Fixed
- **Files:** `README.md`
- **Found:** Untouched scaffold README — nothing about what the app does, how to
  run it, or which env vars are required. By the end it omitted six variables,
  including the two without which the app does not start.
- **Why it matters:** The repo is on GitHub; this is the first thing a
  collaborator reads.
- **Done:** Rewritten — what it does and why multi-model, a required/optional env
  var table, setup through first launch, the reviewer list with guidance on
  adding models (verify tool support; prefer multi-provider slugs), commands,
  architecture, and known limitations. Flags that `APP_ACCESS_SECRET` being unset
  returns 503 on every route, which reads as a broken app rather than a missing
  setting. **Verified by following it on a fresh clone into a clean directory:**
  64 tests pass and the build succeeds from the documented steps alone.
- **Remains:** Nothing.

### C-5 — Default model string duplicated
- **Priority:** Low · **Status:** ✅ Fixed
- **Files:** `src/lib/models.ts`
- **Found:** `"claude-sonnet-5"` appeared as a fallback in both `review.ts` and
  the API route.
- **Why it matters:** Update one, miss the other, and the persisted `model` field
  silently disagrees with the model actually used.
- **Done:** Resolved incidentally by the multi-model work — model identity now
  lives in a single registry (`src/lib/models.ts`) and the selected id is passed
  explicitly, so there is no fallback string to drift.
- **Remains:** Nothing.

### S-5 — Second API key broadens credential exposure
- **Priority:** Medium · **Status:** ✅ Fixed
- **Files:** `src/lib/rate-limit.ts`, `.env.example`
- **Found:** Adding `OPENROUTER_API_KEY` means two billable credentials now live
  in `.env`, and OpenRouter keys carry spend across many providers.
- **Why it matters:** A leaked OpenRouter key is broader in blast radius than a
  single-provider key. There is no per-key spend cap enforced in the app.
- **Done:** A $20/month cap on the OpenRouter key bounds the worst case, and the
  rate limit now charges per **model call** rather than per submission — a budget
  of 30 calls per minute, so a six-model request costs six. Previously a
  six-model request consumed the same quota as a one-model request while billing
  six times as much.
- **Remains:** Budget is in-memory and per-process, so it resets on restart and
  does not coordinate across instances — the same limitation noted under S-2.

### R-5 — No timeout on provider requests
- **Priority:** Medium · **Status:** ✅ Fixed
- **Files:** `src/lib/providers/shared.ts`, `.../anthropic.ts`, `.../openrouter.ts`
- **Found:** Neither provider set a request timeout. `reviewWithModels` waits on
  `Promise.all`, so the slowest model determined total latency.
- **Why it matters:** One hung provider stalled the entire submission, and the
  partial-failure design did not help because nothing had failed yet.
- **Done:** Two layers, because SDK timeouts apply *per attempt* and retries
  multiply the wall clock — a 45s socket timeout with `maxRetries: 1`, plus a
  hard 90s deadline per model (`withDeadline`) that covers retries. Only the
  outer deadline actually guarantees a bound. Configurable via
  `REVIEW_REQUEST_TIMEOUT_MS` and `REVIEW_DEADLINE_MS`.
- **Remains:** The deadline is per model, not per submission. Six models each
  taking 89s would still be a ~90s request. Acceptable while models run in
  parallel; revisit if the model list grows much larger.

### C-6 — Model catalogue can drift from OpenRouter
- **Priority:** Low · **Status:** ✅ Fixed
- **Files:** `scripts/check-models.ts`, `package.json`
- **Found:** Model slugs are hardcoded. They were verified against OpenRouter's
  catalogue when written, but providers deprecate and rename models.
- **Why it matters:** A stale slug surfaces as a runtime failure for that model
  only — contained by the partial-failure design, but confusing.
- **Done:** `npm run check:models` verifies each entry against the public
  catalogue: slug still exists, still reports tool support, and has more than one
  provider. The single-provider warning would have caught the qwen3-coder-plus
  404 before a user hit it. Needs no API key. Current run: 6 models, 0 failing,
  0 warnings.
- **Remains:** Not wired into CI — it depends on a live external API, and a
  provider outage should not fail an unrelated build. Run it manually when
  touching the registry.

## Changelog

### Pass 1 — 2026-07-28

Initial review of the newly scaffolded app. 4 High, 6 Medium, 7 Low identified.

- **Fixed (High):** S-1 shared-secret middleware, S-2 rate limiting, R-1 error
  boundaries, T-1 API route tests.
- **Fixed (Medium):** S-3 prompt hardening, R-2 server-side logging, A11Y-1 focus
  and live region, A11Y-2 contrast verified (no change needed), T-2 component
  tests, C-3 native JSON column.
- **Fixed (Low, opportunistic):** T-3 CI workflow.
- **Deferred (Low, by decision):** S-4, R-3, R-4, A11Y-3, C-4, C-5.
- **Ground truth at close:** 25 tests passing, typecheck clean, lint clean, build
  succeeds. Auth gate, review rendering, and findings counts verified in-browser.
- **Note:** The full submit → Claude → review happy path has not been exercised
  against the live API — `ANTHROPIC_API_KEY` was unset during this pass, so only
  the graceful-error path was verified end-to-end.

### Multi-model review — 2026-07-28

Feature work, not a review pass. Added OpenRouter alongside direct Anthropic so
several models review each submission independently, with overlapping findings
grouped into a consensus view.

- **Schema:** `Review` is now one-to-many per `Submission`, with `status` /
  `error` columns so a failed model is recorded rather than discarding the batch.
- **New surface:** `src/lib/models.ts` (curated 6-model registry, all verified
  tool-capable), `src/lib/providers/{shared,anthropic,openrouter}.ts`,
  `src/lib/consensus.ts` (deterministic finding clustering).
- **Closed incidentally:** C-5 — model identity now has a single source of truth.
- **New findings:** S-5 (second billable credential), R-5 (no provider timeout),
  C-6 (hardcoded slugs can drift). S-5 and R-5 are Medium and worth addressing
  before this handles real traffic.
- **Ground truth at close:** 46 tests passing (up from 25), typecheck clean, lint
  clean, build succeeds. Consensus grouping, partial-failure display, and the
  reviewer picker verified in-browser against seeded data.
- **Still unverified:** no live API call has been made through either provider —
  both keys were unset. The happy path remains untested end-to-end.

### First live run — 2026-07-28

`OPENROUTER_API_KEY` added; all six models pointed at a deliberately buggy
Express snippet. **HTTP 201 in 41s, 5 of 6 models responded.** The happy path is
now verified end-to-end — the last open item from Pass 1 is closed.

Two real defects surfaced that no amount of seeded data would have found:

- **Models ignore `required` in a tool schema.** Claude returned 7 findings with
  no `summary` field — `finish_reason: tool_calls`, valid JSON, 1.3k tokens
  against a 16k limit, so not truncation. The same prompt included `summary` on
  a repeat run. The strict parse threw the whole review away. Fixed: `summary` is
  optional, malformed findings are dropped individually, and only a response with
  neither summary nor findings counts as a failure.
- **Consensus fragmented on real output.** One authorization flaw appeared as two
  groups ("Missing authorization check", 3 models / "Broken Access Control",
  2 models) and one `db.query` bug as three. Root cause was two-fold: title-token
  overlap is too narrow when models share almost no vocabulary, and single-pass
  greedy assignment is order-dependent — a finding started its own group because
  the findings it would have matched had not been processed yet. Fixed by
  comparing descriptions, scoring best-match instead of first-match, and merging
  groups until stable. Result on the same data: 33 findings → 13 groups, with SQL
  injection, missing authorization, and the `db.query` bug each correctly showing
  5-model agreement.

A regression suite (`src/lib/consensus.real.test.ts`) now runs against the
captured 33-finding fixture, because synthetic examples made the clustering look
considerably easier than it is.

- **Ground truth at close:** 58 tests passing, typecheck clean, lint clean, build
  succeeds.
- **Environment note:** `qwen3-coder-plus` failed with a 404. Partial-failure
  handling worked exactly as intended: five reviews persisted and rendered, one
  failure shown inline. Root-caused and fixed below.

### Six-model run — 2026-07-28

- **Qwen 404 root cause:** not a spend or key problem. `qwen3-coder-plus` is
  served by **Alibaba alone**, so an account data policy excluding that single
  provider left zero endpoints and OpenRouter returned a hard 404 instead of
  routing elsewhere. Swapped to `qwen/qwen3-coder` — same family, six providers.
  Verified live: routes via Novita, returns a well-formed tool call. No change to
  account privacy settings was needed. **Lesson for the model registry:** prefer
  multi-provider slugs; single-provider models are a availability risk.
- **R-5 closed.** See its Details entry for the two-layer approach.
- **Result:** 6 of 6 models responded in **26.7s** (previously 41s with one
  failure). 38 findings → 14 groups, with SQL injection and missing
  authorization each flagged by **all six** models.
- **Ground truth at close:** 64 tests passing, typecheck clean, lint clean,
  build succeeds.
- **Known limitation:** consensus still splits the tail slightly — "db.save is
  not awaited" and "Database write is not awaited" remain separate groups.
  Deliberate: lowering the threshold far enough to merge them starts merging
  genuinely distinct findings, and a bad merge hides one issue behind another's
  title. Over-splitting only costs a duplicate row.

### Closing pass — 2026-07-28

Cleared the remaining backlog. **Every tracked finding is now resolved.**

- **A11Y-3** skip link, verified to be the first focusable element.
- **S-4** security headers and CSP, split by environment — development needs
  `'unsafe-eval'` and a websocket for hot reload, production must not have them.
  Verified both ways in a browser rather than trusting the header string.
- **R-3** 413 guard from `content-length` before parsing.
- **S-5** rate limit now charges per model call (30/minute) rather than per
  submission, so a six-model request no longer costs the same quota as a
  one-model request while billing six times as much. This is why R-3 was worth
  doing first: the size guard is what makes it safe to parse the body before
  charging.
- **R-4** initial migration checked in; CI runs `migrate deploy`.
- **C-6** `npm run check:models` detects registry drift against OpenRouter's
  public catalogue, including the single-provider warning that would have caught
  the qwen3-coder-plus 404 in advance.

- **Ground truth at close:** 73 tests passing, typecheck clean, lint clean,
  production build succeeds and hydrates under the strict CSP with no violations
  logged, `check:models` reports 6/6 healthy.
- **Note on "0 open":** this means every *identified* finding is addressed, not
  that the code is without fault. Several entries carry a "Remains" line
  describing accepted limits — in-memory rate limiting, `'unsafe-inline'` in
  `script-src`, shared-secret auth with no per-user identity. Those are bounded
  decisions, not oversights. Run the review skill for a fresh look.
