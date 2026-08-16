/**
 * Zustand Store for GVUI Command Sandbox & Replay Debugger.
 * 100% Zero-any type-safe implementation.
 */

import { create } from "zustand";
import { diffOutputs } from "../../engine/sandbox/diffEngine";
import {
  createDefaultMockCommands,
  createDefaultMockEnv,
  createDefaultVirtualFileSystem,
} from "../../engine/sandbox/mockEnvironment";
import {
  calculateTimingBreakdown,
  computeReplayBuffer,
  computeReplayBufferAtEventIndex,
  findEventIndexAtTime,
} from "../../engine/sandbox/replayEngine";
import { runSandboxSimulation } from "../../engine/sandbox/simulator";
import type {
  DiffStreamFilter,
  RecordedExecutionTrace,
  SandboxConfig,
} from "../../engine/sandbox/types";
import type { CommandSandboxStore, CommandSandboxTab, DiffViewMode } from "./types";

/**
 * Generates an initial sample execution trace for instant preview and testing.
 */
export function createSampleExecutionTrace(): RecordedExecutionTrace {
  return {
    id: "trace-sample-01",
    command:
      "echo '\x1b[32m[START]\x1b[0m Running test suite...' && bun test src/engine/sandbox --verbose",
    startedAt: "2026-08-15T12:00:00.000Z",
    totalDurationMs: 380,
    exitCode: 0,
    cwd: "/workspace",
    env: {
      NODE_ENV: "test",
      COLORTERM: "truecolor",
    },
    events: [
      {
        id: "ev-1",
        timestampMs: 0,
        type: "spawn",
        stream: "system",
        data: "spawn: echo '\x1b[32m[START]\x1b[0m Running test suite...' && bun test src/engine/sandbox --verbose",
      },
      {
        id: "ev-2",
        timestampMs: 15,
        type: "pipeline_step",
        stream: "system",
        data: "stage 1: echo '\x1b[32m[START]\x1b[0m Running test suite...'",
      },
      {
        id: "ev-3",
        timestampMs: 25,
        type: "stdout_chunk",
        stream: "stdout",
        data: "\x1b[32m[START]\x1b[0m Running test suite...\n",
        chunkIndex: 1,
      },
      {
        id: "ev-4",
        timestampMs: 60,
        type: "pipeline_step",
        stream: "system",
        data: "stage 2: bun test src/engine/sandbox --verbose",
      },
      {
        id: "ev-5",
        timestampMs: 120,
        type: "stdout_chunk",
        stream: "stdout",
        data: "\x1b[1m\x1b[36m(bun test v1.2.0)\x1b[0m\n",
        chunkIndex: 2,
      },
      {
        id: "ev-6",
        timestampMs: 180,
        type: "stdout_chunk",
        stream: "stdout",
        data: "  \x1b[32m✓\x1b[0m commandParser.test.ts (14 tests) \x1b[90m[18ms]\x1b[0m\n",
        chunkIndex: 3,
      },
      {
        id: "ev-7",
        timestampMs: 240,
        type: "stdout_chunk",
        stream: "stdout",
        data: "  \x1b[32m✓\x1b[0m ansiParser.test.ts (22 tests) \x1b[90m[12ms]\x1b[0m\n",
        chunkIndex: 4,
      },
      {
        id: "ev-8",
        timestampMs: 300,
        type: "stdout_chunk",
        stream: "stdout",
        data: "  \x1b[32m✓\x1b[0m diffEngine.test.ts (16 tests) \x1b[90m[15ms]\x1b[0m\n",
        chunkIndex: 5,
      },
      {
        id: "ev-9",
        timestampMs: 340,
        type: "stdout_chunk",
        stream: "stdout",
        data: "\n\x1b[1m\x1b[32m52 pass\x1b[0m, \x1b[90m0 fail, 52 total assertions\x1b[0m\n",
        chunkIndex: 6,
      },
      {
        id: "ev-10",
        timestampMs: 380,
        type: "exit",
        stream: "system",
        data: "process exited with code 0",
        exitCode: 0,
      },
    ],
    expectedBaseline: {
      stdout:
        "[START] Running test suite...\n(bun test v1.2.0)\n  ✓ commandParser.test.ts (14 tests)\n  ✓ ansiParser.test.ts (22 tests)\n  ✓ diffEngine.test.ts (16 tests)\n\n52 pass, 0 fail, 52 total assertions\n",
      stderr: "",
      exitCode: 0,
    },
  };
}

/**
 * Alternative sample trace: Failed test execution with stderr output.
 */
export function createFailedExecutionTrace(): RecordedExecutionTrace {
  return {
    id: "trace-failed-02",
    command: "bun test src/components/CommandSandbox --bail",
    startedAt: "2026-08-15T12:05:00.000Z",
    totalDurationMs: 210,
    exitCode: 1,
    cwd: "/workspace",
    env: { NODE_ENV: "test" },
    events: [
      {
        id: "f-1",
        timestampMs: 0,
        type: "spawn",
        stream: "system",
        data: "spawn: bun test src/components/CommandSandbox --bail",
      },
      {
        id: "f-2",
        timestampMs: 20,
        type: "pipeline_step",
        stream: "system",
        data: "stage 1: bun test src/components/CommandSandbox --bail",
      },
      {
        id: "f-3",
        timestampMs: 50,
        type: "stdout_chunk",
        stream: "stdout",
        data: "\x1b[1m\x1b[36m(bun test v1.2.0)\x1b[0m\n",
        chunkIndex: 1,
      },
      {
        id: "f-4",
        timestampMs: 110,
        type: "stdout_chunk",
        stream: "stdout",
        data: "  \x1b[31m✗\x1b[0m diffEngine.test.ts > should handle ANSI escape codes\n",
        chunkIndex: 2,
      },
      {
        id: "f-5",
        timestampMs: 140,
        type: "stderr_chunk",
        stream: "stderr",
        data: "\x1b[31mError: Expected similarity 100% but received 88.5%\x1b[0m\n    at test/diffEngine.test.ts:42:15\n",
        chunkIndex: 3,
      },
      {
        id: "f-6",
        timestampMs: 180,
        type: "stdout_chunk",
        stream: "stdout",
        data: "\n\x1b[1m\x1b[31m1 failed\x1b[0m, 14 passed\n",
        chunkIndex: 4,
      },
      {
        id: "f-7",
        timestampMs: 210,
        type: "exit",
        stream: "system",
        data: "process exited with code 1",
        exitCode: 1,
      },
    ],
    expectedBaseline: {
      stdout:
        "(bun test v1.2.0)\n  ✓ diffEngine.test.ts > should handle ANSI escape codes\n\n15 passed\n",
      stderr: "",
      exitCode: 0,
    },
  };
}

const defaultTrace = createSampleExecutionTrace();
const defaultReplay = computeReplayBuffer(defaultTrace, defaultTrace.totalDurationMs);
const defaultTiming = calculateTimingBreakdown(defaultTrace);

const defaultMockConfig: SandboxConfig = {
  env: createDefaultMockEnv(),
  vfs: createDefaultVirtualFileSystem(),
  cwd: "/workspace",
  commands: createDefaultMockCommands(),
};

export const useCommandSandboxStore = create<CommandSandboxStore>((set, get) => {
  const initialDiff = defaultTrace.expectedBaseline
    ? diffOutputs(
        defaultReplay.visibleStdout,
        defaultReplay.visibleStderr,
        defaultTrace.exitCode,
        defaultTrace.expectedBaseline.stdout,
        defaultTrace.expectedBaseline.stderr,
        defaultTrace.expectedBaseline.exitCode,
        "all",
      )
    : null;

  return {
    activeTab: "replay",
    recordedTrace: defaultTrace,
    replayState: defaultReplay,
    timingBreakdown: defaultTiming,
    diffFilter: "all",
    diffViewMode: "split",
    diffResult: initialDiff,

    mockConfig: defaultMockConfig,
    sandboxCommand: defaultTrace.command,
    sandboxEnvOverrides: {},
    sandboxRunResult: null,
    isSimulating: false,
    selectedVfsFile: "/workspace/package.json",

    terminalSearchQuery: "",
    terminalAutoScroll: true,

    setTab: (tab: CommandSandboxTab) => set({ activeTab: tab }),

    loadTrace: (trace: RecordedExecutionTrace) => {
      const replay = computeReplayBuffer(trace, trace.totalDurationMs);
      const timing = calculateTimingBreakdown(trace);
      const diff = trace.expectedBaseline
        ? diffOutputs(
            replay.visibleStdout,
            replay.visibleStderr,
            trace.exitCode,
            trace.expectedBaseline.stdout,
            trace.expectedBaseline.stderr,
            trace.expectedBaseline.exitCode,
            get().diffFilter,
          )
        : null;

      set({
        recordedTrace: trace,
        replayState: replay,
        timingBreakdown: timing,
        diffResult: diff,
        sandboxCommand: trace.command,
      });
    },

    play: () => {
      const state = get();
      if (!state.recordedTrace) return;
      if (state.replayState.isFinished) {
        // Reset to start before playing
        const startReplay = computeReplayBuffer(
          state.recordedTrace,
          0,
          true,
          state.replayState.playbackSpeed,
        );
        set({ replayState: startReplay });
      } else {
        set({
          replayState: {
            ...state.replayState,
            isPlaying: true,
          },
        });
      }
    },

    pause: () => {
      const state = get();
      set({
        replayState: {
          ...state.replayState,
          isPlaying: false,
        },
      });
    },

    seekToTime: (timestampMs: number) => {
      const state = get();
      if (!state.recordedTrace) return;
      const replay = computeReplayBuffer(
        state.recordedTrace,
        timestampMs,
        state.replayState.isPlaying,
        state.replayState.playbackSpeed,
      );
      set({ replayState: replay });
    },

    stepForward: () => {
      const state = get();
      if (!state.recordedTrace) return;
      const currentIdx = findEventIndexAtTime(state.recordedTrace, state.replayState.currentTimeMs);
      const nextIdx = currentIdx + 1;
      if (nextIdx < state.recordedTrace.events.length) {
        const replay = computeReplayBufferAtEventIndex(
          state.recordedTrace,
          nextIdx,
          false,
          state.replayState.playbackSpeed,
        );
        set({ replayState: replay });
      } else {
        // Jump to end
        const replay = computeReplayBuffer(
          state.recordedTrace,
          state.recordedTrace.totalDurationMs,
          false,
          state.replayState.playbackSpeed,
        );
        set({ replayState: replay });
      }
    },

    stepBackward: () => {
      const state = get();
      if (!state.recordedTrace) return;
      const currentIdx = findEventIndexAtTime(state.recordedTrace, state.replayState.currentTimeMs);
      const prevIdx = Math.max(0, currentIdx - 1);
      const replay = computeReplayBufferAtEventIndex(
        state.recordedTrace,
        prevIdx,
        false,
        state.replayState.playbackSpeed,
      );
      set({ replayState: replay });
    },

    setPlaybackSpeed: (speed: number) => {
      const state = get();
      set({
        replayState: {
          ...state.replayState,
          playbackSpeed: speed,
        },
      });
    },

    jumpToStart: () => {
      const state = get();
      if (!state.recordedTrace) return;
      const replay = computeReplayBuffer(
        state.recordedTrace,
        0,
        false,
        state.replayState.playbackSpeed,
      );
      set({ replayState: replay });
    },

    jumpToEnd: () => {
      const state = get();
      if (!state.recordedTrace) return;
      const replay = computeReplayBuffer(
        state.recordedTrace,
        state.recordedTrace.totalDurationMs,
        false,
        state.replayState.playbackSpeed,
      );
      set({ replayState: replay });
    },

    setDiffFilter: (filter: DiffStreamFilter) => {
      set({ diffFilter: filter });
      get().recomputeDiff();
    },

    setDiffViewMode: (mode: DiffViewMode) => {
      set({ diffViewMode: mode });
    },

    recomputeDiff: () => {
      const state = get();
      if (!state.recordedTrace || !state.recordedTrace.expectedBaseline) {
        set({ diffResult: null });
        return;
      }
      const baseline = state.recordedTrace.expectedBaseline;
      const diff = diffOutputs(
        state.replayState.visibleStdout,
        state.replayState.visibleStderr,
        state.recordedTrace.exitCode,
        baseline.stdout,
        baseline.stderr,
        baseline.exitCode,
        state.diffFilter,
      );
      set({ diffResult: diff });
    },

    setSandboxCommand: (command: string) => set({ sandboxCommand: command }),

    setSandboxEnvOverride: (key: string, value: string) => {
      const state = get();
      set({
        sandboxEnvOverrides: {
          ...state.sandboxEnvOverrides,
          [key]: value,
        },
      });
    },

    removeSandboxEnvOverride: (key: string) => {
      const state = get();
      const updated = { ...state.sandboxEnvOverrides };
      delete (updated as { [k: string]: string | undefined })[key];
      set({ sandboxEnvOverrides: updated });
    },

    clearSandboxEnvOverrides: () => set({ sandboxEnvOverrides: {} }),

    selectVfsFile: (path: string | null) => set({ selectedVfsFile: path }),

    updateVirtualFile: (path: string, content: string) => {
      const state = get();
      const updatedVfs = {
        ...state.mockConfig.vfs,
        [path]: {
          path,
          content,
          modifiedAt: new Date().toISOString(),
        },
      };
      set({
        mockConfig: {
          ...state.mockConfig,
          vfs: updatedVfs,
        },
      });
    },

    deleteVirtualFile: (path: string) => {
      const state = get();
      const updatedVfs = { ...state.mockConfig.vfs };
      delete (updatedVfs as { [k: string]: unknown })[path];
      set({
        mockConfig: {
          ...state.mockConfig,
          vfs: updatedVfs,
        },
        selectedVfsFile: state.selectedVfsFile === path ? null : state.selectedVfsFile,
      });
    },

    runMockSimulation: () => {
      const state = get();
      set({ isSimulating: true });

      try {
        const result = runSandboxSimulation(state.sandboxCommand, state.mockConfig, {
          env: state.sandboxEnvOverrides,
        });

        set({
          sandboxRunResult: result,
          isSimulating: false,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        set({
          sandboxRunResult: {
            command: state.sandboxCommand,
            exitCode: 1,
            stdout: "",
            stderr: `Simulation error: ${errorMsg}\n`,
            events: [],
            executionTimeMs: 0,
            status: "error",
            error: errorMsg,
            stages: [],
          },
          isSimulating: false,
        });
      }
    },

    setTerminalSearchQuery: (query: string) => set({ terminalSearchQuery: query }),

    toggleAutoScroll: () => set((state) => ({ terminalAutoScroll: !state.terminalAutoScroll })),

    reset: () => {
      const trace = createSampleExecutionTrace();
      const replay = computeReplayBuffer(trace, trace.totalDurationMs);
      const timing = calculateTimingBreakdown(trace);
      const diff = trace.expectedBaseline
        ? diffOutputs(
            replay.visibleStdout,
            replay.visibleStderr,
            trace.exitCode,
            trace.expectedBaseline.stdout,
            trace.expectedBaseline.stderr,
            trace.expectedBaseline.exitCode,
            "all",
          )
        : null;

      set({
        activeTab: "replay",
        recordedTrace: trace,
        replayState: replay,
        timingBreakdown: timing,
        diffFilter: "all",
        diffViewMode: "split",
        diffResult: diff,
        mockConfig: {
          env: createDefaultMockEnv(),
          vfs: createDefaultVirtualFileSystem(),
          cwd: "/workspace",
          commands: createDefaultMockCommands(),
        },
        sandboxCommand: trace.command,
        sandboxEnvOverrides: {},
        sandboxRunResult: null,
        isSimulating: false,
        selectedVfsFile: "/workspace/package.json",
        terminalSearchQuery: "",
        terminalAutoScroll: true,
      });
    },
  };
});
