import { readFile, writeFile } from "node:fs/promises";
import type { CodexExecOptions, CodexExecResult } from "../types";

export async function runCodexExec(options: CodexExecOptions): Promise<CodexExecResult> {
  const args = [
    "exec",
    "-C",
    options.cwd,
    "--skip-git-repo-check",
    "--sandbox",
    options.sandbox,
    "--output-schema",
    options.schemaPath,
    "-o",
    options.lastMessagePath,
    "--json",
    "--color",
    "never"
  ];
  if (options.model) args.push("--model", options.model);
  for (const addDir of options.addDirs ?? []) {
    args.push("--add-dir", addDir);
  }
  args.push("-");

  const proc = Bun.spawn([options.codexBin, ...args], {
    cwd: options.cwd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe"
  });

  proc.stdin.write(options.prompt);
  proc.stdin.end();

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  await writeFile(options.eventLogPath, stdout, "utf8");
  const lastMessage = await readFile(options.lastMessagePath, "utf8").catch(() => "");
  return { exitCode, stdout, stderr, lastMessage, eventLogPath: options.eventLogPath, lastMessagePath: options.lastMessagePath };
}
