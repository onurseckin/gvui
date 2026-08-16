/**
 * Mock Command Sandbox Execution Simulator.
 * Runs parsed pipelines, handles pipes, redirects, conditionals, and produces timestamped timeline events.
 * 100% Zero-any type-safe implementation.
 */

import { parseCommandLine } from "./commandParser";
import { resolvePath } from "./mockEnvironment";
import type {
  ExpectedBaseline,
  MockCommandContext,
  MockCommandResult,
  ParsedCommandNode,
  RecordedExecutionTrace,
  SandboxConfig,
  SandboxRunResult,
  StageExecutionResult,
  TimelineEvent,
  VirtualFileSystem,
} from "./types";

/**
 * Runs a single parsed command node in the sandbox environment.
 */
function executeSingleNode(
  node: ParsedCommandNode,
  stdin: string,
  config: SandboxConfig,
  currentFs: VirtualFileSystem,
  activeEnv: Record<string, string>,
): MockCommandResult {
  const cmdName = node.command;
  const mergedEnv = { ...activeEnv, ...node.envVars };

  // Check if command is a custom or built-in mock command
  const def = config.commands[cmdName];

  if (def && def.customHandler) {
    const ctx: MockCommandContext = {
      args: node.args,
      flags: node.flags,
      stdin,
      env: mergedEnv,
      fs: currentFs,
      cwd: config.cwd,
    };
    return def.customHandler(ctx);
  }

  if (def) {
    return {
      exitCode: def.defaultExitCode ?? 0,
      stdout: def.defaultStdout ?? `[mock ${cmdName}] executed successfully\n`,
      stderr: def.defaultStderr ?? "",
      executionTimeMs: def.simulatedLatencyMs ?? 5,
    };
  }

  // Unknown command
  return {
    exitCode: 127,
    stdout: "",
    stderr: `bash: ${cmdName}: command not found\n`,
    executionTimeMs: 2,
  };
}

/**
 * Executes a pipeline of commands connected via pipes (cmd1 | cmd2 | cmd3).
 */
function executePipedCommands(
  commands: ParsedCommandNode[],
  initialStdin: string,
  config: SandboxConfig,
  currentFs: VirtualFileSystem,
  activeEnv: Record<string, string>,
): {
  exitCode: number;
  stdout: string;
  stderr: string;
  totalDurationMs: number;
  modifiedFiles: Record<string, string>;
} {
  let currentStdin = initialStdin;
  let finalStdout = "";
  let finalStderr = "";
  let lastExitCode = 0;
  let totalDuration = 0;
  const aggregatedModifiedFiles: Record<string, string> = {};

  for (let idx = 0; idx < commands.length; idx++) {
    const node = commands[idx];
    if (!node) continue;

    // Handle input redirection (< file)
    let nodeStdin = currentStdin;
    const inputRedirect = node.redirects.find((r) => r.type === "in");
    if (inputRedirect) {
      const filePath = resolvePath(config.cwd, inputRedirect.target);
      const file = currentFs[filePath];
      if (file) {
        nodeStdin = file.content;
      } else {
        return {
          exitCode: 1,
          stdout: "",
          stderr: `bash: ${inputRedirect.target}: No such file or directory\n`,
          totalDurationMs: totalDuration + 2,
          modifiedFiles: aggregatedModifiedFiles,
        };
      }
    }

    const res = executeSingleNode(node, nodeStdin, config, currentFs, activeEnv);
    totalDuration += res.executionTimeMs;
    lastExitCode = res.exitCode;

    if (res.modifiedFiles) {
      Object.assign(aggregatedModifiedFiles, res.modifiedFiles);
      // Update virtual fs in-memory
      for (const [path, content] of Object.entries(res.modifiedFiles)) {
        currentFs[path] = {
          path,
          content,
          modifiedAt: new Date().toISOString(),
        };
      }
    }

    let nodeStdout = res.stdout;
    let nodeStderr = res.stderr;

    // Handle output redirections (>, >>, 2>, 2>&1, &>)
    for (const r of node.redirects) {
      if (r.type === "err_merge") {
        nodeStdout += nodeStderr;
        nodeStderr = "";
      } else if (r.type === "out" || r.type === "append" || r.type === "all") {
        const filePath = resolvePath(config.cwd, r.target);
        const existing = currentFs[filePath]?.content ?? "";
        const writtenContent = r.type === "all" ? `${nodeStdout}${nodeStderr}` : nodeStdout;
        const newContent = r.type === "append" ? existing + writtenContent : writtenContent;

        currentFs[filePath] = {
          path: filePath,
          content: newContent,
          modifiedAt: new Date().toISOString(),
        };
        aggregatedModifiedFiles[filePath] = newContent;
        nodeStdout = "";
        if (r.type === "all") nodeStderr = "";
      } else if (r.type === "err") {
        const filePath = resolvePath(config.cwd, r.target);
        currentFs[filePath] = {
          path: filePath,
          content: nodeStderr,
          modifiedAt: new Date().toISOString(),
        };
        aggregatedModifiedFiles[filePath] = nodeStderr;
        nodeStderr = "";
      }
    }

    if (nodeStderr) {
      finalStderr += nodeStderr;
    }

    const isLast = idx === commands.length - 1;
    if (isLast) {
      finalStdout += nodeStdout;
    } else {
      currentStdin = nodeStdout;
    }
  }

  return {
    exitCode: lastExitCode,
    stdout: finalStdout,
    stderr: finalStderr,
    totalDurationMs: totalDuration,
    modifiedFiles: aggregatedModifiedFiles,
  };
}

/**
 * Runs full simulation for a given command line against the sandbox environment.
 */
export function runSandboxSimulation(
  rawCommand: string,
  config: SandboxConfig,
  overrides?: { env?: Record<string, string>; stdin?: string },
): SandboxRunResult {
  const mergedEnv: Record<string, string> = {
    ...config.env,
    ...(overrides?.env ?? {}),
  };

  // Clone virtual filesystem to avoid state pollution across independent runs
  const workingFs: VirtualFileSystem = {};
  for (const [k, v] of Object.entries(config.vfs)) {
    workingFs[k] = { ...v };
  }

  const parsed = parseCommandLine(rawCommand, mergedEnv);
  const events: TimelineEvent[] = [];
  const stages: StageExecutionResult[] = [];

  let currentTimestampMs = 0;
  let totalStdout = "";
  let totalStderr = "";
  let finalExitCode = 0;
  let chunkCounter = 0;

  // Emit spawn event
  events.push({
    id: `event-${events.length + 1}`,
    timestampMs: currentTimestampMs,
    type: "spawn",
    stream: "system",
    data: `spawn: ${rawCommand}`,
    metadata: {
      cwd: config.cwd,
      stageCount: parsed.stages.length,
    },
  });

  // Emit env_set event if custom overrides were provided
  if (overrides?.env && Object.keys(overrides.env).length > 0) {
    currentTimestampMs += 1;
    events.push({
      id: `event-${events.length + 1}`,
      timestampMs: currentTimestampMs,
      type: "env_set",
      stream: "system",
      data: `env overrides: ${Object.keys(overrides.env).join(", ")}`,
      metadata: overrides.env,
    });
  }

  if (parsed.hasErrors) {
    const errorMsg = parsed.errors.join("\n");
    currentTimestampMs += 5;
    events.push({
      id: `event-${events.length + 1}`,
      timestampMs: currentTimestampMs,
      type: "stderr_chunk",
      stream: "stderr",
      data: `syntax error: ${errorMsg}\n`,
      chunkIndex: ++chunkCounter,
    });
    events.push({
      id: `event-${events.length + 1}`,
      timestampMs: currentTimestampMs + 1,
      type: "exit",
      stream: "system",
      data: "process exited with code 2",
      exitCode: 2,
    });

    return {
      command: rawCommand,
      exitCode: 2,
      stdout: "",
      stderr: `syntax error: ${errorMsg}\n`,
      events,
      executionTimeMs: currentTimestampMs + 1,
      status: "error",
      error: errorMsg,
      stages: [],
    };
  }

  let skipNextUntil: "and" | "or" | null = null;

  for (let sIdx = 0; sIdx < parsed.stages.length; sIdx++) {
    const stage = parsed.stages[sIdx];
    if (!stage) continue;

    // Handle short-circuit conditionals
    if (skipNextUntil === "and" && finalExitCode !== 0) {
      if (stage.operator === "or" || stage.operator === "semicolon") {
        skipNextUntil = null;
      }
      continue;
    }
    if (skipNextUntil === "or" && finalExitCode === 0) {
      if (stage.operator === "and" || stage.operator === "semicolon") {
        skipNextUntil = null;
      }
      continue;
    }

    currentTimestampMs += 2;
    events.push({
      id: `event-${events.length + 1}`,
      timestampMs: currentTimestampMs,
      type: "pipeline_step",
      stream: "system",
      data: `stage ${sIdx + 1}: ${stage.raw}`,
      metadata: { stageIndex: sIdx },
    });

    const stageRes = executePipedCommands(
      stage.commands,
      overrides?.stdin ?? "",
      config,
      workingFs,
      mergedEnv,
    );

    finalExitCode = stageRes.exitCode;
    currentTimestampMs += Math.max(1, stageRes.totalDurationMs);

    // Stream stdout chunks
    if (stageRes.stdout) {
      totalStdout += stageRes.stdout;
      const lines = stageRes.stdout.split("\n");
      for (let l = 0; l < lines.length; l++) {
        const line = lines[l];
        if (l === lines.length - 1 && line === "") continue;
        currentTimestampMs += 1;
        events.push({
          id: `event-${events.length + 1}`,
          timestampMs: currentTimestampMs,
          type: "stdout_chunk",
          stream: "stdout",
          data: `${line}\n`,
          chunkIndex: ++chunkCounter,
        });
      }
    }

    // Stream stderr chunks
    if (stageRes.stderr) {
      totalStderr += stageRes.stderr;
      const lines = stageRes.stderr.split("\n");
      for (let l = 0; l < lines.length; l++) {
        const line = lines[l];
        if (l === lines.length - 1 && line === "") continue;
        currentTimestampMs += 1;
        events.push({
          id: `event-${events.length + 1}`,
          timestampMs: currentTimestampMs,
          type: "stderr_chunk",
          stream: "stderr",
          data: `${line}\n`,
          chunkIndex: ++chunkCounter,
        });
      }
    }

    stages.push({
      stageIndex: sIdx,
      command: stage.raw,
      exitCode: stageRes.exitCode,
      stdout: stageRes.stdout,
      stderr: stageRes.stderr,
      durationMs: stageRes.totalDurationMs,
      operator: stage.operator,
    });

    // Check operator for next step
    if (stage.operator === "and") {
      if (finalExitCode !== 0) {
        skipNextUntil = "and";
      }
    } else if (stage.operator === "or") {
      if (finalExitCode === 0) {
        skipNextUntil = "or";
      }
    }
  }

  currentTimestampMs += 1;
  events.push({
    id: `event-${events.length + 1}`,
    timestampMs: currentTimestampMs,
    type: "exit",
    stream: "system",
    data: `process exited with code ${finalExitCode}`,
    exitCode: finalExitCode,
  });

  return {
    command: rawCommand,
    exitCode: finalExitCode,
    stdout: totalStdout,
    stderr: totalStderr,
    events,
    executionTimeMs: currentTimestampMs,
    status: finalExitCode === 0 ? "success" : "failure",
    stages,
  };
}

/**
 * Creates a recorded execution trace from simulation run result.
 */
export function createExecutionTraceFromRun(
  id: string,
  result: SandboxRunResult,
  env: Record<string, string>,
  cwd: string,
  expectedBaseline?: ExpectedBaseline,
): RecordedExecutionTrace {
  return {
    id,
    command: result.command,
    startedAt: new Date().toISOString(),
    totalDurationMs: result.executionTimeMs,
    exitCode: result.exitCode,
    env,
    cwd,
    events: result.events,
    expectedBaseline,
  };
}
