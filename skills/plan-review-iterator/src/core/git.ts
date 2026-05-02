import { relative, resolve } from "node:path";

export interface CommandOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runCommand(cmd: string[], cwd: string): Promise<CommandOutput> {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  return { exitCode, stdout, stderr };
}

export async function gitRoot(cwd: string): Promise<string | null> {
  const result = await runCommand(["git", "rev-parse", "--show-toplevel"], cwd);
  if (result.exitCode !== 0) return null;
  return result.stdout.trim() || null;
}

export async function isInsideGit(cwd: string): Promise<boolean> {
  return (await gitRoot(cwd)) !== null;
}

export async function relativeToGit(file: string, cwd: string): Promise<{ root: string; relativeFile: string } | null> {
  const root = await gitRoot(cwd);
  if (!root) return null;
  return { root, relativeFile: relative(root, resolve(file)) };
}

export async function isTargetDirty(file: string, cwd: string): Promise<boolean> {
  const rel = await relativeToGit(file, cwd);
  if (!rel) return false;
  const result = await runCommand(["git", "-C", rel.root, "status", "--porcelain", "--", rel.relativeFile], rel.root);
  return result.stdout.trim().length > 0;
}

export async function diffForFile(file: string, cwd: string): Promise<string> {
  const rel = await relativeToGit(file, cwd);
  if (!rel) return "";
  const result = await runCommand(["git", "-C", rel.root, "diff", "--", rel.relativeFile], rel.root);
  return result.stdout;
}

export async function statusPorcelain(cwd: string): Promise<string[]> {
  const root = await gitRoot(cwd);
  if (!root) return [];
  const result = await runCommand(["git", "-C", root, "status", "--porcelain"], root);
  return result.stdout.split("\n").map((line) => line.trimEnd()).filter(Boolean);
}

export function changedStatusDelta(before: string[], after: string[]): string[] {
  const beforeSet = new Set(before);
  return after.filter((line) => !beforeSet.has(line));
}

export function statusLinePath(line: string): string {
  const path = line.slice(3).trim();
  const rename = path.split(" -> ");
  return rename[rename.length - 1] ?? path;
}

export async function newChangedFiles(before: string[], after: string[]): Promise<string[]> {
  return changedStatusDelta(before, after).map(statusLinePath);
}
