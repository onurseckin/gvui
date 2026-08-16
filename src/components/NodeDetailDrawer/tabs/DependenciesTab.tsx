import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconGitFork,
  IconHierarchy2,
  IconRoute,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import type { FC } from "react";
import { memo, useCallback, useMemo, useState } from "react";
import { describeNodeKind, describeNodeStatus } from "../../../primitives/nodes/NodeCard/nodeKinds";
import { useGraphStore } from "../../../state/useGraphStore";
import type { GraphDataset, GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { copyToClipboard, formatDuration, formatTokens } from "../streamUtils";
import {
  ImpactGraph,
  analyzeNodeDependencies,
  type DependencyNodeItem,
  type GraphAnalysisResult,
} from "./ImpactGraph";

export interface DependenciesTabProps {
  node: GraphNodeData;
  dataset?: GraphDataset | null;
  onSelectNode?: (nodeId: string) => void;
  selectedNodeId?: string | null;
}

type FilterView = "all" | "upstream" | "downstream" | "blockers";

/**
 * Formats a markdown report summarizing the node's upstream prerequisites,
 * downstream blast radius, topological depth, and blocker chains.
 */
export function formatImpactReport(analysis: GraphAnalysisResult): string {
  const {
    focusNode,
    topologicalDepth,
    topologicalHeight,
    blastRadius,
    blockerChain,
    directPrerequisites,
    directDependents,
    hasCycle,
    cycles,
  } = analysis;
  const lines: string[] = [];

  lines.push(`# Impact & Dependency Analysis: ${focusNode.name} (${focusNode.id})`);
  lines.push(`- **Status:** ${focusNode.status ?? "pending"}`);
  lines.push(`- **Kind:** ${focusNode.kind ?? "agent"}`);
  lines.push(`- **Topological Depth:** ${topologicalDepth}`);
  lines.push(`- **Topological Height:** ${topologicalHeight}`);
  lines.push(`- **Direct Prerequisites:** ${directPrerequisites.length}`);
  lines.push(`- **Direct Dependents:** ${directDependents.length}`);
  lines.push(
    `- **Transitive Blast Radius:** ${blastRadius.totalAffectedNodes} nodes (${blastRadius.severity.toUpperCase()} severity)`,
  );
  lines.push(`- **Affected Tokens:** ${formatTokens(blastRadius.affectedTokens)}`);
  lines.push(`- **Affected Duration:** ${formatDuration(blastRadius.affectedDurationMs)}`);

  if (hasCycle) {
    lines.push(`\n## ⚠️ Circular Dependencies Detected`);
    for (const c of cycles) {
      lines.push(`- ${c.join(" ➔ ")}`);
    }
  }

  if (blockerChain.length > 0) {
    lines.push(`\n## 🛑 Root Cause Blocker Chain`);
    for (const b of blockerChain) {
      lines.push(
        `- **${b.nodeName}** (${b.nodeId}) [${b.status}]: ${b.failureReason ?? "No failure message"}`,
      );
    }
  }

  if (directPrerequisites.length > 0) {
    lines.push(`\n## Direct Prerequisites (Upstream)`);
    for (const p of directPrerequisites) {
      lines.push(`- [${p.name}] (${p.id}) - Kind: ${p.kind}, Status: ${p.status}`);
    }
  }

  if (directDependents.length > 0) {
    lines.push(`\n## Direct Dependents (Downstream)`);
    for (const d of directDependents) {
      lines.push(`- [${d.name}] (${d.id}) - Kind: ${d.kind}, Status: ${d.status}`);
    }
  }

  return lines.join("\n");
}

/**
 * Dedicated Dependencies & Blast Radius Impact Inspector tab in Node Detail Drawer.
 * Renders topological depth, direct prerequisites, downstream blast radius impact,
 * blocker chains with click-to-jump node links, and interactive DAG graph.
 */
export const DependenciesTab: FC<DependenciesTabProps> = memo(function DependenciesTab({
  node,
  dataset,
  onSelectNode,
}) {
  const setSelectedNodeIdStore = useGraphStore((state) => state.setSelectedNodeId);
  const [filterView, setFilterView] = useState<FilterView>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedReport, setCopiedReport] = useState(false);

  const handleSelectNode = useCallback(
    (nodeId: string) => {
      if (onSelectNode) {
        onSelectNode(nodeId);
      } else {
        setSelectedNodeIdStore(nodeId);
      }
    },
    [onSelectNode, setSelectedNodeIdStore],
  );

  const analysis: GraphAnalysisResult = useMemo(
    () => analyzeNodeDependencies(node, dataset),
    [node, dataset],
  );

  const handleCopyReport = useCallback(async () => {
    const report = formatImpactReport(analysis);
    const success = await copyToClipboard(report);
    if (success) {
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    }
  }, [analysis]);

  // Filtered dependency items for list view
  const filteredItems = useMemo(() => {
    let items: DependencyNodeItem[] = [];
    if (filterView === "all") {
      items = [...analysis.transitivePrerequisites, ...analysis.transitiveDependents];
    } else if (filterView === "upstream") {
      items = analysis.transitivePrerequisites;
    } else if (filterView === "downstream") {
      items = analysis.transitiveDependents;
    } else if (filterView === "blockers") {
      items = analysis.transitivePrerequisites.filter((i) => i.isBlocker);
    }

    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        String(item.kind ?? "")
          .toLowerCase()
          .includes(q) ||
        String(item.edge?.kind ?? "")
          .toLowerCase()
          .includes(q) ||
        String(item.edge?.payloadSummary ?? "")
          .toLowerCase()
          .includes(q),
    );
  }, [analysis, filterView, searchQuery]);

  const isCompletelyIsolated =
    analysis.directPrerequisites.length === 0 &&
    analysis.directDependents.length === 0 &&
    !analysis.hasCycle;

  return (
    <div className="drawer-tab-content drawer-dependencies-tab">
      {/* KPI Metrics Summary Grid */}
      <DrawerSection title="Topological & Impact Metrics">
        <div className="drawer-metric-grid">
          <div className="drawer-metric">
            <span className="drawer-metric-label">
              <IconRoute
                size={11}
                style={{ display: "inline", verticalAlign: "text-top", marginRight: 3 }}
              />
              Topological Depth
            </span>
            <span className="drawer-metric-value">Level {analysis.topologicalDepth}</span>
          </div>

          <div className="drawer-metric">
            <span className="drawer-metric-label">
              <IconHierarchy2
                size={11}
                style={{ display: "inline", verticalAlign: "text-top", marginRight: 3 }}
              />
              Topological Height
            </span>
            <span className="drawer-metric-value">{analysis.topologicalHeight} hops to exit</span>
          </div>

          <div
            className={`drawer-metric ${analysis.blastRadius.severity === "high" || analysis.blastRadius.severity === "critical" ? "drawer-metric--warn" : ""}`}
          >
            <span className="drawer-metric-label">
              <IconAlertTriangle
                size={11}
                style={{ display: "inline", verticalAlign: "text-top", marginRight: 3 }}
              />
              Blast Radius
            </span>
            <span className="drawer-metric-value">
              {analysis.blastRadius.totalAffectedNodes} nodes ({analysis.blastRadius.severity})
            </span>
          </div>

          <div className="drawer-metric">
            <span className="drawer-metric-label">
              <IconGitFork
                size={11}
                style={{ display: "inline", verticalAlign: "text-top", marginRight: 3 }}
              />
              Fan-In / Fan-Out
            </span>
            <span className="drawer-metric-value">
              {analysis.fanIn} in · {analysis.fanOut} out
            </span>
          </div>

          {analysis.blastRadius.affectedTokens > 0 && (
            <div className="drawer-metric">
              <span className="drawer-metric-label">Affected Tokens</span>
              <span className="drawer-metric-value">
                {formatTokens(analysis.blastRadius.affectedTokens)}
              </span>
            </div>
          )}

          {analysis.blastRadius.affectedDurationMs > 0 && (
            <div className="drawer-metric">
              <span className="drawer-metric-label">Affected Duration</span>
              <span className="drawer-metric-value">
                {formatDuration(analysis.blastRadius.affectedDurationMs)}
              </span>
            </div>
          )}
        </div>
      </DrawerSection>

      {/* Cycle Warning Banner */}
      {analysis.hasCycle && (
        <div className="drawer-impact-cycle-banner" role="alert">
          <IconAlertTriangle size={16} className="drawer-impact-cycle-icon" />
          <div className="drawer-impact-cycle-content">
            <strong className="drawer-impact-cycle-title">Circular Dependency Detected</strong>
            <p className="drawer-impact-cycle-desc">
              A cycle was detected in this execution graph:
            </p>
            <div className="drawer-impact-cycle-chips">
              {analysis.cycles.map((c, i) => (
                <div key={`cycle-${i}`} className="drawer-impact-cycle-path">
                  {c.map((nodeId, idx) => (
                    <span key={`c-node-${idx}`} className="drawer-impact-cycle-step">
                      <button
                        type="button"
                        className="drawer-jump-link-btn"
                        onClick={() => handleSelectNode(nodeId)}
                        title={`Jump to ${nodeId}`}
                      >
                        {nodeId}
                      </button>
                      {idx < c.length - 1 && <span className="drawer-impact-cycle-sep">➔</span>}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Root Cause Blocker Chain Banner */}
      {analysis.hasBlocker && (
        <DrawerSection title="Upstream Blocker Chain" count={analysis.blockerChain.length}>
          <div className="drawer-blocker-banner" role="alert">
            <div className="drawer-blocker-header">
              <span className="drawer-blocker-icon">🛑</span>
              <span className="drawer-blocker-title">Upstream Failure Blocking Execution</span>
            </div>
            <div className="drawer-blocker-chain-list">
              {analysis.blockerChain.map((b, idx) => {
                const isCurrent = b.nodeId === node.id;
                return (
                  <div key={`blocker-${b.nodeId}-${idx}`} className="drawer-blocker-chain-row">
                    <button
                      type="button"
                      className={`drawer-blocker-node-btn ${b.isRootCause ? "is-root-cause" : ""} ${isCurrent ? "is-current" : ""}`}
                      onClick={() => handleSelectNode(b.nodeId)}
                      title={`Jump to ${b.nodeName} (${b.nodeId})`}
                      aria-label={`Jump to ${b.nodeName}`}
                    >
                      {b.isRootCause && <span className="drawer-blocker-tag">ROOT CAUSE</span>}
                      {isCurrent && (
                        <span className="drawer-blocker-tag drawer-blocker-tag--current">
                          CURRENT
                        </span>
                      )}
                      <span className="drawer-blocker-name">{b.nodeName}</span>
                      <span className={`drawer-blocker-status drawer-blocker-status--${b.status}`}>
                        {b.status}
                      </span>
                    </button>
                    {b.failureReason && (
                      <span className="drawer-blocker-reason" title={b.failureReason}>
                        {b.failureReason}
                      </span>
                    )}
                    {idx < analysis.blockerChain.length - 1 && (
                      <span className="drawer-blocker-arrow">➔</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </DrawerSection>
      )}

      {/* Interactive Impact Graph Visualization */}
      <DrawerSection title="Local Dependency Graph">
        <ImpactGraph
          currentNode={node}
          dataset={dataset}
          onSelectNode={handleSelectNode}
          selectedNodeId={node.id}
        />
      </DrawerSection>

      {/* Blast Radius & Dependencies Breakdown List */}
      {!isCompletelyIsolated && (
        <DrawerSection
          title="Dependency & Blast Radius Breakdown"
          count={analysis.directPrerequisites.length + analysis.directDependents.length}
        >
          {/* Controls Bar */}
          <div className="drawer-dep-controls-bar">
            <div className="drawer-dep-filter-pills">
              <button
                type="button"
                className={`drawer-tab-pill ${filterView === "all" ? "is-active" : ""}`}
                onClick={() => setFilterView("all")}
              >
                All (
                {analysis.transitivePrerequisites.length + analysis.transitiveDependents.length})
              </button>
              <button
                type="button"
                className={`drawer-tab-pill ${filterView === "upstream" ? "is-active" : ""}`}
                onClick={() => setFilterView("upstream")}
              >
                Prerequisites ({analysis.transitivePrerequisites.length})
              </button>
              <button
                type="button"
                className={`drawer-tab-pill ${filterView === "downstream" ? "is-active" : ""}`}
                onClick={() => setFilterView("downstream")}
              >
                Blast Radius ({analysis.transitiveDependents.length})
              </button>
              {analysis.hasBlocker && (
                <button
                  type="button"
                  className={`drawer-tab-pill drawer-tab-pill--warn ${filterView === "blockers" ? "is-active" : ""}`}
                  onClick={() => setFilterView("blockers")}
                >
                  Blockers ({analysis.transitivePrerequisites.filter((i) => i.isBlocker).length})
                </button>
              )}
            </div>

            <div className="drawer-dep-search-wrap">
              <IconSearch size={12} className="drawer-dep-search-icon" />
              <input
                type="text"
                className="drawer-dep-search-input"
                placeholder="Search dependencies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search dependencies"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="drawer-impact-clear-btn"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                >
                  <IconX size={10} />
                </button>
              )}
            </div>

            <button
              type="button"
              className={`drawer-copy-report-btn ${copiedReport ? "is-copied" : ""}`}
              onClick={handleCopyReport}
              title="Copy markdown impact report to clipboard"
            >
              {copiedReport ? <IconCheck size={12} /> : <IconCopy size={12} />}
              <span>{copiedReport ? "Copied!" : "Copy Report"}</span>
            </button>
          </div>

          {/* Items List */}
          <div className="drawer-dep-list">
            {filteredItems.length === 0 ? (
              <div className="drawer-dep-empty-notice">
                No dependencies matching filter "{filterView}"
                {searchQuery ? ` and query "${searchQuery}"` : ""}.
              </div>
            ) : (
              filteredItems.map((item) => {
                const k = describeNodeKind(item.node);
                const s = describeNodeStatus(item.node);
                const KIcon = k.IconComponent;
                const isUpstream = item.direction === "upstream";
                return (
                  <div
                    key={`dep-item-${item.id}-${item.direction}`}
                    className={`drawer-dep-card ${item.isBlocker ? "is-blocker" : ""}`}
                  >
                    <div className="drawer-dep-card-header">
                      <div className="drawer-dep-card-title-group">
                        <span
                          className="drawer-dep-dir-badge"
                          style={{ color: isUpstream ? "#38bdf8" : "#f472b6" }}
                        >
                          {isUpstream ? "▲ PREREQUISITE" : "▼ DEPENDENT"}
                        </span>
                        <span className="drawer-dep-hop-badge">
                          {isUpstream
                            ? `${Math.abs(item.hopDistance)} hop upstream`
                            : `+${item.hopDistance} hop blast`}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="drawer-dep-jump-btn"
                        onClick={() => handleSelectNode(item.id)}
                        title={`Select ${item.name} in graph`}
                        aria-label={`Jump to ${item.name}`}
                      >
                        <span>Jump to Node</span>
                        <IconArrowRight size={11} />
                      </button>
                    </div>

                    <div className="drawer-dep-card-body">
                      <div className="drawer-dep-node-info">
                        <span className="drawer-dep-kind-icon" style={{ color: k.accent }}>
                          <KIcon size={14} />
                        </span>
                        <div className="drawer-dep-name-col">
                          <span className="drawer-dep-node-name">{item.name}</span>
                          <code className="drawer-dep-node-id">{item.id}</code>
                        </div>
                      </div>

                      <div className="drawer-dep-pills">
                        <span className="drawer-status-pill" style={{ color: s.color }}>
                          {s.label}
                        </span>
                        <span className="drawer-kind-label">{k.label}</span>
                        {item.step !== undefined && (
                          <span className="drawer-step-chip">Step {item.step}</span>
                        )}
                        {item.isBlocker && <span className="drawer-blocker-tag">BLOCKER</span>}
                      </div>
                    </div>

                    {item.edge?.payloadSummary && (
                      <div className="drawer-dep-payload-row">
                        <span className="drawer-dep-payload-label">Data Handoff:</span>
                        <span className="drawer-dep-payload-summary">
                          {item.edge.payloadSummary}
                        </span>
                        {item.edge.tokens && (
                          <span className="drawer-dep-tokens">
                            ({formatTokens(item.edge.tokens)})
                          </span>
                        )}
                      </div>
                    )}

                    {item.failureReason && (
                      <div className="drawer-dep-failure-row">
                        <span className="drawer-dep-failure-label">Reason:</span>
                        <span className="drawer-dep-failure-text">{item.failureReason}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DrawerSection>
      )}

      {isCompletelyIsolated && (
        <div className="drawer-empty-state">
          <span>Isolated node with no upstream prerequisites or downstream dependents.</span>
        </div>
      )}
    </div>
  );
});

export default DependenciesTab;
