/**
 * Adversarial Stress & Edge Case Test Suite for GVUI Command Sandbox & Replay Debugger.
 * Tests complex ANSI escape parsing, exit code propagation in simulation, stdout/stderr diff edge cases,
 * and virtual filesystem error handling.
 * 100% Zero-any type-safe implementation.
 */

import { describe, expect, it } from "bun:test";
import { formatRgbColor, get256Color, parseAnsi, stripAnsi } from "../../engine/sandbox/ansiParser";
import {
  extractFlagsAndArgs,
  interpolateVariables,
  tokenizeShell,
} from "../../engine/sandbox/commandParser";
import {
  computeCharSpans,
  computeSimilarity,
  diffOutputs,
  diffTextLines,
} from "../../engine/sandbox/diffEngine";
import {
  createDefaultMockCommands,
  createDefaultMockEnv,
  createDefaultVirtualFileSystem,
} from "../../engine/sandbox/mockEnvironment";
import {
  calculateTimingBreakdown,
  computeReplayBufferAtEventIndex,
  findEventIndexAtTime,
} from "../../engine/sandbox/replayEngine";
import { runSandboxSimulation } from "../../engine/sandbox/simulator";
import type { RecordedExecutionTrace, SandboxConfig } from "../../engine/sandbox/types";

describe("Adversarial Stress Testing: ANSI Parser", () => {
  it("handles complex chained SGR codes in single escape sequence", () => {
    // Bold, italic, underline, TrueColor FG (255, 128, 64), 256-color BG (208)
    const complexAnsi = "\x1b[1;3;4;38;2;255;128;64;48;5;208mComplex Styled Text\x1b[0m";
    const result = parseAnsi(complexAnsi);

    expect(result.hasAnsi).toBe(true);
    expect(result.lines.length).toBe(1);
    const line = result.lines[0];
    expect(line).toBeDefined();

    const styledSpan = line!.spans.find((s) => s.text === "Complex Styled Text");
    expect(styledSpan).toBeDefined();
    expect(styledSpan!.style.bold).toBe(true);
    expect(styledSpan!.style.italic).toBe(true);
    expect(styledSpan!.style.underline).toBe(true);
    expect(styledSpan!.style.color).toBe("rgb(255, 128, 64)");
    expect(styledSpan!.style.bgColor).toBe(get256Color(208));
  });

  it("handles malformed, incomplete, and unknown ANSI sequences gracefully", () => {
    const malformed =
      "\x1b[999mUnknown Code\x1b[;mDefault Reset\x1b[38;2;255mIncomplete RGB\x1b[mNormal";
    const result = parseAnsi(malformed);

    expect(result.plainText).toContain("Unknown Code");
    expect(result.plainText).toContain("Default Reset");
    expect(result.plainText).toContain("Incomplete RGB");
    expect(result.plainText).toContain("Normal");
  });

  it("clamps TrueColor RGB values to 0-255 range", () => {
    expect(formatRgbColor(-50, 300, 128)).toBe("rgb(0, 255, 128)");
    expect(formatRgbColor(999, -999, 42.7)).toBe("rgb(255, 0, 43)");
  });

  it("correctly boundaries 256-color palette indices", () => {
    expect(get256Color(-10)).toBe("#ffffff");
    expect(get256Color(300)).toBe("#ffffff");
    expect(get256Color(0)).toBe("#18181b"); // Black
    expect(get256Color(15)).toBe("#ffffff"); // Bright White
    expect(get256Color(16)).toBe("#000000"); // 6x6x6 cube start
    expect(get256Color(231)).toBe("#ffffff"); // 6x6x6 cube end
    expect(get256Color(232)).toBe("#080808"); // Grayscale start
    expect(get256Color(255)).toBe("#eeeeee"); // Grayscale end
  });

  it("strips complex ANSI escape sequences including cursor and terminal codes", () => {
    const raw = "\x1b[2K\x1b[1G\x1b[32m[OK]\x1b[0m Loaded \x1b(B\x1b[1;34m100%\x1b[0m\r\nDone!\n";
    const stripped = stripAnsi(raw);
    expect(stripped).toBe("[OK] Loaded 100%\nDone!\n");
  });
});

describe("Adversarial Stress Testing: Shell Parser & Variable Interpolation", () => {
  it("interpolates nested environment variables and defaults", () => {
    const env = {
      NODE_ENV: "production",
      PORT: "8080",
      EMPTY_VAR: "",
    };

    expect(interpolateVariables("env=$NODE_ENV:$PORT", env)).toBe("env=production:8080");
    expect(interpolateVariables("${MISSING_PORT:-3000}", env)).toBe("3000");
    expect(interpolateVariables("${PORT:-3000}", env)).toBe("8080");
    expect(interpolateVariables("${EMPTY_VAR:-fallback}", env)).toBe("fallback");
    expect(interpolateVariables("${NODE_ENV:+custom_alt}", env)).toBe("custom_alt");
    expect(interpolateVariables("${#PORT}", env)).toBe("4");
    expect(interpolateVariables("$?", { "?": "127" })).toBe("127");
  });

  it("tokenizes mixed quotes, escaped spaces, and redirects", () => {
    const cmd = `echo "hello \\"world\\"" 'single quoted' flag\\ with\\ space 2>&1 > /dev/null`;
    const tokens = tokenizeShell(cmd);

    expect(tokens.length).toBeGreaterThan(0);
    const words = tokens.filter((t) => t.type === "word");
    expect(words.some((w) => w.value === 'hello "world"')).toBe(true);
    expect(words.some((w) => w.value === "single quoted")).toBe(true);
  });

  it("extracts short flag clusters and options with equal signs", () => {
    const args = ["-xvf", "--output=dist/bundle.js", "--verbose", "--threads", "8", "file.tar.gz"];
    const { flags, positional } = extractFlagsAndArgs(args);

    expect(flags.x).toBe(true);
    expect(flags.v).toBe(true);
    expect(flags.f).toBe(true);
    expect(flags.output).toBe("dist/bundle.js");
    expect(flags.verbose).toBe(true);
    expect(flags.threads).toBe("8");
    expect(positional).toContain("file.tar.gz");
  });
});

describe("Adversarial Stress Testing: Simulation & Exit Code Propagation", () => {
  const createTestConfig = (): SandboxConfig => ({
    env: createDefaultMockEnv(),
    vfs: createDefaultVirtualFileSystem(),
    cwd: "/workspace",
    commands: createDefaultMockCommands(),
  });

  it("propagates non-zero exit code through AND (&&) pipeline conditional", () => {
    const config = createTestConfig();
    // false && echo "should not execute"
    const result = runSandboxSimulation("false && echo 'should not execute'", config);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).not.toContain("should not execute");
    expect(result.status).toBe("failure");
    // Only 1 stage executed because second was short-circuited
    expect(result.stages.length).toBe(1);
  });

  it("executes fallback stage in OR (||) pipeline conditional", () => {
    const config = createTestConfig();
    // false || echo "fallback executed"
    const result = runSandboxSimulation("false || echo 'fallback executed'", config);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("fallback executed");
    expect(result.status).toBe("success");
    expect(result.stages.length).toBe(2);
  });

  it("short-circuits OR (||) when first stage succeeds", () => {
    const config = createTestConfig();
    // true || echo "should not run"
    const result = runSandboxSimulation("true || echo 'should not run'", config);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("should not run");
    expect(result.stages.length).toBe(1);
  });

  it("pipes multi-stage commands and handles intermediate failures", () => {
    const config = createTestConfig();
    // cat /workspace/README.md | grep Interactive | wc -l
    const result = runSandboxSimulation(
      "cat /workspace/README.md | grep Interactive | wc -l",
      config,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("1");
  });

  it("handles missing virtual file in pipeline with non-zero exit and stderr", () => {
    const config = createTestConfig();
    const result = runSandboxSimulation("cat non_existent_file.txt | grep foo", config);

    expect(result.exitCode).toBeGreaterThanOrEqual(1);
    expect(result.stderr).toContain("No such file or directory");
  });

  it("supports output redirection to virtual filesystem and reading it back", () => {
    const config = createTestConfig();
    const result = runSandboxSimulation(
      "echo 'Generated output line' > /workspace/out.txt && cat /workspace/out.txt",
      config,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("Generated output line\n");
  });
});

describe("Adversarial Stress Testing: LCS Matrix Diff Engine", () => {
  it("detects character-level additions, deletions, and modifications accurately", () => {
    const actual = "const port = 8080;";
    const expected = "const port = 3000;";
    const { spansActual, spansExpected } = computeCharSpans(actual, expected);

    expect(spansActual.length).toBeGreaterThan(0);
    expect(spansExpected.length).toBeGreaterThan(0);

    const hasRemoved = spansActual.some((s) => s.type === "removed");
    expect(hasRemoved).toBe(true);

    const hasAdded = spansExpected.some((s) => s.type === "added");
    expect(hasAdded).toBe(true);
  });

  it("handles completely disjoint multiline text blocks", () => {
    const textA = "alpha\nbravo\ncharlie";
    const textB = "delta\necho\nfoxtrot";
    const diff = diffTextLines(textA, textB);

    expect(diff.summary.unchangedLines).toBe(0);
    expect(diff.summary.isExactMatch).toBe(false);
    expect(diff.lines.length).toBeGreaterThan(0);
  });

  it("flags exit code mismatch even when stdout is 100% identical", () => {
    const stdout = "All tests passed\n";
    const diff = diffOutputs(stdout, "", 1, stdout, "", 0, "all");

    expect(diff.summary.stdoutMatches).toBe(true);
    expect(diff.summary.exitCodeMatches).toBe(false);
    expect(diff.summary.isExactMatch).toBe(false);
  });

  it("computes similarity score properly for empty vs non-empty strings", () => {
    expect(computeSimilarity("", "")).toBe(100.0);
    expect(computeSimilarity("hello", "")).toBe(0.0);
    expect(computeSimilarity("", "world")).toBe(0.0);
    expect(computeSimilarity("identical text", "identical text")).toBe(100.0);
    expect(computeSimilarity("abcdef", "abcxyz")).toBe(50.0);
  });
});

describe("Adversarial Stress Testing: Replay Buffer & Timing Breakdown", () => {
  const mockTrace: RecordedExecutionTrace = {
    id: "stress-trace-01",
    command: "echo test",
    startedAt: "2026-08-15T12:00:00.000Z",
    totalDurationMs: 500,
    exitCode: 0,
    cwd: "/workspace",
    env: {},
    events: [
      { id: "e-0", timestampMs: 0, type: "spawn", stream: "system", data: "spawn" },
      { id: "e-1", timestampMs: 50, type: "pipeline_step", stream: "system", data: "step 1" },
      {
        id: "e-2",
        timestampMs: 100,
        type: "stdout_chunk",
        stream: "stdout",
        data: "chunk 1\n",
        chunkIndex: 1,
      },
      {
        id: "e-3",
        timestampMs: 250,
        type: "stdout_chunk",
        stream: "stdout",
        data: "chunk 2\n",
        chunkIndex: 2,
      },
      {
        id: "e-4",
        timestampMs: 400,
        type: "stderr_chunk",
        stream: "stderr",
        data: "warn 1\n",
        chunkIndex: 3,
      },
      { id: "e-5", timestampMs: 500, type: "exit", stream: "system", data: "exit 0", exitCode: 0 },
    ],
  };

  it("finds correct event index using binary search across timeline", () => {
    expect(findEventIndexAtTime(mockTrace, 0)).toBe(0);
    expect(findEventIndexAtTime(mockTrace, 75)).toBe(1);
    expect(findEventIndexAtTime(mockTrace, 100)).toBe(2);
    expect(findEventIndexAtTime(mockTrace, 300)).toBe(3);
    expect(findEventIndexAtTime(mockTrace, 450)).toBe(4);
    expect(findEventIndexAtTime(mockTrace, 500)).toBe(5);
    expect(findEventIndexAtTime(mockTrace, 1000)).toBe(5);
  });

  it("reconstructs buffer accurately at intermediate event stepping", () => {
    const step2 = computeReplayBufferAtEventIndex(mockTrace, 2);
    expect(step2.visibleStdout).toBe("chunk 1\n");
    expect(step2.visibleStderr).toBe("");
    expect(step2.completedEventsCount).toBe(3);
    expect(step2.isFinished).toBe(false);

    const step4 = computeReplayBufferAtEventIndex(mockTrace, 4);
    expect(step4.visibleStdout).toBe("chunk 1\nchunk 2\n");
    expect(step4.visibleStderr).toBe("warn 1\n");
    expect(step4.completedEventsCount).toBe(5);
  });

  it("computes accurate execution timing breakdown and throughput", () => {
    const timing = calculateTimingBreakdown(mockTrace);

    expect(timing.totalDurationMs).toBe(500);
    expect(timing.ttfbMs).toBe(100);
    expect(timing.chunkCount).toBe(3);
    expect(timing.pipelineStagesCount).toBe(1);
    expect(timing.averageChunkLatencyMs).toBeGreaterThan(0);
  });
});
