import { join, resolve } from "node:path";

export const SKILL_ROOT = resolve(import.meta.dir, "../..");
export const RUNS_DIR = join(SKILL_ROOT, "runs");
export const ARCHIVES_DIR = join(SKILL_ROOT, "archives");
export const PROMPTS_DIR = join(SKILL_ROOT, "prompts");
export const SCHEMAS_DIR = join(SKILL_ROOT, "schemas");

export const DEFAULT_MAX_ITERATIONS = 5;
export const DEFAULT_CLEANUP_OLDER_THAN = "30d";
export const DEFAULT_ARCHIVE_OLDER_THAN = "7d";
export const DEFAULT_KEEP_LAST = 20;
