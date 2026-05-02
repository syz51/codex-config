import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { parseCli } from "../src/cli";
import { iterateCommand } from "../src/commands/iterate";

test("iterate feeds full review response into patch prompt", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plan-review-iterator-test-"));
  const planPath = join(dir, "plan.md");
  const runDir = join(dir, "run");
  const codexPath = join(dir, "codex");
  await writeFile(planPath, "# Plan\n\nDo something.\n", "utf8");
  await writeFile(codexPath, `#!/bin/zsh
schema=""
last=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-schema) shift; schema="$1" ;;
    -o) shift; last="$1" ;;
  esac
  shift
done
if [[ "$schema" == *"review.schema.json" ]]; then
  printf '%s\\n' '{"summary":"review","markdown_response":"FULL_REVIEW_RESPONSE_TEXT","findings":[{"id":"F1","severity":"medium","confidence":0.9,"title":"Issue","location":"Plan","evidence":"Evidence","recommendation":"Fix it","actionable":true}],"unresolved_questions":[]}' > "$last"
elif [[ "$schema" == *"clean-check.schema.json" ]]; then
  printf '%s\\n' '{"has_findings":true,"actionable_count":1,"reason":"needs patch"}' > "$last"
else
  printf '\\nPatched.\\n' >> "\${PWD}/plan.md"
  printf '%s\\n' '{"summary":"patch","markdown_response":"PATCH_RESPONSE_TEXT","resolved_findings":["F1"],"rejected_findings":[],"touched_files":[],"unresolved_questions":[]}' > "$last"
fi
printf '{"event":"mock"}\\n'
`, "utf8");
  await Bun.$`chmod +x ${codexPath}`;
  const { options } = parseCli([
    planPath,
    "--cwd",
    dir,
    "--output",
    runDir,
    "--codex-bin",
    codexPath,
    "--max-iterations",
    "1",
    "--allow-dirty",
    "--json"
  ]);

  const result = await iterateCommand(options);
  expect(result.ok).toBe(false);
  const patchPrompt = await readFile(join(runDir, "iteration-001", "patch.prompt.md"), "utf8");
  const cleanPrompt = await readFile(join(runDir, "iteration-001", "clean-check.prompt.md"), "utf8");
  expect(patchPrompt).toContain("FULL_REVIEW_RESPONSE_TEXT");
  expect(cleanPrompt).toContain("FULL_REVIEW_RESPONSE_TEXT");
});
