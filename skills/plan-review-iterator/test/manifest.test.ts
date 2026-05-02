import { expect, test } from "bun:test";
import { createManifest } from "../src/core/manifest";

test("create manifest", () => {
  const manifest = createManifest({
    runId: "run",
    runDir: "/tmp/run",
    targetFile: "/tmp/plan.md",
    cwd: "/tmp",
    maxIterations: 5,
    validateCmds: ["true"],
    allowRelatedFiles: false,
    worktree: false
  });
  expect(manifest.version).toBe(1);
  expect(manifest.status).toBe("running");
  expect(manifest.iterations).toEqual([]);
  expect(manifest.validateCmds).toEqual(["true"]);
});
