#!/usr/bin/env bun
import { archiveCommand } from "./commands/archive";
import { cleanCheckCommand } from "./commands/cleanCheck";
import { cleanupCommand } from "./commands/cleanup";
import { iterateCommand } from "./commands/iterate";
import { patchCommand } from "./commands/patch";
import { resumeCommand } from "./commands/resume";
import { reviewCommand } from "./commands/review";
import { statusCommand } from "./commands/status";
import { DEFAULT_ARCHIVE_OLDER_THAN, DEFAULT_CLEANUP_OLDER_THAN, DEFAULT_KEEP_LAST, DEFAULT_MAX_ITERATIONS } from "./core/config";
import type { CommandResult, CommonOptions } from "./types";

function usage(): string {
  return `Usage:
  bun run plan-iterate -- /absolute/path/to/plan.md

Maintenance:
  bun run plan-iterate -- review --file <plan.md> [--cwd <repo>]
  bun run plan-iterate -- patch --file <plan.md> --findings <review.json|md> [--cwd <repo>]
  bun run plan-iterate -- clean-check --file <plan.md> --review <review.json|md> [--cwd <repo>]
  bun run plan-iterate -- iterate --file <plan.md> [--cwd <repo>] [--max-iterations 5]
  bun run plan-iterate -- status --run <run-dir>
  bun run plan-iterate -- resume --run <run-dir>
  bun run plan-iterate -- cleanup [--dry-run] [--older-than 30d] [--keep-last 20] [--run <run-id>]
  bun run plan-iterate -- archive [--dry-run] [--older-than 7d] [--keep-last 20] [--run <run-id>]`;
}

export function parseCli(argv: string[]): { command: string; options: CommonOptions } {
  let [command = "help", ...args] = argv;
  const options: CommonOptions = {
    maxIterations: DEFAULT_MAX_ITERATIONS,
    validateCmds: [],
    allowDirty: false,
    allowAnyFile: false,
    allowRelatedFiles: false,
    worktree: false,
    codexBin: "codex",
    reviewOnly: false,
    json: false,
    dryRun: false,
    olderThan: command === "archive" ? DEFAULT_ARCHIVE_OLDER_THAN : DEFAULT_CLEANUP_OLDER_THAN,
    keepLast: DEFAULT_KEEP_LAST,
    force: false
  };

  if (command === "--help" || command === "-h") return { command: "help", options };

  const commands = new Set(["help", "review", "patch", "clean-check", "iterate", "status", "resume", "cleanup", "archive"]);
  if (command.startsWith("--")) {
    args = argv;
    command = "iterate";
  }
  if (!commands.has(command) && !command.startsWith("--")) {
    options.file = command;
    command = "iterate";
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = () => {
      const value = args[++i];
      if (!value) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    if (arg === "--file") options.file = next();
    else if (arg === "--cwd") options.cwd = next();
    else if (arg === "--output") options.output = next();
    else if (arg === "--run") options.run = next();
    else if (arg === "--findings") options.findings = next();
    else if (arg === "--review") options.review = next();
    else if (arg === "--max-iterations") options.maxIterations = Number(next());
    else if (arg === "--validate-cmd") options.validateCmds.push(next());
    else if (arg === "--codex-bin") options.codexBin = next();
    else if (arg === "--model") options.model = next();
    else if (arg === "--older-than") options.olderThan = next();
    else if (arg === "--keep-last") options.keepLast = Number(next());
    else if (arg === "--allow-dirty") options.allowDirty = true;
    else if (arg === "--allow-any-file") options.allowAnyFile = true;
    else if (arg === "--allow-related-files") options.allowRelatedFiles = true;
    else if (arg === "--worktree") options.worktree = true;
    else if (arg === "--review-only") options.reviewOnly = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--help" || arg === "-h") return { command: "help", options };
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return { command, options };
}

async function dispatch(command: string, options: CommonOptions): Promise<CommandResult> {
  if (command === "help") return { ok: true, message: usage() };
  if (command === "review") return reviewCommand(options);
  if (command === "patch") return patchCommand(options);
  if (command === "clean-check") return cleanCheckCommand(options);
  if (command === "iterate") return iterateCommand(options);
  if (command === "status") return statusCommand(options);
  if (command === "resume") return resumeCommand(options);
  if (command === "cleanup") return cleanupCommand(options);
  if (command === "archive") return archiveCommand(options);
  throw new Error(`Unknown command: ${command}`);
}

async function main(): Promise<void> {
  const { command, options } = parseCli(Bun.argv.slice(2));
  const result = await dispatch(command, options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.message);
    if (result.runDir) console.log(`runDir=${result.runDir}`);
    if (result.details !== undefined) console.log(JSON.stringify(result.details, null, 2));
  }
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
