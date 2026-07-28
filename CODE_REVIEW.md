# Code Review — code-review-app

Last updated: 2026-07-28 · Pass 1

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
| S-3 | Security | Medium | Prompt injection via submitted content | ✅ Fixed | `src/lib/review.ts` |
| R-2 | Reliability | Medium | No server-side logging | ✅ Fixed | `src/lib/review.ts`, `src/app/api/reviews/route.ts` |
| A11Y-1 | Accessibility | Medium | No focus management or live region on submit | ✅ Fixed | `src/app/submit/page.tsx` |
| A11Y-2 | Accessibility | Medium | Severity badge contrast unverified | ✅ Fixed | `src/app/review/[id]/page.tsx` |
| T-2 | Test coverage | Medium | No component tests | ✅ Fixed | `src/app/submit/page.test.tsx` |
| C-3 | Code quality | Medium | Findings stored as a JSON string column | ✅ Fixed | `prisma/schema.prisma`, `src/lib/types.ts` |
| T-3 | Test coverage | Low | No CI configuration | ✅ Fixed | `.github/workflows/ci.yml` |
| S-4 | Security | Low | No security headers / CSP | 🔴 Open | `next.config.ts` |
| R-3 | Reliability | Low | No request-size guard before body parse | 🔴 Open | `src/app/api/reviews/route.ts` |
| R-4 | Reliability | Low | No Prisma migration history | 🔴 Open | `prisma/` |
| A11Y-3 | Accessibility | Low | No skip-link, minor landmark polish | 🔴 Open | `src/app/layout.tsx` |
| C-4 | Code quality | Low | README is create-next-app boilerplate | 🔴 Open | `README.md` |
| C-5 | Code quality | Low | Default model string duplicated | 🔴 Open | `src/lib/review.ts`, `src/app/api/reviews/route.ts` |

**11 fixed · 0 partial · 6 open** (all open items are Low, deferred by decision.)

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
- **Done:** In-memory sliding window, 5 requests per minute per client, returning
  429 with `Retry-After`. Covered by a test.
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
- **Files:** `src/lib/review.ts`
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
- **Priority:** Low · **Status:** 🔴 Open
- **Files:** `next.config.ts`
- **Found:** No CSP, HSTS, `X-Frame-Options`, or related headers.
- **Why it matters:** Low while access is gated and usage is internal; matters
  more if this becomes publicly reachable.
- **Remains:** All of it. Deferred by decision.

### R-3 — No request-size guard before body parse
- **Priority:** Low · **Status:** 🔴 Open
- **Files:** `src/app/api/reviews/route.ts`
- **Found:** `request.json()` parses the entire body before zod's length caps
  apply.
- **Why it matters:** Minor memory-pressure surface. Largely mitigated by S-1 and
  S-2 in practice.
- **Remains:** All of it. Deferred by decision.

### R-4 — No Prisma migration history
- **Priority:** Low · **Status:** 🔴 Open
- **Files:** `prisma/`
- **Found:** Schema applied via `prisma db push`; no `prisma/migrations/`.
- **Why it matters:** No reproducible schema history. The C-3 change was applied
  with `--accept-data-loss`, which is acceptable against a local dev database and
  would not be against a shared one.
- **Remains:** Adopt `prisma migrate dev` before any schema change reaches a
  shared or production database. Deferred by decision.

### A11Y-3 — No skip-link, minor landmark polish
- **Priority:** Low · **Status:** 🔴 Open
- **Files:** `src/app/layout.tsx`
- **Found:** No skip-to-content link.
- **Why it matters:** Minor given how shallow the navigation is.
- **Remains:** All of it. Deferred by decision.

### C-4 — README is create-next-app boilerplate
- **Priority:** Low · **Status:** 🔴 Open
- **Files:** `README.md`
- **Found:** Untouched scaffold README — nothing about what the app does, how to
  run it, or which env vars are required (notably `APP_ACCESS_SECRET`).
- **Why it matters:** The repo is now on GitHub; this is the first thing a
  collaborator reads.
- **Remains:** All of it. Deferred by decision — worth doing before anyone else
  touches the repo.

### C-5 — Default model string duplicated
- **Priority:** Low · **Status:** 🔴 Open
- **Files:** `src/lib/review.ts`, `src/app/api/reviews/route.ts`
- **Found:** `"claude-sonnet-5"` appears as a fallback in both files.
- **Why it matters:** Update one, miss the other, and the persisted `model` field
  silently disagrees with the model actually used.
- **Remains:** All of it. Deferred by decision.

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
