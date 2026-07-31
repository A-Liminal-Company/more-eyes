#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { MAX_MODELS_PER_SUBMISSION, MODELS } from "../../src/lib/models";
import { reviewWithModels, type ModelReview } from "../../src/lib/review";
import { groupFindings, type ModelFinding } from "../../src/lib/consensus";

const DEFAULT_MODEL_IDS = ["claude-sonnet-5", "gpt-5.5", "gemini-3.5-flash"];
const VALID_MODEL_IDS = new Set(MODELS.map((m) => m.id));

const server = new McpServer({
  name: "code-review-consensus-mcp",
  version: "0.1.0",
});

server.registerTool(
  "review_code",
  {
    title: "Review code with multiple LLMs",
    description:
      "Runs a code snippet past several LLMs in parallel via OpenRouter and " +
      "deterministically groups their findings into a consensus report. " +
      "Requires the caller's own OPENROUTER_API_KEY to be set in the MCP " +
      "server's environment (bring-your-own-key).",
    inputSchema: {
      code: z
        .string()
        .min(1, "code is required")
        .max(20000, "code must be 20000 characters or fewer"),
      language: z.string().min(1, "language is required"),
      context: z
        .string()
        .optional()
        .describe("What the code is for — used as review context."),
      models: z
        .array(z.string())
        .optional()
        .describe(
          `Model ids to run. Valid ids: ${MODELS.map((m) => m.id).join(", ")}. ` +
            `Defaults to ${DEFAULT_MODEL_IDS.join(", ")} when omitted. ` +
            `Capped at ${MAX_MODELS_PER_SUBMISSION} and deduped.`
        ),
    },
  },
  async ({ code, language, context, models }) => {
    if (!process.env.OPENROUTER_API_KEY) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text:
              "OPENROUTER_API_KEY is not set. This server is bring-your-own-key: " +
              "set OPENROUTER_API_KEY in the MCP client's server env config " +
              '(e.g. `"env": { "OPENROUTER_API_KEY": "sk-or-..." }`) and restart the server.',
          },
        ],
      };
    }

    const requestedIds = models && models.length > 0 ? models : DEFAULT_MODEL_IDS;
    const dedupedIds = [...new Set(requestedIds)];

    const unknown = dedupedIds.filter((id) => !VALID_MODEL_IDS.has(id));
    if (unknown.length > 0) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text:
              `Unknown model id(s): ${unknown.join(", ")}. ` +
              `Valid ids are: ${MODELS.map((m) => m.id).join(", ")}.`,
          },
        ],
      };
    }

    const modelIds = dedupedIds.slice(0, MAX_MODELS_PER_SUBMISSION);

    const title = (context ?? "MCP review request").slice(0, 60);
    const description = context ?? "Code submitted for review via MCP";

    let reviews: ModelReview[];
    try {
      reviews = await reviewWithModels(modelIds, {
        title,
        description,
        language,
        code,
      });
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Review failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }

    const okReviews = reviews.filter(
      (r): r is Extract<ModelReview, { status: "ok" }> => r.status === "ok"
    );
    const failedReviews = reviews.filter(
      (r): r is Extract<ModelReview, { status: "failed" }> => r.status === "failed"
    );

    const modelFindings: ModelFinding[] = okReviews.flatMap((review) =>
      review.result.findings.map((finding) => ({
        ...finding,
        model: review.modelId,
      }))
    );

    const groups = groupFindings(modelFindings);
    const okCount = okReviews.length;

    const payload = {
      groups: groups.map((group) => ({
        title: group.title,
        category: group.category,
        severity: group.severity,
        models: group.models,
        agreement: `${group.models.length}/${okCount}`,
        findings: group.findings.map((finding) => ({
          model: finding.model,
          title: finding.title,
          description: finding.description,
          line: finding.line ?? null,
          severity: finding.severity,
          file: finding.file ?? null,
          assumption: finding.assumption ?? null,
          rationale: finding.rationale ?? null,
        })),
      })),
      summaries: okReviews.map((review) => ({
        model: review.modelId,
        summary: review.result.summary,
      })),
      failures: failedReviews.map((review) => ({
        model: review.modelId,
        error: review.error,
      })),
      modelsRun: modelIds,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(payload, null, 2),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[code-review-consensus-mcp] fatal error:", err);
  process.exit(1);
});
