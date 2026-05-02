import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CleanCheckOutput, CommandResult, CommonOptions } from "../types";
import { runCodexExec } from "../core/codexExec";
import { loadPrompt, renderPrompt } from "../core/prompts";
import { assertCleanCheckOutput, cleanCheckSchemaPath } from "../core/schemas";
import { createRunDir, defaultCwdForFile, iterationDir, validateTargetFile } from "../core/paths";
import { createManifest, saveManifest } from "../core/manifest";

export async function runCleanCheckPass(params: {
  options: CommonOptions;
  targetFile: string;
  cwd: string;
  runDir: string;
  iteration: number;
  reviewPath: string;
  validationContext?: string;
}): Promise<{ output: CleanCheckOutput; jsonPath: string; responsePath: string; promptPath: string }> {
  const dir = await iterationDir(params.runDir, params.iteration);
  const [planText, reviewText, template] = await Promise.all([
    readFile(params.targetFile, "utf8"),
    readFile(params.reviewPath, "utf8"),
    loadPrompt("clean-check.md")
  ]);
  const prompt = renderPrompt(template, {
    TARGET_FILE: params.targetFile,
    CWD: params.cwd,
    PLAN_TEXT: planText,
    REVIEW_TEXT: reviewText,
    VALIDATION_CONTEXT: params.validationContext ?? "None."
  });
  const promptPath = join(dir, "clean-check.prompt.md");
  const lastMessagePath = join(dir, "clean-check.last-message.json");
  const eventLogPath = join(dir, "clean-check.events.jsonl");
  const responsePath = join(dir, "clean-check.response.md");
  const jsonPath = join(dir, "clean-check.json");
  await writeFile(promptPath, prompt, "utf8");
  const result = await runCodexExec({
    codexBin: params.options.codexBin,
    cwd: params.cwd,
    prompt,
    schemaPath: cleanCheckSchemaPath,
    lastMessagePath,
    eventLogPath,
    sandbox: "read-only",
    model: params.options.model
  });
  if (result.exitCode !== 0) throw new Error(`codex clean-check failed with exit ${result.exitCode}: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.lastMessage) as unknown;
  assertCleanCheckOutput(parsed);
  await writeFile(responsePath, JSON.stringify(parsed, null, 2), "utf8");
  await writeFile(jsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return { output: parsed, jsonPath, responsePath, promptPath };
}

export async function cleanCheckCommand(options: CommonOptions): Promise<CommandResult> {
  const targetFile = await validateTargetFile(options.file, options.allowAnyFile);
  if (!options.review) throw new Error("Missing required --review");
  const cwd = await defaultCwdForFile(targetFile, options.cwd);
  const { runDir, runId } = await createRunDir(targetFile, options.output);
  const manifest = createManifest({
    runId,
    runDir,
    targetFile,
    cwd,
    maxIterations: options.maxIterations,
    validateCmds: options.validateCmds,
    allowRelatedFiles: options.allowRelatedFiles,
    worktree: options.worktree
  });
  const pass = await runCleanCheckPass({ options, targetFile, cwd, runDir, iteration: 1, reviewPath: resolve(options.review) });
  manifest.status = pass.output.has_findings ? "findings_remaining" : "clean";
  manifest.endedAt = new Date().toISOString();
  manifest.lastCleanCheck = pass.output;
  manifest.iterations.push({ number: 1, dir: join(runDir, "iteration-001"), cleanCheckJson: pass.jsonPath, clean: !pass.output.has_findings });
  await saveManifest(manifest);
  return { ok: !pass.output.has_findings, runDir, message: pass.output.reason, details: pass.output };
}
