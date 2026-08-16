/**
 * Core type definitions for GVUI Shell Command Execution Replay & Mock Sandbox Engine.
 * 100% Zero-any type-safe definitions.
 */

// ==========================================
// 1. Shell Command Parser & AST Types
// ==========================================

export type ShellTokenType =
  | "word"
  | "pipe"
  | "redirect_out"
  | "redirect_append"
  | "redirect_in"
  | "redirect_err"
  | "redirect_err_merge"
  | "redirect_all"
  | "and"
  | "or"
  | "semicolon"
  | "background"
  | "env_assign"
  | "comment";

export interface ShellToken {
  type: ShellTokenType;
  value: string;
  raw: string;
  start: number;
  end: number;
}

export type RedirectType = "out" | "append" | "in" | "err" | "err_merge" | "all";

export interface ShellRedirect {
  type: RedirectType;
  target: string;
  fd?: number;
}

export interface ParsedCommandNode {
  id: string;
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
  envVars: Record<string, string>;
  redirects: ShellRedirect[];
  raw: string;
  isBackground: boolean;
}

export type PipelineOperator = "pipe" | "and" | "or" | "semicolon" | "background";

export interface PipelineStage {
  id: string;
  commands: ParsedCommandNode[];
  operator?: PipelineOperator;
  raw: string;
}

export interface ParsedCommandLine {
  raw: string;
  stages: PipelineStage[];
  hasErrors: boolean;
  errors: string[];
  allCommands: ParsedCommandNode[];
}

// ==========================================
// 2. ANSI & Terminal Output Types
// ==========================================

export interface AnsiRgbColor {
  r: number;
  g: number;
  b: number;
}

export interface AnsiStyle {
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  blink?: boolean;
  inverse?: boolean;
  hidden?: boolean;
  strikethrough?: boolean;
  color?: string; // Hex, named, or rgb()
  bgColor?: string;
}

export interface AnsiSpan {
  text: string;
  style: AnsiStyle;
}

export type OutputStreamType = "stdout" | "stderr" | "stdin" | "system";

export interface AnsiLine {
  lineNumber: number;
  spans: AnsiSpan[];
  rawText: string;
  plainText: string;
  stream: OutputStreamType;
  timestampMs?: number;
}

export interface ParsedAnsiResult {
  lines: AnsiLine[];
  plainText: string;
  hasAnsi: boolean;
  totalAnsiCodes: number;
}

// ==========================================
// 3. Output Diff Engine Types
// ==========================================

export type DiffLineType = "unchanged" | "added" | "removed" | "modified";
export type DiffStreamFilter = "all" | "stdout" | "stderr";

export interface DiffCharSpan {
  text: string;
  type: "unchanged" | "added" | "removed";
}

export interface DiffLine {
  id: string;
  type: DiffLineType;
  lineNumberActual?: number;
  lineNumberExpected?: number;
  contentActual?: string;
  contentExpected?: string;
  spansActual?: DiffCharSpan[];
  spansExpected?: DiffCharSpan[];
  stream: OutputStreamType;
}

export interface DiffSummary {
  totalLinesActual: number;
  totalLinesExpected: number;
  unchangedLines: number;
  addedLines: number;
  removedLines: number;
  modifiedLines: number;
  similarityPercent: number;
  isExactMatch: boolean;
  exitCodeActual: number;
  exitCodeExpected: number;
  exitCodeMatches: boolean;
  stdoutMatches: boolean;
  stderrMatches: boolean;
}

export interface OutputDiffResult {
  lines: DiffLine[];
  summary: DiffSummary;
}

// ==========================================
// 4. Mock Sandbox & Simulation Types
// ==========================================

export interface VirtualFile {
  path: string;
  content: string;
  isExecutable?: boolean;
  mode?: number;
  modifiedAt: string;
}

export type VirtualFileSystem = Record<string, VirtualFile>;
export type MockEnvVariables = Record<string, string>;

export interface MockCommandContext {
  args: string[];
  flags: Record<string, string | boolean>;
  stdin: string;
  env: MockEnvVariables;
  fs: VirtualFileSystem;
  cwd: string;
}

export interface MockCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  modifiedFiles?: Record<string, string>;
  executionTimeMs: number;
}

export type MockCommandHandler = (ctx: MockCommandContext) => MockCommandResult;

export interface MockCommandDefinition {
  name: string;
  description: string;
  defaultExitCode?: number;
  defaultStdout?: string;
  defaultStderr?: string;
  simulatedLatencyMs?: number;
  customHandler?: MockCommandHandler;
}

export interface SandboxConfig {
  env: MockEnvVariables;
  vfs: VirtualFileSystem;
  cwd: string;
  commands: Record<string, MockCommandDefinition>;
  maxExecutionTimeMs?: number;
}

export interface StageExecutionResult {
  stageIndex: number;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  operator?: PipelineOperator;
}

export type SimulationStatus = "success" | "failure" | "timeout" | "error";

export interface SandboxRunResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  events: TimelineEvent[];
  executionTimeMs: number;
  status: SimulationStatus;
  error?: string;
  stages: StageExecutionResult[];
}

// ==========================================
// 5. Timeline & Replay Types
// ==========================================

export type TimelineEventType =
  | "spawn"
  | "env_set"
  | "stdin"
  | "stdout_chunk"
  | "stderr_chunk"
  | "pipeline_step"
  | "exit";

export interface TimelineEvent {
  id: string;
  timestampMs: number;
  type: TimelineEventType;
  stream?: OutputStreamType;
  data: string;
  chunkIndex?: number;
  exitCode?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface ExpectedBaseline {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RecordedExecutionTrace {
  id: string;
  command: string;
  rawInput?: string;
  startedAt: string;
  totalDurationMs: number;
  exitCode: number;
  env: Record<string, string>;
  cwd: string;
  events: TimelineEvent[];
  expectedBaseline?: ExpectedBaseline;
}

export interface ReplayBufferState {
  currentTimeMs: number;
  isPlaying: boolean;
  playbackSpeed: number;
  visibleStdout: string;
  visibleStderr: string;
  visibleLines: AnsiLine[];
  completedEventsCount: number;
  totalEventsCount: number;
  isFinished: boolean;
}

export interface TimingBreakdown {
  totalDurationMs: number;
  ttfbMs: number;
  stdoutDurationMs: number;
  stderrDurationMs: number;
  chunkCount: number;
  averageChunkLatencyMs: number;
  maxChunkLatencyMs: number;
  pipelineStagesCount: number;
  bytesTotal: number;
  throughputBytesPerSec: number;
}
