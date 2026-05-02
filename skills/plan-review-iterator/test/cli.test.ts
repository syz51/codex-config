import { expect, test } from "bun:test";
import { parseCli } from "../src/cli";

test("parse iterate options", () => {
  const parsed = parseCli([
    "iterate",
    "--file",
    "/tmp/plan.md",
    "--cwd",
    "/repo",
    "--max-iterations",
    "3",
    "--validate-cmd",
    "bun test",
    "--validate-cmd",
    "bun run typecheck",
    "--allow-dirty",
    "--json"
  ]);
  expect(parsed.command).toBe("iterate");
  expect(parsed.options.file).toBe("/tmp/plan.md");
  expect(parsed.options.cwd).toBe("/repo");
  expect(parsed.options.maxIterations).toBe(3);
  expect(parsed.options.validateCmds).toEqual(["bun test", "bun run typecheck"]);
  expect(parsed.options.allowDirty).toBe(true);
  expect(parsed.options.json).toBe(true);
});

test("parse global help", () => {
  expect(parseCli(["--help"]).command).toBe("help");
  expect(parseCli(["-h"]).command).toBe("help");
});

test("positional path defaults to iterate", () => {
  const parsed = parseCli(["/tmp/plan.md"]);
  expect(parsed.command).toBe("iterate");
  expect(parsed.options.file).toBe("/tmp/plan.md");
});

test("--file without mode defaults to iterate", () => {
  const parsed = parseCli(["--file", "/tmp/plan.md", "--cwd", "/repo"]);
  expect(parsed.command).toBe("iterate");
  expect(parsed.options.file).toBe("/tmp/plan.md");
  expect(parsed.options.cwd).toBe("/repo");
});
