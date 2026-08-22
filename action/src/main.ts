import * as core from "@actions/core";
import * as github from "@actions/github";
import { groupFindings, type FindingGroup, type ModelFinding } from "../../src/lib/consensus";
import {
  groupKey,
  keyMapFor,
  redTeamGroups,
  type RedTeamResult,
} from "../../src/lib/redteam";
import { reviewWithModels } from "../../src/lib/review";
import { chunkFiles, filterFiles, parseDiffFiles } from "./diff";
import { evaluateGate, renderSummary, type FailOnSeverity } from "./report";

function parseList(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function writeSkipSummary(reason: string): Promise<void> {
  core.info(`Review skipped: ${reason}`);
  await core.summary
    .addHeading("Code Review Consensus")
    .addRaw(`Review skipped: ${reason}.`)
    .write();
  core.setOutput("skipped", "true");
  core.setOutput("findings_count", "0");
}

export async function run(): Promise<void> {
  const apiKey = core.getInput("openrouter_api_key");

  // Secrets are absent on pull_request runs from forks — this is the
  // documented fork-PR path. Skip successfully; never fail the consumer's
  // CI over a missing key.
  if (!apiKey) {
    await writeSkipSummary("no key available (fork PR?)");
    return;
  }

  const context = github.context;
  const pullRequest = context.payload.pull_request;

  if (context.eventName !== "pull_request" || !pullRequest) {
    await writeSkipSummary(`event "${context.eventName}" is not a pull_request`);
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    await writeSkipSummary("GITHUB_TOKEN is not available");
    return;
  }

  // BYOK: the consumer's own key, read into the environment the shared
  // provider clients already expect (same contract as the MCP server).
  process.env.OPENROUTER_API_KEY = apiKey;

  const modelIds = parseList(core.getInput("models"));
  const maxChars = Number(core.getInput("max_chars")) || 30000;
  const include = parseList(core.getInput("include"));
  const exclude = parseList(core.getInput("exclude"));
  const failOnSeverity = (core.getInput("fail_on_severity") || "none") as FailOnSeverity;
  const minAgreement = Number(core.getInput("min_agreement")) || 2;

  // Read by the shared library from the environment, same contract as the key.
  const redteamModel = core.getInput("redteam_model").trim();
  if (redteamModel) process.env.REDTEAM_MODEL = redteamModel;
  const redteamCategories = core.getInput("redteam_categories").trim();
  if (redteamCategories) process.env.REDTEAM_CATEGORIES = redteamCategories;

  const octokit = github.getOctokit(token);
  const { owner, repo } = context.repo;
  const pull_number = pullRequest.number;

  let rawDiff: string;
  try {
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number,
      mediaType: { format: "diff" },
    });
    // Requesting the diff media type makes `data` a raw diff string, not the
    // typed pull-request object the client's types otherwise assume.
    rawDiff = response.data as unknown as string;
  } catch (err) {
    core.setFailed(`Failed to fetch PR diff: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const files = filterFiles(parseDiffFiles(rawDiff), include, exclude);
  const batches = chunkFiles(files, maxChars);

  core.info(
    `Reviewing ${files.length} files in ${batches.length} batch(es) with models: ${modelIds.join(", ")}`
  );

  const allGroups: FindingGroup[] = [];
  // Index-aligned with allGroups: both are appended together, per batch.
  const allRedTeam: (RedTeamResult | undefined)[] = [];

  for (const batch of batches) {
    const code = batch.join("\n\n");
    const reviews = await reviewWithModels(modelIds, {
      title: `PR #${pull_number}`,
      description: pullRequest.title || "Pull request review",
      language: "mixed",
      code,
      format: "diff",
    });

    for (const review of reviews) {
      if (review.status === "ok") {
        core.info(`${review.modelId}: ${review.result.findings.length} finding(s)`);
      } else {
        core.info(`${review.modelId}: failed - ${review.error}`);
      }
    }

    const modelFindings: ModelFinding[] = reviews
      .filter((r): r is Extract<typeof r, { status: "ok" }> => r.status === "ok")
      .flatMap((review) =>
        review.result.findings.map((finding) => ({ ...finding, model: review.modelId }))
      );

    const batchGroups = groupFindings(modelFindings);

    // Red-teamed here rather than after the loop: groups accumulate across
    // batches but each one describes its own batch's code, and an exploit built
    // against the wrong source would be nonsense. Returns null when the pass is
    // off, in which case every group in this batch simply has no verdict.
    const verdicts = await redTeamGroups(batchGroups, modelFindings, {
      code,
      language: "mixed",
      format: "diff",
    });

    const keyOf = keyMapFor(modelFindings);
    allGroups.push(...batchGroups);
    allRedTeam.push(
      ...batchGroups.map((group) => {
        if (!verdicts) return undefined;
        const key = groupKey(group, keyOf);
        return key ? verdicts.results[key] : undefined;
      })
    );
  }

  core.info(`Total: ${allGroups.length} grouped finding(s)`);

  await core.summary
    .addRaw(renderSummary(allGroups, modelIds.length, allRedTeam))
    .write();
  core.setOutput("findings_count", String(allGroups.length));
  core.setOutput("skipped", "false");

  const gate = evaluateGate(allGroups, { failOnSeverity, minAgreement });
  if (gate.shouldFail && gate.reason) {
    core.setFailed(gate.reason);
  }
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
