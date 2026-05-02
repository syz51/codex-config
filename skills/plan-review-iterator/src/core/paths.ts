import { mkdir, realpath, stat, lstat, rm, readdir } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { ARCHIVES_DIR, RUNS_DIR } from "./config";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function timestampId(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

export function safeName(input: string): string {
  return input
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "plan";
}

export async function createRunDir(file: string, output?: string): Promise<{ runDir: string; runId: string }> {
  if (output) {
    const runDir = resolve(output);
    await ensureDir(runDir);
    return { runDir, runId: basename(runDir) };
  }
  await ensureDir(RUNS_DIR);
  const runId = `${timestampId()}-${safeName(basename(file))}`;
  const runDir = join(RUNS_DIR, runId);
  await ensureDir(runDir);
  return { runDir, runId };
}

export async function iterationDir(runDir: string, iteration: number): Promise<string> {
  const dir = join(runDir, `iteration-${String(iteration).padStart(3, "0")}`);
  await ensureDir(dir);
  return dir;
}

export async function validateTargetFile(file: string | undefined, allowAnyFile: boolean): Promise<string> {
  if (!file) throw new Error("Missing required --file");
  const resolved = resolve(file);
  const info = await stat(resolved).catch(() => null);
  if (!info) throw new Error(`Target file does not exist: ${resolved}`);
  if (!info.isFile()) throw new Error(`Target is not a file: ${resolved}`);
  const linkInfo = await lstat(resolved);
  if (linkInfo.isSymbolicLink()) throw new Error(`Refusing symlink target file: ${resolved}`);
  if (!allowAnyFile && ![".md", ".markdown"].includes(extname(resolved).toLowerCase())) {
    throw new Error(`Refusing non-Markdown file without --allow-any-file: ${resolved}`);
  }
  return resolved;
}

export async function assertInside(parent: string, child: string): Promise<void> {
  const parentReal = await realpath(parent);
  const childReal = await realpath(child).catch(() => resolve(child));
  const rel = relative(parentReal, childReal);
  if (rel === "" || (!rel.startsWith("..") && !rel.startsWith("/") && rel !== "..")) return;
  throw new Error(`Refusing path outside ${parentReal}: ${childReal}`);
}

export async function removeDirInside(parent: string, target: string): Promise<void> {
  await assertInside(parent, target);
  await rm(target, { recursive: true, force: true });
}

export async function listRunDirs(): Promise<string[]> {
  await ensureDir(RUNS_DIR);
  const entries = await readdir(RUNS_DIR, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(RUNS_DIR, entry.name));
}

export async function listArchiveDirs(): Promise<string[]> {
  await ensureDir(ARCHIVES_DIR);
  const entries = await readdir(ARCHIVES_DIR, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(ARCHIVES_DIR, entry.name));
}

export async function findNearestGitRoot(path: string): Promise<string | null> {
  let dir = dirname(resolve(path));
  while (true) {
    if (await exists(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export async function defaultCwdForFile(file: string, requestedCwd?: string): Promise<string> {
  if (requestedCwd) return resolve(requestedCwd);
  return (await findNearestGitRoot(file)) ?? dirname(resolve(file));
}
