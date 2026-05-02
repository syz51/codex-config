import type { CommandResult, CommonOptions } from "../types";
import { archiveRuns, selectRetentionTargets } from "../core/retention";

export async function archiveCommand(options: CommonOptions): Promise<CommandResult> {
  const targets = await selectRetentionTargets({ runId: options.run, olderThan: options.olderThan, keepLast: options.keepLast });
  const archived = await archiveRuns(targets, options.dryRun);
  return {
    ok: true,
    message: `${options.dryRun ? "Would archive" : "Archived"} ${archived.length} run(s).`,
    details: archived
  };
}
