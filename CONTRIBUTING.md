# Contributing

Thanks for looking. This is a small project with opinions, and most of them came from
something going wrong. This file is about the opinions — for setup, environment
variables, and what the thing does, read the [README](README.md) first.

## Getting it running

Everything you need is in the README's [Setup](README.md#setup) section. The short
version: Node 22+, a Postgres you point `DATABASE_URL` at, an `APP_ACCESS_SECRET` you
generate, and **your own** OpenRouter key.

That last one matters. This project is bring-your-own-key throughout — no key ships with
it, and nothing here ever runs on the maintainer's account. One submission bills every
model you select, so set a spend limit on your key before you start poking at it.

```bash
npm install
cp .env.example .env      # then fill it in
createdb code_review_dev
npx prisma generate && npx prisma migrate deploy
npm run dev
```

## Before you open a PR

```bash
npm test          # vitest
npm run lint      # eslint
npm run build     # next build
npx tsc --noEmit  # and the same in action/ and mcp-server/
```

CI runs all of it. Your PR also gets reviewed by this project's own GitHub Action, which
is either useful or funny depending on the day.

**If you are working from a fork, that review will skip itself.** Secrets are not
forwarded to fork PRs, so the Action detects the missing key and exits successfully
rather than failing your build. That is deliberate, not a bug you need to fix.

## Invariants worth knowing before you change things

These are the load-bearing decisions. Breaking one is fine if you have a reason, but say
so in the PR, because each of these exists because the alternative bit us.

**Grouping stays deterministic.** `groupFindings` in `src/lib/consensus.ts` is plain code
— category match plus token overlap — and it runs on every page render. A model call in
that path would re-bill on every page view and make renders non-deterministic. Anything
that costs money happens once, at submission, and gets persisted.

**Over-splitting is the safe failure mode.** A missed match shows two similar findings,
which is merely redundant. A bad merge hides one real issue behind another's title. When
you are tuning thresholds, err toward splitting.

**Parsing is deliberately lenient.** Models do not reliably honour `required` in a tool
schema. We have observed a model return seven findings with no `summary`, and return
`findings` as a JSON-encoded string instead of an array, on the same input, with no
truncation. Every field degrades independently rather than failing the batch. Do not
tighten this into a strict parse.

**Partial failure is a feature.** Models run in parallel and each result is stored
separately. One provider failing must never discard the reviews that succeeded.

**Optional passes must never fail a submission.** The consensus merge pass and the
red-team pass are both opt-in enhancements over something that already works. Both return
null on any failure — a timeout, a missing key, a malformed response — and the submission
proceeds without them. If you add a third such pass, hold the same contract.

**Findings have no database identity.** They live inside a `Review.findings` JSON column
and are identified by `<model>#<index>` keys. Anything that attaches data to a finding
must key on that identity, never on array position. Group order is not stable between a
write and a later read, and a positional array eventually shows one finding's data under
another.

## Testing

Tests sit next to the code as `*.test.ts`. `src/lib/consensus.real.test.ts` runs against a
captured real five-model run, which is worth knowing about: synthetic fixtures made the
clustering look considerably easier than it actually is.

**Verify UI changes in a browser, not only in tests.** This is not boilerplate advice. The
red-team feature once shipped with 231 passing tests while rendering nothing at all —
verdicts computed correctly, stored correctly, and vanished silently on the page because a
lookup keyed on object identity missed. No test caught it and no error was logged. If your
change spans storage and rendering, load the page.

## Adding a model

Edit `src/lib/models.ts`, then:

1. **Confirm it supports tool calling** at `https://openrouter.ai/api/v1/models`. Structured output depends on it.
2. **Prefer a multi-provider slug.** A model served by a single provider returns a hard 404 if your account's data policy excludes that provider, with no fallback. This is why the list uses `qwen/qwen3-coder` rather than `qwen/qwen3-coder-plus`. Check with `https://openrouter.ai/api/v1/models/<slug>/endpoints`.
3. Run `npm run check:models` to verify the registry against the live catalogue.

Diversity across labs is the point — models share blind spots with their own family, so a
second opinion from the same lab is worth less than it looks.

## Security

Do not commit keys. `.env` is gitignored; `.env.example` is the file to update when you
add a variable.

If you find a vulnerability, please open a private security advisory on the repository
rather than a public issue.

One thing to be aware of if you deploy this: the red-team pass generates working exploit
descriptions. A public instance with a weak or missing `APP_ACCESS_SECRET` is not just a
leaky review tool, it is an exploit-generation service pointed at whatever people paste
into it. Set the secret.

## Style

Match the surrounding code. Comments here tend to explain *why* rather than *what*,
especially where a decision looks odd — most of the odd-looking ones are load-bearing.
If you find a comment that is wrong, fixing it is a welcome PR on its own.
