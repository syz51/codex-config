import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunManifest } from "../types";

export function manifestPath(runDir: string): string {
  return join(runDir, "manifest.json");
}

export async function loadManifest(runDir: string): Promise<RunManifest> {
  return JSON.parse(await readFile(manifestPath(runDir), "utf8")) as RunManifest;
}

export async function saveManifest(manifest: RunManifest): Promise<void> {
  await writeFile(manifestPath(manifest.runDir), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function createManifest(params: {
  runId: string;
  runDir: string;
  targetFile: string;
  cwd: string;
  maxIterations: number;
  validateCmds: string[];
  allowRelatedFiles: boolean;
  worktree: boolean;
}): RunManifest {
  return {
    version: 1,
    runId: params.runId,
    runDir: params.runDir,
    targetFile: params.targetFile,
    cwd: params.cwd,
    startedAt: new Date().toISOString(),
    status: "running",
    maxIterations: params.maxIterations,
    validateCmds: params.validateCmds,
    allowRelatedFiles: params.allowRelatedFiles,
    worktree: params.worktree,
    iterations: [],
    unresolvedQuestions: []
  };
}
