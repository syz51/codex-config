import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderPrompt } from "../src/core/prompts";
import { PROMPTS_DIR } from "../src/core/config";

test("render prompt placeholders", () => {
  expect(renderPrompt("A {{X}} B {{Y}}", { X: "one", Y: 2 })).toBe("A one B 2");
});

test("review prompt stays generic", async () => {
  const prompt = await readFile(join(PROMPTS_DIR, "review.md"), "utf8");
  expect(prompt).toContain("Consider any area that is relevant to the plan.");
  expect(prompt).not.toContain("training");
  expect(prompt).not.toContain("holdout");
  expect(prompt).not.toContain("agent workflow");
});
