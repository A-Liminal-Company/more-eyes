# Code Review — More Eyes

Last updated: 2026-08-26 · Pass 3 — baseline security net added; 4 of 12 new findings fixed

Tracked findings across security, reliability, accessibility, test coverage, and
code quality. Kept current by the `more-eyes-review` skill — run it to
re-verify every item below against the actual code and sweep for new issues.

**ID prefixes:** `S` security · `R` reliability · `A11Y` accessibility ·
`T` test coverage · `C` code quality. IDs are stable forever — never renumbered
or reused, even once resolved, so changelog entries stay meaningful.

**Status:** ✅ Fixed · 🟡 Partial · 🔴 Open

## Summary

| ID | Category | Priority | Title | Status | Files |
|---|---|---|---|---|---|
| S-1 | Security | High | No auth/authz on app or API routes | ✅ Fixed | `src/proxy.ts` |
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
| S-4 | Security | Low | No security headers / CSP | ✅ Fixed | `src/proxy.ts` |
| R-3 | Reliability | Low | No request-size guard before body parse | ✅ Fixed | `src/app/api/reviews/route.ts` |
| R-4 | Reliability | Low | No Prisma migration history | ✅ Fixed | `prisma/migrations/`, `.github/workflows/ci.yml` |
| A11Y-3 | Accessibility | Low | No skip-link, minor landmark polish | ✅ Fixed | `src/app/layout.tsx` |
| C-4 | Code quality | Low | README is create-next-app boilerplate | ✅ Fixed | `README.md` |
| C-5 | Code quality | Low | Default model string duplicated | ✅ Fixed | `src/lib/models.ts` |
| S-5 | Security | Medium | Second API key broadens credential exposure | ✅ Fixed | `src/lib/rate-limit.ts`, `.env.example` |
| R-5 | Reliability | Medium | No timeout on provider requests | ✅ Fixed | `src/lib/providers/shared.ts` |
| C-6 | Code quality | Low | Model catalogue can drift from OpenRouter | ✅ Fixed | `scripts/check-models.ts` |
| S-6 | Security | High | Access cookie stores the master secret verbatim | ✅ Fixed | `src/lib/access-token.ts`, `src/proxy.ts` |
| S-7 | Security | Medium | Access secret accepted via URL query parameter | ✅ Fixed | `src/proxy.ts` |
| S-8 | Security | High | Rate limit keyed on spoofable `X-Forwarded-For` | ✅ Fixed | `src/lib/client-key.ts`, `src/lib/rate-limit.ts` |
| R-6 | Reliability | Medium | Rate-limit map grows unbounded across client keys | ✅ Fixed | `src/lib/rate-limit.ts` |
| C-7 | Code quality | Medium | Consensus matching is lexical and has a ceiling | ✅ Fixed | `src/lib/consensus-llm.ts`, `src/lib/consensus.ts` |

| S-9 | Security | High | 9 high-severity CVEs in the dependency tree | ✅ Fixed | `package.json`, `package-lock.json` |
| S-10 | Security | High | No automated security net on a public repo | ✅ Fixed | `.github/dependabot.yml`, `.github/workflows/codeql.yml` |
| S-13 | Security | High | Submitted code routed through Chinese jurisdiction | ✅ Fixed | `src/lib/provider-policy.ts`, `src/lib/models.ts`, `scripts/check-models.ts` |
| C-8 | Code quality | High | `action/dist` not reproducible from `action/src` | ✅ Fixed | `action/dist/index.js`, `.github/workflows/ci.yml` |
| S-11 | Security | Medium | Model-authored text fenced in one place, raw in another | 🔴 Open | `action/src/report.ts` |
| A11Y-5 | Accessibility | Medium | `opacity-70` text fails WCAG AA on high/medium cards | 🔴 Open | `src/app/review/[id]/findings-list.tsx` |
| T-4 | Test coverage | Medium | Action and MCP entry points untested | 🔴 Open | `action/src/main.ts`, `mcp-server/src/index.ts` |
| C-9 | Code quality | Medium | Review doc and skill went stale against the code | 🟡 Partial | `CODE_REVIEW.md`, `.claude/skills/more-eyes-review/SKILL.md` |
| S-12 | Security | Low | CSP allows `script-src 'unsafe-inline'` in production | 🔴 Open | `src/proxy.ts` |
| R-7 | Reliability | Low | Request-size guard bypassable without `content-length` | 🔴 Open | `src/app/api/reviews/route.ts` |
| C-10 | Code quality | Low | `comment_mode` defaults to `both` but does nothing | 🔴 Open | `action/action.yml` |
| C-11 | Code quality | Low | `.env.example` misrepresents `ANTHROPIC_API_KEY` | 🔴 Open | `.env.example` |

**29 fixed · 1 partial · 7 open** — the 25 findings from passes 1–2 all still
hold (re-verified against the code, not the doc). Pass 3 added 12: the four
High ones are fixed, the rest are open by choice pending a go-ahead on Medium
priority. See the note on what "0 open" did and did not mean at the end of the
closing pass below — it applies just as much to these counts.

## Details

### S-1 — No auth/authz on app or API routes
- **Priority:** High · **Status:** ✅ Fixed
- **Files:** `src/proxy.ts`, `.env.example`
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
- **Files:** `src/proxy.ts`
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
  hydration scripts. Removing it needs nonce plumbing through `proxy.ts` —
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

### S-9 — 9 high-severity CVEs in the dependency tree
- **Priority:** High · **Status:** ✅ Fixed
- **Files:** `package.json`, `package-lock.json`
- **Found:** `npm audit` reported 9 high advisories, 7 reachable from production
  dependencies. `next@16.2.12` pulled a vulnerable `postcss` (three advisories,
  all arbitrary `.map` file disclosure via attacker-controlled
  `sourceMappingURL`) and `sharp <0.35.0` (four inherited libvips CVEs).
- **Why it matters:** The app is deployed and public-facing, and this is exactly
  the class of thing S-10's Dependabot exists to surface. It had been sitting
  unflagged because nothing was watching.
- **Done:** Bumped to `next@16.3.3`, which clears both. `npm audit fix` then
  cleared `brace-expansion`, `js-yaml`, and `nanoid` without a breaking change.
  9 high → 3 high.
- **Remains:** Three, all one chain: `prisma` → `@prisma/config` →
  `deepmerge-ts` (stack exhaustion merging recursive object graphs). Not taken,
  because npm's only offered "fix" is a **downgrade** to `prisma@6.12.0` —
  backwards across a major, reaching code that predates the advisory rather than
  resolves it. The reachable surface is `@prisma/config` parsing our own schema
  at build time, not attacker-supplied input. Dependabot now tracks the real
  upstream fix.

### S-10 — No automated security net on a public repo
- **Priority:** High · **Status:** ✅ Fixed
- **Files:** `.github/dependabot.yml`, `.github/workflows/codeql.yml`, repo settings
- **Found:** The repository is **public**, and Dependabot alerts, Dependabot
  security updates, secret scanning, and push protection were all disabled. No
  code scanning of any kind existed.
- **Why it matters:** A live `OPENROUTER_API_KEY` sits in a gitignored `.env`.
  One `git add -A` slip publishes a billable credential to a public repo with
  nothing positioned to catch it. Separately, S-9 proves the dependency half was
  not hypothetical — real CVEs were already present and unflagged.
- **Done:** `dependabot.yml` covering all three npm manifests plus the Actions
  themselves, grouped so a framework bump moves its `@types` and eslint-config
  packages in one PR rather than several that each fail CI alone. A CodeQL
  workflow on push, PR, and weekly schedule, running `security-extended` rather
  than the default pack — the injection- and XSS-class queries are the reason
  for adding it and are not in the default set. No build step, since the
  `javascript-typescript` extractor reads sources directly. The four repository
  toggles were enabled via the API and verified as `enabled` afterwards.
- **Remains:** Secret scanning validity checks and non-provider patterns are
  still off — both are available and free on a public repo. Validity checks in
  particular would tell you whether a leaked key is still live. Left off because
  they were outside what was asked for, not because they were judged unhelpful.
  No CodeQL run has completed yet, so the first results are unreviewed.

### S-13 — Submitted code routed through Chinese jurisdiction
- **Priority:** High · **Status:** ✅ Fixed
- **Files:** `src/lib/provider-policy.ts` (new), `src/lib/models.ts`,
  `src/lib/providers/openrouter.ts`, `src/lib/consensus-llm.ts`,
  `src/lib/redteam.ts`, `scripts/check-models.ts`,
  `src/lib/provider-policy.test.ts` (new)
- **Found:** The roster included DeepSeek V3.1 and Qwen3 Coder. Checking
  OpenRouter's live endpoint data, `qwen/qwen3-coder` was being served by the
  `alibaba` provider, whose published datacenter list includes `CN`. Submitted
  code was physically routing into mainland China. `deepseek-chat-v3.1` was
  additionally served by SiliconFlow and Novita.
- **Why it matters:** Submitted code is by definition unreleased work, and a
  review ships it verbatim to whoever serves the model. Choosing a model is not
  the same decision as choosing a jurisdiction — that distinction is the whole
  finding.
- **Done:** Two layers, because either alone is insufficient. (1) Both
  Chinese-lab models removed from the roster — this fixes today. (2) Every
  OpenRouter request now pins `provider.only` to an allowlist of
  US-headquartered providers with no CN/HK datacenters — this is what keeps it
  fixed, since OpenRouter maps one slug to a shifting set of providers and a
  clean roster can start routing elsewhere without a line changing here. An
  allowlist rather than a blocklist, so onboarding a new provider fails closed.
  `check:models` now enforces the policy against the live catalogue and runs in
  CI per-PR and weekly. Verified by re-adding both models: exits 1 and names
  `alibaba (hq=SG, dc=SG/CN) ← excluded jurisdiction` as the reason.
- **Remains:** The cost is real — two labs' worth of independent opinions on an
  app whose premise is cross-lab disagreement. A test asserts at least two labs
  remain so the filter cannot quietly collapse the roster to one. Grok 4.5 now
  has a single allowlisted provider (`xai`), so an xAI outage removes it
  entirely; `check:models` warns rather than fails on this. `headquarters` is
  also a weaker signal than it looks — several Chinese-founded providers
  register in SG — which is why the check screens datacenters too and why the
  allowlist is kept short enough to re-derive by hand.

### C-8 — `action/dist` not reproducible from `action/src`
- **Priority:** High · **Status:** ✅ Fixed
- **Files:** `action/dist/index.js`, `.github/workflows/ci.yml`, `CONTRIBUTING.md`
- **Found:** Rebuilding the committed ncc bundle produced a different artifact —
  3,117,637 bytes committed against 3,136,138 rebuilt. CI acknowledged this in a
  comment and checked it anyway: "drift between action/src and action/dist won't
  fail this, only a broken build will."
- **Why it matters:** `uses: <repo>@v1` executes `dist/index.js`, never
  `action/src`. Reviewed source and executed artifact could differ with nothing
  positioned to notice. This turned out to be load-bearing rather than
  hygienic: the committed bundle contained **zero** occurrences of the S-13
  provider routing pin, so the Action as published would have kept sending PR
  diffs to unrestricted providers while the source said otherwise.
- **Done:** Confirmed ncc is deterministic given the same lockfile (three
  consecutive builds, identical SHA-256). CI now rebuilds and fails when the
  tree is left dirty, with the fix command in the error message. The rebuilt
  bundle is committed, which is what closes the current gap. `CONTRIBUTING.md`
  documents the rebuild step and cites this incident as the reason.
- **Remains:** The check proves `dist` matches `src` **at the lockfile CI
  resolves**. It is not a reproducible-build guarantee in the cryptographic
  sense, and it cannot detect a bundle committed together with a matching
  malicious source change. Publishing provenance attestations would close that;
  it was out of scope here.

### S-11 — Model-authored text fenced in one place, raw in another
- **Priority:** Medium · **Status:** 🔴 Open
- **Files:** `action/src/report.ts:142-144`
- **Found:** `fence()` correctly wraps red-team `reasoning` and `exploit` in a
  backtick run long enough to survive their own contents. But
  `finding.description`, `group.title`, `assumption`, and `rationale` are
  interpolated raw into the job-summary markdown.
- **Why it matters:** A description containing `</details>`, a `###` heading, or
  the literal text "No findings." can restructure or spoof the report. The whole
  value of the product is that the summary can be trusted; content originating
  in submitted code should not be able to rewrite the verdict's framing. GitHub
  sanitizes HTML in job summaries, so this is layout and content spoofing rather
  than XSS.
- **Done:** Nothing yet.
- **Remains:** All of it. The fix is small — route every model-authored field
  through the existing `fence()` or an inline-escaping equivalent, noting that
  titles sit in a heading where fencing is wrong and escaping is right.

### A11Y-5 — `opacity-70` text fails WCAG AA on high/medium cards
- **Priority:** Medium · **Status:** 🔴 Open
- **Files:** `src/app/review/[id]/findings-list.tsx:113` (category label), `:29`
  (`STATUS_STYLES.persistent`), `:46` (`REDTEAM_STYLES.no`)
- **Found:** Contrast ratios computed rather than eyeballed. `text-xs` at
  `opacity-70` on `bg-red-100`/`text-red-900` gives **4.16:1**; on
  `bg-amber-100`/`text-amber-900`, **3.92:1**. Both are below the 4.5:1 required
  for normal-size text, and `text-xs` is unambiguously normal size.
- **Why it matters:** It affects the category label on *every* finding card plus
  the "persistent" and "not demonstrated" pills — and the high and medium cards
  are precisely the ones a reader most needs to be able to read.
- **Done:** Nothing yet.
- **Remains:** All of it. Scope is narrower than it first appears: low-severity
  (gray) cards pass at 5.27:1 and all of dark mode passes at 6.96:1, so this is
  light mode, high and medium severity only. `opacity-80` already passes at
  5.27:1, which suggests the smallest correct fix is raising 70 to 80 — worth
  re-computing rather than assuming.

### T-4 — Action and MCP entry points untested
- **Priority:** Medium · **Status:** 🔴 Open
- **Files:** `action/src/main.ts`, `mcp-server/src/index.ts`
- **Found:** `action/src/report.ts` and `action/src/diff.ts` are well covered,
  but `main.ts` — which holds the fork-PR skip paths, the cross-batch red-team
  budget arithmetic, and the gate wiring — has no tests. `mcp-server/` has none
  at all.
- **Why it matters:** Two of the three shipping surfaces have untested entry
  points. The shared red-team budget in particular was a deliberate bug fix
  (commit `775f096`, "Make the red-team cap a budget shared across the Action's
  batches") and nothing currently prevents it regressing to `cap × batches`.
- **Done:** Nothing yet.
- **Remains:** All of it. `main.ts` needs `@actions/core` and `@actions/github`
  mocked, which is why it was skipped originally; the budget arithmetic could be
  extracted into a pure helper and tested directly at much lower cost.

### C-9 — Review doc and skill went stale against the code
- **Priority:** Medium · **Status:** 🟡 Partial
- **Files:** `CODE_REVIEW.md`, `.claude/skills/more-eyes-review/SKILL.md`
- **Found:** This document was last updated 2026-07-30 and predated the red-team
  pass, the MCP server, the GitHub Action, and the Postgres migration — roughly
  ten commits of new subsystems it did not mention. The skill's repo notes still
  described "Prisma over SQLite" and "Requires `ANTHROPIC_API_KEY`" when the app
  had moved to Postgres and OpenRouter. `A11Y-4` appears in commit `e231329` but
  never reached the summary table, and `C-1`/`C-2` are absent entirely.
- **Why it matters:** This is the mechanism intended to make re-review cheap.
  Wrong repo notes do not merely fail to help — they actively mislead the next
  pass into checking for the wrong things.
- **Done:** Both files brought current in pass 3. The skill now also verifies the
  S-10 tooling is still enabled and runs `check:models` for S-13.
- **Remains:** The underlying cause is unaddressed: nothing links a subsystem
  landing to this document being updated. `A11Y-4`, `C-1`, and `C-2` are still
  unaccounted for — their IDs stay burned rather than being reused.

### S-12 — CSP allows `script-src 'unsafe-inline'` in production
- **Priority:** Low · **Status:** 🔴 Open
- **Files:** `src/proxy.ts:91`
- **Found:** The production CSP is `script-src 'self' 'unsafe-inline'`. The
  existing comment explains it accurately: Next inlines hydration scripts and a
  nonce-free policy needs `unsafe-inline` for them.
- **Why it matters:** `unsafe-inline` substantially weakens what CSP contributes
  against XSS. It is defense-in-depth rather than a live vulnerability — React
  escapes by default and no unsanitized HTML injection point was found — but it
  removes the layer meant to catch the case where one is introduced.
- **Done:** Nothing. The tradeoff was made knowingly when S-4 landed.
- **Remains:** Next 16 supports nonce-based CSP generated in the proxy, which
  would let `unsafe-inline` be dropped. Worth revisiting now that the proxy is
  already doing per-request work.

### R-7 — Request-size guard bypassable without `content-length`
- **Priority:** Low · **Status:** 🔴 Open
- **Files:** `src/app/api/reviews/route.ts:33`
- **Found:** The 413 guard reads the `content-length` header. When it is absent
  — chunked transfer encoding — `Number(null ?? 0)` evaluates to `0` and the
  check passes, after which `await request.json()` buffers the body before zod's
  20,000-character cap can apply.
- **Why it matters:** Less than it first appears, and the initial assessment of
  Medium was wrong. Because this app uses `proxy.ts`, Next already buffers
  request bodies with a **10MB default cap** (`proxyClientMaxBodySize`), so the
  body cannot actually grow unbounded; an oversized request is truncated and
  then fails JSON parsing, returning a clean 400. The residual issue is that
  10MB per concurrent request is still generous for an endpoint whose largest
  legitimate body is roughly 36KB.
- **Done:** Nothing yet. Reclassified High→Medium→Low once Next's own buffering
  behaviour was read rather than assumed.
- **Remains:** Set `experimental.proxyClientMaxBodySize` in `next.config.ts` to
  something near `MAX_REQUEST_BYTES` so the framework enforces the same ceiling
  the route intends. Note the setting is marked experimental.

### C-10 — `comment_mode` defaults to `both` but does nothing
- **Priority:** Low · **Status:** 🔴 Open
- **Files:** `action/action.yml:35-38`
- **Found:** The input is accepted and defaults to `both`, but `main.ts` never
  reads it and no PR comment is ever posted — only the job summary is written.
- **Why it matters:** Honestly documented as reserved for M3 in both the input
  description and `action/README.md`, so this is a papercut rather than a
  deception. But a default naming behaviour that does not exist invites a
  consumer to configure it and conclude the Action is broken.
- **Done:** Nothing.
- **Remains:** Either default it to `summary`, which is what actually happens,
  or implement M3. The former is a one-line change.

### C-11 — `.env.example` misrepresents `ANTHROPIC_API_KEY`
- **Priority:** Low · **Status:** 🔴 Open
- **Files:** `.env.example`
- **Found:** The file leads with `ANTHROPIC_API_KEY` and a "Get a key from
  console.anthropic.com" comment, giving no indication it is optional. The
  README's variable table correctly marks it **No**, since Claude is routed via
  OpenRouter by default.
- **Why it matters:** `.env.example` is what a new contributor copies. Leading
  with an optional key implies two credentials are required when one is, and the
  genuinely required pair (`OPENROUTER_API_KEY`, `APP_ACCESS_SECRET`) is further
  down.
- **Done:** Nothing.
- **Remains:** Reorder so required variables come first, and mark the Anthropic
  key optional with the condition under which it is needed.

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

### S-6 — Access cookie stores the master secret verbatim
- **Priority:** High · **Status:** ✅ Fixed
- **Files:** `src/lib/access-token.ts`, `src/proxy.ts`
- **Found:** Flagged by 3 of 6 models. The access cookie's *value* is the shared
  secret itself, so anything that captures a cookie captures the master
  credential — logs, proxies, backups, a browser profile on a shared machine.
- **Why it matters:** There is one secret for the whole app and no way to revoke
  a single leaked session without rotating access for everyone.
- **Done:** The cookie now holds `v1.<issuedAt>.<nonce>.<signature>`, an
  HMAC-SHA256 over the first three segments keyed by the secret. The nonce is 16
  random bytes, so every session is distinct rather than every browser holding
  the identical value. Expiry is enforced server-side against `issuedAt` rather
  than trusting the cookie's `maxAge`, which is only a request to the browser —
  and a back-dated `issuedAt` fails the signature, so age cannot be extended.
  Verified in-browser: the cookie value is a `v1.` token, editing one character
  of the signature returns 401 on the next request.
- **Remains:** Still one credential for everyone — a token proves its holder
  presented the secret, not who they are, so there is no per-user revocation.
  Rotating `APP_ACCESS_SECRET` invalidates every token at once. **Cookies issued
  before this change held the raw secret and no longer verify**, so existing
  sessions re-enter the secret once.

### S-7 — Access secret accepted via URL query parameter
- **Priority:** Medium · **Status:** ✅ Fixed
- **Files:** `src/proxy.ts`, `README.md`
- **Found:** Flagged by 3 of 6 models. `?secret=` is the documented way in, and
  URLs land in browser history, server access logs, and `Referer` headers.
- **Why it matters:** A deliberate convenience tradeoff, but an undocumented one.
- **Done:** A secret arriving via `?secret=` now sets the cookie on a redirect to
  the same URL with the parameter removed. The `x-access-secret` header path is
  unchanged — no redirect, since nothing leaks there. The README documents both,
  and points at the header as the option with no history exposure at all.
- **Remains:** The one navigation that carried the secret is still in browser
  history; a redirect cannot retroactively remove it. Everything after it —
  the landed URL, `Referer` headers, later log lines — is clean.

### S-8 — Rate limit keyed on spoofable `X-Forwarded-For`
- **Priority:** High · **Status:** ✅ Fixed
- **Files:** `src/lib/client-key.ts`, `src/lib/rate-limit.ts`, `src/app/api/reviews/route.ts`
- **Found:** The client key comes from `X-Forwarded-For`, which the client
  controls. Rotating the header resets the budget every request.
- **Why it matters:** The rate limit is the only thing bounding spend once
  someone is past the access gate. Trivially bypassed as written.
- **Done:** Two layers, because neither is sufficient alone.
  `X-Forwarded-For` is *appended to* by each proxy, so the code now reads the
  entry `TRUSTED_PROXY_HOPS` from the **right** (default 1) — a value our own
  proxy wrote — rather than the leftmost, which is whatever the caller typed.
  A client sending its own header only prepends to the list and cannot reach the
  entry we read. On top of that, a global bucket now caps model calls across all
  clients combined (`RATE_LIMIT_GLOBAL_MAX`, default 120/minute): everyone past
  the gate shares one secret, so *any* per-client key is choosable by an insider,
  and the global ceiling is the part that actually bounds spend. Covered by a
  route test that rotates the header 31 times and expects a 429 — under the old
  code every request got a fresh budget and all 31 succeeded.
- **Remains:** The hop count is a configuration assumption. Set it too high and
  the key is client-controlled again; too low and every client shares one key.
  Correct for Railway's single edge proxy, documented in the README, and the
  global ceiling bounds spend either way.

### R-6 — Rate-limit map grows unbounded across client keys
- **Priority:** Medium · **Status:** ✅ Fixed
- **Files:** `src/lib/rate-limit.ts`
- **Found:** Flagged by 2 models. `hits` never evicts keys, so every distinct
  client key allocates an entry that is never reclaimed. Compounds with S-8,
  where an attacker chooses the keys.
- **Done:** Three mechanisms, because each covers a case the others miss. A key
  is dropped outright when its window empties, rather than being stored as an
  empty array. An idle client is never touched again, so a periodic sweep — at
  most once per window, making the O(n) walk free amortised — reclaims keys that
  expired without being revisited. And a hard cap of 10,000 tracked keys covers
  the case neither handles: a burst of distinct keys *inside* one window, which
  is exactly the shape of the S-8 attack. Over the cap, live entries are evicted
  oldest-activity first. Tested with 12,000 rotating keys.
- **Remains:** Nothing. Still per-process in-memory state, as noted under S-2.

### C-7 — Consensus matching is lexical and has a ceiling
- **Priority:** Medium · **Status:** ✅ Fixed (opt-in)
- **Files:** `src/lib/consensus.ts`
- **Found:** Reviewing `consensus.ts` with the app produced 21 findings and zero
  corroborated, while three models had plainly reported one defect in different
  words. Thresholds were lowered to 0.20 and the case now groups, but the root
  cause is that token overlap cannot see paraphrase: "chain unrelated findings"
  and "hide distinct issues" describe one thing and share nothing.
- **Why it matters:** Fragmentation understates agreement, which is the tool's
  entire value.
- **Done:** An opt-in model-assisted merge pass, enabled by setting
  `CONSENSUS_MERGE_MODEL`. The structural constraint drove the design:
  `groupFindings` runs at *render* time, on the home page and every review page,
  so a model call inside it would re-bill on each view and make renders
  non-deterministic. The pass therefore runs **once, at submission**, and stores
  its answer in a new `Submission.consensus` column as a grouping assignment of
  `<model>#<index>` keys — the assignment only, not a copy of the findings, and
  order-independent so it survives however Prisma returns the review rows.
  Chose this over embeddings: same paraphrase handling, one call per submission
  instead of one per finding, and no new dependency.
  Three properties make it safe to leave on: it can only ever *fail soft* (a
  timeout, missing key, or malformed response is logged and the lexical grouping
  stands); malformed indices are dropped individually and any group the model
  failed to place survives on its own, so the result is never worse than what it
  started from; and groups the pass deliberately kept apart are exempted from
  the lexical merge that follows, since deciding they are distinct is the whole
  point. Off by default, so the deterministic path stays the default and the
  tested one — every pre-existing consensus test passes unchanged.
  **Verified against the captured 33-finding fixture** with
  `google/gemini-3.5-flash`: 12 groups → 9, all 33 findings preserved. It
  correctly merged three pairs lexical matching could not see — "Returns entire
  user row" with "SELECT * may leak sensitive columns", and "Request body
  parsing is not configured" with "Missing Body Parser Middleware" — none of
  which share meaningful vocabulary.
- **Found by that run, and fixed:** the pass over-merged on its first attempt,
  fusing one model's "no check for user existence" and "no input validation on
  email field" behind another model's broader "Missing Input Validation" title.
  That is precisely the failure this design calls the dangerous direction. The
  guard is cheap and strong: **two groups sharing a model are never merged.** A
  model that filed them as two findings is asserting they are two issues, and
  its own separation is better evidence than another model's grouping. With the
  guard the same run yields 9 groups instead of 8, every group holds at most one
  finding per model, and the three genuine merges above survive untouched.
- **Remains:** Enabling it puts a model in the render path's *input*, so grouping
  is no longer reproducible from the findings alone — the stored assignment is
  the record of what was decided. Verified against the fixture but not yet
  through a live end-to-end submission, so the wiring in the POST route is
  covered only by its unit tests.

### Self-review pass — 2026-07-30

Submitted this codebase to its own deployed instance: `consensus.ts`, the
middleware and rate limiter, and the request pipeline, six models each.

- **Fixed:** stringified `findings` (two models returned a JSON-encoded string
  rather than an array, and were being discarded entirely — 3 of 6 reviewers
  lost); single-link chaining in group merging, now average linkage at 0.15;
  match thresholds lowered to 0.20 with line distance as counter-evidence.
- **New findings:** S-6, S-7, S-8, R-6, C-7 above.
- **False positives worth recording:** two models agreed that the representative
  title, category and severity could disagree — they all come from the same
  object. One reported a missing import that is defined in the same file.
  Agreement is a confidence signal, not proof.
- **Method limitation:** submissions are file-by-file, so several findings
  claimed `isUsableReview` was never applied. It is, in `providers/`, which was
  not included in that submission.
- **Ground truth at close:** 77 tests passing, typecheck clean, lint clean,
  build succeeds, deployed and healthy.

### Closing the self-review findings — 2026-07-30

The five findings the app raised against its own code are now fixed. **Every
tracked finding is resolved again.**

Four of them share a root: the access gate and the rate limiter each trusted
something they should not have. The cookie carried the master credential, the
secret travelled in a URL, the rate-limit key was a client-supplied header, and
the limiter's map never evicted. Past the access gate the rate limit is the only
thing bounding spend, and rotating one header bypassed it entirely.

- **Migrated `middleware.ts` → `proxy.ts`.** Next 16 deprecated the `middleware`
  file convention; the codemod handled the rename, and S-6 and S-7 rewrote that
  file anyway. `next build` now reports the route as `ƒ Proxy (Middleware)`.
  Worth knowing for future work: **Proxy runs on the Node.js runtime** in Next 16
  and the `runtime` config option throws, so `node:crypto` is available
  synchronously — no Web Crypto workaround was needed for the HMAC.
- **S-6** signed access token in the cookie instead of the secret, with
  server-side expiry. **Pre-existing cookies hold the raw secret and no longer
  verify** — anyone with an open session re-enters the secret once. That is the
  fix working, not a regression.
- **S-7** the query-param unlock now redirects to the same URL with the parameter
  stripped, cookie set on the redirect. The strip applies to *any* granted
  request carrying `?secret=`, not just the unlock — someone with a working
  session who follows a shared link would otherwise leave the secret in their
  address bar. Refused requests are not redirected: a 401 is the answer, and
  redirecting first would only leak the attempt into one more log line.
- **S-8** `X-Forwarded-For` is read from the right, plus a global spend ceiling
  that holds regardless of what key a caller picks.
- **R-6** empty windows dropped, a once-per-window sweep for idle keys, and a
  10,000-key cap for the burst case the sweep cannot reach.
- **C-7** opt-in model-assisted merge pass behind `CONSENSUS_MERGE_MODEL`, run
  once at submission and stored in a new `Submission.consensus` column. It had
  to move out of `groupFindings`: that runs on every render, so a model call
  inside it would re-bill on each page view. Exercised against the real
  33-finding fixture rather than shipped on unit tests alone — which was worth
  doing, because the first run over-merged and produced the same-model guard now
  in the code. See its Details entry.

- **Ground truth at close:** 132 tests passing (up from 77), typecheck clean,
  lint clean, production build succeeds, `check:models` reports 6/6 healthy,
  `prisma migrate dev` applied cleanly.
- **Verified against a running server, not just asserted:** 401 with no cookie;
  `/api/health` still ungated; `?secret=` returns a 307 to the path with the
  parameter removed and unrelated query params preserved; the issued cookie is a
  `v1.` token that neither equals nor contains the secret; that cookie
  authorises; a single flipped character in the signature returns 401; and the
  raw secret presented as a cookie — the old format — is rejected. Home and
  review pages render, with pre-existing rows (`consensus IS NULL`) falling back
  to lexical grouping and still showing multi-model agreement.
- **Not verified:** the merge pass was run against the captured fixture, not
  through a live end-to-end submission, so its wiring in the POST route rests on
  unit tests. Its *output quality* is now measured, which was the part that
  mattered — and measuring it changed the code.
- **Method note worth keeping:** the fixture was the right thing to test against,
  not a fresh six-model submission. One model call instead of seven, run on the
  exact data where fragmentation was originally observed, and reproducible
  afterwards. Live verification does not have to mean an expensive one.

### Pass 3 — 2026-08-26

First pass since the repo grew three shipping surfaces. Scope was a full
re-review plus standing up a baseline security net in GitHub's own tooling.

**Ground truth at open:** typecheck clean, lint clean, 235 tests passing,
production build succeeds. No regressions — all 25 findings from passes 1–2
re-verified against the code rather than trusted from this document, and every
one still holds.

**The document itself was the first finding.** It was last updated 2026-07-30
and described a Prisma-over-SQLite app requiring `ANTHROPIC_API_KEY`. Since
then the app moved to Postgres and OpenRouter and gained a red-team pass, an
MCP server, and a GitHub Action — none of which appeared here. The skill's repo
notes were wrong in the same ways, which is worse than absent, since they told
the next pass to go looking for the wrong things. Filed as C-9.

**Twelve new findings: four High, four Medium, four Low.** The four High are
fixed; the rest are open pending a decision on Medium priority.

- **S-9** — `npm audit` reported 9 high advisories, 7 reachable from production
  deps, via `next@16.2.12` → vulnerable `postcss` and `sharp`. `next@16.3.3`
  plus a non-breaking `audit fix` took it to 3. The remaining three are one
  `prisma` → `@prisma/config` → `deepmerge-ts` chain whose only offered fix is a
  *downgrade* across a major, which is not a fix.
- **S-10** — the requested security net. The repo is public and had Dependabot
  alerts, Dependabot security updates, secret scanning, and push protection all
  **disabled**, with no code scanning at all. All four toggles enabled and
  verified; `dependabot.yml` covers three npm manifests plus the Actions;
  CodeQL runs `security-extended` on push, PR, and weekly. S-9 is the proof
  this was not theoretical — real CVEs were already sitting unflagged.
- **S-13** — raised mid-pass, and the most consequential finding here. Verified
  against OpenRouter's live endpoint data that `qwen/qwen3-coder` was served by
  `alibaba`, whose published datacenters include `CN`: submitted code was
  actually routing into mainland China, not hypothetically. Fixed in two layers,
  because removing the models alone fixes only today — requests now pin
  `provider.only` to an allowlist, since OpenRouter remaps slugs to new
  providers without anything in this repo changing. Cost two labs.
- **C-8** — the committed Action bundle did not match its source. This stopped
  being hygiene the moment S-13 landed: the published `dist` contained **zero**
  occurrences of the new routing pin, so the Action would have kept sending PR
  diffs to unrestricted providers while the source said otherwise. A fix that
  reaches source but not the shipped artifact is not a fix.

**One assessment corrected mid-pass.** R-7 was first written up as Medium on the
reasoning that a missing `content-length` lets an unbounded body reach
`request.json()`. Reading Next 16's own `proxyClientMaxBodySize` documentation
showed the framework already buffers proxy-handled bodies with a 10MB default
cap, so the body cannot actually grow without bound and an oversized request
degrades to a clean 400. Downgraded to Low. The finding survives only as
"10MB is a poor ceiling for a 36KB endpoint."

**Ground truth at close:** typecheck clean, lint clean, **241 tests passing**
(up from 235), `check:models` reports 4 models / 0 failing / 1 warning,
production build succeeds, `mcp-server` and `action` both build, and
`action/dist` verified in sync with `action/src`.

- **Verified rather than asserted:** the jurisdiction check was negative-tested
  by re-adding both removed models — it exits 1 and names
  `alibaba (hq=SG, dc=SG/CN) ← excluded jurisdiction`. ncc determinism was
  confirmed across three consecutive builds with identical SHA-256, which is
  what makes the new CI dist check meaningful rather than flaky. The four
  repository security toggles were re-read from the API after enabling and
  confirmed `enabled`.
- **Not verified:** no CodeQL run has completed, so its first findings are
  unreviewed and may add to this list. Dependabot has not yet opened its first
  PR. Nothing was exercised against a live model — the roster change is
  catalogue-verified, not confirmed by an actual review request through a pinned
  provider. Nothing was deployed.
- **Method note worth keeping:** the two most valuable findings this pass came
  from checking live external state rather than reading code. `models.ts` looks
  entirely correct in isolation; only OpenRouter's provider directory reveals
  where the code actually goes. Likewise `action/dist` looks fine until it is
  rebuilt and diffed. A review confined to the source tree would have found
  neither, which is an argument for keeping `check:models` and the dist check in
  CI rather than treating them as review-time chores.
