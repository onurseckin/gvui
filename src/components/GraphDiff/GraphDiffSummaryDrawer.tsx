import type { FC } from "react";
import React, { useCallback, useMemo, useState } from "react";
import {
  IconCheck,
  IconClock,
  IconCoins,
  IconCopy,
  IconCpu,
  IconShieldCheck,
  IconX,
} from "@tabler/icons-react";
import {
  formatCostUsd,
  formatDurationMs,
  formatMetricDeltaValue,
  safeStringify,
} from "./diffEngine";
import { useGraphDiffStore } from "../../store/useGraphDiffStore";
import type { DiffStatus, FindingDiff, FindingDiffStatus, MetricDelta } from "./types";

export interface GraphDiffSummaryDrawerProps {
  className?: string;
  onClose?: () => void;
}

function getStatusBadgeClass(status: DiffStatus): string {
  switch (status) {
    case "added":
      return "diff-status-tag diff-status-tag--added";
    case "removed":
      return "diff-status-tag diff-status-tag--removed";
    case "modified":
      return "diff-status-tag diff-status-tag--modified";
    case "unchanged":
    default:
      return "diff-status-tag diff-status-tag--unchanged";
  }
}

function getFindingStatusBadge(status: FindingDiffStatus): { text: string; className: string } {
  switch (status) {
    case "repaired":
      return { text: "✓ REPAIRED", className: "diff-status-tag diff-status-tag--added" };
    case "new":
      return { text: "⚠ NEW ISSUE", className: "diff-status-tag diff-status-tag--removed" };
    case "regressed":
      return { text: "✖ REGRESSED", className: "diff-status-tag diff-status-tag--removed" };
    case "persistent_open":
      return { text: "⏳ UNRESOLVED", className: "diff-status-tag diff-status-tag--modified" };
    case "persistent_resolved":
      return {
        text: "✓ RESOLVED IN BOTH",
        className: "diff-status-tag diff-status-tag--unchanged",
      };
  }
}

function renderDeltaClass(delta: MetricDelta, inverseGood = false): string {
  if (delta.isNeutral) return "diff-delta-val--neutral";
  if (inverseGood) {
    // For duration, cost, errors, decreases are GOOD (green), increases are BAD (rose)
    return delta.isDecrease ? "diff-delta-val--neg" : "diff-delta-val--pos";
  }
  // For tokens processed or throughput, increases might be positive
  return delta.isIncrease ? "diff-delta-val--pos" : "diff-delta-val--neg";
}

export const GraphDiffSummaryDrawer: FC<GraphDiffSummaryDrawerProps> = React.memo(
  function GraphDiffSummaryDrawer({ className = "", onClose }) {
    const {
      isSummaryDrawerOpen,
      setSummaryDrawerOpen,
      activeDrawerTab,
      setActiveDrawerTab,
      selectedNodeId,
      setSelectedNodeId,
      selectedEdgeId,
      setSelectedEdgeId,
      diffResult,
      getFilteredNodes,
      getFilteredEdges,
    } = useGraphDiffStore();

    const [copiedJson, setCopiedJson] = useState(false);
    const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null);

    const filteredNodes = getFilteredNodes();
    const filteredEdges = getFilteredEdges();
    const { metrics, counts } = diffResult;

    const selectedNode = useMemo(() => {
      if (!selectedNodeId) return null;
      return diffResult.nodeDiffMap[selectedNodeId] ?? null;
    }, [selectedNodeId, diffResult]);

    const selectedEdge = useMemo(() => {
      if (!selectedEdgeId) return null;
      return diffResult.edgeDiffMap[selectedEdgeId] ?? null;
    }, [selectedEdgeId, diffResult]);

    const allFindings = useMemo(() => {
      const list: FindingDiff[] = [];
      for (const node of diffResult.nodeDiffs) {
        list.push(...node.findingsDiff);
      }
      return list;
    }, [diffResult]);

    const handleCopyJson = useCallback(() => {
      const dataToCopy = selectedNode ?? selectedEdge ?? diffResult;
      navigator.clipboard.writeText(JSON.stringify(dataToCopy, null, 2)).then(() => {
        setCopiedJson(true);
        setTimeout(() => setCopiedJson(false), 2000);
      });
    }, [selectedNode, selectedEdge, diffResult]);

    const handleClose = useCallback(() => {
      if (onClose) {
        onClose();
      } else {
        setSummaryDrawerOpen(false);
      }
    }, [onClose, setSummaryDrawerOpen]);

    if (!isSummaryDrawerOpen) {
      return null;
    }

    return (
      <aside
        className={`graph-diff-drawer ${className}`}
        role="complementary"
        aria-label="Graph Diff Summary Drawer"
      >
        {/* Drawer Header */}
        <div className="diff-drawer-header">
          <div className="diff-drawer-title">
            <IconCpu size={16} />
            <span>Diff Inspector</span>
          </div>
          <button
            type="button"
            className="diff-drawer-close"
            onClick={handleClose}
            aria-label="Close Inspector Drawer"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="diff-drawer-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeDrawerTab === "overview"}
            className={`diff-drawer-tab-btn ${activeDrawerTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveDrawerTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeDrawerTab === "nodes"}
            className={`diff-drawer-tab-btn ${activeDrawerTab === "nodes" ? "active" : ""}`}
            onClick={() => setActiveDrawerTab("nodes")}
          >
            Nodes ({filteredNodes.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeDrawerTab === "edges"}
            className={`diff-drawer-tab-btn ${activeDrawerTab === "edges" ? "active" : ""}`}
            onClick={() => setActiveDrawerTab("edges")}
          >
            Edges ({filteredEdges.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeDrawerTab === "findings"}
            className={`diff-drawer-tab-btn ${activeDrawerTab === "findings" ? "active" : ""}`}
            onClick={() => setActiveDrawerTab("findings")}
          >
            Findings ({allFindings.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeDrawerTab === "raw"}
            className={`diff-drawer-tab-btn ${activeDrawerTab === "raw" ? "active" : ""}`}
            onClick={() => setActiveDrawerTab("raw")}
          >
            Raw Diff
          </button>
        </div>

        {/* Tab Body */}
        <div className="diff-drawer-body">
          {/* TAB 1: OVERVIEW */}
          {activeDrawerTab === "overview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Primary KPI Grid */}
              <div className="diff-kpi-grid">
                <div className="diff-kpi-card">
                  <div className="diff-kpi-label">
                    <IconClock size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    Duration
                  </div>
                  <div className="diff-kpi-value-row">
                    <span className="diff-kpi-value">
                      {formatDurationMs(metrics.totalDurationMs.compValue)}
                    </span>
                    <span
                      className={`diff-kpi-delta ${renderDeltaClass(metrics.totalDurationMs, true)}`}
                    >
                      {metrics.totalDurationMs.delta > 0 ? "+" : ""}
                      {formatDurationMs(metrics.totalDurationMs.delta)} (
                      {metrics.totalDurationMs.percentChange > 0 ? "+" : ""}
                      {metrics.totalDurationMs.percentChange.toFixed(1)}%)
                    </span>
                  </div>
                </div>

                <div className="diff-kpi-card">
                  <div className="diff-kpi-label">
                    <IconCpu size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    Total Tokens
                  </div>
                  <div className="diff-kpi-value-row">
                    <span className="diff-kpi-value">
                      {formatMetricDeltaValue(metrics.totalTokens.compValue)}
                    </span>
                    <span
                      className={`diff-kpi-delta ${renderDeltaClass(metrics.totalTokens, true)}`}
                    >
                      {metrics.totalTokens.delta > 0 ? "+" : ""}
                      {formatMetricDeltaValue(metrics.totalTokens.delta)} (
                      {metrics.totalTokens.percentChange > 0 ? "+" : ""}
                      {metrics.totalTokens.percentChange.toFixed(1)}%)
                    </span>
                  </div>
                </div>

                <div className="diff-kpi-card">
                  <div className="diff-kpi-label">
                    <IconCoins size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />
                    Estimated Cost
                  </div>
                  <div className="diff-kpi-value-row">
                    <span className="diff-kpi-value">
                      {formatCostUsd(metrics.totalCostUsd.compValue)}
                    </span>
                    <span
                      className={`diff-kpi-delta ${renderDeltaClass(metrics.totalCostUsd, true)}`}
                    >
                      {metrics.totalCostUsd.delta > 0 ? "+" : ""}
                      {formatCostUsd(metrics.totalCostUsd.delta)}
                    </span>
                  </div>
                </div>

                <div className="diff-kpi-card">
                  <div className="diff-kpi-label">
                    <IconShieldCheck
                      size={12}
                      style={{ verticalAlign: "middle", marginRight: 4 }}
                    />
                    Gate Findings
                  </div>
                  <div className="diff-kpi-value-row">
                    <span className="diff-kpi-value">
                      {counts.findings.repaired} Repaired /{" "}
                      {counts.findings.new + counts.findings.regressed} New
                    </span>
                    <span
                      className={`diff-kpi-delta ${counts.findings.repaired > 0 ? "diff-delta-val--neg" : "diff-delta-val--neutral"}`}
                    >
                      {counts.findings.total} Total
                    </span>
                  </div>
                </div>
              </div>

              {/* Topology Summary */}
              <div
                style={{
                  background: "#161619",
                  padding: "14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{ fontSize: "12px", fontWeight: 600, marginBottom: "10px", color: "#fff" }}
                >
                  Topology Change Breakdown
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>
                      Nodes
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "3px",
                      }}
                    >
                      <span style={{ color: "#34d399" }}>+ {counts.nodes.added} Added</span>
                      <span style={{ color: "#fb7185" }}>- {counts.nodes.removed} Removed</span>
                      <span style={{ color: "#fbbf24" }}>Δ {counts.nodes.modified} Modified</span>
                      <span style={{ color: "#94a3b8" }}>= {counts.nodes.unchanged} Unchanged</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#a1a1aa", marginBottom: "4px" }}>
                      Edges
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "3px",
                      }}
                    >
                      <span style={{ color: "#34d399" }}>+ {counts.edges.added} Added</span>
                      <span style={{ color: "#fb7185" }}>- {counts.edges.removed} Removed</span>
                      <span style={{ color: "#fbbf24" }}>Δ {counts.edges.modified} Modified</span>
                      <span style={{ color: "#94a3b8" }}>= {counts.edges.unchanged} Unchanged</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Token Breakdown Details */}
              <div
                style={{
                  background: "#161619",
                  padding: "14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div
                  style={{ fontSize: "12px", fontWeight: 600, marginBottom: "10px", color: "#fff" }}
                >
                  Token Consumption Details
                </div>
                <table className="diff-prop-table">
                  <thead>
                    <tr>
                      <th>Token Type</th>
                      <th>Baseline</th>
                      <th>Comparison</th>
                      <th>Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Prompt</td>
                      <td className="diff-val-base">
                        {formatMetricDeltaValue(metrics.totalPromptTokens.baseValue)}
                      </td>
                      <td className="diff-val-comp">
                        {formatMetricDeltaValue(metrics.totalPromptTokens.compValue)}
                      </td>
                      <td
                        className={`diff-kpi-delta ${renderDeltaClass(metrics.totalPromptTokens, true)}`}
                      >
                        {formatMetricDeltaValue(metrics.totalPromptTokens.delta)}
                      </td>
                    </tr>
                    <tr>
                      <td>Completion</td>
                      <td className="diff-val-base">
                        {formatMetricDeltaValue(metrics.totalCompletionTokens.baseValue)}
                      </td>
                      <td className="diff-val-comp">
                        {formatMetricDeltaValue(metrics.totalCompletionTokens.compValue)}
                      </td>
                      <td
                        className={`diff-kpi-delta ${renderDeltaClass(metrics.totalCompletionTokens, true)}`}
                      >
                        {formatMetricDeltaValue(metrics.totalCompletionTokens.delta)}
                      </td>
                    </tr>
                    <tr>
                      <td>Reasoning</td>
                      <td className="diff-val-base">
                        {formatMetricDeltaValue(metrics.totalReasoningTokens.baseValue)}
                      </td>
                      <td className="diff-val-comp">
                        {formatMetricDeltaValue(metrics.totalReasoningTokens.compValue)}
                      </td>
                      <td
                        className={`diff-kpi-delta ${renderDeltaClass(metrics.totalReasoningTokens, true)}`}
                      >
                        {formatMetricDeltaValue(metrics.totalReasoningTokens.delta)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: NODES */}
          {activeDrawerTab === "nodes" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {selectedNode && (
                <div
                  style={{
                    background: "#18181b",
                    padding: "12px",
                    borderRadius: "8px",
                    border: "1px solid #38bdf8",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "#fff", fontSize: "13px" }}>
                      Selected: {selectedNode.name}
                    </span>
                    <button
                      type="button"
                      className="diff-toolbar-btn"
                      onClick={() => setSelectedNodeId(null)}
                      style={{ padding: "2px 6px", fontSize: "10px" }}
                    >
                      Clear Selection
                    </button>
                  </div>

                  <div style={{ marginBottom: "10px" }}>
                    <span className={getStatusBadgeClass(selectedNode.status)}>
                      {selectedNode.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Property Changes Table */}
                  {selectedNode.propertyChanges.length > 0 && (
                    <div style={{ marginTop: "10px" }}>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#a1a1aa",
                          marginBottom: "6px",
                        }}
                      >
                        Property Diffs:
                      </div>
                      <table className="diff-prop-table">
                        <thead>
                          <tr>
                            <th>Field</th>
                            <th>Baseline</th>
                            <th>Comparison</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedNode.propertyChanges.map((p) => (
                            <tr
                              key={p.field}
                              className={p.isDifferent ? "diff-prop-row--changed" : ""}
                            >
                              <td style={{ fontWeight: 600 }}>{p.label}</td>
                              <td className="diff-val-base">{safeStringify(p.oldValue)}</td>
                              <td
                                className={`diff-val-comp ${p.isDifferent ? "diff-val-changed" : ""}`}
                              >
                                {safeStringify(p.newValue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Port Changes */}
                  {(selectedNode.inputPortChanges.length > 0 ||
                    selectedNode.outputPortChanges.length > 0) && (
                    <div style={{ marginTop: "12px" }}>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#a1a1aa",
                          marginBottom: "6px",
                        }}
                      >
                        I/O Port Differences:
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {[...selectedNode.inputPortChanges, ...selectedNode.outputPortChanges].map(
                          (p, idx) => (
                            <div
                              key={`port-${idx}`}
                              style={{
                                fontSize: "11px",
                                display: "flex",
                                justifyContent: "space-between",
                                padding: "4px 6px",
                                background: "rgba(255,255,255,0.03)",
                                borderRadius: "4px",
                              }}
                            >
                              <span>
                                {p.label} ({p.kind})
                              </span>
                              <span className={getStatusBadgeClass(p.status)}>{p.status}</span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tool Changes */}
                  {selectedNode.toolChanges.length > 0 && (
                    <div style={{ marginTop: "12px" }}>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#a1a1aa",
                          marginBottom: "6px",
                        }}
                      >
                        Tool Attachments:
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {selectedNode.toolChanges.map((t, idx) => (
                          <div
                            key={`tool-${idx}`}
                            style={{
                              fontSize: "11px",
                              display: "flex",
                              justifyContent: "space-between",
                              padding: "4px 6px",
                              background: "rgba(255,255,255,0.03)",
                              borderRadius: "4px",
                            }}
                          >
                            <span>{t.name}</span>
                            <span className={getStatusBadgeClass(t.status)}>{t.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* File Touches */}
                  {selectedNode.fileChanges.length > 0 && (
                    <div style={{ marginTop: "12px" }}>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "#a1a1aa",
                          marginBottom: "6px",
                        }}
                      >
                        Modified Files:
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {selectedNode.fileChanges.map((f, idx) => (
                          <div
                            key={`file-${idx}`}
                            style={{
                              fontSize: "11px",
                              display: "flex",
                              justifyContent: "space-between",
                              padding: "4px 6px",
                              background: "rgba(255,255,255,0.03)",
                              borderRadius: "4px",
                            }}
                          >
                            <span style={{ fontFamily: "monospace" }}>{f.path}</span>
                            <span className={getStatusBadgeClass(f.status)}>{f.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* List of all filtered nodes */}
              <div style={{ fontSize: "11px", fontWeight: 600, color: "#a1a1aa" }}>
                All Nodes ({filteredNodes.length}):
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {filteredNodes.map((node) => (
                  <div
                    key={node.id}
                    className={`diff-node-card diff-node-card--${node.status} ${selectedNodeId === node.id ? "selected" : ""}`}
                    onClick={() => setSelectedNodeId(node.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedNodeId(node.id)}
                  >
                    <div className="diff-node-card-header">
                      <span className="diff-node-title" title={node.name}>
                        {node.name}
                      </span>
                      <span className={getStatusBadgeClass(node.status)}>{node.status}</span>
                    </div>

                    <div className="diff-node-metrics-bar">
                      <span className="diff-metric-chip">
                        <IconClock size={11} />
                        <span
                          className={`diff-delta-val ${renderDeltaClass(node.metrics.durationMs, true)}`}
                        >
                          {formatDurationMs(node.metrics.durationMs.compValue)} (
                          {node.metrics.durationMs.formattedDelta})
                        </span>
                      </span>
                      <span className="diff-metric-chip">
                        <IconCpu size={11} />
                        <span
                          className={`diff-delta-val ${renderDeltaClass(node.metrics.tokensTotal, true)}`}
                        >
                          {formatMetricDeltaValue(node.metrics.tokensTotal.compValue)} tokens
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: EDGES */}
          {activeDrawerTab === "edges" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {selectedEdge && (
                <div
                  style={{
                    background: "#18181b",
                    padding: "12px",
                    borderRadius: "8px",
                    border: "1px solid #38bdf8",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span style={{ fontWeight: 700, color: "#fff", fontSize: "13px" }}>
                      Edge: {selectedEdge.source} → {selectedEdge.target}
                    </span>
                    <button
                      type="button"
                      className="diff-toolbar-btn"
                      onClick={() => setSelectedEdgeId(null)}
                      style={{ padding: "2px 6px", fontSize: "10px" }}
                    >
                      Clear Selection
                    </button>
                  </div>

                  <span className={getStatusBadgeClass(selectedEdge.status)}>
                    {selectedEdge.status.toUpperCase()}
                  </span>

                  {selectedEdge.propertyChanges.length > 0 && (
                    <div style={{ marginTop: "10px" }}>
                      <table className="diff-prop-table">
                        <thead>
                          <tr>
                            <th>Field</th>
                            <th>Baseline</th>
                            <th>Comparison</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedEdge.propertyChanges.map((p) => (
                            <tr
                              key={p.field}
                              className={p.isDifferent ? "diff-prop-row--changed" : ""}
                            >
                              <td>{p.label}</td>
                              <td className="diff-val-base">{safeStringify(p.oldValue)}</td>
                              <td
                                className={`diff-val-comp ${p.isDifferent ? "diff-val-changed" : ""}`}
                              >
                                {safeStringify(p.newValue)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div style={{ fontSize: "11px", fontWeight: 600, color: "#a1a1aa" }}>
                All Edges ({filteredEdges.length}):
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {filteredEdges.map((edge) => (
                  <div
                    key={edge.id}
                    className={`diff-node-card diff-node-card--${edge.status} ${selectedEdgeId === edge.id ? "selected" : ""}`}
                    onClick={() => setSelectedEdgeId(edge.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedEdgeId(edge.id)}
                  >
                    <div className="diff-node-card-header">
                      <span className="diff-node-title">
                        {edge.source} → {edge.target}
                      </span>
                      <span className={getStatusBadgeClass(edge.status)}>{edge.status}</span>
                    </div>
                    <div style={{ fontSize: "11px", color: "#a1a1aa" }}>
                      Type: {edge.kindComp ?? edge.kindBase ?? "default"}
                      {edge.labelComp ? ` (${edge.labelComp})` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: FINDINGS */}
          {activeDrawerTab === "findings" && (
            <div className="diff-findings-list">
              {allFindings.length === 0 ? (
                <div className="diff-empty-banner">
                  <IconShieldCheck className="diff-empty-icon" size={32} />
                  <span>No gate findings or remediations recorded in either run.</span>
                </div>
              ) : (
                allFindings.map((finding) => {
                  const badge = getFindingStatusBadge(finding.status);
                  const isExpanded = expandedFindingId === finding.id;

                  return (
                    <div
                      key={finding.id}
                      className={`diff-finding-card diff-finding-card--${finding.status} ${isExpanded ? "expanded" : ""}`}
                      onClick={() =>
                        setExpandedFindingId((prev) => (prev === finding.id ? null : finding.id))
                      }
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        setExpandedFindingId((prev) => (prev === finding.id ? null : finding.id))
                      }
                    >
                      <div className="diff-finding-header">
                        <span className="diff-finding-title">
                          {finding.requirementId ? `[${finding.requirementId}] ` : ""}
                          {finding.id}
                        </span>
                        <span className={badge.className}>{badge.text}</span>
                      </div>

                      <div style={{ fontSize: "12px", color: "#d4d4d8" }}>
                        {finding.observation}
                      </div>

                      {finding.remediation && (
                        <div style={{ fontSize: "11px", color: "#a1a1aa" }}>
                          <strong>Remediation:</strong> {finding.remediation}
                        </div>
                      )}

                      {finding.revalidationProof && (
                        <div className="diff-finding-proof">
                          <div style={{ fontWeight: 600, marginBottom: "2px" }}>
                            Proof Method: {finding.revalidationProof.method ?? "Verification"}
                          </div>
                          {Array.isArray(finding.revalidationProof.evidence) ? (
                            finding.revalidationProof.evidence.map((ev, idx) => (
                              <div key={idx}>• {ev}</div>
                            ))
                          ) : (
                            <div>{String(finding.revalidationProof.evidence)}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 5: RAW JSON */}
          {activeDrawerTab === "raw" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="diff-toolbar-btn"
                  onClick={handleCopyJson}
                  title="Copy JSON to clipboard"
                >
                  {copiedJson ? <IconCheck size={14} color="#34d399" /> : <IconCopy size={14} />}
                  <span>{copiedJson ? "Copied!" : "Copy JSON"}</span>
                </button>
              </div>
              <pre
                style={{
                  background: "#09090b",
                  padding: "12px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono, monospace)",
                  color: "#d4d4d8",
                  overflowX: "auto",
                  maxHeight: "500px",
                }}
              >
                {JSON.stringify(selectedNode ?? selectedEdge ?? diffResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </aside>
    );
  },
);
