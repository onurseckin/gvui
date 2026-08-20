import type { FC } from "react";
import type { KpiScorecard } from "../../engine/reporting/types";
import { formatUsd } from "../../engine/reporting/formatters";

export interface ScorecardViewProps {
  kpi: KpiScorecard;
  theme?: "dark" | "light";
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export const ScorecardView: FC<ScorecardViewProps> = ({ kpi }) => {
  const getHealthColorClass = (score: number) => {
    if (score >= 85) return "color-success";
    if (score >= 65) return "color-warning";
    return "color-danger";
  };

  return (
    <div className="scorecard-view-wrapper">
      <div className="scorecard-summary-grid">
        {/* System Health */}
        <div className="kpi-card" data-testid="kpi-health-card">
          <div className="kpi-card-header">Composite System Health</div>
          <div
            className={`kpi-card-value ${getHealthColorClass(kpi.healthScore)}`}
            data-testid="kpi-health-value"
          >
            {kpi.healthScore}/100
          </div>
          <div className="kpi-card-sub">
            {kpi.failureRate === 0
              ? "100% Operational Reliability"
              : `${kpi.failureRate}% Failure Rate (${kpi.failureCount} failed)`}
          </div>
        </div>

        {/* Scale */}
        <div className="kpi-card" data-testid="kpi-scale-card">
          <div className="kpi-card-header">Graph Scale &amp; Topology</div>
          <div className="kpi-card-value color-accent" data-testid="kpi-nodes-value">
            {kpi.totalNodes.toLocaleString()} Nodes
          </div>
          <div className="kpi-card-sub">
            {kpi.totalEdges.toLocaleString()} Edges &bull; {kpi.successCount} Success &bull;{" "}
            {kpi.runningCount} Running
          </div>
        </div>

        {/* MTTR & Recovery */}
        <div className="kpi-card" data-testid="kpi-mttr-card">
          <div className="kpi-card-header">MTTR (Mean Recovery Time)</div>
          <div className="kpi-card-value" data-testid="kpi-mttr-value">
            {formatDuration(kpi.mttrMs)}
          </div>
          <div className="kpi-card-sub">
            {kpi.recoveryEfficiency}% Recovery Efficiency &bull; {kpi.totalRepairRounds} Repairs
            &bull; {kpi.totalRetries} Retries
          </div>
        </div>

        {/* Token Consumption */}
        <div className="kpi-card" data-testid="kpi-tokens-card">
          <div className="kpi-card-header">Total Token Volume</div>
          <div className="kpi-card-value" data-testid="kpi-tokens-value">
            {kpi.totalTokens.toLocaleString()}
          </div>
          <div className="kpi-card-sub">
            Cost: {formatUsd(kpi.totalCostUsd)} &bull; {kpi.reasoningTokens.toLocaleString()}{" "}
            Reasoning Tokens
          </div>
        </div>

        {/* Execution Velocity */}
        <div className="kpi-card" data-testid="kpi-velocity-card">
          <div className="kpi-card-header">Execution Duration &amp; Velocity</div>
          <div className="kpi-card-value" data-testid="kpi-duration-value">
            {formatDuration(kpi.totalDurationMs)}
          </div>
          <div className="kpi-card-sub">
            {kpi.throughputNodesPerSec} nodes / sec throughput &bull; Bottleneck Skew:{" "}
            {kpi.bottleneckScore}/100
          </div>
        </div>

        {/* Critical Path */}
        <div className="kpi-card" data-testid="kpi-critical-path-card">
          <div className="kpi-card-header">Critical Path Bottleneck</div>
          <div className="kpi-card-value" data-testid="kpi-critical-path-value">
            {formatDuration(kpi.criticalPathDurationMs)}
          </div>
          <div className="kpi-card-sub">
            {kpi.criticalPathNodeCount} Sequential Bottleneck Nodes in primary path
          </div>
        </div>
      </div>
    </div>
  );
};
