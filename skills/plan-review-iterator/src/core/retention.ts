import { readdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { ARCHIVES_DIR, RUNS_DIR } from "./config";
import { assertInside, ensureDir, exists, listRunDirs, removeDirInside } from "./paths";
import { runCommand } from "./git";

export function parseDurationMs(input: string): number {
  const match = /^(\d+)([dhm])$/.exec(input.trim());
  if (!match) throw new Error(`Invalid duration: ${input}. Use forms like 30d, 12h, or 45m.`);
  const value = Number(match[1]);
  const unit = match[2];
  if (unit === "d") return value * 24 * 60 * 60 * 1000;
  if (unit === "h") return value * 60 * 60 * 1000;
  return value * 60 * 1000;
}

export interface RetentionCandidate {
  path: string;
  id: string;
  mtimeMs: number;
  active: boolean;
}

export async function getRunCandidates(): Promise<RetentionCandidate[]> {
  const dirs = await listRunDirs();
  const candidates = await Promise.all(dirs.map(async (path) => {
    await assertInside(RUNS_DIR, path);
    const info = await stat(path);
    return { path, id: basename(path), mtimeMs: info.mtimeMs, active: await exists(join(path, ".active.lock")) };
  }));
  return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

export async function selectRetentionTargets(options: { runId?: string; olderThan: string; keepLast: number }): Promise<RetentionCandidate[]> {
  const candidates = await getRunCandidates();
  if (options.runId) {
    const target = candidates.find((candidate) => candidate.id === options.runId || candidate.path === options.runId);
    if (!target) throw new Error(`Run not found: ${options.runId}`);
    return target.active ? [] : [target];
  }
  const cutoff = Date.now() - parseDurationMs(options.olderThan);
  const keep = new Set(candidates.slice(0, Math.max(0, options.keepLast)).map((candidate) => candidate.path));
  return candidates.filter((candidate) => !candidate.active && !keep.has(candidate.path) && candidate.mtimeMs < cutoff);
}

export async function deleteRuns(targets: RetentionCandidate[]): Promise<void> {
  for (const target of targets) {
    await removeDirInside(RUNS_DIR, target.path);
  }
}

async function hashFile(path: string): Promise<string> {
  const hasher = createHash("sha256");
  hasher.update(Buffer.from(await Bun.file(path).arrayBuffer()));
  return hasher.digest("hex");
}

async function collectFiles(root: string): Promise<Array<{ path: string; sha256: string }>> {
  const output: Array<{ path: string; sha256: string }> = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      if (entry.isFile()) output.push({ path, sha256: await hashFile(path) });
    }
  }
  await walk(root);
  return output;
}

export async function archiveRuns(targets: RetentionCandidate[], dryRun: boolean): Promise<Array<{ runId: string; archivePath: string }>> {
  await ensureDir(ARCHIVES_DIR);
  const archived: Array<{ runId: string; archivePath: string }> = [];
  for (const target of targets) {
    await assertInside(RUNS_DIR, target.path);
    const archivePath = join(ARCHIVES_DIR, `${target.id}.zip`);
    archived.push({ runId: target.id, archivePath });
    if (dryRun) continue;
    const manifest = {
      runId: target.id,
      archivedAt: new Date().toISOString(),
      files: await collectFiles(target.path)
    };
    await writeFile(join(target.path, "archive-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const result = await runCommand(["zip", "-qr", archivePath, target.id], RUNS_DIR);
    if (result.exitCode !== 0) throw new Error(`zip failed for ${target.id}: ${result.stderr || result.stdout}`);
    await removeDirInside(RUNS_DIR, target.path);
  }
  return archived;
}
