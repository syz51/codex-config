import type { CommandResult, CommonOptions } from "../types";
import { deleteRuns, selectRetentionTargets } from "../core/retention";

export async function cleanupCommand(options: CommonOptions): Promise<CommandResult> {
  const targets = await selectRetentionTargets({ runId: options.run, olderThan: options.olderThan, keepLast: options.keepLast });
  if (!options.dryRun) await deleteRuns(targets);
  return {
    ok: true,
    message: `${options.dryRun ? "Would delete" : "Deleted"} ${targets.length} run(s).`,
    details: targets.map((target) => ({ id: target.id, path: target.path, active: target.active }))
  };
}
