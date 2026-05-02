import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { CommandResult, CommonOptions, PatchOutput } from "../types";
import { runCodexExec } from "../core/codexExec";
import { diffForFile, isTargetDirty, newChangedFiles, relativeToGit, statusPorcelain } from "../core/git";
import { createManifest, saveManifest } from "../core/manifest";
import { loadPrompt, renderPrompt } from "../core/prompts";
import { assertPatchOutput, patchSchemaPath } from "../core/schemas";
import { createRunDir, defaultCwdForFile, iterationDir, validateTargetFile } from "../core/paths";

export async function runPatchPass(params: {
  options: CommonOptions;
  targetFile: string;
  cwd: string;
  runDir: string;
  iteration: number;
  findingsPath: string;
  validationContext?: string;
}): Promise<{ output: PatchOutput; responsePath: string; jsonPath: string; diffPath: string; promptPath: string; changedFiles: string[]; changedTarget: boolean }> {
  if (!params.options.allowDirty && await isTargetDirty(params.targetFile, params.cwd)) {
    throw new Error(`Refusing to patch dirty target file without --allow-dirty: ${params.targetFile}`);
  }
  const beforeTarget = await readFile(params.targetFile, "utf8");
  const beforeStatus = await statusPorcelain(params.cwd);
  const dir = await iterationDir(params.runDir, params.iteration);
  const [planText, findingsText, patchTemplate, repairTemplate] = await Promise.all([
    readFile(params.targetFile, "utf8"),
    readFile(params.findingsPath, "utf8"),
    loadPrompt("patch.md"),
    loadPrompt("validation-repair.md")
  ]);
  const validationRepair = params.validationContext
    ? renderPrompt(repairTemplate, { VALIDATION_CONTEXT: params.validationContext })
    : "No prior validation failure.";
  const prompt = renderPrompt(patchTemplate, {
    TARGET_FILE: params.targetFile,
    CWD: params.cwd,
    PLAN_TEXT: planText,
    FINDINGS_TEXT: findingsText,
    VALIDATION_REPAIR: validationRepair,
    RELATED_FILE_POLICY: params.options.allowRelatedFiles
      ? "Related files may be edited only when the finding cannot be resolved safely in the target plan file."
      : "Edit only the target plan file. Do not edit any other file."
  });
  const promptPath = join(dir, "patch.prompt.md");
  const lastMessagePath = join(dir, "patch.last-message.json");
  const eventLogPath = join(dir, "patch.events.jsonl");
  const responsePath = join(dir, "patch.response.md");
  const jsonPath = join(dir, "patch.json");
  const diffPath = join(dir, "patch.diff");
  await writeFile(promptPath, prompt, "utf8");
  const result = await runCodexExec({
    codexBin: params.options.codexBin,
    cwd: dirname(params.targetFile),
    prompt,
    schemaPath: patchSchemaPath,
    lastMessagePath,
    eventLogPath,
    sandbox: "workspace-write",
    model: params.options.model
  });
  if (result.exitCode !== 0) throw new Error(`codex patch failed with exit ${result.exitCode}: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(result.lastMessage) as unknown;
  assertPatchOutput(parsed);
  const diff = await diffForFile(params.targetFile, params.cwd);
  await writeFile(diffPath, diff, "utf8");
  await writeFile(responsePath, parsed.markdown_response, "utf8");
  await writeFile(jsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  const changedFiles = await newChangedFiles(beforeStatus, await statusPorcelain(params.cwd));
  const changedTarget = beforeTarget !== await readFile(params.targetFile, "utf8");
  if (!changedTarget && parsed.resolved_findings.length === 0 && parsed.rejected_findings.length === 0) {
    throw new Error("Patch pass changed nothing and resolved/rejected no findings.");
  }
  if (!params.options.allowRelatedFiles) {
    const rel = await relativeToGit(params.targetFile, params.cwd);
    if (rel) {
      const outside = changedFiles.filter((file) => file !== rel.relativeFile);
      if (outside.length > 0) {
        throw new Error(`Patch touched files outside target: ${outside.join(", ")}`);
      }
    }
  }
  return { output: parsed, responsePath, jsonPath, diffPath, promptPath, changedFiles, changedTarget };
}

export async function patchCommand(options: CommonOptions): Promise<CommandResult> {
  const targetFile = await validateTargetFile(options.file, options.allowAnyFile);
  if (!options.findings) throw new Error("Missing required --findings");
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
  await saveManifest(manifest);
  const pass = await runPatchPass({ options, targetFile, cwd, runDir, iteration: 1, findingsPath: resolve(options.findings) });
  manifest.status = "running";
  manifest.endedAt = new Date().toISOString();
  manifest.iterations.push({
    number: 1,
    dir: join(runDir, "iteration-001"),
    patchJson: pass.jsonPath,
    patchResponse: pass.responsePath,
    patchDiff: pass.diffPath
  });
  manifest.unresolvedQuestions = pass.output.unresolved_questions;
  await saveManifest(manifest);
  if (!options.json) {
    console.log("\n--- patch response ---\n");
    console.log(pass.output.markdown_response);
    console.log("\n--- end patch response ---\n");
  }
  return { ok: true, runDir, message: `Patch complete: ${runDir}` };
}
