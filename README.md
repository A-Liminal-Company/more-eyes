# More Eyes

Paste code, get it reviewed by several AI models at once, and see where they
agree. Built for catching bugs before they ship when you're moving fast.

Each model reviews independently and the results are grouped, so an issue that
five models flagged separately shows up as one finding with five voices behind
it — and something only one model spotted is visibly just one opinion.

## Why several models

Models share blind spots within a family. On a deliberately buggy Express
snippet, all six independently caught a SQL injection and a missing
authorization check, but coverage of the long tail varied a lot — one model
found 8 issues, another 4. Agreement is a useful confidence signal; disagreement
is where it's worth looking closer.

Reviews are advisory. They are not a security gate, and a clean review is not
evidence that code is correct.

## Setup

Requires Node 22+ and Postgres.

```bash
npm install
cp .env.example .env
```

Then fill in `.env`:

| Variable | Required | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | **Yes** | [openrouter.ai/keys](https://openrouter.ai/keys). Powers every reviewer, Claude included. Set a spend limit on the key — one submission bills every selected model. |
| `APP_ACCESS_SECRET` | **Yes** | Gates the whole app. Generate with `openssl rand -hex 32`. Without it every route returns 503 — this looks like a broken app rather than a missing setting, so check it first when nothing loads. |
| `DATABASE_URL` | Yes | Postgres connection string. Railway injects this automatically; locally point it at your own instance. |
| `ANTHROPIC_API_KEY` | No | Only needed if you repoint the Claude entry in `src/lib/models.ts` at the direct Anthropic API instead of OpenRouter. |
| `REVIEW_REQUEST_TIMEOUT_MS` | No | Per-attempt socket timeout. Default 45000. |
| `REVIEW_DEADLINE_MS` | No | Hard ceiling per model, retries included. Default 90000. |
| `TRUSTED_PROXY_HOPS` | No | How many proxies sit in front of the app. Default 1, which is right behind Railway. Only raise it if you add another proxy — see the rate-limiting note below. |
| `RATE_LIMIT_GLOBAL_MAX` | No | Model calls per minute across all clients combined. Default 120. |
| `CONSENSUS_MERGE_MODEL` | No | Enables the model-assisted consensus pass. Unset by default; see [Deterministic consensus](#how-it-works). |
| `REDTEAM_MODEL` | No | Enables the red-team pass. Unset by default; see [Demonstrability](#demonstrability). Costs one call per reported finding. |
| `REDTEAM_CATEGORIES` | No | Categories worth an exploit attempt. Default `security,bug,reliability`. |
| `REDTEAM_MAX_FINDINGS` | No | Ceiling on exploit attempts per submission. Default 10, most severe first. |

Create the database, then start it:

```bash
createdb code_review_dev
npx prisma generate && npx prisma migrate deploy
npm run dev
```

Visit `http://localhost:3000/?secret=<your APP_ACCESS_SECRET>` once. The app
sets an httpOnly cookie and immediately redirects to the same URL without the
query string, so the secret does not linger in the address bar, in `Referer`
headers, or in later access log lines. It is still in the history entry for that
one navigation — if that matters in your setup, send the secret as an
`x-access-secret` header instead, which takes the same path without the
redirect.

The cookie holds a signed token derived from the secret, never the secret
itself, so a captured cookie is not a captured master credential. Rotating
`APP_ACCESS_SECRET` invalidates every issued token.

## Reviewers

Six models across six labs, all verified to support tool calling:

| Model | Lab |
|---|---|
| Claude Sonnet 5 | Anthropic |
| GPT-5.5 | OpenAI |
| Gemini 3.5 Flash | Google |
| Grok 4.5 | xAI |
| Mistral Large 3 | Mistral |
| Nova 2 Lite | Amazon |

### Who is allowed to receive your code

A review sends submitted code verbatim to whoever serves the model, and
submitted code is by definition unreleased work. The risk being managed is
therefore **corporate control**: which legal entity ends up holding the code,
what its terms permit it to do with it, and whose government can compel it to
hand the code over.

Every request pins `provider.only` to an allowlist where each entry is either
the lab that built the model, serving it directly, or a first-party hyperscaler
cloud (`src/lib/provider-policy.ts`). In both cases the counterparty is a US or
EU entity with enterprise data terms and a legal system the code's owner can
actually reach.

The pin is the load-bearing part. Picking a model is not the same decision as
picking a counterparty — OpenRouter maps one slug to a shifting set of
providers, so a roster that was clean when written can start routing elsewhere
without a line changing here. DeepSeek V3.1 and Qwen3 Coder were removed under
this test: `qwen/qwen3-coder` was being served by Alibaba Cloud, and the
objection is that Alibaba is a Chinese company whose terms and legal obligations
put the code beyond its owner's reach.

**Geography is a secondary signal, not the test.** Data physically in China is
reachable by PRC legal process whoever owns the server — which is exactly why
the hyperscalers partition rather than extend, AWS China being a separate
Chinese entity that AWS Global never routes into. And in the other direction,
only about a quarter of providers publish a datacenter list at all, so "no CN
datacenter listed" usually just means "nothing listed".

This costs real coverage. Losing DeepSeek and Qwen cost two labs on an app whose
premise is cross-lab disagreement; Mistral Large 3 and Nova 2 Lite restore both —
the latter through Bedrock, which was already allowlisted, so at no policy cost.

Meta was considered and rejected on capability rather than policy. Every Llama
available on an allowlisted provider states a knowledge cutoff of 2024-08-31 or
earlier, against 2025-12 and 2025-01 for the rest of the roster. This tool
reviews code written against framework versions two years newer than that, and a
reviewer that confidently misremembers current APIs is worse than absent here —
the outlier badge invites a second look at exactly its false positives. Worth
revisiting when Meta ships something current on Bedrock or Vertex.

`npm run check:models` enforces the allowlist against OpenRouter's live
catalogue and fails if a rostered model has picked up a provider outside it. CI
runs it on every PR and again weekly, since the catalogue changes on its own
schedule.

Edit the list in `src/lib/models.ts`. Three things to know before adding one:

- **Confirm it reports `tools` support** at `https://openrouter.ai/api/v1/models`.
  Structured output depends on it.
- **Check who would serve it.** Run `npm run check:models`. If the model is
  served by a provider outside the allowlist, decide deliberately whether to
  drop the model or admit the provider having read its retention and training
  terms — do not widen `ALLOWED_PROVIDERS` to make a red build go green. There
  is no field anywhere for "who ultimately controls this entity", and
  registration country is actively misleading, so this judgement needs a person.
- **Prefer multi-provider slugs.** A model served by a single allowlisted
  provider has no fallback when that provider is degraded. Grok 4.5, Mistral
  Large 3 and Nova 2 Lite are all in this position — `check:models` warns rather
  than failing. Check with
  `https://openrouter.ai/api/v1/models/<slug>/endpoints`.
- **Check the knowledge cutoff.** A reviewer whose training predates the
  framework versions you actually ship will produce confident, wrong findings
  about current APIs. This is what ruled out Meta's models here.

## Commands

```bash
npm run dev            # development server
npm test               # vitest
npm run lint           # eslint
npm run build          # production build
npm run check:models   # verify the registry against OpenRouter's catalogue
```

CI runs typecheck, lint, tests, the jurisdiction check, and build on every push
and PR, plus a weekly scheduled run. CodeQL (`security-extended`) analyses the
same code on push, PR, and weekly; Dependabot covers all three package
manifests.

## How it works

```
src/
  app/
    page.tsx               submission history
    models/                model quality — corroboration rate per reviewer
    submit/                the form; also handles ?previous=<id> re-reviews
    review/[id]/
      page.tsx              consensus view + per-model summaries
      findings-list.tsx      focused/all toggle, outlier and delta badges
    api/reviews/            POST fans out to models, GET lists
  lib/
    models.ts               the reviewer registry
    providers/               shared prompt + Anthropic and OpenRouter clients
    consensus.ts             groups findings that describe the same issue,
                              and diffs two submissions' groups for re-reviews
    model-stats.ts           per-model corroboration rate for the models page
    validation.ts            zod schemas for input and model output
    consensus-llm.ts         optional model-assisted merge pass, off by default
    redteam.ts               optional exploit-construction pass, off by default
    access-token.ts          issues and verifies the signed access cookie
    client-key.ts            derives the rate-limit key from trusted proxy headers
    rate-limit.ts            budget of 30 model calls per minute per client
  proxy.ts                  shared-secret gate (Next 16 renamed `middleware`)
mcp-server/                 BYOK MCP server exposing the same review engine
```

Three decisions worth knowing about, because each came from something that went
wrong in practice:

**Partial failure.** Models run in parallel and each result is stored
separately. If one provider fails, the others still persist and render, with the
failure shown inline. With six reviewers, all-or-nothing would throw away good
work over one flaky provider.

**Lenient parsing.** Models don't reliably honour `required` in a tool schema —
Claude was observed returning 7 findings with no `summary` field on one run and
including it on the next, same input, no truncation. So `summary` is optional
and malformed findings are dropped individually rather than failing the batch.

**Deterministic consensus.** Grouping runs in plain code — category match plus
token overlap across titles and descriptions — not via another model call. It's
free, instant, and testable, and a wrong merge is worse than no merge because it
hides one issue behind another's title. It deliberately errs toward
over-splitting; a missed match just costs a duplicate row.

`src/lib/consensus.real.test.ts` runs against a captured real five-model run.
Synthetic fixtures made the clustering look considerably easier than it is.

Token overlap cannot see paraphrase, though, and that is a real ceiling: three
models describing one defect as "chain unrelated findings", "hide distinct
issues" and "join unrelated issues" share almost no vocabulary. Setting
`CONSENSUS_MERGE_MODEL` to a model slug adds an opt-in second pass that asks
that model to merge the groups lexical matching left split. It runs **once, at
submission**, and its answer is stored on the row — grouping is recomputed on
every page render, so a model call inside it would re-bill on each view. The
pass never fails a submission: on a timeout, a missing key, or a malformed
response it is skipped and the lexical grouping stands. Groups the pass
deliberately kept apart are not re-merged lexically afterwards, and **two groups
sharing a model are never merged** — a model that filed them as two findings is
telling you they are two issues, which is better evidence than another model's
grouping. On the captured 33-finding fixture it takes 12 groups to 9.

## Focused view

A review page defaults to a **focused view**: findings that more than one model
flagged, plus single-model security and high-severity findings. Everything else
— uncorroborated medium/low findings — is hidden behind a "Show all" toggle.

This exists for two reasons. Noise fatigue: a six-model run can return dozens
of findings, most of them one model's opinion on a style nit, and burying real
issues in that list trains people to stop reading review output at all. And the
popularity trap: agreement is a useful signal but not the only one worth
surfacing, so the focused view also keeps single-model **security** and
**high-severity** findings rather than filtering purely on vote count — see
`outlierSignal` in `src/lib/consensus.ts`, and the "single-model outlier" badge
it drives on the review page.

## Assumption and rationale

Two optional fields ride along on each finding, both filled in by the model,
both degrading to "not provided" rather than discarding the finding when a
model sends something unusable (see the lenient parsing note above):

- **`assumption`** — stated only when a finding depends on something the
  snippet can't show (a definition elsewhere, runtime config, how a caller
  behaves), so a finding that looks certain but is really conditional says so.
- **`rationale`** — one sentence naming the concrete evidence the model saw,
  shown behind a collapsed "Why flag this" disclosure under each finding. Meant
  to separate "I saw X on line N" from a title that just restates itself.

## Demonstrability

Agreement answers "did other models say this too", which is a weak signal when
models share training biases and converge on the same wrong answer. Setting
`REDTEAM_MODEL` to a model slug adds an opt-in pass that answers something
agreement cannot: **can the issue actually be shown?**

For each finding the focused view keeps, that model is asked to construct the
concrete exploit — the input, the call, the conditions, and what goes wrong.
Findings come back labeled **exploit demonstrated** or **not demonstrated**,
with the reasoning and any exploit behind a collapsed disclosure.

The pass is **static only**. The model is given no execution tool and is told it
cannot run anything, because a pasted snippet doesn't run standalone anyway.
It's also told that failing to construct an exploit is a valuable answer rather
than a failure — a finding nobody can demonstrate is worth knowing about. A
`demonstrated: true` that arrives with no actual exploit text is downgraded to
false: an unsubstantiated yes is precisely the confident-wrong answer this is
meant to catch.

**It annotates, never decides.** An undemonstrated finding keeps its place in
the list and, in the Action, cannot fail a build. Some real issues simply aren't
demonstrable from a snippet — treat it as a hint, not a verdict.

Cost scales with issues rather than submissions: only findings that already
survived the noise gate get a call, capped by `REDTEAM_MAX_FINDINGS` (10) and
limited to `REDTEAM_CATEGORIES` (`security,bug,reliability` — asking for an
exploit of a style nit bills real money for nonsense). A clean submission costs
nothing extra. Red-team calls are charged against the same rate-limit budget as
the reviewers; if the budget won't cover them the pass is skipped rather than
failing the submission. Like the consensus merge pass, it runs **once, at
submission**, and stores its verdicts on the row.

Verdicts are stored keyed by finding identity rather than by position, because
group order isn't guaranteed identical between the write and a later read.
Attaching an exploit to the wrong finding would discredit the whole signal, so a
key that no longer matches shows nothing at all — see `src/lib/redteam.ts`.

## Model quality

`/models` aggregates corroboration rate per model across recent submissions —
how often a given model's findings land in a group at least one other model
also flagged, versus standing alone. A persistently low rate is a prompt to go
look at that model's isolated findings, not a verdict by itself: single-model
findings are sometimes noise and sometimes the one catch nobody else made (see
Focused view above).

## Re-review delta tracking

"Re-review this code" on a review page links to `/submit?previous=<id>`,
which prefills the form from that submission and, on submit, links the new
submission back to it via `previousSubmissionId`. The new review page then
shows, per finding group, whether it's **new since last review** or
**persistent**, plus a collapsed "Fixed since last review" list of groups from
the previous run that nothing in the new run matched.

The matching is the same lexical, category-plus-token-overlap comparison
`groupFindings` uses internally (`diffGroups` in `src/lib/consensus.ts`), so it
inherits the same blind spot: a finding paraphrased differently between two
runs can fail to match its predecessor and get counted "new" even though
nothing regressed. That's the deliberately safe failure mode — over-reporting
"new" just means an extra look at something already fixed; wrongly calling a
real regression "persistent," or a real issue "fixed," would hide it.

## Diff submissions

The submit form has a "This is a unified diff" checkbox. Checked, the
submission is tagged `format: "diff"` end to end — the review page shows
"unified diff" instead of the language, and the prompt tells the model to treat
`+`/`-` lines as the change, surrounding context lines as context rather than
additional code to flag, and to cite line numbers from the new-file side of
each hunk.

## MCP server

`mcp-server/` packages the same multi-model review engine as a standalone MCP
tool (`review_code`) for any MCP-capable IDE or agent to call directly — see
[`mcp-server/README.md`](mcp-server/README.md) for setup and the tool's
input/output shape.

It's **bring-your-own-key**: the MCP server reads `OPENROUTER_API_KEY` from its
own process environment at call time. This web app's key is never involved —
the two are separate processes with separate credentials, so running the MCP
server costs nothing against this app's OpenRouter budget and vice versa.

## GitHub Action

`action/` runs the same engine on pull requests: it reviews the PR diff and
writes a job summary with agreement counts, optionally failing the run only
for corroborated high-severity findings. Also bring-your-own-key, via the
consuming repo's secrets — see [`action/README.md`](action/README.md) for
usage and [`docs/pr-action-design.md`](docs/pr-action-design.md) for the
design, including the parts not built yet (sticky-comment delta, inline
comments). This repo dogfoods it on its own PRs via
`.github/workflows/consensus-review.yml`.

## Review status

[`CODE_REVIEW.md`](CODE_REVIEW.md) tracks every known issue with its current
status, what was done, and what remains.

To re-audit, invoke the `more-eyes-review` skill in Claude Code. It
re-verifies each finding against the actual code rather than trusting the
document, sweeps for new issues, runs the suite and build for ground truth, and
updates the changelog. Report-only unless you ask it to fix things.

## Deploying

Built for a single always-on container rather than serverless, for two reasons:
a six-model review takes 27-90s, which exceeds typical serverless function
limits, and the rate limiter holds state in process memory — on serverless each
instance would keep its own copy of the budget.

`railway.json` configures the build, runs `prisma migrate deploy` on start, and
points the healthcheck at `/api/health`. That route is deliberately exempt from
the access gate: a gated healthcheck returns 401 and the platform marks every
deploy failed. It exposes no submission data, only whether the process and
database are reachable.

## Known limitations

- Shared-secret auth — no per-user identity or audit trail.
- Rate limiting is in-memory and per-process; it resets on restart and doesn't
  coordinate across instances.
- The per-client rate-limit key is an IP address from `X-Forwarded-For`, read
  from the right so a client cannot choose it. That assumes exactly
  `TRUSTED_PROXY_HOPS` proxies in front — set it wrong and the key is either
  client-controlled again or constant for everyone. The global ceiling bounds
  spend either way.
- `script-src` still allows `'unsafe-inline'` because Next inlines hydration
  scripts. Tightening it needs nonce plumbing through `proxy.ts`.
