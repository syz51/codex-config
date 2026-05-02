import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PROMPTS_DIR } from "./config";

export async function loadPrompt(name: string): Promise<string> {
  return readFile(join(PROMPTS_DIR, name), "utf8");
}

export function renderPrompt(template: string, values: Record<string, string | number | boolean | undefined>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replaceAll(`{{${key}}}`, String(value ?? ""));
  }
  return result;
}
