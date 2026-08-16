import React, { useMemo, useState } from "react";
import type { FC } from "react";
import type { BlastRadiusMatrix, NodeBlastImpact, RiskLevel } from "../../engine/reporting/types";

export interface BlastRadiusMatrixViewProps {
  matrix: BlastRadiusMatrix;
  theme?: "dark" | "light";
}

function formatUsd(cost: number): string {
  if (cost < 0.01 && cost > 0) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

export const BlastRadiusMatrixView: FC<BlastRadiusMatrixViewProps> = ({ matrix }) => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedRisk, setSelectedRisk] = useState<RiskLevel | "all">("all");
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    return matrix.items.filter((item) => {
      if (selectedRisk !== "all" && item.riskLevel !== selectedRisk) {
        return false;
      }
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        return (
          item.nodeId.toLowerCase().includes(q) ||
          item.nodeName.toLowerCase().includes(q) ||
          (item.kind && item.kind.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [matrix.items, selectedRisk, searchQuery]);

  const toggleExpand = (nodeId: string) => {
    setExpandedNodeId((prev) => (prev === nodeId ? null : nodeId));
  };

  return (
    <div className="blast-matrix-view-wrapper">
      {/* Fragility Index & Risk Counts Header */}
      <div className="scorecard-summary-grid" style={{ marginBottom: "16px" }}>
        <div className="kpi-card">
          <div className="kpi-card-header">Graph Fragility Index</div>
          <div
            className={`kpi-card-value ${matrix.overallFragilityIndex >= 50 ? "color-danger" : "color-success"}`}
          >
            {matrix.overallFragilityIndex}/100
          </div>
          <div className="kpi-card-sub">
            Max graph dependency depth: {matrix.maxGraphDepth} hops
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">Critical Blast Risk</div>
          <div className="kpi-card-value color-danger">{matrix.criticalCount}</div>
          <div className="kpi-card-sub">Immediate single-point of failure</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">High Blast Risk</div>
          <div className="kpi-card-value color-warning">{matrix.highCount}</div>
          <div className="kpi-card-sub">High downstream impact</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">Medium / Low Risk</div>
          <div className="kpi-card-value color-success">{matrix.mediumCount + matrix.lowCount}</div>
          <div className="kpi-card-sub">
            {matrix.mediumCount} medium &bull; {matrix.lowCount} low
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="blast-filter-bar">
        <input
          type="text"
          className="blast-search-input"
          placeholder="Filter by node name or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Filter blast radius nodes"
        />

        <div className="blast-risk-filter-pills" role="tablist" aria-label="Risk level filters">
          <button
            type="button"
            className={`risk-pill-btn ${selectedRisk === "all" ? "active" : ""}`}
            onClick={() => setSelectedRisk("all")}
          >
            All ({matrix.items.length})
          </button>
          <button
            type="button"
            className={`risk-pill-btn ${selectedRisk === "critical" ? "active" : ""}`}
            onClick={() => setSelectedRisk("critical")}
          >
            Critical ({matrix.criticalCount})
          </button>
          <button
            type="button"
            className={`risk-pill-btn ${selectedRisk === "high" ? "active" : ""}`}
            onClick={() => setSelectedRisk("high")}
          >
            High ({matrix.highCount})
          </button>
          <button
            type="button"
            className={`risk-pill-btn ${selectedRisk === "medium" ? "active" : ""}`}
            onClick={() => setSelectedRisk("medium")}
          >
            Medium ({matrix.mediumCount})
          </button>
          <button
            type="button"
            className={`risk-pill-btn ${selectedRisk === "low" ? "active" : ""}`}
            onClick={() => setSelectedRisk("low")}
          >
            Low ({matrix.lowCount})
          </button>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="data-table-container">
        <table className="blast-table" data-testid="blast-radius-table">
          <thead>
            <tr>
              <th>Node Name &amp; ID</th>
              <th>Kind</th>
              <th>Status</th>
              <th>Downstream Reach</th>
              <th>Max Depth</th>
              <th>Blast Score</th>
              <th>Risk Level</th>
              <th>Est. Cost at Risk</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: "24px", color: "#888" }}>
                  No matching nodes found.
                </td>
              </tr>
            ) : (
              filteredItems.map((item: NodeBlastImpact) => {
                const isExpanded = expandedNodeId === item.nodeId;
                return (
                  <React.Fragment key={item.nodeId}>
                    <tr>
                      <td>
                        <strong>{item.nodeName}</strong>
                        <div style={{ fontSize: "10px", color: "var(--text-muted, #71717a)" }}>
                          {item.nodeId}
                        </div>
                      </td>
                      <td>{item.kind || "node"}</td>
                      <td>{item.status || "pending"}</td>
                      <td>
                        {item.directDownstreamCount} direct &rarr; {item.transitiveDownstreamCount}{" "}
                        total
                      </td>
                      <td>{item.maxCascadeDepth} hops</td>
                      <td>
                        <strong>{item.blastRadiusScore}</strong>/100
                      </td>
                      <td>
                        <span className={`risk-tag ${item.riskLevel}`}>{item.riskLevel}</span>
                      </td>
                      <td>{formatUsd(item.estimatedCostAtRiskUsd)}</td>
                      <td>
                        <button
                          type="button"
                          className="exec-btn exec-btn-secondary"
                          style={{ padding: "3px 8px", fontSize: "11px" }}
                          onClick={() => toggleExpand(item.nodeId)}
                        >
                          {isExpanded ? "Hide" : "Cascade Tree"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={9} style={{ padding: "0 12px 12px" }}>
                          <div className="cascade-detail-panel">
                            <div style={{ marginBottom: "6px" }}>
                              <strong>Remediation Recommendation:</strong>{" "}
                              {item.remediationRecommendation}
                            </div>
                            <div>
                              <strong>
                                Downstream Cascade Chain ({item.cascadeTree.length} nodes):
                              </strong>
                              {item.cascadeTree.length === 0 ? (
                                <span style={{ marginLeft: "6px", color: "#888" }}>
                                  No downstream nodes (Terminal node).
                                </span>
                              ) : (
                                <ul style={{ marginLeft: "18px", marginTop: "4px" }}>
                                  {item.cascadeTree.map((child) => (
                                    <li key={child.nodeId} style={{ margin: "2px 0" }}>
                                      <strong>{child.nodeName}</strong> (Depth: {child.depth})
                                      &ndash; {child.reason}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
