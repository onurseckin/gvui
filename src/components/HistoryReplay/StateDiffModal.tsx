import type { ChangeEvent, FC } from "react";
import { memo, useCallback, useMemo, useState } from "react";
import {
  IconCheck,
  IconClock,
  IconFileDelta,
  IconGitCompare,
  IconKey,
  IconLayersSubtract,
  IconListDetails,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { diffStates } from "../../store/useHistoryReplayStore";
import type { ReplayEvent, StateDiffResult } from "./types";

export interface StateDiffModalProps {
  isOpen: boolean;
  events: readonly ReplayEvent[];
  initialIndexA?: number;
  initialIndexB?: number;
  onClose: () => void;
  onJumpToEvent?: (index: number) => void;
  className?: string;
}

export const StateDiffModal: FC<StateDiffModalProps> = memo(function StateDiffModal({
  isOpen,
  events,
  initialIndexA = 0,
  initialIndexB = 0,
  onClose,
  onJumpToEvent,
  className = "",
}) {
  const totalEvents = events.length;

  const [indexA, setIndexA] = useState<number>(
    Math.max(0, Math.min(initialIndexA, Math.max(0, totalEvents - 1))),
  );
  const [indexB, setIndexB] = useState<number>(
    Math.max(0, Math.min(initialIndexB, Math.max(0, totalEvents - 1))),
  );
  const [activeTab, setActiveTab] = useState<"nodes" | "edges" | "leases" | "properties">("nodes");

  const diffResult: StateDiffResult = useMemo(() => {
    return diffStates(indexA, indexB, events);
  }, [indexA, indexB, events]);

  const handleSelectA = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    setIndexA(parseInt(e.target.value, 10));
  }, []);

  const handleSelectB = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    setIndexB(parseInt(e.target.value, 10));
  }, []);

  const handleCompareWithPrevious = useCallback(() => {
    if (indexB > 0) {
      setIndexA(indexB - 1);
    }
  }, [indexB]);

  if (!isOpen) return null;

  const {
    summary,
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedEdges,
    removedEdges,
    modifiedEdges,
    addedLeases,
    releasedLeases,
    propertyChanges,
  } = diffResult;

  return (
    <div className={`state-diff-modal-overlay ${className}`} data-testid="state-diff-modal">
      <div className="state-diff-modal-container" role="dialog" aria-labelledby="diff-modal-title">
        {/* Header */}
        <div className="state-diff-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <IconGitCompare size={20} style={{ color: "#818cf8" }} />
            <h2 id="diff-modal-title" style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>
              Differential State Inspector
            </h2>
          </div>
          <button
            type="button"
            className="history-replay-btn history-replay-btn-icon"
            onClick={onClose}
            aria-label="Close diff modal"
            data-testid="btn-close-diff-modal"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* State Selectors */}
        <div className="state-diff-selectors-row">
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontWeight: 600, color: "#a1a1aa" }}>Base State (A):</span>
            <select
              className="state-diff-select"
              value={indexA}
              onChange={handleSelectA}
              data-testid="select-diff-a"
            >
              {events.map((ev, idx) => (
                <option key={`opt-a-${ev.id}-${idx}`} value={idx}>
                  #{ev.sequence} — {ev.kind} ({ev.actor})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontWeight: 600, color: "#a1a1aa" }}>Target State (B):</span>
            <select
              className="state-diff-select"
              value={indexB}
              onChange={handleSelectB}
              data-testid="select-diff-b"
            >
              {events.map((ev, idx) => (
                <option key={`opt-b-${ev.id}-${idx}`} value={idx}>
                  #{ev.sequence} — {ev.kind} ({ev.actor})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="history-replay-btn"
            style={{ fontSize: "11px", padding: "4px 8px" }}
            onClick={handleCompareWithPrevious}
            disabled={indexB === 0}
            data-testid="btn-compare-prev"
          >
            <IconClock size={12} /> Compare with Prev
          </button>
        </div>

        {/* Summary Badges */}
        <div className="state-diff-summary-badges">
          <span className="diff-badge diff-add" data-testid="diff-badge-nodes-added">
            +{summary.nodesAdded} Nodes Added
          </span>
          <span className="diff-badge diff-remove" data-testid="diff-badge-nodes-removed">
            -{summary.nodesRemoved} Nodes Removed
          </span>
          <span className="diff-badge diff-mod" data-testid="diff-badge-nodes-modified">
            ~{summary.nodesModified} Nodes Modified
          </span>
          <span className="diff-badge diff-add" data-testid="diff-badge-edges-added">
            +{summary.edgesAdded} Edges Added
          </span>
          <span className="diff-badge diff-remove" data-testid="diff-badge-edges-removed">
            -{summary.edgesRemoved} Edges Removed
          </span>
          <span className="diff-badge diff-mod" data-testid="diff-badge-leases-changed">
            {summary.leasesGranted} Leases Granted / {summary.leasesReleased} Released
          </span>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: "4px",
            padding: "8px 20px",
            background: "#18181b",
            borderBottom: "1px solid #27272a",
          }}
        >
          <button
            type="button"
            className={`bookmark-filter-tab ${activeTab === "nodes" ? "active" : ""}`}
            onClick={() => setActiveTab("nodes")}
            data-testid="diff-tab-nodes"
          >
            <IconLayersSubtract size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
            Nodes ({addedNodes.length + removedNodes.length + modifiedNodes.length})
          </button>
          <button
            type="button"
            className={`bookmark-filter-tab ${activeTab === "edges" ? "active" : ""}`}
            onClick={() => setActiveTab("edges")}
            data-testid="diff-tab-edges"
          >
            <IconFileDelta size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
            Edges ({addedEdges.length + removedEdges.length + modifiedEdges.length})
          </button>
          <button
            type="button"
            className={`bookmark-filter-tab ${activeTab === "leases" ? "active" : ""}`}
            onClick={() => setActiveTab("leases")}
            data-testid="diff-tab-leases"
          >
            <IconKey size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
            Leases ({addedLeases.length + releasedLeases.length})
          </button>
          <button
            type="button"
            className={`bookmark-filter-tab ${activeTab === "properties" ? "active" : ""}`}
            onClick={() => setActiveTab("properties")}
            data-testid="diff-tab-properties"
          >
            <IconListDetails size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
            Property Logs ({propertyChanges.length})
          </button>
        </div>

        {/* Body content based on active tab */}
        <div className="state-diff-modal-body" data-testid="state-diff-body">
          {activeTab === "nodes" && (
            <div>
              {addedNodes.length === 0 &&
              removedNodes.length === 0 &&
              modifiedNodes.length === 0 ? (
                <div style={{ color: "#71717a", textAlign: "center", padding: "24px" }}>
                  No node structural or status differences between Event #{diffResult.sequenceA} and
                  #{diffResult.sequenceB}.
                </div>
              ) : (
                <table className="diff-items-table" data-testid="diff-table-nodes">
                  <thead>
                    <tr>
                      <th>Delta</th>
                      <th>Node ID</th>
                      <th>Name / Label</th>
                      <th>Kind</th>
                      <th>Status Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {addedNodes.map((n) => (
                      <tr key={`add-${n.id}`} className="diff-row-added">
                        <td>
                          <IconPlus size={14} style={{ verticalAlign: "middle" }} /> ADDED
                        </td>
                        <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{n.id}</td>
                        <td>{n.name}</td>
                        <td>{n.kind ?? "agent"}</td>
                        <td>{n.status ?? "pending"}</td>
                      </tr>
                    ))}
                    {removedNodes.map((n) => (
                      <tr key={`rem-${n.id}`} className="diff-row-removed">
                        <td>
                          <IconTrash size={14} style={{ verticalAlign: "middle" }} /> REMOVED
                        </td>
                        <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{n.id}</td>
                        <td>{n.name}</td>
                        <td>{n.kind ?? "agent"}</td>
                        <td>{n.status ?? "pending"}</td>
                      </tr>
                    ))}
                    {modifiedNodes.map((m) => (
                      <tr key={`mod-${m.nodeId}`} className="diff-row-modified">
                        <td>MODIFIED</td>
                        <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{m.nodeId}</td>
                        <td>{m.after.name}</td>
                        <td>{m.after.kind ?? "agent"}</td>
                        <td>
                          {m.fromStatus} →{" "}
                          <strong
                            style={{
                              color:
                                m.toStatus === "error"
                                  ? "#f87171"
                                  : m.toStatus === "success"
                                    ? "#34d399"
                                    : "#60a5fa",
                            }}
                          >
                            {m.toStatus}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === "edges" && (
            <div>
              {addedEdges.length === 0 &&
              removedEdges.length === 0 &&
              modifiedEdges.length === 0 ? (
                <div style={{ color: "#71717a", textAlign: "center", padding: "24px" }}>
                  No edge differences between Event #{diffResult.sequenceA} and #
                  {diffResult.sequenceB}.
                </div>
              ) : (
                <table className="diff-items-table" data-testid="diff-table-edges">
                  <thead>
                    <tr>
                      <th>Delta</th>
                      <th>Edge ID</th>
                      <th>Source</th>
                      <th>Target</th>
                      <th>Kind / Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {addedEdges.map((e) => (
                      <tr key={`add-edge-${e.id}`} className="diff-row-added">
                        <td>
                          <IconPlus size={14} style={{ verticalAlign: "middle" }} /> ADDED
                        </td>
                        <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{e.id}</td>
                        <td>{e.source}</td>
                        <td>{e.target}</td>
                        <td>{e.kind ?? e.label ?? "sequence"}</td>
                      </tr>
                    ))}
                    {removedEdges.map((e) => (
                      <tr key={`rem-edge-${e.id}`} className="diff-row-removed">
                        <td>
                          <IconTrash size={14} style={{ verticalAlign: "middle" }} /> REMOVED
                        </td>
                        <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{e.id}</td>
                        <td>{e.source}</td>
                        <td>{e.target}</td>
                        <td>{e.kind ?? e.label ?? "sequence"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === "leases" && (
            <div>
              {addedLeases.length === 0 && releasedLeases.length === 0 ? (
                <div style={{ color: "#71717a", textAlign: "center", padding: "24px" }}>
                  No active lease changes between Event #{diffResult.sequenceA} and #
                  {diffResult.sequenceB}.
                </div>
              ) : (
                <table className="diff-items-table" data-testid="diff-table-leases">
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Task ID</th>
                      <th>Agent ID</th>
                      <th>Role</th>
                      <th>Issued At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {addedLeases.map((l) => (
                      <tr key={`grant-${l.taskId}-${l.agentId}`} className="diff-row-added">
                        <td>
                          <IconCheck size={14} style={{ verticalAlign: "middle" }} /> LEASE GRANTED
                        </td>
                        <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{l.taskId}</td>
                        <td>{l.agentId}</td>
                        <td>{l.role ?? "implementer"}</td>
                        <td>{l.issuedAt ? new Date(l.issuedAt).toLocaleTimeString() : "-"}</td>
                      </tr>
                    ))}
                    {releasedLeases.map((l) => (
                      <tr key={`rel-${l.taskId}-${l.agentId}`} className="diff-row-removed">
                        <td>RELEASED</td>
                        <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{l.taskId}</td>
                        <td>{l.agentId}</td>
                        <td>{l.role ?? "implementer"}</td>
                        <td>{l.issuedAt ? new Date(l.issuedAt).toLocaleTimeString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === "properties" && (
            <div>
              {propertyChanges.length === 0 ? (
                <div style={{ color: "#71717a", textAlign: "center", padding: "24px" }}>
                  No individual property field mutations recorded.
                </div>
              ) : (
                <table className="diff-items-table" data-testid="diff-table-properties">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Entity ID</th>
                      <th>Field</th>
                      <th>Before (State A)</th>
                      <th>After (State B)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {propertyChanges.map((p, idx) => (
                      <tr key={`prop-${p.entityType}-${p.entityId}-${p.field}-${idx}`}>
                        <td
                          style={{ textTransform: "uppercase", fontSize: "11px", fontWeight: 700 }}
                        >
                          {p.entityType}
                        </td>
                        <td style={{ fontFamily: "var(--font-mono, monospace)" }}>{p.entityId}</td>
                        <td>{p.field}</td>
                        <td style={{ color: "#fca5a5" }}>
                          {p.from !== null && p.from !== undefined ? String(p.from) : "null"}
                        </td>
                        <td style={{ color: "#86efac" }}>
                          {p.to !== null && p.to !== undefined ? String(p.to) : "null"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="state-diff-modal-footer">
          {onJumpToEvent && (
            <button
              type="button"
              className="history-replay-btn history-replay-btn-primary"
              onClick={() => {
                onJumpToEvent(indexB);
                onClose();
              }}
              data-testid="btn-jump-to-target-state"
            >
              Jump Replay to Target State (#{diffResult.sequenceB})
            </button>
          )}
          <button
            type="button"
            className="history-replay-btn"
            onClick={onClose}
            data-testid="btn-footer-close-diff"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
});
