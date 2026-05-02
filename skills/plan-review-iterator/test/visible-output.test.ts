import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";

async function makeFakeCodex(dir: string): Promise<string> {
  const codexPath = join(dir, "codex");
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
  printf '%s\\n' '{"summary":"review","markdown_response":"VISIBLE_REVIEW_RESPONSE","findings":[],"unresolved_questions":[]}' > "$last"
elif [[ "$schema" == *"clean-check.schema.json" ]]; then
  printf '%s\\n' '{"has_findings":false,"actionable_count":0,"reason":"clean"}' > "$last"
else
  printf '\\nPatched.\\n' >> "\${PWD}/plan.md"
  printf '%s\\n' '{"summary":"patch","markdown_response":"VISIBLE_PATCH_RESPONSE","resolved_findings":[],"rejected_findings":[],"touched_files":[],"unresolved_questions":[]}' > "$last"
fi
printf '{"event":"mock"}\\n'
`, "utf8");
  await Bun.$`chmod +x ${codexPath}`;
  return codexPath;
}

test("review prints human response in normal mode", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plan-review-visible-"));
  const planPath = join(dir, "plan.md");
  await writeFile(planPath, "# Plan\n", "utf8");
  const codexPath = await makeFakeCodex(dir);
  const proc = Bun.spawn([
    "bun",
    "run",
    "src/cli.ts",
    "review",
    "--file",
    planPath,
    "--cwd",
    dir,
    "--output",
    join(dir, "run"),
    "--codex-bin",
    codexPath
  ], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  expect(stdout).toContain("VISIBLE_REVIEW_RESPONSE");
});

test("json mode keeps stdout machine-readable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plan-review-json-"));
  const planPath = join(dir, "plan.md");
  await writeFile(planPath, "# Plan\n", "utf8");
  const codexPath = await makeFakeCodex(dir);
  const proc = Bun.spawn([
    "bun",
    "run",
    "src/cli.ts",
    "review",
    "--file",
    planPath,
    "--cwd",
    dir,
    "--output",
    join(dir, "run"),
    "--codex-bin",
    codexPath,
    "--json"
  ], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  const [stdout, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited
  ]);
  expect(exitCode).toBe(0);
  expect(JSON.parse(stdout).ok).toBe(true);
  expect(stdout).not.toContain("--- review response ---");
});

test("patch prints human response in normal mode", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plan-patch-visible-"));
  const planPath = join(dir, "plan.md");
  const findingsPath = join(dir, "findings.md");
  await writeFile(planPath, "# Plan\n", "utf8");
  await writeFile(findingsPath, "Fix issue.", "utf8");
  const codexPath = await makeFakeCodex(dir);
  const proc = Bun.spawn([
    "bun",
    "run",
    "src/cli.ts",
    "patch",
    "--file",
    planPath,
    "--findings",
    findingsPath,
    "--cwd",
    dir,
    "--output",
    join(dir, "run"),
    "--codex-bin",
    codexPath,
    "--allow-dirty"
  ], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  expect(stdout).toContain("VISIBLE_PATCH_RESPONSE");
  const patchPrompt = await readFile(join(dir, "run", "iteration-001", "patch.prompt.md"), "utf8");
  expect(patchPrompt).toContain("Full review response:");
});
