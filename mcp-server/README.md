# code-review-consensus-mcp

A standalone MCP (Model Context Protocol) server that exposes the code-review-app's
multi-model review engine as a single tool: `review_code`. It runs a code
snippet past several LLMs in parallel via [OpenRouter](https://openrouter.ai)
and deterministically groups their findings into a consensus report — the
same engine the code-review-app web UI uses, repackaged for any MCP-capable
AI tool or IDE to call directly.

This is **bring-your-own-key (BYOK)**: the server reads `OPENROUTER_API_KEY`
from its own process environment at call time. Nothing is proxied through
code-review-app's infrastructure, and no key is bundled with the server.

## Setup

1. Get an OpenRouter API key at https://openrouter.ai/keys.
2. Set a spend limit on the key (OpenRouter supports per-key credit limits) —
   each `review_code` call fans out to up to 6 models in parallel, so cap
   what you're comfortable spending per run before wiring this into an
   agent that can call it repeatedly.
3. Build the server:

   ```bash
   cd mcp-server
   npm install
   npm run build
   ```

   This compiles `mcp-server/src` and the `src/lib` review engine it imports
   from the parent repo into `mcp-server/dist`. The entry point ends up at
   `mcp-server/dist/mcp-server/src/index.js` (see "Why the nested dist path"
   below) — `package.json`'s `bin` and `start` fields already point there.

## MCP client configuration

Point your MCP client at the built entry point, and set your key in the
server's own `env` block:

```json
{
  "mcpServers": {
    "code-review-consensus": {
      "command": "node",
      "args": ["<abs path>/mcp-server/dist/mcp-server/src/index.js"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-..."
      }
    }
  }
}
```

Replace `<abs path>` with the absolute path to this repo checkout.

### Running without building

For quick local testing you can skip the build step and run the TypeScript
source directly with `tsx` (available in the parent repo's `node_modules`):

```json
{
  "mcpServers": {
    "code-review-consensus": {
      "command": "npx",
      "args": ["tsx", "<abs path>/mcp-server/src/index.ts"],
      "env": {
        "OPENROUTER_API_KEY": "sk-or-..."
      }
    }
  }
}
```

or from a shell: `npx tsx mcp-server/src/index.ts`.

## The `review_code` tool

**Input:**

| field      | type       | required | notes |
|------------|------------|----------|-------|
| `code`     | string     | yes      | max 20,000 characters |
| `language` | string     | yes      | e.g. `"typescript"`, `"python"` |
| `context`  | string     | no       | what the code is for; used to build the review's title/description |
| `models`   | string[]   | no       | model ids to run; defaults to `["claude-sonnet-5", "gpt-5.5", "gemini-3.5-flash"]`; capped at 6 and deduped |

Valid model ids: `claude-sonnet-5`, `gpt-5.5`, `gemini-3.5-flash`, `grok-4.5`,
`deepseek-v3.1`, `qwen3-coder`. Passing an unknown id returns a tool error
listing the valid ones.

**Output:** structured JSON (as the tool's text content) shaped like:

```json
{
  "groups": [
    {
      "title": "Unhandled promise rejection in retry loop",
      "category": "reliability",
      "severity": "high",
      "models": ["claude-sonnet-5", "gpt-5.5"],
      "agreement": "2/3",
      "findings": [
        {
          "model": "claude-sonnet-5",
          "title": "...",
          "description": "...",
          "line": 42,
          "severity": "high",
          "file": "The repo-relative path this finding is about, or null — only models reviewing a multi-file unified diff set this.",
          "assumption": "A stated dependency on context the snippet couldn't show, or null when the model didn't give one.",
          "rationale": "One sentence of concrete evidence for the finding, or null when the model didn't give one."
        }
      ]
    }
  ],
  "summaries": [{ "model": "claude-sonnet-5", "summary": "..." }],
  "failures": [{ "model": "gemini-3.5-flash", "error": "..." }],
  "modelsRun": ["claude-sonnet-5", "gpt-5.5", "gemini-3.5-flash"]
}
```

If `OPENROUTER_API_KEY` is not set in the server's environment, the tool
returns a clear error telling the caller to set it in their MCP client's
server `env` config, instead of crashing.

## Why the nested dist path

This package has no source of its own beyond `src/index.ts` — the actual
review engine lives in the parent repo's `src/lib` (`models.ts`, `review.ts`,
`validation.ts`, `consensus.ts`, the provider clients) and is compiled
in-place rather than duplicated, so this server always tracks the same
review logic the web app uses. `tsconfig.json` sets `rootDir` to the repo
root so both `mcp-server/src` and `../src/lib` compile under one `tsc`
invocation with correct relative imports; TypeScript mirrors each file's
path under `rootDir` into `dist`, which is why the entry point lands at
`dist/mcp-server/src/index.js` rather than `dist/index.js`.
