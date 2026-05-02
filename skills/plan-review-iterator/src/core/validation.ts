import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ValidationResult } from "../types";

export async function runValidationCommands(commands: string[], cwd: string, iterationDir: string): Promise<{ passed: boolean; logPath: string; results: ValidationResult[] }> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    const proc = Bun.spawn(["/bin/zsh", "-lc", command], { cwd, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited
    ]);
    results.push({ command, stdout, stderr, exitCode });
  }

  const log = results.map((result) => [
    `$ ${result.command}`,
    `exitCode=${result.exitCode}`,
    "--- stdout ---",
    result.stdout.trimEnd(),
    "--- stderr ---",
    result.stderr.trimEnd()
  ].join("\n")).join("\n\n");
  const logPath = join(iterationDir, "validation.log");
  await writeFile(logPath, `${log}\n`, "utf8");
  return { passed: results.every((result) => result.exitCode === 0), logPath, results };
}
