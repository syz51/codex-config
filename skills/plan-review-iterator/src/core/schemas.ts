import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SCHEMAS_DIR } from "./config";
import type { CleanCheckOutput, PatchOutput, ReviewOutput } from "../types";

export const reviewSchemaPath = join(SCHEMAS_DIR, "review.schema.json");
export const cleanCheckSchemaPath = join(SCHEMAS_DIR, "clean-check.schema.json");
export const patchSchemaPath = join(SCHEMAS_DIR, "patch.schema.json");

export async function parseJsonFile<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

export function assertReviewOutput(value: unknown): asserts value is ReviewOutput {
  const output = value as ReviewOutput;
  if (!output || typeof output.summary !== "string" || typeof output.markdown_response !== "string" || !Array.isArray(output.findings)) {
    throw new Error("Invalid review output schema");
  }
}

export function assertCleanCheckOutput(value: unknown): asserts value is CleanCheckOutput {
  const output = value as CleanCheckOutput;
  if (!output || typeof output.has_findings !== "boolean" || typeof output.actionable_count !== "number" || typeof output.reason !== "string") {
    throw new Error("Invalid clean-check output schema");
  }
}

export function assertPatchOutput(value: unknown): asserts value is PatchOutput {
  const output = value as PatchOutput;
  if (!output || typeof output.summary !== "string" || typeof output.markdown_response !== "string" || !Array.isArray(output.resolved_findings)) {
    throw new Error("Invalid patch output schema");
  }
}
