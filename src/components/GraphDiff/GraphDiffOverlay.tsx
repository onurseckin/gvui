import type { FC } from "react";
import React, { useCallback, useEffect, useRef } from "react";
import type { GraphDataset } from "../../types/graphData";
import { useGraphDiffStore } from "../../store/useGraphDiffStore";
import { GraphDiffLegend } from "./GraphDiffLegend";
import { GraphDiffSummaryDrawer } from "./GraphDiffSummaryDrawer";
import { GraphDiffToolbar } from "./GraphDiffToolbar";
import { formatDurationMs, formatMetricDeltaValue } from "./diffEngine";
import type { DiffStatus, NodeDiff } from "./types";
import "./GraphDiff.css";

export interface GraphDiffOverlayProps {
  baseDataset?: GraphDataset | null;
  comparisonDataset?: GraphDataset | null;
  targetDataset?: GraphDataset | null;
  baseRunId?: string;
  comparisonRunId?: string;
  targetRunId?: string;
  onClose?: () => void;
  onSelectNode?: (nodeId: string, run: "base" | "comp") => void;
  onSwapRuns?: () => void;
  className?: string;
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

export const GraphDiffOverlay: FC<GraphDiffOverlayProps> = React.memo(function GraphDiffOverlay({
  baseDataset,
  comparisonDataset,
  targetDataset,
  baseRunId,
  comparisonRunId,
  targetRunId,
  onClose,
  onSelectNode,
  onSwapRuns,
  className = "",
}) {
  const {
    diffResult,
    visualMode,
    overlayOpacity,
    splitRatio,
    selectedNodeId,
    setDatasets,
    setSelectedNodeId,
    setSplitRatio,
    getFilteredNodes,
  } = useGraphDiffStore();

  // Sync incoming props into Zustand store on change if explicitly provided
  useEffect(() => {
    if (
      baseDataset !== undefined ||
      comparisonDataset !== undefined ||
      targetDataset !== undefined
    ) {
      setDatasets(
        baseDataset ?? null,
        comparisonDataset ?? targetDataset ?? null,
        baseRunId,
        comparisonRunId ?? targetRunId,
      );
    }
  }, [
    baseDataset,
    comparisonDataset,
    targetDataset,
    baseRunId,
    comparisonRunId,
    targetRunId,
    setDatasets,
  ]);

  const filteredNodes = getFilteredNodes();
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingDivider = useRef(false);

  const handleNodeClick = useCallback(
    (nodeId: string, run: "base" | "comp" = "comp") => {
      setSelectedNodeId(nodeId);
      if (onSelectNode) {
        onSelectNode(nodeId, run);
      }
    },
    [setSelectedNodeId, onSelectNode],
  );

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingDivider.current = true;
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDraggingDivider.current || !splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const newRatio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(newRatio);
    },
    [setSplitRatio],
  );

  const handleMouseUp = useCallback(() => {
    isDraggingDivider.current = false;
  }, []);

  const renderNodeCard = useCallback(
    (node: NodeDiff, forceOpacity?: number) => {
      const isSelected = selectedNodeId === node.id;
      const style = forceOpacity !== undefined ? { opacity: forceOpacity } : undefined;

      return (
        <div
          key={node.id}
          className={`diff-node-card diff-node-card--${node.status} ${isSelected ? "selected" : ""}`}
          style={style}
          onClick={() => handleNodeClick(node.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && handleNodeClick(node.id)}
          title={`Click to inspect diff for ${node.name}`}
        >
          <div className="diff-node-card-header">
            <span className="diff-node-title">{node.name}</span>
            <span className={getStatusBadgeClass(node.status)}>{node.status}</span>
          </div>

          <div style={{ fontSize: "11px", color: "#a1a1aa" }}>
            ID: <span style={{ fontFamily: "monospace" }}>{node.id}</span>
          </div>

          <div className="diff-node-metrics-bar">
            {node.metrics.durationMs.compValue > 0 && (
              <span className="diff-metric-chip">
                <span>⏱</span>
                <span>{formatDurationMs(node.metrics.durationMs.compValue)}</span>
              </span>
            )}
            {node.metrics.tokensTotal.compValue > 0 && (
              <span className="diff-metric-chip">
                <span>⚡</span>
                <span>{formatMetricDeltaValue(node.metrics.tokensTotal.compValue)} tok</span>
              </span>
            )}
            {node.modelComp && (
              <span className="diff-metric-chip" style={{ color: "#38bdf8" }}>
                <span>{node.modelComp}</span>
              </span>
            )}
          </div>

          {node.status === "modified" && node.propertyChanges.length > 0 && (
            <div style={{ fontSize: "10px", color: "#fbbf24", fontWeight: 600 }}>
              {node.propertyChanges.filter((p) => p.isDifferent).length} property delta(s)
            </div>
          )}
        </div>
      );
    },
    [selectedNodeId, handleNodeClick],
  );

  return (
    <div className={`graph-diff-root ${className}`}>
      {/* Top Control Toolbar */}
      <GraphDiffToolbar onSwapRuns={onSwapRuns} onClose={onClose} />

      <div className="graph-diff-content">
        {/* Main Visual Comparison Viewport */}
        <div
          className="graph-diff-viewport"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          {/* Case: Identical Datasets */}
          {diffResult.hasDatasets && diffResult.isIdentical && (
            <div className="diff-empty-banner">
              <div style={{ fontSize: "24px" }}>⚖️</div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                Graphs are Structurally & Operationally Identical
              </div>
              <div style={{ fontSize: "12px" }}>
                No additions, removals, or property deltas detected between the baseline and
                candidate runs.
              </div>
            </div>
          )}

          {/* Case: No Datasets */}
          {!diffResult.hasDatasets && (
            <div className="diff-empty-banner">
              <div style={{ fontSize: "24px" }}>📊</div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
                No Comparison Datasets Loaded
              </div>
              <div style={{ fontSize: "12px" }}>
                Select a baseline and candidate execution run to compute the topology diff.
              </div>
            </div>
          )}

          {/* MODE 1: UNIFIED OVERLAY */}
          {diffResult.hasDatasets && visualMode === "unified-overlay" && (
            <div className="diff-overlay-container">
              <div className="diff-overlay-canvas">
                <div className="diff-nodes-grid">
                  {filteredNodes.map((node) =>
                    renderNodeCard(node, node.status === "removed" ? overlayOpacity * 0.7 : 1),
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MODE 2: SIDE BY SIDE */}
          {diffResult.hasDatasets && visualMode === "side-by-side" && (
            <div className="diff-side-by-side-container">
              <div className="diff-pane">
                <div className="diff-pane-header">
                  <span style={{ color: "#38bdf8" }}>Baseline Run: {diffResult.baseTitle}</span>
                  <span style={{ fontSize: "11px", color: "#a1a1aa" }}>
                    {diffResult.counts.nodes.total - diffResult.counts.nodes.added} Nodes
                  </span>
                </div>
                <div className="diff-nodes-grid">
                  {filteredNodes
                    .filter((n) => n.baseNode !== null)
                    .map((node) => renderNodeCard(node))}
                </div>
              </div>

              <div className="diff-pane">
                <div className="diff-pane-header">
                  <span style={{ color: "#2dd4bf" }}>Candidate Run: {diffResult.compTitle}</span>
                  <span style={{ fontSize: "11px", color: "#a1a1aa" }}>
                    {diffResult.counts.nodes.total - diffResult.counts.nodes.removed} Nodes
                  </span>
                </div>
                <div className="diff-nodes-grid">
                  {filteredNodes
                    .filter((n) => n.compNode !== null)
                    .map((node) => renderNodeCard(node))}
                </div>
              </div>
            </div>
          )}

          {/* MODE 3: SPLIT SCREEN */}
          {diffResult.hasDatasets && visualMode === "split-screen" && (
            <div ref={splitContainerRef} className="diff-split-container">
              {/* Baseline Layer */}
              <div
                className="diff-split-layer diff-split-layer--base"
                style={{ width: `${splitRatio * 100}%` }}
              >
                <div className="diff-pane-header">
                  <span style={{ color: "#38bdf8" }}>Baseline ({diffResult.baseTitle})</span>
                </div>
                <div className="diff-nodes-grid">
                  {filteredNodes
                    .filter((n) => n.baseNode !== null)
                    .map((node) => renderNodeCard(node))}
                </div>
              </div>

              {/* Draggable Divider */}
              <div
                className="diff-split-divider"
                style={{ left: `calc(${splitRatio * 100}% - 2px)` }}
                onMouseDown={handleDividerMouseDown}
              >
                <div className="diff-split-divider-handle">⇄</div>
              </div>

              {/* Candidate Layer */}
              <div
                className="diff-split-layer diff-split-layer--comp"
                style={{ width: `${(1 - splitRatio) * 100}%` }}
              >
                <div className="diff-pane-header">
                  <span style={{ color: "#2dd4bf" }}>Candidate ({diffResult.compTitle})</span>
                </div>
                <div className="diff-nodes-grid">
                  {filteredNodes
                    .filter((n) => n.compNode !== null)
                    .map((node) => renderNodeCard(node, overlayOpacity))}
                </div>
              </div>
            </div>
          )}

          {/* Topology Diff Floating Legend */}
          <GraphDiffLegend />
        </div>

        {/* Right Summary & Inspector Drawer */}
        <GraphDiffSummaryDrawer />
      </div>
    </div>
  );
});
