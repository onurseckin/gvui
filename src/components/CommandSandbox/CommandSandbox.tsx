/**
 * Main Command Sandbox & Replay Debugger Component.
 * Orchestrates terminal replay, output diffing, mock sandbox testbed, timing metrics, and AST inspector.
 * 100% Zero-any type-safe implementation.
 */

import { useEffect, type FC } from "react";
import { CommandAstViewer } from "./CommandAstViewer";
import { DiffInspector } from "./DiffInspector";
import { MockSandboxPanel } from "./MockSandboxPanel";
import { TerminalReplayView } from "./TerminalReplayView";
import { TimingBreakdownView } from "./TimingBreakdownView";
import type { CommandSandboxProps, CommandSandboxTab } from "./types";
import {
  createFailedExecutionTrace,
  createSampleExecutionTrace,
  useCommandSandboxStore,
} from "./useCommandSandboxStore";
import "./CommandSandbox.css";

export const CommandSandbox: FC<CommandSandboxProps> = ({
  initialTrace,
  initialTab,
  className = "",
  onTraceChange,
}) => {
  const activeTab = useCommandSandboxStore((state) => state.activeTab);
  const recordedTrace = useCommandSandboxStore((state) => state.recordedTrace);

  const setTab = useCommandSandboxStore((state) => state.setTab);
  const loadTrace = useCommandSandboxStore((state) => state.loadTrace);
  const reset = useCommandSandboxStore((state) => state.reset);

  useEffect(() => {
    if (initialTrace) {
      loadTrace(initialTrace);
    }
  }, [initialTrace, loadTrace]);

  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
    }
  }, [initialTab, setTab]);

  useEffect(() => {
    if (recordedTrace && onTraceChange) {
      onTraceChange(recordedTrace);
    }
  }, [recordedTrace, onTraceChange]);

  const tabs: { id: CommandSandboxTab; label: string; icon: string }[] = [
    { id: "replay", label: "Terminal Replay", icon: "▶" },
    { id: "diff", label: "Output Diff", icon: "⚖" },
    { id: "sandbox", label: "Mock Sandbox & Rerun", icon: "⚡" },
    { id: "timing", label: "Timing Breakdown", icon: "⏱" },
    { id: "ast", label: "Command AST", icon: "🌳" },
  ];

  return (
    <div className={`command-sandbox-root ${className}`}>
      {/* Workbench Header */}
      <div className="sandbox-workbench-header">
        <div className="workbench-title-area">
          <div className="workbench-icon">🖥</div>
          <div className="workbench-titles">
            <h2 className="workbench-title">Command Replay & Sandbox Debugger</h2>
            <span className="workbench-desc">
              Interactive terminal execution trace inspector, ANSI renderer, baseline differ, and
              mock sandbox runner.
            </span>
          </div>
        </div>

        {/* Trace Presets and Actions */}
        <div className="workbench-actions">
          <div className="preset-selector-group">
            <span className="preset-label">Sample Traces:</span>
            <button
              type="button"
              className="preset-btn"
              onClick={() => loadTrace(createSampleExecutionTrace())}
            >
              Test Suite Run
            </button>
            <button
              type="button"
              className="preset-btn"
              onClick={() => loadTrace(createFailedExecutionTrace())}
            >
              Failed Run (Diff)
            </button>
          </div>

          <button
            type="button"
            className="reset-workbench-btn"
            onClick={reset}
            title="Reset to default trace"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="sandbox-tabs-nav" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`sandbox-tab-item ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setTab(tab.id)}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Main Tab Content View */}
      <div className="sandbox-tab-content" role="tabpanel">
        {activeTab === "replay" && <TerminalReplayView />}
        {activeTab === "diff" && <DiffInspector />}
        {activeTab === "sandbox" && <MockSandboxPanel />}
        {activeTab === "timing" && <TimingBreakdownView />}
        {activeTab === "ast" && <CommandAstViewer />}
      </div>
    </div>
  );
};
