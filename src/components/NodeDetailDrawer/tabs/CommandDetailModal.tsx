import {
  IconAlertTriangle,
  IconBrain,
  IconCheck,
  IconClock,
  IconCopy,
  IconFileCode,
  IconFolder,
  IconListCheck,
  IconRobot,
  IconServer,
  IconSparkles,
  IconTerminal,
  IconX,
} from "@tabler/icons-react";
import type { FC, MouseEvent, KeyboardEvent } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  copyToClipboard,
  formatBytes,
  formatDuration,
  formatTokens,
  getByteLength,
} from "../streamUtils";
import type { ExtendedCommandExecutionDetail } from "./CommandsTab";

export type CommandModalTab = "streams" | "record" | "metadata" | "environment";

export interface CommandDetailModalProps {
  isOpen: boolean;
  command: ExtendedCommandExecutionDetail | null | undefined;
  onClose: () => void;
}

/**
 * CommandDetailModal provides an expandable dialog for inspecting:
 * - Full raw stream command records (commands/<id>/record.json or evidence/<id>.json)
 * - Formatted stdout and stderr streams with line numbers, byte sizes, and copy actions
 * - Verified exit status codes, execution duration ms, and memory footprints
 * - Host model, thinking level, and cognitive token counts
 * - Execution telemetry, gate/task bindings, and environment variables
 */
export const CommandDetailModal: FC<CommandDetailModalProps> = memo(function CommandDetailModal({
  isOpen,
  command,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState<CommandModalTab>("streams");
  const [jsonFormat, setJsonFormat] = useState<"pretty" | "compact">("pretty");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Global keydown handler for Escape key dismiss and Tab focus trapping
  useEffect(() => {
    if (!isOpen) return;
    if (typeof window === "undefined") return;

    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab") {
        const container =
          dialogRef.current ||
          (typeof document !== "undefined" && typeof document.querySelector === "function"
            ? document.querySelector<HTMLElement>(".drawer-lightbox-overlay")
            : null);
        if (!container) return;

        const focusableElements = Array.from(
          container.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => {
          if (typeof window !== "undefined" && window.getComputedStyle) {
            const style = window.getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden") {
              return false;
            }
          }
          return true;
        });

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (
            document.activeElement === firstElement ||
            !container.contains(document.activeElement)
          ) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (
            document.activeElement === lastElement ||
            !container.contains(document.activeElement)
          ) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [isOpen, onClose]);

  // Initial focus management & focus restoration on unmount / dismiss
  useEffect(() => {
    if (!isOpen) return;

    if (typeof document !== "undefined" && document.activeElement) {
      previousActiveElementRef.current = document.activeElement as HTMLElement;
    }

    const timer = setTimeout(() => {
      if (closeBtnRef.current) {
        closeBtnRef.current.focus();
      } else if (dialogRef.current) {
        dialogRef.current.focus();
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      if (
        previousActiveElementRef.current &&
        typeof previousActiveElementRef.current.focus === "function" &&
        (typeof document === "undefined" ||
          document.body.contains(previousActiveElementRef.current))
      ) {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  const handleCopy = useCallback(async (text: string, key: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    await copyToClipboard(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  const cmdLine = useMemo(() => {
    if (!command) return "";
    return Array.isArray(command.argv) ? command.argv.join(" ") : String(command.argv ?? "");
  }, [command]);

  const stdout = useMemo(() => {
    if (!command) return "";
    return command.stdout ?? command.stdoutSnippet ?? command.stdoutTail ?? "";
  }, [command]);

  const stderr = useMemo(() => {
    if (!command) return "";
    return command.stderr ?? command.stderrSnippet ?? command.stderrTail ?? "";
  }, [command]);

  const recordPath = useMemo(() => {
    if (!command) return "";
    return (
      command.recordPath ??
      command.record_path ??
      (command.id ? `commands/${command.id}/record.json` : "commands/record.json")
    );
  }, [command]);

  const evidencePath = useMemo(() => {
    if (!command) return "";
    return (
      command.evidencePath ??
      command.evidence_path ??
      (command.id ? `evidence/${command.id}.json` : "evidence/record.json")
    );
  }, [command]);

  const hostModel = useMemo(() => {
    if (!command) return undefined;
    return command.hostModel ?? command.model;
  }, [command]);

  const thinkingLevel = useMemo(() => {
    if (!command) return undefined;
    return command.thinkingLevel ?? command.reasoningEffort;
  }, [command]);

  const cognitiveTokens = useMemo(() => {
    if (!command) return undefined;
    return command.cognitiveTokens ?? command.reasoningTokens ?? command.tokens;
  }, [command]);

  const repairAttempt = useMemo(() => {
    if (!command) return undefined;
    return command.repairAttempt ?? command.repairRound;
  }, [command]);

  const memoryFormatted = useMemo(() => {
    if (!command) return undefined;
    if (typeof command.memoryMb === "number") return `${command.memoryMb} MB`;
    if (typeof command.memoryBytes === "number") return formatBytes(command.memoryBytes);
    if (command.memoryFootprint) return String(command.memoryFootprint);
    return undefined;
  }, [command]);

  const rawRecord = useMemo<Record<string, unknown>>(() => {
    if (!command) return {};
    if (command.rawRecord && typeof command.rawRecord === "object") {
      return command.rawRecord;
    }
    if (command.record && typeof command.record === "object") {
      return command.record;
    }
    if (command.raw && typeof command.raw === "object") {
      return command.raw;
    }

    const isSuccess = command.exitCode === 0;
    const startedAt = command.startedAt ?? command.started_at;
    const finishedAt = command.finishedAt ?? command.finished_at;
    const exitCode = command.exitCode ?? command.exit_code ?? 0;
    const durationMs = command.durationMs ?? command.duration_ms ?? 0;

    const recordObj: Record<string, unknown> = {
      id: command.id,
      actor: command.actor ?? "gvui-runner",
      argv: command.argv,
      cwd: command.cwd,
      exit_code: exitCode,
      status: isSuccess ? "succeeded" : "failed",
      duration_ms: durationMs,
      started_at: startedAt,
      finished_at: finishedAt,
      record_path: recordPath,
      evidence_path: evidencePath,
      gate_id: command.gateId ?? command.gate_id ?? null,
      task_id: command.taskId ?? command.task_id ?? null,
      fingerprint: command.fingerprint ?? null,
      assurance: command.assurance ?? "trusted_host_observed_v1",
    };

    if (hostModel) recordObj.host_model = hostModel;
    if (thinkingLevel) recordObj.thinking_level = thinkingLevel;
    if (typeof cognitiveTokens === "number") recordObj.cognitive_tokens = cognitiveTokens;
    if (repairAttempt !== undefined) recordObj.repair_attempt = repairAttempt;
    if (memoryFormatted) recordObj.memory_footprint = memoryFormatted;

    recordObj.logs = {
      stdout: {
        path: `${recordPath.replace(/\/[^/]+$/, "")}/stdout.log`,
        bytes: getByteLength(stdout),
        lines: stdout ? stdout.split("\n").length : 0,
        snippet: stdout || undefined,
      },
      stderr: {
        path: `${recordPath.replace(/\/[^/]+$/, "")}/stderr.log`,
        bytes: getByteLength(stderr),
        lines: stderr ? stderr.split("\n").length : 0,
        snippet: stderr || undefined,
      },
    };

    if (Array.isArray(command.attempts) && command.attempts.length > 0) {
      recordObj.attempts = command.attempts;
    } else {
      recordObj.attempts = [
        {
          attempt: 1,
          exit_code: exitCode,
          status: isSuccess ? "succeeded" : "failed",
          started_at: startedAt,
          finished_at: finishedAt,
          duration_ms: durationMs,
        },
      ];
    }

    const envMap = command.environment ?? command.env;
    if (envMap && typeof envMap === "object") {
      recordObj.environment = envMap;
    }

    if (Array.isArray(command.evidenceIssues ?? command.evidence_issues)) {
      recordObj.evidence_issues = command.evidenceIssues ?? command.evidence_issues;
    }

    return recordObj;
  }, [
    command,
    stdout,
    stderr,
    recordPath,
    evidencePath,
    hostModel,
    thinkingLevel,
    cognitiveTokens,
    repairAttempt,
    memoryFormatted,
  ]);

  const rawRecordJson = useMemo(() => {
    return jsonFormat === "pretty" ? JSON.stringify(rawRecord, null, 2) : JSON.stringify(rawRecord);
  }, [rawRecord, jsonFormat]);

  const envEntries = useMemo(() => {
    if (!command) return [];
    const envObj = command.environment ?? command.env;
    if (!envObj || typeof envObj !== "object") return [];
    return Object.entries(envObj);
  }, [command]);

  if (!isOpen || !command) return null;

  const isSuccess = command.exitCode === 0;
  const stdoutLineCount = stdout ? stdout.split("\n").length : 0;
  const stderrLineCount = stderr ? stderr.split("\n").length : 0;
  const stdoutBytes = getByteLength(stdout);
  const stderrBytes = getByteLength(stderr);
  const recordBytes = getByteLength(rawRecordJson);

  return (
    <div
      className="drawer-lightbox-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div
        ref={dialogRef}
        className="drawer-lightbox-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-detail-modal-title"
        tabIndex={-1}
        style={{
          maxWidth: "960px",
          width: "92vw",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0d0e12",
          border: "1px solid #27272a",
          borderRadius: "8px",
          boxShadow: "0 20px 45px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="drawer-lightbox-header"
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid #27272a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            backgroundColor: "#121217",
            flexShrink: 0,
          }}
        >
          <div
            className="drawer-lightbox-header-left"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              flex: 1,
              minWidth: 0,
            }}
          >
            <span
              className="drawer-lightbox-type-icon"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "24px",
                height: "24px",
                borderRadius: "4px",
                backgroundColor: "rgba(56, 189, 248, 0.15)",
                color: "#38bdf8",
              }}
            >
              <IconTerminal size={15} />
            </span>

            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h2
                  id="command-detail-modal-title"
                  className="drawer-lightbox-title"
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#fafafa",
                    margin: 0,
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  Command Stream Inspector
                </h2>
                <code
                  className="drawer-command-id"
                  style={{
                    backgroundColor: "#18181b",
                    padding: "1px 6px",
                    borderRadius: "3px",
                    fontSize: "11px",
                    color: "#38bdf8",
                  }}
                >
                  {command.id}
                </code>
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#71717a",
                  fontFamily: "var(--font-mono)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "500px",
                }}
              >
                {recordPath}
              </div>
            </div>

            <span
              className={`drawer-command-exit ${isSuccess ? "is-success" : "is-error"}`}
              style={{ marginLeft: "4px" }}
            >
              {isSuccess
                ? "✅ Verified Clean Execution (Exit 0)"
                : `⚠️ Validation Gate Pushback (Exit ${command.exitCode})`}
            </span>

            <span
              className="drawer-command-duration"
              title="⏱️ Execution Duration"
              aria-label="⏱️ Execution Duration"
              style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}
            >
              <IconClock size={11} />
              {formatDuration(command.durationMs)}
              {memoryFormatted ? ` · ${memoryFormatted}` : ""}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <button
              type="button"
              className={`drawer-copy-btn ${copiedKey === "raw-json-header" ? "is-copied" : ""}`}
              onClick={(e) => handleCopy(rawRecordJson, "raw-json-header", e)}
              title="Copy Raw JSON Record Payload"
              aria-label="Copy Raw JSON Record"
              style={{ padding: "4px 8px", fontSize: "11px" }}
            >
              {copiedKey === "raw-json-header" ? <IconCheck size={12} /> : <IconCopy size={12} />}
              <span>{copiedKey === "raw-json-header" ? "Copied Record!" : "Copy Payload"}</span>
            </button>

            <button
              ref={closeBtnRef}
              type="button"
              className="drawer-lightbox-action-btn drawer-lightbox-close-btn"
              onClick={onClose}
              aria-label="Close dialog"
              title="Close dialog (Escape)"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "28px",
                background: "transparent",
                border: "1px solid #27272a",
                borderRadius: "4px",
                color: "#a1a1aa",
                cursor: "pointer",
              }}
            >
              <IconX size={15} />
            </button>
          </div>
        </div>

        {/* Badges / Model Banner */}
        {(hostModel ||
          thinkingLevel ||
          typeof cognitiveTokens === "number" ||
          repairAttempt !== undefined) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexWrap: "wrap",
              padding: "6px 14px",
              backgroundColor: "rgba(255, 255, 255, 0.02)",
              borderBottom: "1px solid #1f1f23",
            }}
          >
            {hostModel && (
              <span
                className="drawer-effort-pill"
                style={{
                  background: "rgba(255, 255, 255, 0.06)",
                  borderColor: "#27272a",
                  color: "#e4e4e7",
                  fontSize: "11px",
                }}
              >
                <IconRobot
                  size={11}
                  style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}
                />
                {hostModel}
              </span>
            )}
            {thinkingLevel && (
              <span className="drawer-effort-pill" style={{ fontSize: "11px" }}>
                <IconSparkles
                  size={11}
                  style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}
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
                  fontSize: "11px",
                }}
              >
                <IconBrain
                  size={11}
                  style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}
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
                  fontSize: "11px",
                }}
              >
                <IconAlertTriangle
                  size={11}
                  style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}
                />
                {`Repair Attempt #${repairAttempt}`}
              </span>
            )}
          </div>
        )}

        {/* Tab Navigation */}
        <div
          role="tablist"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "6px 14px",
            backgroundColor: "#111115",
            borderBottom: "1px solid #27272a",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            role="tab"
            data-tab="streams"
            aria-selected={activeTab === "streams"}
            className={`drawer-lightbox-action-btn ${activeTab === "streams" ? "is-active" : ""}`}
            onClick={() => setActiveTab("streams")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 10px",
              fontSize: "11.5px",
              borderRadius: "4px",
              cursor: "pointer",
              border: activeTab === "streams" ? "1px solid #38bdf8" : "1px solid #27272a",
              backgroundColor: activeTab === "streams" ? "rgba(56, 189, 248, 0.1)" : "transparent",
              color: activeTab === "streams" ? "#38bdf8" : "#a1a1aa",
              fontWeight: activeTab === "streams" ? 600 : 400,
            }}
          >
            <IconTerminal size={13} />
            Formatted Streams
            <span
              style={{
                fontSize: "10px",
                padding: "1px 5px",
                borderRadius: "3px",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
              }}
            >
              {stdout ? `${stdoutLineCount}L` : "0L"}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            data-tab="record"
            aria-selected={activeTab === "record"}
            className={`drawer-lightbox-action-btn ${activeTab === "record" ? "is-active" : ""}`}
            onClick={() => setActiveTab("record")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 10px",
              fontSize: "11.5px",
              borderRadius: "4px",
              cursor: "pointer",
              border: activeTab === "record" ? "1px solid #38bdf8" : "1px solid #27272a",
              backgroundColor: activeTab === "record" ? "rgba(56, 189, 248, 0.1)" : "transparent",
              color: activeTab === "record" ? "#38bdf8" : "#a1a1aa",
              fontWeight: activeTab === "record" ? 600 : 400,
            }}
          >
            <IconFileCode size={13} />
            Raw Record (JSON)
            <span
              style={{
                fontSize: "10px",
                padding: "1px 5px",
                borderRadius: "3px",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
              }}
            >
              {formatBytes(recordBytes)}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            data-tab="metadata"
            aria-selected={activeTab === "metadata"}
            className={`drawer-lightbox-action-btn ${activeTab === "metadata" ? "is-active" : ""}`}
            onClick={() => setActiveTab("metadata")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "4px 10px",
              fontSize: "11.5px",
              borderRadius: "4px",
              cursor: "pointer",
              border: activeTab === "metadata" ? "1px solid #38bdf8" : "1px solid #27272a",
              backgroundColor: activeTab === "metadata" ? "rgba(56, 189, 248, 0.1)" : "transparent",
              color: activeTab === "metadata" ? "#38bdf8" : "#a1a1aa",
              fontWeight: activeTab === "metadata" ? 600 : 400,
            }}
          >
            <IconListCheck size={13} />
            Execution Telemetry
          </button>

          {envEntries.length > 0 && (
            <button
              type="button"
              role="tab"
              data-tab="environment"
              aria-selected={activeTab === "environment"}
              className={`drawer-lightbox-action-btn ${activeTab === "environment" ? "is-active" : ""}`}
              onClick={() => setActiveTab("environment")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "4px 10px",
                fontSize: "11.5px",
                borderRadius: "4px",
                cursor: "pointer",
                border: activeTab === "environment" ? "1px solid #38bdf8" : "1px solid #27272a",
                backgroundColor:
                  activeTab === "environment" ? "rgba(56, 189, 248, 0.1)" : "transparent",
                color: activeTab === "environment" ? "#38bdf8" : "#a1a1aa",
                fontWeight: activeTab === "environment" ? 600 : 400,
              }}
            >
              <IconServer size={13} />
              Environment ({envEntries.length})
            </button>
          )}
        </div>

        {/* Modal Body / Scrollable Content */}
        <div
          className="drawer-lightbox-main"
          style={{
            padding: "14px",
            overflowY: "auto",
            flex: 1,
            backgroundColor: "#0d0e12",
          }}
        >
          {/* View 1: Formatted Streams */}
          {activeTab === "streams" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Command Line & CWD Bar */}
              <div
                style={{
                  backgroundColor: "#121217",
                  border: "1px solid #27272a",
                  borderRadius: "6px",
                  padding: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    marginBottom: "6px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className="drawer-command-prompt">$</span>
                    <code
                      style={{
                        color: "#fafafa",
                        fontFamily: "var(--font-mono)",
                        fontSize: "12px",
                        wordBreak: "break-all",
                      }}
                    >
                      {cmdLine}
                    </code>
                  </div>
                  <button
                    type="button"
                    className={`drawer-copy-btn ${copiedKey === "modal-argv" ? "is-copied" : ""}`}
                    onClick={(e) => handleCopy(cmdLine, "modal-argv", e)}
                    title="Copy command line"
                    aria-label="Copy command line"
                  >
                    {copiedKey === "modal-argv" ? <IconCheck size={11} /> : <IconCopy size={11} />}
                    <span>{copiedKey === "modal-argv" ? "Copied!" : "Copy"}</span>
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    fontSize: "11px",
                    color: "#71717a",
                    borderTop: "1px solid #1f1f23",
                    paddingTop: "6px",
                    marginTop: "6px",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <IconFolder size={12} />
                    CWD: <code style={{ color: "#a1a1aa" }}>{command.cwd}</code>
                  </span>
                  <button
                    type="button"
                    className={`drawer-copy-btn ${copiedKey === "modal-cwd" ? "is-copied" : ""}`}
                    onClick={(e) => handleCopy(command.cwd, "modal-cwd", e)}
                    title="Copy CWD"
                    aria-label="Copy working directory"
                    style={{ padding: "1px 5px", fontSize: "10px" }}
                  >
                    {copiedKey === "modal-cwd" ? <IconCheck size={10} /> : <IconCopy size={10} />}
                  </button>
                </div>
              </div>

              {/* Stdout stream */}
              <div className="drawer-log-snippet drawer-log-snippet--stdout">
                <div className="drawer-log-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className="drawer-log-label">
                      <IconTerminal
                        size={12}
                        style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }}
                      />
                      Standard Output (stdout)
                    </span>
                    {stdout && (
                      <span
                        style={{
                          fontSize: "10px",
                          color: "#71717a",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {`${stdoutLineCount} lines · ${formatBytes(stdoutBytes)}`}
                      </span>
                    )}
                  </div>

                  {stdout && (
                    <button
                      type="button"
                      className={`drawer-copy-btn ${copiedKey === "modal-stdout" ? "is-copied" : ""}`}
                      onClick={(e) => handleCopy(stdout, "modal-stdout", e)}
                      title="Copy stdout"
                      aria-label="Copy stdout snippet"
                    >
                      {copiedKey === "modal-stdout" ? (
                        <IconCheck size={11} />
                      ) : (
                        <IconCopy size={11} />
                      )}
                      <span>{copiedKey === "modal-stdout" ? "Copied!" : "Copy Stdout"}</span>
                    </button>
                  )}
                </div>
                {stdout ? (
                  <pre
                    className="drawer-pre drawer-pre--stdout"
                    style={{ maxHeight: "280px", overflowY: "auto", margin: 0, padding: "10px" }}
                  >
                    {stdout}
                  </pre>
                ) : (
                  <div
                    style={{
                      padding: "16px",
                      textAlign: "center",
                      color: "#52525b",
                      fontSize: "12px",
                    }}
                  >
                    No stdout stream recorded for this command.
                  </div>
                )}
              </div>

              {/* Stderr stream */}
              <div className="drawer-log-snippet drawer-log-snippet--stderr">
                <div className="drawer-log-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className="drawer-log-label drawer-log-label--stderr">
                      <IconTerminal
                        size={12}
                        style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }}
                      />
                      Standard Error (stderr)
                    </span>
                    {stderr && (
                      <span
                        style={{
                          fontSize: "10px",
                          color: "#f87171",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {`${stderrLineCount} lines · ${formatBytes(stderrBytes)}`}
                      </span>
                    )}
                  </div>

                  {stderr && (
                    <button
                      type="button"
                      className={`drawer-copy-btn ${copiedKey === "modal-stderr" ? "is-copied" : ""}`}
                      onClick={(e) => handleCopy(stderr, "modal-stderr", e)}
                      title="Copy stderr"
                      aria-label="Copy stderr snippet"
                    >
                      {copiedKey === "modal-stderr" ? (
                        <IconCheck size={11} />
                      ) : (
                        <IconCopy size={11} />
                      )}
                      <span>{copiedKey === "modal-stderr" ? "Copied!" : "Copy Stderr"}</span>
                    </button>
                  )}
                </div>
                {stderr ? (
                  <pre
                    className="drawer-pre drawer-pre--stderr"
                    style={{ maxHeight: "280px", overflowY: "auto", margin: 0, padding: "10px" }}
                  >
                    {stderr}
                  </pre>
                ) : (
                  <div
                    style={{
                      padding: "16px",
                      textAlign: "center",
                      color: "#52525b",
                      fontSize: "12px",
                    }}
                  >
                    No stderr stream recorded for this command (clean stream).
                  </div>
                )}
              </div>
            </div>
          )}

          {/* View 2: Raw Record JSON */}
          {activeTab === "record" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  backgroundColor: "#121217",
                  border: "1px solid #27272a",
                  borderRadius: "6px",
                  padding: "8px 12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <IconFileCode size={14} style={{ color: "#38bdf8" }} />
                  <span style={{ fontSize: "12px", color: "#e4e4e7", fontWeight: 500 }}>
                    Raw JSON Stream Record
                  </span>
                  <code style={{ fontSize: "11px", color: "#71717a" }}>{recordPath}</code>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    className="drawer-copy-btn"
                    onClick={() => setJsonFormat((f) => (f === "pretty" ? "compact" : "pretty"))}
                    title={
                      jsonFormat === "pretty"
                        ? "Switch to compact single-line JSON"
                        : "Switch to formatted indented JSON"
                    }
                    aria-label="Toggle JSON format"
                    style={{ fontSize: "11px" }}
                  >
                    <span>{jsonFormat === "pretty" ? "Compact" : "Pretty"}</span>
                  </button>

                  <button
                    type="button"
                    className={`drawer-copy-btn ${copiedKey === "raw-json-tab" ? "is-copied" : ""}`}
                    onClick={(e) => handleCopy(rawRecordJson, "raw-json-tab", e)}
                    title="Copy Raw JSON"
                    aria-label="Copy Raw JSON"
                  >
                    {copiedKey === "raw-json-tab" ? (
                      <IconCheck size={11} />
                    ) : (
                      <IconCopy size={11} />
                    )}
                    <span>{copiedKey === "raw-json-tab" ? "Copied JSON!" : "Copy JSON"}</span>
                  </button>
                </div>
              </div>

              <div
                style={{
                  backgroundColor: "#09090b",
                  border: "1px solid #27272a",
                  borderRadius: "6px",
                  overflow: "hidden",
                }}
              >
                <pre
                  className="drawer-pre"
                  style={{
                    maxHeight: "480px",
                    overflowY: "auto",
                    margin: 0,
                    padding: "12px",
                    fontSize: "11.5px",
                    fontFamily: "var(--font-mono)",
                    color: "#38bdf8",
                    lineHeight: "1.45",
                  }}
                >
                  {rawRecordJson}
                </pre>
              </div>
            </div>
          )}

          {/* View 3: Execution Telemetry */}
          {activeTab === "metadata" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    backgroundColor: "#121217",
                    border: "1px solid #27272a",
                    borderRadius: "6px",
                    padding: "10px",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "#71717a", marginBottom: "4px" }}>
                    Command Execution ID
                  </div>
                  <code style={{ fontSize: "12px", color: "#38bdf8", wordBreak: "break-all" }}>
                    {command.id}
                  </code>
                </div>

                <div
                  style={{
                    backgroundColor: "#121217",
                    border: "1px solid #27272a",
                    borderRadius: "6px",
                    padding: "10px",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "#71717a", marginBottom: "4px" }}>
                    Exit Status & Code
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: isSuccess ? "#34d399" : "#f87171",
                    }}
                  >
                    {`Exit Code ${command.exitCode} (${isSuccess ? "Success" : "Failure / Pushback"})`}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: "#121217",
                    border: "1px solid #27272a",
                    borderRadius: "6px",
                    padding: "10px",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "#71717a", marginBottom: "4px" }}>
                    Duration & Performance
                  </div>
                  <div
                    style={{ fontSize: "12px", color: "#fafafa", fontFamily: "var(--font-mono)" }}
                  >
                    {`${command.durationMs} ms (${formatDuration(command.durationMs)})${memoryFormatted ? ` · Memory: ${memoryFormatted}` : ""}`}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: "#121217",
                    border: "1px solid #27272a",
                    borderRadius: "6px",
                    padding: "10px",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "#71717a", marginBottom: "4px" }}>
                    Host Model & Reasoning
                  </div>
                  <div style={{ fontSize: "12px", color: "#fafafa" }}>
                    {`${hostModel ?? "System Host"}${thinkingLevel ? ` · Thinking: ${thinkingLevel}` : ""}${typeof cognitiveTokens === "number" ? ` · ${formatTokens(cognitiveTokens)} Tokens` : ""}`}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: "#121217",
                    border: "1px solid #27272a",
                    borderRadius: "6px",
                    padding: "10px",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "#71717a", marginBottom: "4px" }}>
                    Execution Timeline
                  </div>
                  <div
                    style={{ fontSize: "11px", color: "#a1a1aa", fontFamily: "var(--font-mono)" }}
                  >
                    Started:{" "}
                    {command.startedAt ? new Date(command.startedAt).toLocaleString() : "N/A"}
                    <br />
                    Finished:{" "}
                    {command.finishedAt ? new Date(command.finishedAt).toLocaleString() : "N/A"}
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: "#121217",
                    border: "1px solid #27272a",
                    borderRadius: "6px",
                    padding: "10px",
                  }}
                >
                  <div style={{ fontSize: "11px", color: "#71717a", marginBottom: "4px" }}>
                    Record & Evidence Paths
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#38bdf8",
                      fontFamily: "var(--font-mono)",
                      wordBreak: "break-all",
                    }}
                  >
                    {recordPath}
                    <br />
                    <span style={{ color: "#71717a" }}>{evidencePath}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* View 4: Environment Variables */}
          {activeTab === "environment" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: "#121217",
                  border: "1px solid #27272a",
                  borderRadius: "6px",
                  padding: "8px 12px",
                }}
              >
                <span style={{ fontSize: "12px", color: "#e4e4e7", fontWeight: 500 }}>
                  Environment Variables ({envEntries.length})
                </span>
                <button
                  type="button"
                  className={`drawer-copy-btn ${copiedKey === "env-tab" ? "is-copied" : ""}`}
                  onClick={(e) =>
                    handleCopy(
                      JSON.stringify(command.environment ?? command.env, null, 2),
                      "env-tab",
                      e,
                    )
                  }
                  title="Copy Environment Variables"
                  aria-label="Copy Environment Variables"
                >
                  {copiedKey === "env-tab" ? <IconCheck size={11} /> : <IconCopy size={11} />}
                  <span>{copiedKey === "env-tab" ? "Copied!" : "Copy Env JSON"}</span>
                </button>
              </div>

              <div
                style={{
                  border: "1px solid #27272a",
                  borderRadius: "6px",
                  overflow: "hidden",
                  backgroundColor: "#09090b",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  <thead>
                    <tr style={{ backgroundColor: "#18181b", borderBottom: "1px solid #27272a" }}>
                      <th
                        style={{
                          padding: "6px 10px",
                          textAlign: "left",
                          color: "#a1a1aa",
                          width: "35%",
                        }}
                      >
                        Variable
                      </th>
                      <th style={{ padding: "6px 10px", textAlign: "left", color: "#a1a1aa" }}>
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {envEntries.map(([key, val]) => (
                      <tr
                        key={key}
                        style={{
                          borderBottom: "1px solid #1f1f23",
                        }}
                      >
                        <td
                          style={{
                            padding: "5px 10px",
                            color: "#38bdf8",
                            verticalAlign: "top",
                            wordBreak: "break-all",
                          }}
                        >
                          {key}
                        </td>
                        <td
                          style={{
                            padding: "5px 10px",
                            color: "#d4d4d8",
                            wordBreak: "break-all",
                          }}
                        >
                          {String(val)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
