import {
  IconAlertTriangle,
  IconBrain,
  IconCheck,
  IconClock,
  IconCopy,
  IconMaximize,
  IconRobot,
  IconSparkles,
  IconTerminal,
} from "@tabler/icons-react";
import type { FC, MouseEvent } from "react";
import { useState } from "react";
import type { CommandExecutionDetail, GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { copyToClipboard, formatBytes, formatDuration, formatTokens } from "../streamUtils";
import { CommandDetailModal } from "./CommandDetailModal";

export interface ExtendedCommandExecutionDetail extends CommandExecutionDetail {
  memoryMb?: number;
  memoryBytes?: number;
  memoryFootprint?: string | number;
  cognitiveTokens?: number;
  tokens?: number;
  reasoningTokens?: number;
  hostModel?: string;
  model?: string;
  thinkingLevel?: string;
  reasoningEffort?: string;
  repairAttempt?: number;
  repairRound?: number;
  status?: string;
  actor?: string;
  gateId?: string;
  gate_id?: string;
  taskId?: string;
  task_id?: string;
  recordPath?: string;
  record_path?: string;
  record?: Record<string, unknown>;
  rawRecord?: Record<string, unknown>;
  raw?: Record<string, unknown>;
  evidencePath?: string;
  evidence_path?: string;
  evidenceIssues?: readonly string[];
  evidence_issues?: readonly string[];
  fingerprint?: string;
  assurance?: string;
  environment?: Record<string, string>;
  env?: Record<string, string>;
  attempts?: readonly Record<string, unknown>[];
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  duration_ms?: number;
  started_at?: string;
  finished_at?: string;
}

interface CommandsTabProps {
  node: GraphNodeData;
}

/**
 * Command execution breakdown tab presenting CLI executions, humanized execution status pills,
 * execution duration & memory footprint, authentic host model, cognitive token counts,
 * repair attempts, working directory, and formatted stdout/stderr stream snippets.
 */
export const CommandsTab: FC<CommandsTabProps> = ({ node }) => {
  const commands = (node.metadata?.commands ?? []) as ExtendedCommandExecutionDetail[];
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedCommand, setSelectedCommand] = useState<ExtendedCommandExecutionDetail | null>(
    null,
  );

  const handleCopy = async (text: string, id: string, e: MouseEvent) => {
    e.stopPropagation();
    await copyToClipboard(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (commands.length === 0) {
    return (
      <div className="drawer-tab-content">
        <div className="drawer-empty-state">No command executions recorded for this node.</div>
      </div>
    );
  }

  return (
    <div className="drawer-tab-content">
      <DrawerSection title="Executed Commands" count={commands.length}>
        {commands.map((cmd, index) => {
          const isSuccess = cmd.exitCode === 0;
          const stdout = cmd.stdoutSnippet ?? cmd.stdoutTail;
          const stderr = cmd.stderrSnippet ?? cmd.stderrTail;
          const cmdLine = Array.isArray(cmd.argv) ? cmd.argv.join(" ") : String(cmd.argv);

          const memoryFormatted =
            typeof cmd.memoryMb === "number"
              ? `${cmd.memoryMb} MB`
              : typeof cmd.memoryBytes === "number"
                ? formatBytes(cmd.memoryBytes)
                : cmd.memoryFootprint
                  ? String(cmd.memoryFootprint)
                  : undefined;

          const hostModel = cmd.hostModel ?? cmd.model;
          const thinkingLevel = cmd.thinkingLevel ?? cmd.reasoningEffort;
          const cognitiveTokens = cmd.cognitiveTokens ?? cmd.reasoningTokens ?? cmd.tokens;
          const repairAttempt = cmd.repairAttempt ?? cmd.repairRound;

          return (
            <div key={`${cmd.id}-${index}`} className="drawer-command-card">
              <div className="drawer-command-header">
                <span className={`drawer-command-exit ${isSuccess ? "is-success" : "is-error"}`}>
                  {isSuccess
                    ? "✅ Verified Clean Execution (Exit 0)"
                    : `⚠️ Validation Gate Pushback (Exit ${cmd.exitCode})`}
                </span>

                <div className="drawer-command-meta-right">
                  <span
                    className="drawer-command-duration"
                    title="⏱️ Duration & Memory Footprint"
                    aria-label="⏱️ Duration & Memory Footprint"
                  >
                    <IconClock
                      size={11}
                      style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}
                    />
                    {formatDuration(cmd.durationMs)}
                    {memoryFormatted ? ` · ${memoryFormatted}` : ""}
                  </span>
                  <code className="drawer-command-id">{cmd.id}</code>
                  <button
                    type="button"
                    className="drawer-lightbox-action-btn"
                    onClick={() => setSelectedCommand(cmd)}
                    title="Inspect command raw stream & record"
                    aria-label={`Inspect command ${cmd.id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                      padding: "2px 6px",
                      fontSize: "10.5px",
                      borderRadius: "3px",
                      border: "1px solid #27272a",
                      background: "rgba(56, 189, 248, 0.08)",
                      color: "#38bdf8",
                      cursor: "pointer",
                    }}
                  >
                    <IconMaximize size={11} />
                    <span>Inspect</span>
                  </button>
                </div>
              </div>

              {(hostModel ||
                thinkingLevel ||
                typeof cognitiveTokens === "number" ||
                repairAttempt !== undefined) && (
                <div
                  className="drawer-command-badges-row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                    margin: "4px 0 6px",
                  }}
                >
                  {hostModel && (
                    <span
                      className="drawer-effort-pill"
                      style={{
                        background: "rgba(255, 255, 255, 0.06)",
                        borderColor: "#27272a",
                        color: "#e4e4e7",
                      }}
                    >
                      <IconRobot
                        size={11}
                        style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }}
                      />
                      {hostModel}
                    </span>
                  )}
                  {thinkingLevel && (
                    <span className="drawer-effort-pill">
                      <IconSparkles
                        size={11}
                        style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }}
                      />
                      {`Thinking: ${thinkingLevel}`}
                    </span>
                  )}
                  {typeof cognitiveTokens === "number" && (
                    <span
                      className="drawer-effort-pill"
                      style={{
                        background: "rgba(99, 102, 241, 0.12)",
                        borderColor: "rgba(99, 102, 241, 0.3)",
                        color: "#a5b4fc",
                      }}
                    >
                      <IconBrain
                        size={11}
                        style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }}
                      />
                      {`${formatTokens(cognitiveTokens)} Cognitive Tokens`}
                    </span>
                  )}
                  {repairAttempt !== undefined && (
                    <span
                      className="drawer-effort-pill"
                      style={{
                        background: "rgba(245, 158, 11, 0.12)",
                        borderColor: "rgba(245, 158, 11, 0.35)",
                        color: "#fcd34d",
                      }}
                    >
                      <IconAlertTriangle
                        size={11}
                        style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }}
                      />
                      {`Repair Attempt #${repairAttempt}`}
                    </span>
                  )}
                </div>
              )}

              <div className="drawer-command-argv">
                <span className="drawer-command-prompt">$</span>
                <code>{cmdLine}</code>
                <button
                  type="button"
                  className={`drawer-copy-btn ${copiedId === `argv-${cmd.id}` ? "is-copied" : ""}`}
                  onClick={(e) => handleCopy(cmdLine, `argv-${cmd.id}`, e)}
                  title="Copy command"
                  aria-label="Copy command line"
                >
                  {copiedId === `argv-${cmd.id}` ? <IconCheck size={11} /> : <IconCopy size={11} />}
                </button>
              </div>

              {stdout && (
                <div className="drawer-log-snippet drawer-log-snippet--stdout">
                  <div className="drawer-log-header">
                    <span className="drawer-log-label">
                      <IconTerminal
                        size={11}
                        style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}
                      />
                      stdout
                    </span>
                    <button
                      type="button"
                      className={`drawer-copy-btn ${copiedId === `stdout-${cmd.id}` ? "is-copied" : ""}`}
                      onClick={(e) => handleCopy(stdout, `stdout-${cmd.id}`, e)}
                      title="Copy stdout"
                      aria-label="Copy stdout snippet"
                    >
                      {copiedId === `stdout-${cmd.id}` ? (
                        <IconCheck size={11} />
                      ) : (
                        <IconCopy size={11} />
                      )}
                      <span>{copiedId === `stdout-${cmd.id}` ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                  <pre className="drawer-pre drawer-pre--stdout" style={{ maxHeight: "240px" }}>
                    {stdout}
                  </pre>
                </div>
              )}

              {stderr && (
                <div className="drawer-log-snippet drawer-log-snippet--stderr">
                  <div className="drawer-log-header">
                    <span className="drawer-log-label drawer-log-label--stderr">
                      <IconTerminal
                        size={11}
                        style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}
                      />
                      stderr
                    </span>
                    <button
                      type="button"
                      className={`drawer-copy-btn ${copiedId === `stderr-${cmd.id}` ? "is-copied" : ""}`}
                      onClick={(e) => handleCopy(stderr, `stderr-${cmd.id}`, e)}
                      title="Copy stderr"
                      aria-label="Copy stderr snippet"
                    >
                      {copiedId === `stderr-${cmd.id}` ? (
                        <IconCheck size={11} />
                      ) : (
                        <IconCopy size={11} />
                      )}
                      <span>{copiedId === `stderr-${cmd.id}` ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                  <pre className="drawer-pre drawer-pre--stderr" style={{ maxHeight: "240px" }}>
                    {stderr}
                  </pre>
                </div>
              )}

              <div className="drawer-command-footer">
                <span className="drawer-command-cwd">
                  CWD: <code>{cmd.cwd}</code>
                </span>
                {cmd.startedAt && (
                  <span className="drawer-command-time">
                    {new Date(cmd.startedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </DrawerSection>

      <CommandDetailModal
        isOpen={Boolean(selectedCommand)}
        command={selectedCommand}
        onClose={() => setSelectedCommand(null)}
      />
    </div>
  );
};
