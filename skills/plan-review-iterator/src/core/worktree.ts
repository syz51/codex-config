import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { gitRoot, runCommand } from "./git";

export interface WorktreeHandle {
  cwd: string;
  cleanup: () => Promise<void>;
}

export async function maybeCreateWorktree(cwd: string, enabled: boolean): Promise<WorktreeHandle> {
  if (!enabled) return { cwd, cleanup: async () => undefined };
  const root = await gitRoot(cwd);
  if (!root) throw new Error("--worktree requires a git repository");
  const parent = await mkdtemp(join(tmpdir(), "plan-review-iterator-"));
  const worktreeDir = join(parent, basename(root));
  const branch = `plan-review-iterator-${Date.now()}`;
  const result = await runCommand(["git", "-C", root, "worktree", "add", "-b", branch, worktreeDir, "HEAD"], root);
  if (result.exitCode !== 0) throw new Error(`Failed to create worktree: ${result.stderr || result.stdout}`);
  return {
    cwd: worktreeDir,
    cleanup: async () => {
      await runCommand(["git", "-C", root, "worktree", "remove", "--force", worktreeDir], root);
      await rm(parent, { recursive: true, force: true });
    }
  };
}
