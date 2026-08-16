import type { FC } from "react";
import { IconGitCommit, IconArrowRight } from "@tabler/icons-react";
import type { CriticalPathMetrics } from "../../store/useAnalyticsStore";
import { formatDuration } from "../../primitives/nodes/NodeCard/nodeCardModel";

export interface CriticalPathCardProps {
  criticalPath: CriticalPathMetrics;
  onSelectNode?: (nodeId: string) => void;
}

export const CriticalPathCard: FC<CriticalPathCardProps> = ({ criticalPath, onSelectNode }) => {
  const {
    pathNodes,
    totalCriticalPathDurationMs,
    longestNodeInPath,
    bottleneckRankings,
    estimatedQueueWaitMs,
    parallelEfficiencyPercent,
  } = criticalPath;

  return (
    <div className="analytics-card" data-testid="critical-path-card">
      <div className="analytics-card-header">
        <h3 className="analytics-card-title">
          <IconGitCommit size={18} color="#6366f1" />
          Critical Path & Bottleneck Analysis
        </h3>
        <span className="analytics-card-badge">
          Path Span: {formatDuration(totalCriticalPathDurationMs)}
        </span>
      </div>

      <div className="analytics-card-content">
        {/* KPI Mini-Row */}
        <div className="velocity-stat-row">
          <div className="velocity-stat-cell">
            <span className="velocity-stat-label">Critical Path</span>
            <span className="velocity-stat-val" style={{ color: "#a5b4fc" }}>
              {formatDuration(totalCriticalPathDurationMs)}
            </span>
          </div>
          <div className="velocity-stat-cell">
            <span className="velocity-stat-label">Queue Latency</span>
            <span className="velocity-stat-val">{formatDuration(estimatedQueueWaitMs)}</span>
          </div>
          <div className="velocity-stat-cell">
            <span className="velocity-stat-label">DAG Parallelism</span>
            <span className="velocity-stat-val" style={{ color: "#38bdf8" }}>
              {parallelEfficiencyPercent.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Longest Dependency Chain Sequence */}
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#a1a1aa",
              marginBottom: 6,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Longest Dependency Path ({pathNodes.length} nodes)</span>
            {longestNodeInPath && (
              <span style={{ color: "#f59e0b", fontSize: 11 }}>
                Bottleneck: {longestNodeInPath.nodeName} (
                {formatDuration(longestNodeInPath.durationMs)})
              </span>
            )}
          </div>

          <div className="critical-path-chain">
            {pathNodes.length === 0 ? (
              <div style={{ color: "#71717a", fontSize: 12, padding: "10px 0" }}>
                No execution path nodes detected
              </div>
            ) : (
              pathNodes.map((node, index) => (
                <div
                  key={`cp-node-${node.nodeId}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                >
                  <div
                    className="critical-path-node-pill"
                    onClick={() => onSelectNode?.(node.nodeId)}
                    style={{ cursor: onSelectNode ? "pointer" : "default" }}
                    title={`Click to select ${node.nodeName}`}
                  >
                    <span className="critical-path-node-name">{node.nodeName}</span>
                    <span className="critical-path-node-dur">
                      {formatDuration(node.durationMs)} ({node.percentOfCriticalPath.toFixed(0)}%)
                    </span>
                  </div>
                  {index < pathNodes.length - 1 && (
                    <span className="critical-path-arrow">
                      <IconArrowRight size={14} />
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Bottleneck Nodes Ranking Table */}
        {bottleneckRankings.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#a1a1aa", marginBottom: 6 }}>
              Top Bottleneck Nodes (Ranked by Latency)
            </div>
            <table className="bottleneck-rankings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Node Name</th>
                  <th>Duration</th>
                  <th>Share</th>
                  <th>Critical Path</th>
                </tr>
              </thead>
              <tbody>
                {bottleneckRankings.slice(0, 5).map((item) => (
                  <tr
                    key={`bottleneck-${item.nodeId}`}
                    className={item.isOnCriticalPath ? "critical-path-row" : ""}
                    onClick={() => onSelectNode?.(item.nodeId)}
                    style={{ cursor: onSelectNode ? "pointer" : "default" }}
                  >
                    <td style={{ fontWeight: 700, color: "#a1a1aa" }}>{item.rank}</td>
                    <td style={{ fontWeight: 600 }}>{item.nodeName}</td>
                    <td>{formatDuration(item.durationMs)}</td>
                    <td>{item.percentOfTotalDuration.toFixed(1)}%</td>
                    <td>
                      {item.isOnCriticalPath ? (
                        <span style={{ color: "#818cf8", fontWeight: 700, fontSize: 11 }}>
                          ● On Critical Path
                        </span>
                      ) : (
                        <span style={{ color: "#71717a", fontSize: 11 }}>Off-path</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
