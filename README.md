# code-review-app

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

Requires Node 22+.

```bash
npm install
cp .env.example .env
```

Then fill in `.env`:

| Variable | Required | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | **Yes** | [openrouter.ai/keys](https://openrouter.ai/keys). Powers every reviewer, Claude included. Set a spend limit on the key — one submission bills every selected model. |
| `APP_ACCESS_SECRET` | **Yes** | Gates the whole app. Generate with `openssl rand -hex 32`. Without it every route returns 503 — this looks like a broken app rather than a missing setting, so check it first when nothing loads. |
| `DATABASE_URL` | Yes | Defaults to `file:./dev.db`. |
| `ANTHROPIC_API_KEY` | No | Only needed if you repoint the Claude entry in `src/lib/models.ts` at the direct Anthropic API instead of OpenRouter. |
| `REVIEW_REQUEST_TIMEOUT_MS` | No | Per-attempt socket timeout. Default 45000. |
| `REVIEW_DEADLINE_MS` | No | Hard ceiling per model, retries included. Default 90000. |

Create the database, then start it:

```bash
npx prisma generate && npx prisma migrate deploy
npm run dev
```

Visit `http://localhost:3000/?secret=<your APP_ACCESS_SECRET>` once. That sets
an httpOnly cookie and every later visit works without the query string.

## Reviewers

Six models across six labs, all verified to support tool calling:

| Model | Lab |
|---|---|
| Claude Sonnet 5 | Anthropic |
| GPT-5.5 | OpenAI |
| Gemini 3.5 Flash | Google |
| Grok 4.5 | xAI |
| DeepSeek V3.1 | DeepSeek |
| Qwen3 Coder | Qwen |

Edit the list in `src/lib/models.ts`. Two things to know before adding one:

- **Confirm it reports `tools` support** at `https://openrouter.ai/api/v1/models`.
  Structured output depends on it.
- **Prefer multi-provider slugs.** A model served by a single provider returns a
  hard 404 if your account's data policy excludes that provider, with no
  fallback. This is exactly why the list uses `qwen/qwen3-coder` rather than
  `qwen/qwen3-coder-plus`, which only Alibaba serves. Check with
  `https://openrouter.ai/api/v1/models/<slug>/endpoints`.

## Commands

```bash
npm run dev            # development server
npm test               # vitest
npm run lint           # eslint
npm run build          # production build
npm run check:models   # verify the registry against OpenRouter's catalogue
```

CI runs typecheck, lint, tests, and build on every push and PR.

## How it works

```
src/
  app/
    page.tsx              submission history
    submit/               the form
    review/[id]/          consensus view + per-model summaries
    api/reviews/          POST fans out to models, GET lists
  lib/
    models.ts             the reviewer registry
    providers/            shared prompt + Anthropic and OpenRouter clients
    consensus.ts          groups findings that describe the same issue
    validation.ts         zod schemas for input and model output
    rate-limit.ts         budget of 30 model calls per minute per client
  middleware.ts           shared-secret gate
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

## Review status

[`CODE_REVIEW.md`](CODE_REVIEW.md) tracks every known issue with its current
status, what was done, and what remains.

To re-audit, invoke the `code-review-app-review` skill in Claude Code. It
re-verifies each finding against the actual code rather than trusting the
document, sweeps for new issues, runs the suite and build for ground truth, and
updates the changelog. Report-only unless you ask it to fix things.

## Known limitations

- Shared-secret auth — no per-user identity or audit trail.
- Rate limiting is in-memory and per-process; it resets on restart and doesn't
  coordinate across instances.
- `script-src` still allows `'unsafe-inline'` because Next inlines hydration
  scripts. Tightening it needs nonce plumbing through the middleware.
