# Code Review Consensus Action

A GitHub Action that reviews a pull request's diff with multiple LLMs via
[OpenRouter](https://openrouter.ai) and reports grouped findings with
agreement counts — the same consensus engine the code-review-app web UI and
`mcp-server` use, in CI.

**Bring-your-own-key (BYOK):** the consuming repo sets `OPENROUTER_API_KEY`
in its own secrets. Nothing runs on a hosted key, and there is no hosted
component at all — the Action runs entirely in your runner.

## Status

Walking skeleton (M2 of the design in `../docs/pr-action-design.md`): fetch
the PR diff, filter/chunk it, run the consensus review, and write a job
summary. Gating (`fail_on_severity` / `min_agreement`) is implemented.
**Sticky PR comments and inline review comments are not built yet** — that's
M3. `comment_mode` is accepted as an input for forward compatibility but has
no effect yet; every run writes to the job summary only.

## Usage

```yaml
name: Consensus Review

on:
  pull_request:

permissions:
  contents: read

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: code-review-app/action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          openrouter_api_key: ${{ secrets.OPENROUTER_API_KEY }}
```

`GITHUB_TOKEN` is read from the environment (not a declared input) — the
Action uses it via Octokit to fetch the PR diff, so the step must pass it
through `env:` as shown above.

## Inputs

| input | default | notes |
|---|---|---|
| `openrouter_api_key` | *(none)* | Your own OpenRouter key, from a repo secret. Leave unset on fork PRs — see below. |
| `models` | `claude-sonnet-5,gpt-5.5,gemini-3.5-flash` | Comma-separated model ids. |
| `max_chars` | `30000` | Per-batch character budget for diff chunking. |
| `include` | *(empty = all files)* | Comma-separated glob(s) of files to review. |
| `exclude` | `package-lock.json,*.lock,dist/**,*.min.*,vendor/**,vendored/**,node_modules/**` | Comma-separated glob(s) of files to skip. |
| `comment_mode` | `both` | `summary` \| `inline` \| `both`. Reserved for M3 — no effect yet. |
| `fail_on_severity` | `none` | `none` \| `high` \| `medium`. The run is advisory (never fails) by default. |
| `min_agreement` | `2` | How many models must independently agree before a finding can fail the run. A single-model finding never breaks the build, however severe — it's surfaced and labeled instead. |
| `redteam_model` | *(empty = off)* | Model id that attempts a concrete exploit per reported finding, labeling it demonstrated or not. Costs one extra call per reported finding. Never fails the run — see below. |
| `redteam_categories` | `security,bug,reliability` | Which categories are worth an exploit attempt. Widening to `performance,style` mostly buys calls with no exploit to find. |

### Demonstrability

With `redteam_model` set, each reported finding gets one adversarial follow-up
call asking for the concrete exploit — the input, the call, what goes wrong. The
job summary then labels findings **exploit demonstrated** or **not
demonstrated**, with the reasoning in a collapsed block.

It is **static analysis only**: the model gets no execution tool and nothing is
ever run in your runner. And it is **advisory** — `evaluateGate` ignores
demonstrability entirely, so an undemonstrated finding can't fail a build and a
demonstrated one can't newly break it. A model failing to write an exploit is a
hint the finding may be a false positive, not proof of one.

## Outputs

| output | notes |
|---|---|
| `findings_count` | Total number of grouped findings reported. |
| `skipped` | `"true"` when the review was skipped — no key available, or the triggering event isn't a pull request. |

## BYOK

Same model as `mcp-server`: this Action never touches a key that isn't
yours. Set a spend limit on the OpenRouter key you use here — every push to
every reviewed PR re-runs the full filtered diff through every configured
model.

## Fork PRs and missing keys

Repository secrets are not forwarded to `pull_request` workflow runs
triggered from a fork — that's a GitHub security boundary, not something
this Action can bypass. When `openrouter_api_key` comes through empty, the
Action **exits successfully** (`skipped: "true"`) with a note in the job
summary instead of failing the run. Point your workflow's `openrouter_api_key`
straight at your secret, as in the example above — no conditional guard
needed; the Action already handles the fork case gracefully.
