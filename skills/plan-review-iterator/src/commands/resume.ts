import type { CommandResult, CommonOptions } from "../types";
import { loadManifest } from "../core/manifest";
import { assertNoLock } from "../core/runLock";
import { iterateCommand } from "./iterate";

export async function resumeCommand(options: CommonOptions): Promise<CommandResult> {
  if (!options.run) throw new Error("Missing required --run");
  await assertNoLock(options.run, options.force);
  const manifest = await loadManifest(options.run);
  const merged = {
    ...options,
    file: manifest.targetFile,
    cwd: manifest.cwd,
    maxIterations: options.maxIterations || manifest.maxIterations,
    validateCmds: options.validateCmds.length > 0 ? options.validateCmds : manifest.validateCmds,
    allowRelatedFiles: options.allowRelatedFiles || manifest.allowRelatedFiles,
    worktree: options.worktree || manifest.worktree
  };
  return iterateCommand(merged, manifest);
}
