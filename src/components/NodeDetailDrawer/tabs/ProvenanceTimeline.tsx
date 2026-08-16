import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconCopy,
  IconFileCode,
  IconFilter,
  IconKey,
  IconRobot,
  IconRoute,
  IconShieldCheck,
  IconShieldX,
  IconTerminal,
  IconUserCheck,
} from "@tabler/icons-react";
import type { FC, MouseEvent, ReactNode } from "react";
import { memo, useMemo, useState } from "react";
import type {
  ChainOfCustodyRecord,
  CommandExecutionDetail,
  GraphNodeData,
  NodeProvenanceData,
  ProvenanceCommandRef,
  ProvenanceEvent,
  ProvenanceEventStatus,
  ProvenanceRemediation,
} from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { copyToClipboard, formatDuration } from "../streamUtils";

export interface ProvenanceTimelineProps {
  node: GraphNodeData;
}

/**
 * Format a lease token into a compact short hash preview.
 * e.g. "1v9x_PDRWr_Dx9krMV3cYM_YIwMtlWQa5Nzc8MqpKKk" -> "1v9x_PDR...qpKKk"
 */
export function formatTokenPreview(token?: unknown): string {
  if (token === null || token === undefined) return "";
  const str = String(token).trim();
  if (str.length === 0) return "";
  if (str.length <= 16) return str;
  return `${str.slice(0, 8)}...${str.slice(-5)}`;
}

/**
 * Format a timestamp into a clean, human-readable date & time.
 */
export function formatTimestamp(ts?: unknown): string {
  if (ts === null || ts === undefined || ts === "" || ts === 0) return "";
  try {
    const d = new Date(ts as string | number);
    if (Number.isNaN(d.getTime())) return String(ts);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
  } catch {
    return String(ts);
  }
}

/**
 * Describe status color and icon for provenance events and custody records.
 */
export function describeProvenanceStatus(status?: ProvenanceEventStatus): {
  label: string;
  className: string;
  variant: "leased" | "validating" | "satisfied" | "rejected" | "repaired" | "running" | "neutral";
} {
  const s = (status ?? "").toLowerCase().trim();
  switch (s) {
    case "leased":
      return { label: "Leased", className: "status-leased", variant: "leased" };
    case "validating":
    case "validating_gate":
      return { label: "Validating", className: "status-validating", variant: "validating" };
    case "satisfied":
    case "passed":
    case "approved":
    case "success":
      return { label: "Satisfied", className: "status-satisfied", variant: "satisfied" };
    case "rejected":
    case "failed":
    case "pushback":
    case "error":
      return { label: "Rejected", className: "status-rejected", variant: "rejected" };
    case "repaired":
    case "resolved":
    case "fixed":
      return { label: "Repaired", className: "status-repaired", variant: "repaired" };
    case "running":
    case "in_progress":
      return { label: "Running", className: "status-running", variant: "running" };
    default:
      return {
        label: status ? status.toUpperCase() : "RECORDED",
        className: "status-neutral",
        variant: "neutral",
      };
  }
}

/**
 * Provenance & Execution Timeline Component.
 *
 * Renders:
 * 1. Chain of custody breakdown:
 *    - Actor IDs & roles
 *    - Validator lease token digests with short preview, copy button, and full digest toggle
 *    - Attempt progressions & retry counters
 *    - Finding remediations & revalidation proofs
 *    - Interactive command execution links & inspectable snippets
 *    - Resolution paths & step sequences
 * 2. Event timeline:
 *    - Chronological provenance events
 *    - Status badges, duration, timestamps, and actor attributions
 *    - Expandable payload inspection with copy triggers
 * 3. Standardized empty state handling.
 */
export const ProvenanceTimeline: FC<ProvenanceTimelineProps> = memo(function ProvenanceTimeline({
  node,
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedTokens, setExpandedTokens] = useState<Set<string>>(new Set());
  const [expandedPayloads, setExpandedPayloads] = useState<Set<string>>(new Set());
  const [expandedCommands, setExpandedCommands] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const handleCopy = async (text: string, key: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    await copyToClipboard(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleTokenExpand = (key: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedTokens((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const togglePayloadExpand = (key: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedPayloads((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleCommandExpand = (key: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedCommands((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Collect provenance data from node fields & metadata
  const provenanceData: NodeProvenanceData | undefined =
    node.provenance ??
    node.metadata?.provenance ??
    (node.chainOfCustody || node.timeline || node.events
      ? {
          chainOfCustody: node.chainOfCustody,
          events: node.timeline ?? node.events,
        }
      : undefined);

  // Extract custody records
  const rawCustody =
    provenanceData?.chainOfCustody ??
    provenanceData?.custody ??
    node.chainOfCustody ??
    node.metadata?.chainOfCustody;

  const custodyRecords: ChainOfCustodyRecord[] = useMemo(() => {
    if (Array.isArray(rawCustody)) return rawCustody;
    if (rawCustody && typeof rawCustody === "object") return [rawCustody];

    // Synthesize custody record from node metadata if present
    const meta = node.metadata;
    const actorId = meta?.leaseAgent ?? meta?.actorId ?? provenanceData?.actorId;
    const leaseToken =
      meta?.validatorLeaseToken ??
      meta?.leaseToken ??
      provenanceData?.validatorLeaseToken ??
      provenanceData?.leaseToken;
    const attempt = meta?.attempt ?? provenanceData?.attempt;
    const round = meta?.repairRounds ?? meta?.round ?? provenanceData?.round;
    const resolutionPath = meta?.resolutionPath ?? provenanceData?.resolutionPath;

    if (actorId || leaseToken || attempt !== undefined || round !== undefined || resolutionPath) {
      return [
        {
          actorId,
          leaseToken,
          validatorLeaseToken: leaseToken,
          attempt,
          round,
          resolutionPath,
          status: (node.status as ProvenanceEventStatus) ?? "leased",
          commands: meta?.commands,
          findings: meta?.findings,
        },
      ];
    }

    return [];
  }, [rawCustody, node.metadata, node.status, provenanceData]);

  // Extract timeline events
  const rawEvents =
    provenanceData?.events ??
    provenanceData?.timeline ??
    node.timeline ??
    node.events ??
    node.metadata?.timeline ??
    node.metadata?.events;

  const timelineEvents: ProvenanceEvent[] = useMemo(() => {
    if (!Array.isArray(rawEvents)) return [];
    return [...rawEvents].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    });
  }, [rawEvents]);

  // Available status filters
  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    for (const ev of timelineEvents) {
      if (ev.status) set.add(ev.status.toLowerCase());
    }
    return Array.from(set);
  }, [timelineEvents]);

  const filteredEvents = useMemo(() => {
    if (statusFilter === "all") return timelineEvents;
    return timelineEvents.filter((ev) => (ev.status ?? "").toLowerCase() === statusFilter);
  }, [timelineEvents, statusFilter]);

  const hasCustody = custodyRecords.length > 0;
  const hasTimeline = timelineEvents.length > 0;

  if (!hasCustody && !hasTimeline) {
    return (
      <div className="drawer-empty-state">
        No provenance events or chain of custody records found for this node.
      </div>
    );
  }

  // Lookup node commands for reference matching
  const nodeCommands = (node.metadata?.commands ?? []) as CommandExecutionDetail[];
  const findCommandDetail = (
    ref?: string | ProvenanceCommandRef | CommandExecutionDetail,
  ): CommandExecutionDetail | ProvenanceCommandRef | undefined => {
    if (!ref) return undefined;
    if (typeof ref === "string") {
      return nodeCommands.find((c) => c.id === ref) ?? { id: ref, argv: [ref] };
    }
    if (typeof ref === "object" && ref.id) {
      return nodeCommands.find((c) => c.id === ref.id) ?? ref;
    }
    return ref;
  };

  const renderCommandInspection = (
    cmd: CommandExecutionDetail | ProvenanceCommandRef,
    cmdKey: string,
  ): ReactNode => {
    const isExpanded = expandedCommands.has(cmdKey);
    const cmdLine = Array.isArray(cmd.argv) ? cmd.argv.join(" ") : String(cmd.argv ?? cmd.id);
    const isSuccess = cmd.exitCode === 0;

    return (
      <div key={cmdKey} className="provenance-command-card">
        <div className="provenance-command-bar">
          <button
            type="button"
            className="provenance-command-toggle-btn"
            onClick={(e) => toggleCommandExpand(cmdKey, e)}
            aria-expanded={isExpanded}
            aria-label={`Toggle command inspection for ${cmd.id ?? cmdLine}`}
          >
            <span className="provenance-command-toggle-icon">
              {isExpanded ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
            </span>
            <IconTerminal size={13} className="provenance-command-icon" />
            <code className="provenance-command-title">{cmd.id ?? "Command Ref"}</code>
            {cmd.exitCode !== undefined && (
              <span
                className={`provenance-exit-badge ${isSuccess ? "is-success" : "is-error"}`}
                title={`Exit Code: ${cmd.exitCode}`}
              >
                {isSuccess ? "Exit 0" : `Exit ${cmd.exitCode}`}
              </span>
            )}
            {cmd.durationMs !== undefined && (
              <span className="provenance-cmd-duration">
                <IconClock size={11} style={{ marginRight: 2, verticalAlign: "middle" }} />
                {formatDuration(cmd.durationMs)}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`drawer-copy-btn ${copiedKey === `cmd-${cmdKey}` ? "is-copied" : ""}`}
            onClick={(e) => handleCopy(cmdLine, `cmd-${cmdKey}`, e)}
            title="Copy command"
            aria-label="Copy command line"
          >
            {copiedKey === `cmd-${cmdKey}` ? <IconCheck size={11} /> : <IconCopy size={11} />}
            <span>{copiedKey === `cmd-${cmdKey}` ? "Copied!" : "Copy"}</span>
          </button>
        </div>

        {isExpanded && (
          <div className="provenance-command-details">
            <div className="provenance-command-argv">
              <span className="provenance-command-prompt">$</span>
              <code>{cmdLine}</code>
            </div>

            {cmd.cwd && (
              <div className="provenance-command-submeta">
                <span>CWD:</span>
                <code>{cmd.cwd}</code>
              </div>
            )}

            {cmd.stdoutSnippet && (
              <div className="provenance-log-box">
                <div className="provenance-log-header">stdout snippet</div>
                <pre className="drawer-pre drawer-pre--stdout">{cmd.stdoutSnippet}</pre>
              </div>
            )}

            {cmd.stderrSnippet && (
              <div className="provenance-log-box">
                <div className="provenance-log-header provenance-log-header--stderr">
                  stderr snippet
                </div>
                <pre className="drawer-pre drawer-pre--stderr">{cmd.stderrSnippet}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderResolutionPath = (path?: string | string[]): ReactNode => {
    if (!path) return null;
    const steps = Array.isArray(path)
      ? path
      : path
          .split(/->|➔|>/)
          .map((s) => s.trim())
          .filter(Boolean);

    if (steps.length === 0) return null;

    return (
      <div className="provenance-resolution-path">
        <div className="provenance-sublabel">
          <IconRoute size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
          Resolution Path & Lifecycle Trajectory:
        </div>
        <div className="provenance-path-steps">
          {steps.map((step, idx) => (
            <span key={idx} className="provenance-step-item">
              <span className="provenance-step-pill">{step}</span>
              {idx < steps.length - 1 && (
                <IconArrowRight size={12} className="provenance-step-arrow" />
              )}
            </span>
          ))}
        </div>
      </div>
    );
  };

  const renderRemediations = (remediations?: Array<ProvenanceRemediation | string>): ReactNode => {
    if (!remediations || remediations.length === 0) return null;

    return (
      <div className="provenance-remediations-list">
        <div className="provenance-sublabel">
          <IconShieldX size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
          Finding Remediations & Pushback Resolutions:
        </div>
        {remediations.map((rem, idx) => {
          if (typeof rem === "string") {
            return (
              <div key={idx} className="provenance-remediation-card">
                <p className="provenance-remediation-text">{rem}</p>
              </div>
            );
          }

          const sev = (rem.severity ?? "important").toLowerCase();
          const isResolved = (rem.status ?? "").toLowerCase() === "resolved";

          return (
            <div key={rem.id ?? idx} className={`provenance-remediation-card severity-${sev}`}>
              <div className="provenance-remediation-header">
                {rem.id || rem.findingId ? (
                  <code className="provenance-remediation-id">{rem.id ?? rem.findingId}</code>
                ) : null}
                <span className={`drawer-finding-severity ${sev}`}>
                  {`${sev.toUpperCase()} SEVERITY`}
                </span>
                {rem.status && (
                  <span
                    className={`provenance-status-pill ${isResolved ? "status-satisfied" : "status-rejected"}`}
                  >
                    {isResolved ? "RESOLVED" : rem.status.toUpperCase()}
                  </span>
                )}
              </div>

              {rem.observation && (
                <div className="provenance-rem-field">
                  <span className="provenance-field-label">Observation:</span>
                  <p className="provenance-field-value">{rem.observation}</p>
                </div>
              )}

              {rem.remediation && (
                <div className="provenance-rem-field">
                  <span className="provenance-field-label">Required Remediation:</span>
                  <p className="provenance-field-value provenance-field-value--remediation">
                    {rem.remediation}
                  </p>
                </div>
              )}

              {rem.proof && (
                <div className="provenance-proof-box">
                  <div className="provenance-field-label">
                    <IconShieldCheck size={11} style={{ marginRight: 3 }} />
                    Revalidation Proof:
                  </div>
                  {typeof rem.proof === "string" ? (
                    <code className="provenance-proof-code">{rem.proof}</code>
                  ) : (
                    <div className="provenance-proof-content">
                      {rem.proof.method && (
                        <div>
                          <strong>Method:</strong> {rem.proof.method}
                        </div>
                      )}
                      {Array.isArray(rem.proof.evidence) && (
                        <ul className="provenance-evidence-list">
                          {rem.proof.evidence.map((ev, eIdx) => (
                            <li key={eIdx}>{ev}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="provenance-container">
      {/* 1. Chain of Custody Section */}
      {hasCustody && (
        <DrawerSection title="Chain of Custody & Validator Lease" count={custodyRecords.length}>
          <div className="provenance-custody-list">
            {custodyRecords.map((record, index) => {
              const token = record.validatorLeaseToken ?? record.leaseToken ?? record.tokenDigest;
              const tokenKey = `custody-token-${index}`;
              const isTokenExpanded = expandedTokens.has(tokenKey);
              const actor = record.actorId ?? record.actor ?? record.agent ?? "Unknown Actor";
              const role = record.role;
              const statusDesc = describeProvenanceStatus(record.status);
              const attempt = record.attempt;
              const maxAttempts = record.maxAttempts ?? record.totalAttempts;
              const round = record.round;

              const commandRefs = (record.commands ?? record.commandRefs ?? []) as Array<
                string | CommandExecutionDetail | ProvenanceCommandRef
              >;
              const remediations = (record.remediations ?? record.findings ?? []) as Array<
                ProvenanceRemediation | string
              >;

              return (
                <div key={index} className="provenance-custody-card">
                  <div className="provenance-custody-header">
                    <div className="provenance-actor-wrap">
                      <span className="provenance-actor-icon">
                        <IconUserCheck size={16} />
                      </span>
                      <div className="provenance-actor-info">
                        <div className="provenance-actor-name-row">
                          <strong className="provenance-actor-name">{actor}</strong>
                          {role && <span className="provenance-role-chip">{role}</span>}
                          <span className={`provenance-status-pill ${statusDesc.className}`}>
                            {statusDesc.label}
                          </span>
                        </div>
                        {record.timestamp && (
                          <span className="provenance-time-sub">
                            {formatTimestamp(record.timestamp)}
                          </span>
                        )}
                      </div>
                    </div>

                    {(attempt !== undefined || round !== undefined) && (
                      <div className="provenance-progression-pills">
                        {attempt !== undefined && (
                          <span className="provenance-attempt-pill">
                            {maxAttempts
                              ? `Attempt ${attempt} of ${maxAttempts}`
                              : `Attempt #${attempt}`}
                          </span>
                        )}
                        {round !== undefined && round > 0 && (
                          <span className="provenance-round-pill">
                            <IconAlertTriangle size={11} style={{ marginRight: 2 }} />
                            {`Repair Round #${round}`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Validator Lease Token Digest */}
                  {token && (
                    <div className="provenance-token-section">
                      <div className="provenance-token-header">
                        <div className="provenance-token-label">
                          <IconKey size={12} className="provenance-key-icon" />
                          <span>Validator Lease Token:</span>
                        </div>

                        <div className="provenance-token-actions">
                          <button
                            type="button"
                            className="provenance-toggle-token-btn"
                            onClick={(e) => toggleTokenExpand(tokenKey, e)}
                            aria-expanded={isTokenExpanded}
                            aria-label="Toggle full lease token digest"
                          >
                            {isTokenExpanded ? "Show Short" : "Show Full"}
                          </button>

                          <button
                            type="button"
                            className={`drawer-copy-btn ${copiedKey === tokenKey ? "is-copied" : ""}`}
                            onClick={(e) => handleCopy(token, tokenKey, e)}
                            title="Copy lease token"
                            aria-label="Copy lease token digest"
                          >
                            {copiedKey === tokenKey ? (
                              <IconCheck size={11} />
                            ) : (
                              <IconCopy size={11} />
                            )}
                            <span>{copiedKey === tokenKey ? "Copied!" : "Copy Digest"}</span>
                          </button>
                        </div>
                      </div>

                      <div className="provenance-token-body">
                        {isTokenExpanded ? (
                          <pre className="provenance-token-pre">
                            <code>{token}</code>
                          </pre>
                        ) : (
                          <code className="provenance-token-digest">
                            {formatTokenPreview(token)}
                          </code>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Resolution Path */}
                  {renderResolutionPath(record.resolutionPath)}

                  {/* Finding Remediations */}
                  {renderRemediations(remediations)}

                  {/* Referenced Commands */}
                  {commandRefs.length > 0 && (
                    <div className="provenance-commands-section">
                      <div className="provenance-sublabel">
                        <IconTerminal
                          size={12}
                          style={{ marginRight: 4, verticalAlign: "middle" }}
                        />
                        {`Referenced Execution Commands (${commandRefs.length}):`}
                      </div>
                      {commandRefs.map((cmdRef, cIdx) => {
                        const cmd = findCommandDetail(cmdRef);
                        if (!cmd) return null;
                        return renderCommandInspection(cmd, `custody-${index}-cmd-${cIdx}`);
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DrawerSection>
      )}

      {/* 2. Chronological Event Timeline Section */}
      {hasTimeline && (
        <DrawerSection title="Provenance Event Timeline" count={filteredEvents.length}>
          {/* Status Filter Chips */}
          {availableStatuses.length > 1 && (
            <div className="provenance-filter-bar" role="toolbar" aria-label="Event Status Filter">
              <span className="provenance-filter-label">
                <IconFilter size={11} style={{ marginRight: 3, verticalAlign: "middle" }} />
                Filter:
              </span>
              <button
                type="button"
                className={`drawer-filter-chip ${statusFilter === "all" ? "is-active" : ""}`}
                onClick={() => setStatusFilter("all")}
              >
                {`All (${timelineEvents.length})`}
              </button>
              {availableStatuses.map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`drawer-filter-chip ${statusFilter === st ? "is-active" : ""}`}
                  onClick={() => setStatusFilter(st)}
                >
                  {st.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {filteredEvents.length === 0 ? (
            <div className="drawer-empty-state">
              {`No provenance events match the selected status filter "${statusFilter}".`}
            </div>
          ) : (
            <div className="provenance-timeline-list">
              {filteredEvents.map((ev, index) => {
                const statusDesc = describeProvenanceStatus(ev.status);
                const payloadKey = `payload-${ev.id ?? index}`;
                const isPayloadExpanded = expandedPayloads.has(payloadKey);
                const payloadStr =
                  typeof ev.payload === "string"
                    ? ev.payload
                    : ev.payload !== undefined
                      ? JSON.stringify(ev.payload, null, 2)
                      : ev.payloadSnippet;

                const actor = ev.actorId ?? ev.actor ?? ev.agent;
                const token = ev.validatorLeaseToken ?? ev.leaseToken ?? ev.tokenDigest;
                const tokenKey = `ev-token-${ev.id ?? index}`;
                const isTokenExpanded = expandedTokens.has(tokenKey);
                const cmdRef = ev.commandRef ?? ev.command ?? ev.commandId;
                const cmd = cmdRef ? findCommandDetail(cmdRef) : undefined;
                const remediations = ev.remediations ?? (ev.remediation ? [ev.remediation] : []);

                return (
                  <div key={ev.id ?? index} className="provenance-timeline-item">
                    <div className="provenance-timeline-marker">
                      <span className={`provenance-timeline-dot ${statusDesc.className}`}>
                        {index + 1}
                      </span>
                      <div className="provenance-timeline-line" />
                    </div>

                    <div className="provenance-timeline-content">
                      <div className="provenance-timeline-header">
                        <div className="provenance-timeline-title-row">
                          <strong className="provenance-timeline-title">
                            {ev.title ?? ev.label ?? ev.type ?? `Event #${index + 1}`}
                          </strong>
                          <span className={`provenance-status-pill ${statusDesc.className}`}>
                            {statusDesc.label}
                          </span>
                          {ev.attempt !== undefined && (
                            <span className="provenance-attempt-chip">
                              {`Attempt #${ev.attempt}`}
                            </span>
                          )}
                          {ev.round !== undefined && ev.round > 0 && (
                            <span className="provenance-round-chip">{`Round #${ev.round}`}</span>
                          )}
                        </div>

                        <div className="provenance-timeline-meta-right">
                          {ev.durationMs !== undefined && (
                            <span className="provenance-duration-pill">
                              <IconClock
                                size={11}
                                style={{ marginRight: 2, verticalAlign: "middle" }}
                              />
                              {formatDuration(ev.durationMs)}
                            </span>
                          )}
                          {ev.timestamp && (
                            <span className="provenance-timeline-time" title={String(ev.timestamp)}>
                              {formatTimestamp(ev.timestamp)}
                            </span>
                          )}
                        </div>
                      </div>

                      {ev.summary && <p className="provenance-event-summary">{ev.summary}</p>}

                      {/* Actor attribution & token digest in timeline event */}
                      {(actor || token) && (
                        <div className="provenance-event-chips-row">
                          {actor && (
                            <span className="provenance-actor-chip">
                              <IconRobot
                                size={11}
                                style={{ marginRight: 2, verticalAlign: "middle" }}
                              />
                              {actor}
                              {ev.role ? ` (${ev.role})` : ""}
                            </span>
                          )}

                          {token && (
                            <div className="provenance-event-token-wrap">
                              <span className="provenance-token-inline-label">
                                <IconKey size={11} /> Token:
                              </span>
                              <code className="provenance-token-digest">
                                {isTokenExpanded ? token : formatTokenPreview(token)}
                              </code>
                              <button
                                type="button"
                                className="provenance-inline-toggle-btn"
                                onClick={(e) => toggleTokenExpand(tokenKey, e)}
                              >
                                {isTokenExpanded ? "Short" : "Full"}
                              </button>
                              <button
                                type="button"
                                className={`drawer-copy-btn ${copiedKey === tokenKey ? "is-copied" : ""}`}
                                onClick={(e) => handleCopy(token, tokenKey, e)}
                                aria-label="Copy event lease token"
                              >
                                {copiedKey === tokenKey ? (
                                  <IconCheck size={11} />
                                ) : (
                                  <IconCopy size={11} />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Resolution Path inside Event */}
                      {renderResolutionPath(ev.resolutionPath)}

                      {/* Remediations inside Event */}
                      {renderRemediations(remediations)}

                      {/* Command Reference inside Event */}
                      {cmd && renderCommandInspection(cmd, `ev-${ev.id ?? index}-cmd`)}

                      {/* Expandable Event Payload */}
                      {payloadStr && (
                        <div className="provenance-payload-box">
                          <div className="provenance-payload-header">
                            <button
                              type="button"
                              className="provenance-payload-toggle-btn"
                              onClick={(e) => togglePayloadExpand(payloadKey, e)}
                              aria-expanded={isPayloadExpanded}
                              aria-label={`Toggle payload view for ${ev.title ?? ev.id}`}
                            >
                              {isPayloadExpanded ? (
                                <IconChevronDown size={12} />
                              ) : (
                                <IconChevronRight size={12} />
                              )}
                              <IconFileCode size={12} />
                              <span>Payload Details</span>
                            </button>

                            <button
                              type="button"
                              className={`drawer-copy-btn ${copiedKey === payloadKey ? "is-copied" : ""}`}
                              onClick={(e) => handleCopy(payloadStr, payloadKey, e)}
                              aria-label="Copy event payload"
                            >
                              {copiedKey === payloadKey ? (
                                <IconCheck size={11} />
                              ) : (
                                <IconCopy size={11} />
                              )}
                              <span>{copiedKey === payloadKey ? "Copied!" : "Copy"}</span>
                            </button>
                          </div>

                          {isPayloadExpanded && (
                            <pre className="drawer-pre provenance-payload-pre">
                              <code>{payloadStr}</code>
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DrawerSection>
      )}
    </div>
  );
});

export default ProvenanceTimeline;
