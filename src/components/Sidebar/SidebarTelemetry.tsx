import type { FC } from "react";
import React, { useMemo } from "react";
import type { GraphDataset, GraphNodeData, TokenUsageDetail } from "../../types/graphData";
import {
  formatCost,
  formatDuration,
  formatTokens,
} from "../../primitives/nodes/NodeCard/nodeCardModel";

export interface SidebarTelemetryProps {
  dataset: GraphDataset | null;
}

function resolveNodeTokens(node: GraphNodeData): number {
  const metrics = node.metrics;
  const meta = node.metadata;

  // 1. Direct tokensIn + tokensOut on metrics
  let inOutSum = 0;
  let hasInOut = false;
  if (typeof metrics?.tokensIn === "number") {
    inOutSum += metrics.tokensIn;
    hasInOut = true;
  }
  if (typeof metrics?.tokensOut === "number") {
    inOutSum += metrics.tokensOut;
    hasInOut = true;
  }
  if (hasInOut) return inOutSum;

  // 2. TokenUsageDetail on metrics.tokens or meta.tokens
  const tokenObj = (metrics?.tokens ?? meta?.tokens) as TokenUsageDetail | undefined;
  if (tokenObj) {
    if (typeof tokenObj.totalTokens === "number") {
      return tokenObj.totalTokens;
    }
    let detailSum = 0;
    let hasDetail = false;
    if (typeof tokenObj.promptTokens === "number") {
      detailSum += tokenObj.promptTokens;
      hasDetail = true;
    }
    if (typeof tokenObj.completionTokens === "number") {
      detailSum += tokenObj.completionTokens;
      hasDetail = true;
    }
    if (typeof tokenObj.reasoningTokens === "number") {
      detailSum += tokenObj.reasoningTokens;
      hasDetail = true;
    }
    if (hasDetail) return detailSum;
  }

  // 3. Fallback on metadata direct properties
  if (typeof meta?.tokensIn === "number" || typeof meta?.tokensOut === "number") {
    let sum = 0;
    if (typeof meta?.tokensIn === "number") sum += meta.tokensIn;
    if (typeof meta?.tokensOut === "number") sum += meta.tokensOut;
    return sum;
  }

  return 0;
}

export const SidebarTelemetry: FC<SidebarTelemetryProps> = React.memo(function SidebarTelemetry({
  dataset,
}) {
  const telemetry = useMemo(() => {
    if (!dataset || !dataset.nodes || dataset.nodes.length === 0) {
      return null;
    }

    let totalTokens = 0;
    let totalCost = 0;
    let totalDurationMs = 0;
    let totalRetries = 0;
    let totalRepairRounds = 0;

    for (const node of dataset.nodes) {
      totalTokens += resolveNodeTokens(node);

      const metrics = node.metrics;
      const meta = node.metadata;

      if (typeof metrics?.costUsd === "number") {
        totalCost += metrics.costUsd;
      } else if (typeof meta?.costUsd === "number") {
        totalCost += meta.costUsd;
      }

      if (typeof metrics?.durationMs === "number") {
        totalDurationMs += metrics.durationMs;
      } else if (typeof meta?.durationMs === "number") {
        totalDurationMs += meta.durationMs;
      } else if (typeof meta?.timing?.wallDurationMs === "number") {
        totalDurationMs += meta.timing.wallDurationMs;
      } else if (typeof meta?.timingBreakdown?.wallDurationMs === "number") {
        totalDurationMs += meta.timingBreakdown.wallDurationMs;
      }

      if (typeof metrics?.retries === "number") {
        totalRetries += metrics.retries;
      }

      if (typeof metrics?.repairRounds === "number") {
        totalRepairRounds += metrics.repairRounds;
      } else if (typeof meta?.repairRounds === "number") {
        totalRepairRounds += meta.repairRounds;
      }
    }

    return {
      nodesCount: dataset.nodes.length,
      edgesCount: dataset.edges ? dataset.edges.length : 0,
      totalTokens,
      totalCost,
      totalDurationMs,
      totalRetries,
      totalRepairRounds,
    };
  }, [dataset]);

  if (!telemetry) {
    return (
      <div className="sidebar-section" data-testid="sidebar-telemetry">
        <h4 className="sidebar-section-title">Graph Telemetry</h4>
        <p className="sidebar-empty-state">No graph telemetry available</p>
      </div>
    );
  }

  return (
    <div className="sidebar-section" data-testid="sidebar-telemetry">
      <h4 className="sidebar-section-title">Graph Telemetry</h4>
      <div className="sidebar-telemetry-grid">
        <div className="telemetry-card">
          <span className="telemetry-label">Nodes</span>
          <span className="telemetry-value" data-testid="telemetry-nodes-count">
            {telemetry.nodesCount}
          </span>
        </div>
        <div className="telemetry-card">
          <span className="telemetry-label">Edges</span>
          <span className="telemetry-value" data-testid="telemetry-edges-count">
            {telemetry.edgesCount}
          </span>
        </div>
        <div className="telemetry-card">
          <span className="telemetry-label">Duration</span>
          <span className="telemetry-value" data-testid="telemetry-duration">
            {formatDuration(telemetry.totalDurationMs)}
          </span>
        </div>
        <div className="telemetry-card">
          <span className="telemetry-label">Tokens</span>
          <span className="telemetry-value" data-testid="telemetry-tokens">
            {formatTokens(telemetry.totalTokens)}
          </span>
        </div>
        <div className="telemetry-card">
          <span className="telemetry-label">Cost</span>
          <span className="telemetry-value" data-testid="telemetry-cost">
            {formatCost(telemetry.totalCost)}
          </span>
        </div>
        {telemetry.totalRetries > 0 || telemetry.totalRepairRounds > 0 ? (
          <div className="telemetry-card">
            <span className="telemetry-label">Retries</span>
            <span className="telemetry-value" data-testid="telemetry-retries">
              {telemetry.totalRetries + telemetry.totalRepairRounds}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
});

SidebarTelemetry.displayName = "SidebarTelemetry";
