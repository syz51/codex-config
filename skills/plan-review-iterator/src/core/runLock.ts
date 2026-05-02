import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./paths";

export function lockPath(runDir: string): string {
  return join(runDir, ".active.lock");
}

export async function assertNoLock(runDir: string, force = false): Promise<void> {
  if (!force && await exists(lockPath(runDir))) {
    throw new Error(`Run is locked as active: ${lockPath(runDir)}. Use --force to override.`);
  }
}

export async function createLock(runDir: string): Promise<void> {
  await writeFile(lockPath(runDir), `${process.pid}\n${new Date().toISOString()}\n`, "utf8");
}

export async function removeLock(runDir: string): Promise<void> {
  await rm(lockPath(runDir), { force: true });
}
