import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CommandResult, CommonOptions, ReviewOutput, RunManifest } from "../types";
import { runCodexExec } from "../core/codexExec";
import { createManifest, saveManifest } from "../core/manifest";
import { loadPrompt, renderPrompt } from "../core/prompts";
import { reviewSchemaPath, assertReviewOutput } from "../core/schemas";
import { createRunDir, defaultCwdForFile, iterationDir, validateTargetFile } from "../core/paths";

export async function runReviewPass(params: {
  options: CommonOptions;
  targetFile: string;
  cwd: string;
  runDir: string;
  iteration: number;
  extraContext?: string;
}): Promise<{ output: ReviewOutput; responsePath: string; jsonPath: string; promptPath: string }> {
  const dir = await iterationDir(params.runDir, params.iteration);
  const planText = await readFile(params.targetFile, "utf8");
  const template = await loadPrompt("review.md");
  const prompt = renderPrompt(template, {
    TARGET_FILE: params.targetFile,
    CWD: params.cwd,
    PLAN_TEXT: planText,
    EXTRA_CONTEXT: params.extraContext ?? "None."
  });
  const promptPath = join(dir, "review.prompt.md");
  const lastMessagePath = join(dir, "review.last-message.json");
  const eventLogPath = join(dir, "review.events.jsonl");
  const responsePath = join(dir, "review.response.md");
  const jsonPath = join(dir, "review.json");
  await writeFile(promptPath, prompt, "utf8");
  const result = await runCodexExec({
    codexBin: params.options.codexBin,
    cwd: params.cwd,
    prompt,
    schemaPath: reviewSchemaPath,
    lastMessagePath,
    eventLogPath,
    sandbox: "read-only",
    model: params.options.model
  });
  if (result.exitCode !== 0) {
    throw new Error(`codex review failed with exit ${result.exitCode}: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.lastMessage) as unknown;
  assertReviewOutput(parsed);
  await writeFile(responsePath, parsed.markdown_response, "utf8");
  await writeFile(jsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return { output: parsed, responsePath, jsonPath, promptPath };
}

export async function reviewCommand(options: CommonOptions): Promise<CommandResult> {
  const targetFile = await validateTargetFile(options.file, options.allowAnyFile);
  const cwd = await defaultCwdForFile(targetFile, options.cwd);
  const { runDir, runId } = await createRunDir(targetFile, options.output);
  const manifest: RunManifest = createManifest({
    runId,
    runDir,
    targetFile,
    cwd,
    maxIterations: options.maxIterations,
    validateCmds: options.validateCmds,
    allowRelatedFiles: options.allowRelatedFiles,
    worktree: options.worktree
  });
  await saveManifest(manifest);
  const pass = await runReviewPass({ options, targetFile, cwd, runDir, iteration: 1 });
  manifest.status = "reviewed";
  manifest.endedAt = new Date().toISOString();
  manifest.iterations.push({
    number: 1,
    dir: join(runDir, "iteration-001"),
    reviewJson: pass.jsonPath,
    reviewResponse: pass.responsePath,
    clean: pass.output.findings.filter((finding) => finding.actionable).length === 0
  });
  manifest.unresolvedQuestions = pass.output.unresolved_questions;
  await saveManifest(manifest);
  if (!options.json) {
    console.log("\n--- review response ---\n");
    console.log(pass.output.markdown_response);
    console.log("\n--- end review response ---\n");
  }
  return { ok: true, runDir, message: `Review complete: ${runDir}` };
}
