import type { CommandResult, CommonOptions } from "../types";
import { loadManifest } from "../core/manifest";

export async function statusCommand(options: CommonOptions): Promise<CommandResult> {
  if (!options.run) throw new Error("Missing required --run");
  const manifest = await loadManifest(options.run);
  const lastIteration = manifest.iterations[manifest.iterations.length - 1];
  const details = {
    targetFile: manifest.targetFile,
    cwd: manifest.cwd,
    startedAt: manifest.startedAt,
    endedAt: manifest.endedAt,
    status: manifest.status,
    currentIteration: lastIteration?.number ?? 0,
    lastCleanCheck: manifest.lastCleanCheck,
    lastValidation: manifest.lastValidation,
    artifacts: {
      runDir: manifest.runDir,
      lastIterationDir: lastIteration?.dir
    }
  };
  return { ok: manifest.status === "clean" || manifest.status === "reviewed", runDir: manifest.runDir, message: `Run ${manifest.status}: ${manifest.runDir}`, details };
}
