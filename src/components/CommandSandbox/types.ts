/**
 * Type definitions for Command Sandbox UI components and Zustand store.
 * 100% Zero-any type-safe definitions.
 */

import type {
  DiffStreamFilter,
  OutputDiffResult,
  RecordedExecutionTrace,
  ReplayBufferState,
  SandboxConfig,
  SandboxRunResult,
  TimingBreakdown,
} from "../../engine/sandbox/types";

export type CommandSandboxTab = "replay" | "diff" | "sandbox" | "timing" | "ast";

export type DiffViewMode = "unified" | "split";

export interface CommandSandboxStoreState {
  activeTab: CommandSandboxTab;
  recordedTrace: RecordedExecutionTrace | null;
  replayState: ReplayBufferState;
  timingBreakdown: TimingBreakdown | null;
  diffFilter: DiffStreamFilter;
  diffViewMode: DiffViewMode;
  diffResult: OutputDiffResult | null;

  // Mock Sandbox State
  mockConfig: SandboxConfig;
  sandboxCommand: string;
  sandboxEnvOverrides: Record<string, string>;
  sandboxRunResult: SandboxRunResult | null;
  isSimulating: boolean;
  selectedVfsFile: string | null;

  // Terminal UI State
  terminalSearchQuery: string;
  terminalAutoScroll: boolean;
}

export interface CommandSandboxStoreActions {
  setTab: (tab: CommandSandboxTab) => void;
  loadTrace: (trace: RecordedExecutionTrace) => void;
  play: () => void;
  pause: () => void;
  seekToTime: (timestampMs: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  setPlaybackSpeed: (speed: number) => void;
  jumpToStart: () => void;
  jumpToEnd: () => void;

  setDiffFilter: (filter: DiffStreamFilter) => void;
  setDiffViewMode: (mode: DiffViewMode) => void;
  recomputeDiff: () => void;

  setSandboxCommand: (command: string) => void;
  setSandboxEnvOverride: (key: string, value: string) => void;
  removeSandboxEnvOverride: (key: string) => void;
  clearSandboxEnvOverrides: () => void;
  selectVfsFile: (path: string | null) => void;
  updateVirtualFile: (path: string, content: string) => void;
  deleteVirtualFile: (path: string) => void;
  runMockSimulation: () => void;

  setTerminalSearchQuery: (query: string) => void;
  toggleAutoScroll: () => void;
  reset: () => void;
}

export type CommandSandboxStore = CommandSandboxStoreState & CommandSandboxStoreActions;

export interface CommandSandboxProps {
  initialTrace?: RecordedExecutionTrace;
  initialTab?: CommandSandboxTab;
  className?: string;
  onTraceChange?: (trace: RecordedExecutionTrace) => void;
}
