import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

test("codexExec source passes additional writable directories", async () => {
  const source = await readFile("src/core/codexExec.ts", "utf8");
  expect(source).toContain("options.addDirs");
  expect(source).toContain("\"--add-dir\"");
  expect(source).not.toContain("--ask-for-approval");
});

test("patch command does not add the repository as writable context", async () => {
  const source = await readFile("src/commands/patch.ts", "utf8");
  expect(source).not.toContain("addDirs: [params.cwd]");
});
