import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CommandResult, CommonOptions, RunManifest } from "../types";
import { createManifest, saveManifest } from "../core/manifest";
import { createRunDir, defaultCwdForFile, iterationDir, validateTargetFile } from "../core/paths";
import { createLock, removeLock } from "../core/runLock";
import { runValidationCommands } from "../core/validation";
import { runCleanCheckPass } from "./cleanCheck";
import { runPatchPass } from "./patch";
import { runReviewPass } from "./review";

export async function iterateCommand(options: CommonOptions, existingManifest?: RunManifest): Promise<CommandResult> {
  const targetFile = existingManifest?.targetFile ?? await validateTargetFile(options.file, options.allowAnyFile);
  const cwd = existingManifest?.cwd ?? await defaultCwdForFile(targetFile, options.cwd);
  const runInfo = existingManifest ? { runDir: existingManifest.runDir, runId: existingManifest.runId } : await createRunDir(targetFile, options.output);
  const manifest = existingManifest ?? createManifest({
    runId: runInfo.runId,
    runDir: runInfo.runDir,
    targetFile,
    cwd,
    maxIterations: options.maxIterations,
    validateCmds: options.validateCmds,
    allowRelatedFiles: options.allowRelatedFiles,
    worktree: options.worktree
  });

  await saveManifest(manifest);
  await createLock(runInfo.runDir);
  let pendingValidationContext = manifest.lastValidation?.passed === false && manifest.lastValidation.log
    ? await readFile(manifest.lastValidation.log, "utf8").catch(() => "")
    : "";

  try {
    const start = manifest.iterations.length + 1;
    for (let iteration = start; iteration <= manifest.maxIterations; iteration++) {
      const iterDir = await iterationDir(runInfo.runDir, iteration);
      const record = { number: iteration, dir: iterDir };
      manifest.iterations.push(record);
      await saveManifest(manifest);

      const review = await runReviewPass({
        options,
        targetFile,
        cwd,
        runDir: runInfo.runDir,
        iteration,
        extraContext: pendingValidationContext ? `Previous validation failed:\n${pendingValidationContext}` : undefined
      });
      Object.assign(record, { reviewJson: review.jsonPath, reviewResponse: review.responsePath });
      manifest.unresolvedQuestions = review.output.unresolved_questions;
      await saveManifest(manifest);
      if (!options.json) {
        console.log(`\n=== iteration ${iteration} review ===\n`);
        console.log(review.output.markdown_response);
        console.log(`\n=== end iteration ${iteration} review ===\n`);
      }

      if (options.reviewOnly) {
        manifest.status = "reviewed";
        manifest.endedAt = new Date().toISOString();
        await saveManifest(manifest);
        return { ok: true, runDir: runInfo.runDir, message: `Review-only iteration complete: ${runInfo.runDir}` };
      }

      const clean = await runCleanCheckPass({
        options,
        targetFile,
        cwd,
        runDir: runInfo.runDir,
        iteration,
        reviewPath: review.responsePath,
        validationContext: pendingValidationContext || undefined
      });
      Object.assign(record, { cleanCheckJson: clean.jsonPath, clean: !clean.output.has_findings });
      manifest.lastCleanCheck = clean.output;
      await saveManifest(manifest);

      const validationBlocksCleanStop = pendingValidationContext.trim().length > 0;
      if (!clean.output.has_findings && !validationBlocksCleanStop) {
        manifest.status = "clean";
        manifest.endedAt = new Date().toISOString();
        await saveManifest(manifest);
        return { ok: true, runDir: runInfo.runDir, message: `No actionable findings remain after ${iteration} iteration(s).` };
      }

      const patch = await runPatchPass({
        options,
        targetFile,
        cwd,
        runDir: runInfo.runDir,
        iteration,
        findingsPath: review.responsePath,
        validationContext: pendingValidationContext || undefined
      });
      Object.assign(record, { patchJson: patch.jsonPath, patchResponse: patch.responsePath, patchDiff: patch.diffPath });
      manifest.unresolvedQuestions = patch.output.unresolved_questions;
      if (!options.json) {
        console.log(`\n=== iteration ${iteration} patch ===\n`);
        console.log(patch.output.markdown_response);
        console.log(`\n=== end iteration ${iteration} patch ===\n`);
      }
      pendingValidationContext = "";

      if (manifest.validateCmds.length > 0) {
        const validation = await runValidationCommands(manifest.validateCmds, cwd, iterDir);
        Object.assign(record, { validationLog: validation.logPath, validationPassed: validation.passed });
        manifest.lastValidation = { passed: validation.passed, log: validation.logPath };
        if (!validation.passed) {
          pendingValidationContext = await readFile(validation.logPath, "utf8");
        }
      } else {
        manifest.lastValidation = { passed: true };
      }
      await saveManifest(manifest);
    }

    manifest.status = "findings_remaining";
    manifest.endedAt = new Date().toISOString();
    await saveManifest(manifest);
    return { ok: false, runDir: runInfo.runDir, message: `Max iterations reached with findings remaining: ${runInfo.runDir}` };
  } catch (error) {
    manifest.status = "failed";
    manifest.endedAt = new Date().toISOString();
    const last = manifest.iterations[manifest.iterations.length - 1];
    if (last) last.error = error instanceof Error ? error.message : String(error);
    await saveManifest(manifest);
    throw error;
  } finally {
    await removeLock(runInfo.runDir);
  }
}
