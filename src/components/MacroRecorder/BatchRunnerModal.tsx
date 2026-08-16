import React, { useState } from "react";
import { BatchProcessor } from "../../engine/macros/batchProcessor";
import type { BatchErrorPolicy } from "../../engine/macros/types";
import { useGraphStore } from "../../state/useGraphStore";
import { useMacroStore } from "./useMacroStore";

export const BatchRunnerModal: React.FC = () => {
  const activeScript = useMacroStore((s) => s.activeScript);
  const isBatchRunning = useMacroStore((s) => s.isBatchRunning);
  const batchProgress = useMacroStore((s) => s.batchProgress);
  const batchResult = useMacroStore((s) => s.batchResult);
  const runBatch = useMacroStore((s) => s.runBatch);
  const abortBatch = useMacroStore((s) => s.abortBatch);

  const positionedNodes = useGraphStore((s) => s.positionedNodes);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);

  const [targetScope, setTargetScope] = useState<"all" | "selected" | "kind" | "status">("all");
  const [selectedKind, setSelectedKind] = useState<string>("agent");
  const [selectedStatus, setSelectedStatus] = useState<string>("running");
  const [nameFilter, setNameFilter] = useState<string>("");
  const [errorPolicy, setErrorPolicy] = useState<BatchErrorPolicy>("continue-on-error");

  // Compute matched targets
  const targets = BatchProcessor.filterTargets(positionedNodes, {
    selectedNodeIds: targetScope === "selected" && selectedNodeId ? [selectedNodeId] : undefined,
    kinds: targetScope === "kind" ? [selectedKind] : undefined,
    statuses: targetScope === "status" ? [selectedStatus] : undefined,
    nameContains: nameFilter.trim() || undefined,
  });

  const handleRunBatch = () => {
    if (!activeScript || targets.length === 0) return;
    void runBatch(targets, {
      errorPolicy,
      speedMultiplier: 0, // instant for batch operations
    });
  };

  const progressPercent =
    batchProgress && batchProgress.total > 0
      ? Math.round((batchProgress.completed / batchProgress.total) * 100)
      : 0;

  return (
    <div className="macro-batch-container">
      <div className="macro-batch-section">
        <span className="macro-batch-section-title">1. Target Elements Selection</span>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="batchScope"
              checked={targetScope === "all"}
              onChange={() => setTargetScope("all")}
            />
            <span>All Nodes ({positionedNodes.length})</span>
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="batchScope"
              checked={targetScope === "selected"}
              onChange={() => setTargetScope("selected")}
              disabled={!selectedNodeId}
            />
            <span>Selected Node {selectedNodeId ? `(${selectedNodeId})` : "(None)"}</span>
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="batchScope"
              checked={targetScope === "kind"}
              onChange={() => setTargetScope("kind")}
            />
            <span>By Kind</span>
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="batchScope"
              checked={targetScope === "status"}
              onChange={() => setTargetScope("status")}
            />
            <span>By Status</span>
          </label>
        </div>

        {targetScope === "kind" && (
          <div style={{ marginTop: "6px" }}>
            <select
              className="macro-param-input"
              value={selectedKind}
              onChange={(e) => setSelectedKind(e.target.value)}
            >
              <option value="agent">Agent</option>
              <option value="critic">Critic</option>
              <option value="gate">Gate</option>
              <option value="tool">Tool</option>
              <option value="router">Router</option>
              <option value="join">Join</option>
              <option value="terminal">Terminal</option>
            </select>
          </div>
        )}

        {targetScope === "status" && (
          <div style={{ marginTop: "6px" }}>
            <select
              className="macro-param-input"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="running">Running</option>
              <option value="pending">Pending</option>
              <option value="success">Success</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>
        )}

        <div style={{ marginTop: "6px" }}>
          <input
            type="text"
            className="macro-param-input"
            placeholder="Filter node name contains (optional)..."
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          />
        </div>

        <div style={{ fontSize: "11px", color: "#a7f3d0", marginTop: "4px" }}>
          ✓ {targets.length} node{targets.length === 1 ? "" : "s"} matched for batch execution
        </div>
      </div>

      {/* Policy Selection */}
      <div className="macro-batch-section">
        <span className="macro-batch-section-title">2. Error Handling Policy</span>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="errorPolicy"
              checked={errorPolicy === "continue-on-error"}
              onChange={() => setErrorPolicy("continue-on-error")}
            />
            <div>
              <strong>Continue on Error</strong>
              <div style={{ color: "#a1a1aa", fontSize: "10px" }}>
                Execute remaining nodes and log failures
              </div>
            </div>
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="errorPolicy"
              checked={errorPolicy === "stop-on-error"}
              onChange={() => setErrorPolicy("stop-on-error")}
            />
            <div>
              <strong>Stop on Error</strong>
              <div style={{ color: "#a1a1aa", fontSize: "10px" }}>
                Halt immediately when an element fails
              </div>
            </div>
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="errorPolicy"
              checked={errorPolicy === "rollback-on-error"}
              onChange={() => setErrorPolicy("rollback-on-error")}
            />
            <div>
              <strong>Rollback on Error (Transactional)</strong>
              <div style={{ color: "#a1a1aa", fontSize: "10px" }}>
                Revert all modified nodes back to initial graph state on failure
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Progress & Run Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {isBatchRunning ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div className="macro-progress-bar-bg">
              <div className="macro-progress-bar-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="macro-progress-text">
              <span>Running Batch: {batchProgress?.currentItem ?? "Processing..."}</span>
              <span>
                {progressPercent}% ({batchProgress?.completed}/{batchProgress?.total})
              </span>
            </div>
            <button
              type="button"
              className="macro-ctrl-btn danger"
              onClick={abortBatch}
              style={{ marginTop: "4px" }}
            >
              Abort Batch Execution
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="macro-ctrl-btn primary"
            disabled={targets.length === 0 || !activeScript}
            onClick={handleRunBatch}
            style={{ padding: "8px 12px" }}
          >
            Run Macro Across {targets.length} Element{targets.length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {/* Results Summary */}
      {batchResult && (
        <div className="macro-batch-section" style={{ background: "#121215" }}>
          <span className="macro-batch-section-title">Batch Execution Report</span>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "11px",
              marginTop: "4px",
            }}
          >
            <span>
              Status:{" "}
              <strong style={{ color: batchResult.status === "completed" ? "#a7f3d0" : "#fca5a5" }}>
                {batchResult.status}
              </strong>
            </span>
            <span>Duration: {batchResult.durationMs}ms</span>
          </div>
          <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "#d4d4d8" }}>
            <span style={{ color: "#a7f3d0" }}>✓ {batchResult.succeededCount} succeeded</span>
            {batchResult.failedCount > 0 && (
              <span style={{ color: "#f87171" }}>✕ {batchResult.failedCount} failed</span>
            )}
            {batchResult.skippedCount > 0 && (
              <span style={{ color: "#a1a1aa" }}>⊘ {batchResult.skippedCount} skipped</span>
            )}
          </div>
          {batchResult.errors.length > 0 && (
            <div style={{ color: "#f87171", fontSize: "10px", marginTop: "4px" }}>
              {batchResult.errors.map((e) => (
                <div key={e.elementId}>
                  {e.elementId}: {e.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
