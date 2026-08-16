import type { FC } from "react";
import { IconGauge } from "@tabler/icons-react";
import type { RunVelocityMetrics } from "../../store/useAnalyticsStore";
import { formatDuration } from "../../primitives/nodes/NodeCard/nodeCardModel";

export interface RunVelocityCardProps {
  velocity: RunVelocityMetrics;
  completedNodes?: number;
}

export const RunVelocityCard: FC<RunVelocityCardProps> = ({ velocity }) => {
  const {
    totalWallClockMs,
    totalCognitiveMs,
    totalToolMs,
    totalOverheadMs,
    cognitivePercentage,
    toolPercentage,
    overheadPercentage,
    nodesPerMinute,
    tokensPerSecond,
    phaseVelocities,
    fastestStep,
    slowestStep,
    avgStepDurationMs,
  } = velocity;

  return (
    <div className="analytics-card" data-testid="run-velocity-card">
      <div className="analytics-card-header">
        <h3 className="analytics-card-title">
          <IconGauge size={18} color="#818cf8" />
          Run Velocity & Throughput
        </h3>
        <span className="analytics-card-badge">{nodesPerMinute.toFixed(1)} nodes/min</span>
      </div>

      <div className="analytics-card-content">
        {/* Core Velocity KPI Stat Row */}
        <div className="velocity-stat-row">
          <div className="velocity-stat-cell">
            <span className="velocity-stat-label">Wall Duration</span>
            <span className="velocity-stat-val">{formatDuration(totalWallClockMs)}</span>
          </div>
          <div className="velocity-stat-cell">
            <span className="velocity-stat-label">Cognitive Think</span>
            <span className="velocity-stat-val" style={{ color: "#c4b5fd" }}>
              {formatDuration(totalCognitiveMs)}
            </span>
          </div>
          <div className="velocity-stat-cell">
            <span className="velocity-stat-label">Throughput</span>
            <span className="velocity-stat-val" style={{ color: "#38bdf8" }}>
              {Math.round(tokensPerSecond)} tok/s
            </span>
          </div>
        </div>

        {/* Split Bar: Cognitive vs Tool vs Overhead */}
        <div className="velocity-split-bar">
          <div className="velocity-bar-track">
            <div
              className="velocity-bar-segment cognitive"
              style={{ width: `${cognitivePercentage}%` }}
              title={`Cognitive: ${cognitivePercentage.toFixed(1)}% (${formatDuration(totalCognitiveMs)})`}
            />
            <div
              className="velocity-bar-segment tool"
              style={{ width: `${toolPercentage}%` }}
              title={`Tool: ${toolPercentage.toFixed(1)}% (${formatDuration(totalToolMs)})`}
            />
            <div
              className="velocity-bar-segment overhead"
              style={{ width: `${overheadPercentage}%` }}
              title={`Overhead: ${overheadPercentage.toFixed(1)}% (${formatDuration(totalOverheadMs)})`}
            />
          </div>
          <div className="velocity-legend">
            <div className="velocity-legend-item">
              <span className="velocity-legend-dot" style={{ backgroundColor: "#8b5cf6" }} />
              <span>Cognitive ({cognitivePercentage.toFixed(0)}%)</span>
            </div>
            <div className="velocity-legend-item">
              <span className="velocity-legend-dot" style={{ backgroundColor: "#3b82f6" }} />
              <span>Tool/Exec ({toolPercentage.toFixed(0)}%)</span>
            </div>
            <div className="velocity-legend-item">
              <span className="velocity-legend-dot" style={{ backgroundColor: "#3f3f46" }} />
              <span>Queue/Overhead ({overheadPercentage.toFixed(0)}%)</span>
            </div>
          </div>
        </div>

        {/* Phase / Step Velocity Table */}
        {phaseVelocities.length > 0 && (
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
              <span>Phase Breakdown</span>
              <span>Avg Phase: {formatDuration(avgStepDurationMs)}</span>
            </div>
            <table className="analytics-phase-table">
              <thead>
                <tr>
                  <th>Phase</th>
                  <th>Nodes</th>
                  <th>Duration</th>
                  <th>Speed</th>
                  <th>Tokens</th>
                </tr>
              </thead>
              <tbody>
                {phaseVelocities.map((pv) => {
                  const isFastest = fastestStep?.step === pv.step && phaseVelocities.length > 1;
                  const isSlowest = slowestStep?.step === pv.step && phaseVelocities.length > 1;
                  return (
                    <tr key={`pv-${pv.step}`}>
                      <td style={{ fontWeight: 600 }}>{pv.label}</td>
                      <td>{pv.nodeCount}</td>
                      <td>{formatDuration(pv.durationMs)}</td>
                      <td>
                        <span
                          className={`phase-speed-indicator ${
                            isSlowest ? "slow" : isFastest ? "fast" : ""
                          }`}
                        >
                          {pv.velocityNodesPerMin.toFixed(1)} n/m
                        </span>
                      </td>
                      <td>{pv.tokens.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
