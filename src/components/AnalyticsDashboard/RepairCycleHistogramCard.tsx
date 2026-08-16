import type { FC } from "react";
import { useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import type { RepairCycleMetrics } from "../../store/useAnalyticsStore";

export interface RepairCycleHistogramCardProps {
  repairCycles: RepairCycleMetrics;
  totalNodes: number;
}

export const RepairCycleHistogramCard: FC<RepairCycleHistogramCardProps> = ({
  repairCycles,
  totalNodes,
}) => {
  const {
    totalRepairs,
    firstPassSuccessRate,
    maxRepairsOnNode,
    repairedNodesCount,
    bins,
    repairedNodes,
  } = repairCycles;

  const [showNodeList, setShowNodeList] = useState<boolean>(false);

  return (
    <div className="analytics-card" data-testid="repair-cycle-histogram-card">
      <div className="analytics-card-header">
        <h3 className="analytics-card-title">
          <IconRefresh size={18} color="#10b981" />
          Repair Cycle Histogram
        </h3>
        <span className="analytics-card-badge">
          1st-Pass Success: {firstPassSuccessRate.toFixed(1)}%
        </span>
      </div>

      <div className="analytics-card-content">
        {/* KPI Mini-Row */}
        <div className="velocity-stat-row">
          <div className="velocity-stat-cell">
            <span className="velocity-stat-label">Total Repairs</span>
            <span
              className="velocity-stat-val"
              style={{ color: totalRepairs > 0 ? "#f59e0b" : "#10b981" }}
            >
              {totalRepairs}
            </span>
          </div>
          <div className="velocity-stat-cell">
            <span className="velocity-stat-label">Max Iterations</span>
            <span className="velocity-stat-val">{maxRepairsOnNode}</span>
          </div>
          <div className="velocity-stat-cell">
            <span className="velocity-stat-label">Repaired Nodes</span>
            <span className="velocity-stat-val">
              {repairedNodesCount} / {totalNodes}
            </span>
          </div>
        </div>

        {/* Histogram Bars */}
        <div className="repair-histogram-list">
          {bins.map((bin) => {
            const fillClass =
              bin.roundCount === 0 ? "" : bin.roundCount === 1 ? "warning" : "error";
            return (
              <div key={`repair-bin-${bin.roundCount}`} className="repair-bar-row">
                <div className="repair-bar-header">
                  <span>{bin.roundsLabel}</span>
                  <span style={{ fontWeight: 600 }}>
                    {bin.nodeCount} tasks ({bin.percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="repair-bar-track">
                  <div
                    className={`repair-bar-fill ${fillClass}`}
                    style={{ width: `${Math.max(bin.percentage, bin.nodeCount > 0 ? 3 : 0)}%` }}
                    title={`${bin.roundsLabel}: ${bin.nodeCount} tasks (${bin.percentage.toFixed(1)}%)`}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Toggleable Rejection & Repair Node List */}
        {repairedNodes.length > 0 && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                padding: "6px 0",
              }}
              onClick={() => setShowNodeList((prev) => !prev)}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: "#f59e0b" }}>
                ⚠️ {repairedNodes.length} task(s) required adversarial repair
              </span>
              <span style={{ fontSize: 11, color: "#a1a1aa" }}>
                {showNodeList ? "Hide details ▲" : "View details ▼"}
              </span>
            </div>

            {showNodeList && (
              <div className="repaired-nodes-list" data-testid="repaired-nodes-list">
                {repairedNodes.map((n) => (
                  <div key={`repaired-${n.nodeId}`} className="repaired-node-item">
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontWeight: 600, color: "#ffffff" }}>{n.nodeName}</span>
                      <span style={{ fontSize: 10, color: "#a1a1aa" }}>
                        Reason: {n.reasons.slice(0, 1).join("; ")}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        backgroundColor: "#78350f",
                        color: "#fde68a",
                        padding: "2px 6px",
                        borderRadius: 3,
                      }}
                    >
                      {n.repairRounds} round(s)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
