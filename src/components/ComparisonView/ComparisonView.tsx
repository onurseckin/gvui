import type { FC } from "react";
import React, { useMemo, useState, useCallback } from "react";
import type { GraphDataset } from "../../types/graphData";
import {
  computeGraphDiff,
  type DiffStatus,
  type FindingDiff,
  type FindingDiffStatus,
  type NodeDiff,
} from "./diffEngine";
import "./ComparisonView.css";

export interface ComparisonViewProps {
  baseDataset?: GraphDataset | null;
  targetDataset?: GraphDataset | null;
  baseRunId?: string;
  targetRunId?: string;
  onClose?: () => void;
  onSelectNode?: (nodeId: string, run: "base" | "target") => void;
  onSwapRuns?: () => void;
  className?: string;
}

type TabType = "topology" | "performance" | "findings" | "raw";

function getNodeStatusTagLabel(status: DiffStatus): string {
  switch (status) {
    case "added":
      return "+ Added";
    case "removed":
      return "- Removed";
    case "modified":
      return "Δ Modified";
    case "unchanged":
      return "= Same";
  }
}

function getFindingStatusLabel(status: FindingDiffStatus): string {
  switch (status) {
    case "repaired":
      return "✓ REPAIRED";
    case "new":
      return "⚠ NEW ISSUE";
    case "regressed":
      return "✖ REGRESSED";
    case "persistent_open":
      return "⏳ UNRESOLVED";
    case "persistent_resolved":
      return "✓ RESOLVED IN BOTH";
  }
}

export const ComparisonView: FC<ComparisonViewProps> = React.memo(function ComparisonView({
  baseDataset,
  targetDataset,
  baseRunId,
  targetRunId,
  onClose,
  onSelectNode,
  onSwapRuns,
  className = "",
}) {
  const [activeTab, setActiveTab] = useState<TabType>("topology");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<DiffStatus | "all">("all");
  const [findingFilter, setFindingFilter] = useState<FindingDiffStatus | "all">("all");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const diff = useMemo(() => {
    return computeGraphDiff(baseDataset, targetDataset);
  }, [baseDataset, targetDataset]);

  const toggleNodeExpand = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const filteredNodes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return diff.nodesDiff.filter((node) => {
      if (statusFilter !== "all" && node.status !== statusFilter) return false;
      if (!q) return true;
      return (
        node.id.toLowerCase().includes(q) ||
        node.name.toLowerCase().includes(q) ||
        (node.kindB && node.kindB.toLowerCase().includes(q)) ||
        (node.kindA && node.kindA.toLowerCase().includes(q)) ||
        (node.modelB && node.modelB.toLowerCase().includes(q)) ||
        (node.modelA && node.modelA.toLowerCase().includes(q))
      );
    });
  }, [diff.nodesDiff, searchQuery, statusFilter]);

  const filteredEdges = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return diff.edgesDiff.filter((edge) => {
      if (statusFilter !== "all" && edge.status !== statusFilter) return false;
      if (!q) return true;
      return (
        edge.id.toLowerCase().includes(q) ||
        edge.source.toLowerCase().includes(q) ||
        edge.target.toLowerCase().includes(q)
      );
    });
  }, [diff.edgesDiff, searchQuery, statusFilter]);

  const filteredFindings = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return diff.findingsDiff.filter((f) => {
      if (findingFilter !== "all" && f.status !== findingFilter) return false;
      if (!q) return true;
      return (
        f.id.toLowerCase().includes(q) ||
        f.observation.toLowerCase().includes(q) ||
        (f.remediation && f.remediation.toLowerCase().includes(q)) ||
        (f.requirementId && f.requirementId.toLowerCase().includes(q))
      );
    });
  }, [diff.findingsDiff, searchQuery, findingFilter]);

  const baseLabel = baseRunId || diff.baseTitle || "Baseline";
  const targetLabel = targetRunId || diff.targetTitle || "Candidate";

  const renderKpiDelta = (deltaVal: number, pctVal: number, unit = "", invertGood = false) => {
    if (deltaVal === 0) {
      return (
        <span className="kpi-delta-pill kpi-delta-pill--neutral" data-testid="delta-pill-neutral">
          0 {unit} (0%)
        </span>
      );
    }
    // For duration, tokens, and errors, negative delta is improvement (green)
    const isImprovement = invertGood ? deltaVal > 0 : deltaVal < 0;
    const sign = deltaVal > 0 ? "+" : "";
    const formatted = `${sign}${deltaVal.toLocaleString()}${unit ? ` ${unit}` : ""} (${sign}${pctVal.toFixed(1)}%)`;

    return (
      <span
        className={`kpi-delta-pill ${
          isImprovement ? "kpi-delta-pill--positive" : "kpi-delta-pill--negative"
        }`}
        data-testid={isImprovement ? "delta-pill-positive" : "delta-pill-negative"}
      >
        {formatted}
      </span>
    );
  };

  const renderNodeDiffItem = (item: NodeDiff) => {
    const isExpanded = expandedNodes.has(item.id);
    return (
      <div
        key={item.id}
        className={`diff-item-card diff-item-card--${item.status}`}
        data-testid={`node-diff-${item.id}`}
      >
        <div
          className="diff-item-header"
          onClick={() => toggleNodeExpand(item.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleNodeExpand(item.id);
            }
          }}
          aria-expanded={isExpanded}
        >
          <div className="diff-item-header-left">
            <span
              className={`diff-status-tag diff-status-tag--${item.status}`}
              data-testid={`node-diff-status-${item.id}`}
            >
              {getNodeStatusTagLabel(item.status)}
            </span>
            <span className="diff-item-title">{item.name}</span>
            <span className="diff-item-id">{item.id}</span>
          </div>

          <div className="diff-item-header-right">
            <div className="diff-item-metrics-preview">
              {item.durationDeltaMs !== 0 && (
                <span>
                  ⏱ {item.durationDeltaMs > 0 ? "+" : ""}
                  {item.durationDeltaMs}ms
                </span>
              )}
              {item.tokensDelta !== 0 && (
                <span>
                  🪙 {item.tokensDelta > 0 ? "+" : ""}
                  {item.tokensDelta} tok
                </span>
              )}
              {item.repairRoundsDelta !== 0 && (
                <span>
                  🔧 {item.repairRoundsDelta > 0 ? "+" : ""}
                  {item.repairRoundsDelta} repairs
                </span>
              )}
            </div>

            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`diff-item-expand-icon ${isExpanded ? "expanded" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        {isExpanded && (
          <div className="diff-item-detail" data-testid={`node-diff-detail-${item.id}`}>
            {item.fieldChanges.length > 0 ? (
              <table className="diff-fields-table">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>{baseLabel} (Base)</th>
                    <th>{targetLabel} (Target)</th>
                  </tr>
                </thead>
                <tbody>
                  {item.fieldChanges.map((change) => (
                    <tr key={change.field}>
                      <td className="diff-field-name">{change.label}</td>
                      <td>
                        <span className="diff-field-val-a">
                          {change.from !== null && change.from !== undefined
                            ? String(change.from)
                            : "—"}
                        </span>
                      </td>
                      <td>
                        <span className="diff-field-val-b">
                          {change.to !== null && change.to !== undefined ? String(change.to) : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="diff-item-no-changes">
                {item.status === "added" && "New node introduced in candidate execution run."}
                {item.status === "removed" && "Node present in baseline was removed in candidate."}
                {item.status === "unchanged" &&
                  "No differences detected across runs for this node."}
              </div>
            )}

            {onSelectNode && (
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                {item.nodeA && (
                  <button
                    type="button"
                    className="status-filter-chip"
                    onClick={() => onSelectNode(item.id, "base")}
                  >
                    View in Base ({baseLabel})
                  </button>
                )}
                {item.nodeB && (
                  <button
                    type="button"
                    className="status-filter-chip"
                    onClick={() => onSelectNode(item.id, "target")}
                  >
                    View in Target ({targetLabel})
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderFindingItem = (f: FindingDiff) => {
    return (
      <div key={f.id} className="findings-diff-card" data-testid={`finding-diff-${f.id}`}>
        <div className="findings-diff-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              className={`finding-status-badge finding-status-badge--${
                f.status === "repaired"
                  ? "repaired"
                  : f.status === "new"
                    ? "new"
                    : f.status === "regressed"
                      ? "regressed"
                      : "persistent"
              }`}
              data-testid={`finding-status-${f.id}`}
            >
              {getFindingStatusLabel(f.status)}
            </span>
            <span style={{ fontSize: 11, color: "#a1a1aa", fontFamily: "var(--font-mono)" }}>
              {f.id}
            </span>
            {f.requirementId && (
              <span className="comparison-badge" style={{ fontSize: 10, padding: "1px 5px" }}>
                {f.requirementId}
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, textTransform: "capitalize", color: "#a1a1aa" }}>
            Severity: <strong>{f.severity}</strong>
          </span>
        </div>

        <div className="finding-observation">{f.observation}</div>

        {f.remediation && (
          <div className="finding-remediation">
            <strong>Remediation:</strong> {f.remediation}
          </div>
        )}

        {f.revalidationProof && (
          <div className="finding-proof" data-testid={`finding-proof-${f.id}`}>
            <strong>Revalidation Proof:</strong> {f.revalidationProof.method ?? "Automated Harness"}
            {Array.isArray(f.revalidationProof.evidence) &&
              f.revalidationProof.evidence.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {f.revalidationProof.evidence.map((ev, i) => (
                    <div key={i}>• {ev}</div>
                  ))}
                </div>
              )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`comparison-view-container ${className}`.trim()} data-testid="comparison-view">
      {/* Header */}
      <header className="comparison-header">
        <div className="comparison-header-left">
          <div className="comparison-title-row">
            <h2 className="comparison-title">Multi-Run Comparison & Topology Diff</h2>
            <span className="comparison-badge">Diff Mode</span>
          </div>
          <div className="comparison-subtitle">
            <span>Baseline (A):</span>
            <span className="run-tag run-tag--base" data-testid="base-run-tag">
              {baseLabel}
            </span>
            <span>vs Candidate (B):</span>
            <span className="run-tag run-tag--target" data-testid="target-run-tag">
              {targetLabel}
            </span>
          </div>
        </div>

        <div className="comparison-header-actions">
          {onSwapRuns && (
            <button
              type="button"
              className="status-filter-chip"
              onClick={onSwapRuns}
              data-testid="comparison-swap-btn"
              title="Swap Baseline and Candidate"
            >
              ⇄ Swap Runs
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="status-filter-chip"
              onClick={onClose}
              data-testid="comparison-close-btn"
              title="Close Comparison View"
              aria-label="Close Comparison View"
            >
              ✕ Close
            </button>
          )}
        </div>
      </header>

      {/* Summary KPI Cards Grid */}
      <div className="comparison-summary-grid" data-testid="comparison-summary-grid">
        {/* Duration Card */}
        <div className="summary-kpi-card" data-testid="kpi-duration">
          <div className="kpi-card-header">
            <span>Duration Delta</span>
            <span>⏱</span>
          </div>
          <div className="kpi-card-values">
            <div className="kpi-main-val">{diff.summary.duration.targetValue} ms</div>
            {renderKpiDelta(
              diff.summary.duration.delta,
              diff.summary.duration.percentChange,
              "ms",
              false,
            )}
          </div>
          <div className="kpi-sub-val">Base: {diff.summary.duration.baseValue} ms</div>
        </div>

        {/* Tokens Card */}
        <div className="summary-kpi-card" data-testid="kpi-tokens">
          <div className="kpi-card-header">
            <span>Token Footprint Delta</span>
            <span>🪙</span>
          </div>
          <div className="kpi-card-values">
            <div className="kpi-main-val">
              {diff.summary.tokens.targetValue.toLocaleString()} tok
            </div>
            {renderKpiDelta(
              diff.summary.tokens.delta,
              diff.summary.tokens.percentChange,
              "tok",
              false,
            )}
          </div>
          <div className="kpi-sub-val">
            Prompt: {diff.summary.promptTokens.targetValue} | Comp:{" "}
            {diff.summary.completionTokens.targetValue}
          </div>
        </div>

        {/* Node Topology Card */}
        <div className="summary-kpi-card" data-testid="kpi-nodes">
          <div className="kpi-card-header">
            <span>Node Topology</span>
            <span>⬡</span>
          </div>
          <div className="kpi-card-values">
            <div className="kpi-main-val">{diff.summary.nodes.totalB} nodes</div>
            <span className="kpi-delta-pill kpi-delta-pill--neutral">
              {diff.summary.nodes.delta >= 0
                ? `+${diff.summary.nodes.delta}`
                : diff.summary.nodes.delta}
            </span>
          </div>
          <div className="kpi-breakdown-row">
            {diff.summary.nodes.added > 0 && (
              <span className="kpi-pill-tag kpi-pill-tag--add">
                +{diff.summary.nodes.added} added
              </span>
            )}
            {diff.summary.nodes.removed > 0 && (
              <span className="kpi-pill-tag kpi-pill-tag--remove">
                -{diff.summary.nodes.removed} removed
              </span>
            )}
            {diff.summary.nodes.modified > 0 && (
              <span className="kpi-pill-tag kpi-pill-tag--modify">
                Δ{diff.summary.nodes.modified} modified
              </span>
            )}
          </div>
        </div>

        {/* Edge Topology Card */}
        <div className="summary-kpi-card" data-testid="kpi-edges">
          <div className="kpi-card-header">
            <span>Edge Topology</span>
            <span>→</span>
          </div>
          <div className="kpi-card-values">
            <div className="kpi-main-val">{diff.summary.edges.totalB} edges</div>
            <span className="kpi-delta-pill kpi-delta-pill--neutral">
              {diff.summary.edges.delta >= 0
                ? `+${diff.summary.edges.delta}`
                : diff.summary.edges.delta}
            </span>
          </div>
          <div className="kpi-breakdown-row">
            {diff.summary.edges.added > 0 && (
              <span className="kpi-pill-tag kpi-pill-tag--add">
                +{diff.summary.edges.added} added
              </span>
            )}
            {diff.summary.edges.removed > 0 && (
              <span className="kpi-pill-tag kpi-pill-tag--remove">
                -{diff.summary.edges.removed} removed
              </span>
            )}
            {diff.summary.edges.modified > 0 && (
              <span className="kpi-pill-tag kpi-pill-tag--modify">
                Δ{diff.summary.edges.modified} modified
              </span>
            )}
          </div>
        </div>

        {/* Findings Delta Card */}
        <div className="summary-kpi-card" data-testid="kpi-findings">
          <div className="kpi-card-header">
            <span>Repaired Findings</span>
            <span>🛡</span>
          </div>
          <div className="kpi-card-values">
            <div className="kpi-main-val">{diff.summary.findings.repaired} Repaired</div>
            {diff.summary.findings.newIssues > 0 ? (
              <span className="kpi-delta-pill kpi-delta-pill--negative">
                +{diff.summary.findings.newIssues} new
              </span>
            ) : (
              <span className="kpi-delta-pill kpi-delta-pill--positive">0 regressions</span>
            )}
          </div>
          <div className="kpi-breakdown-row">
            <span className="kpi-pill-tag kpi-pill-tag--repair">
              ✓ {diff.summary.findings.repaired} fixed
            </span>
            {diff.summary.findings.persistentOpen > 0 && (
              <span className="kpi-pill-tag kpi-pill-tag--modify">
                ⏳ {diff.summary.findings.persistentOpen} open
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs and Filter Toolbar */}
      <div className="comparison-nav-bar">
        <div className="comparison-tabs-list" role="tablist">
          <button
            type="button"
            className={`comparison-tab-btn ${activeTab === "topology" ? "active" : ""}`}
            onClick={() => setActiveTab("topology")}
            data-testid="tab-topology"
            role="tab"
            aria-selected={activeTab === "topology"}
          >
            Topology Diff
            <span className="comparison-tab-badge">{diff.nodesDiff.length}</span>
          </button>

          <button
            type="button"
            className={`comparison-tab-btn ${activeTab === "performance" ? "active" : ""}`}
            onClick={() => setActiveTab("performance")}
            data-testid="tab-performance"
            role="tab"
            aria-selected={activeTab === "performance"}
          >
            Performance & Tokens
          </button>

          <button
            type="button"
            className={`comparison-tab-btn ${activeTab === "findings" ? "active" : ""}`}
            onClick={() => setActiveTab("findings")}
            data-testid="tab-findings"
            role="tab"
            aria-selected={activeTab === "findings"}
          >
            Repaired Findings
            <span className="comparison-tab-badge">{diff.summary.findings.repaired}</span>
          </button>

          <button
            type="button"
            className={`comparison-tab-btn ${activeTab === "raw" ? "active" : ""}`}
            onClick={() => setActiveTab("raw")}
            data-testid="tab-raw"
            role="tab"
            aria-selected={activeTab === "raw"}
          >
            Raw Diff JSON
          </button>
        </div>

        <div className="comparison-filter-controls">
          <input
            type="text"
            className="comparison-search-input"
            placeholder="Search diffs..."
            value={searchQuery}
            onChange={handleSearchChange}
            data-testid="comparison-search-input"
            aria-label="Search diffs"
          />

          {activeTab === "topology" && (
            <div className="comparison-status-filters" data-testid="status-filter-group">
              <button
                type="button"
                className={`status-filter-chip ${statusFilter === "all" ? "active" : ""}`}
                onClick={() => setStatusFilter("all")}
                data-testid="filter-status-all"
              >
                All ({diff.nodesDiff.length})
              </button>
              <button
                type="button"
                className={`status-filter-chip ${statusFilter === "added" ? "active" : ""}`}
                onClick={() => setStatusFilter("added")}
                data-testid="filter-status-added"
              >
                + Added ({diff.summary.nodes.added})
              </button>
              <button
                type="button"
                className={`status-filter-chip ${statusFilter === "removed" ? "active" : ""}`}
                onClick={() => setStatusFilter("removed")}
                data-testid="filter-status-removed"
              >
                - Removed ({diff.summary.nodes.removed})
              </button>
              <button
                type="button"
                className={`status-filter-chip ${statusFilter === "modified" ? "active" : ""}`}
                onClick={() => setStatusFilter("modified")}
                data-testid="filter-status-modified"
              >
                Δ Modified ({diff.summary.nodes.modified})
              </button>
            </div>
          )}

          {activeTab === "findings" && (
            <div className="comparison-status-filters" data-testid="finding-filter-group">
              <button
                type="button"
                className={`status-filter-chip ${findingFilter === "all" ? "active" : ""}`}
                onClick={() => setFindingFilter("all")}
                data-testid="filter-finding-all"
              >
                All ({diff.findingsDiff.length})
              </button>
              <button
                type="button"
                className={`status-filter-chip ${findingFilter === "repaired" ? "active" : ""}`}
                onClick={() => setFindingFilter("repaired")}
                data-testid="filter-finding-repaired"
              >
                ✓ Repaired ({diff.summary.findings.repaired})
              </button>
              <button
                type="button"
                className={`status-filter-chip ${findingFilter === "new" ? "active" : ""}`}
                onClick={() => setFindingFilter("new")}
                data-testid="filter-finding-new"
              >
                ⚠ New ({diff.summary.findings.newIssues})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tab Content Body */}
      <div className="comparison-content-body" data-testid="comparison-body">
        {/* Identical Runs State */}
        {diff.isIdentical && diff.hasDatasets && (
          <div className="comparison-empty-panel" data-testid="identical-runs-banner">
            <div className="comparison-empty-icon">✓</div>
            <h3 className="comparison-empty-title">Datasets Are Identical</h3>
            <p className="comparison-empty-text">
              No topology changes, execution duration shifts, token variances, or repaired findings
              were detected between {baseLabel} and {targetLabel}.
            </p>
          </div>
        )}

        {/* Empty Dataset State */}
        {!diff.hasDatasets && (
          <div className="comparison-empty-panel" data-testid="empty-datasets-banner">
            <div className="comparison-empty-icon">⬡</div>
            <h3 className="comparison-empty-title">No Comparison Datasets Provided</h3>
            <p className="comparison-empty-text">
              Please select a baseline and candidate execution run to begin visual comparison.
            </p>
          </div>
        )}

        {/* Tab 1: Topology Diff */}
        {activeTab === "topology" && diff.hasDatasets && (
          <div className="diff-items-list" data-testid="topology-diff-list">
            <h3 style={{ margin: "4px 0 8px 0", fontSize: 13, color: "#a1a1aa" }}>
              Nodes Diff ({filteredNodes.length})
            </h3>
            {filteredNodes.length === 0 ? (
              <div className="comparison-empty-text">No nodes match the selected filter.</div>
            ) : (
              filteredNodes.map(renderNodeDiffItem)
            )}

            <h3 style={{ margin: "16px 0 8px 0", fontSize: 13, color: "#a1a1aa" }}>
              Edges Diff ({filteredEdges.length})
            </h3>
            {filteredEdges.length === 0 ? (
              <div className="comparison-empty-text">No edges match the selected filter.</div>
            ) : (
              filteredEdges.map((edge) => (
                <div
                  key={edge.id}
                  className={`diff-item-card diff-item-card--${edge.status}`}
                  data-testid={`edge-diff-${edge.id}`}
                >
                  <div className="diff-item-header">
                    <div className="diff-item-header-left">
                      <span className={`diff-status-tag diff-status-tag--${edge.status}`}>
                        {getNodeStatusTagLabel(edge.status)}
                      </span>
                      <span className="diff-item-title">
                        {edge.source} → {edge.target}
                      </span>
                      <span className="diff-item-id">{edge.id}</span>
                    </div>

                    <div className="diff-item-header-right">
                      {edge.tokensDelta !== 0 && (
                        <span
                          style={{ fontSize: 11, color: "#a1a1aa", fontFamily: "var(--font-mono)" }}
                        >
                          🪙 {edge.tokensDelta > 0 ? "+" : ""}
                          {edge.tokensDelta} tok
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Performance & Tokens */}
        {activeTab === "performance" && diff.hasDatasets && (
          <div className="diff-items-list" data-testid="performance-diff-view">
            <div className="findings-diff-card">
              <h3 style={{ margin: 0, fontSize: 14, color: "#ffffff" }}>
                Node Performance & Resource Deltas
              </h3>
              <table className="diff-fields-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Node ID / Name</th>
                    <th>Base Duration</th>
                    <th>Target Duration</th>
                    <th>Duration Delta</th>
                    <th>Base Tokens</th>
                    <th>Target Tokens</th>
                    <th>Tokens Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.nodesDiff.map((n) => (
                    <tr key={n.id} data-testid={`perf-row-${n.id}`}>
                      <td className="diff-field-name">
                        <div>{n.name}</div>
                        <div style={{ fontSize: 10, color: "#71717a" }}>{n.id}</div>
                      </td>
                      <td>{n.durationMsA} ms</td>
                      <td>{n.durationMsB} ms</td>
                      <td>
                        <span
                          style={{
                            color:
                              n.durationDeltaMs < 0
                                ? "#86efac"
                                : n.durationDeltaMs > 0
                                  ? "#fca5a5"
                                  : "#a1a1aa",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {n.durationDeltaMs > 0 ? "+" : ""}
                          {n.durationDeltaMs} ms
                        </span>
                      </td>
                      <td>{n.tokensA.toLocaleString()}</td>
                      <td>{n.tokensB.toLocaleString()}</td>
                      <td>
                        <span
                          style={{
                            color:
                              n.tokensDelta < 0
                                ? "#86efac"
                                : n.tokensDelta > 0
                                  ? "#fca5a5"
                                  : "#a1a1aa",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {n.tokensDelta > 0 ? "+" : ""}
                          {n.tokensDelta.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Repaired Findings */}
        {activeTab === "findings" && diff.hasDatasets && (
          <div className="diff-items-list" data-testid="findings-diff-view">
            {filteredFindings.length === 0 ? (
              <div className="comparison-empty-panel">
                <div className="comparison-empty-icon">✓</div>
                <h3 className="comparison-empty-title">No Audit Findings In Scope</h3>
                <p className="comparison-empty-text">
                  No findings match the current filter criteria across baseline and candidate runs.
                </p>
              </div>
            ) : (
              filteredFindings.map(renderFindingItem)
            )}
          </div>
        )}

        {/* Tab 4: Raw Diff JSON */}
        {activeTab === "raw" && (
          <div className="diff-items-list" data-testid="raw-diff-view">
            <pre
              style={{
                backgroundColor: "#0d0d10",
                border: "1px solid #27272a",
                borderRadius: 8,
                padding: 14,
                color: "#c4b5fd",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                overflowX: "auto",
                maxHeight: 500,
              }}
            >
              {JSON.stringify(diff, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
});

export default ComparisonView;
