export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export interface CommonOptions {
  file?: string;
  cwd?: string;
  output?: string;
  run?: string;
  findings?: string;
  review?: string;
  maxIterations: number;
  validateCmds: string[];
  allowDirty: boolean;
  allowAnyFile: boolean;
  allowRelatedFiles: boolean;
  worktree: boolean;
  codexBin: string;
  model?: string;
  reviewOnly: boolean;
  json: boolean;
  dryRun: boolean;
  olderThan: string;
  keepLast: number;
  force: boolean;
}

export interface CodexExecOptions {
  codexBin: string;
  cwd: string;
  prompt: string;
  schemaPath: string;
  lastMessagePath: string;
  eventLogPath: string;
  sandbox: SandboxMode;
  model?: string;
  addDirs?: string[];
}

export interface CodexExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  lastMessage: string;
  eventLogPath: string;
  lastMessagePath: string;
}

export interface ReviewFinding {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  confidence: number;
  title: string;
  location: string;
  evidence: string;
  recommendation: string;
  actionable: boolean;
}

export interface ReviewOutput {
  summary: string;
  markdown_response: string;
  findings: ReviewFinding[];
  unresolved_questions: string[];
}

export interface CleanCheckOutput {
  has_findings: boolean;
  actionable_count: number;
  reason: string;
}

export interface PatchOutput {
  summary: string;
  markdown_response: string;
  resolved_findings: string[];
  rejected_findings: Array<{ id: string; rationale: string }>;
  touched_files: string[];
  unresolved_questions: string[];
}

export interface ValidationResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface IterationRecord {
  number: number;
  dir: string;
  reviewJson?: string;
  reviewResponse?: string;
  cleanCheckJson?: string;
  patchJson?: string;
  patchResponse?: string;
  patchDiff?: string;
  validationLog?: string;
  clean?: boolean;
  validationPassed?: boolean;
  error?: string;
}

export interface RunManifest {
  version: 1;
  runId: string;
  runDir: string;
  targetFile: string;
  cwd: string;
  startedAt: string;
  endedAt?: string;
  status: "running" | "clean" | "findings_remaining" | "failed" | "reviewed";
  maxIterations: number;
  validateCmds: string[];
  allowRelatedFiles: boolean;
  worktree: boolean;
  iterations: IterationRecord[];
  lastCleanCheck?: CleanCheckOutput;
  lastValidation?: { passed: boolean; log?: string };
  unresolvedQuestions: string[];
}

export interface CommandResult {
  ok: boolean;
  runDir?: string;
  message: string;
  details?: unknown;
}
