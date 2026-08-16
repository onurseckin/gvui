import React from "react";
import { IconClock, IconCpu, IconHierarchy, IconTrendingUp } from "@tabler/icons-react";
import type { FlamegraphMetrics } from "./types";
import { formatCostUsd, formatDuration, formatTokens } from "./flamegraphEngine";

export interface FlamegraphMetricsSummaryProps {
  metrics: FlamegraphMetrics;
  activeFilterCount?: number;
}

export const FlamegraphMetricsSummary: React.FC<FlamegraphMetricsSummaryProps> = ({
  metrics,
  activeFilterCount: _activeFilterCount = 0,
}) => {
  const totalToks = Math.max(1, metrics.totalTokens.totalTokens);
  const promptPct = (metrics.totalTokens.promptTokens / totalToks) * 100;
  const compPct = (metrics.totalTokens.completionTokens / totalToks) * 100;
  const reasonPct = (metrics.totalTokens.reasoningTokens / totalToks) * 100;

  const agentCount = Object.keys(metrics.agentBreakdown).length;

  return (
    <div className="flamegraph-metrics-summary" data-testid="flamegraph-metrics-summary">
      {/* Metric Card 1: Wall Time & Concurrency */}
      <div className="metric-card" data-testid="metric-duration-card">
        <div className="metric-card-header">
          <IconClock size={16} className="metric-card-icon" />
          <span className="metric-card-title">Duration & Concurrency</span>
        </div>
        <div className="metric-card-body">
          <div className="metric-main-value">{formatDuration(metrics.totalDurationMs)}</div>
          <div className="metric-sub-values">
            <span>Active: {formatDuration(metrics.activeExecutionMs)}</span>
            <span className="bullet-sep">•</span>
            <span>
              Peak Concurrency: <strong>{metrics.concurrencyPeak}x</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Metric Card 2: Spans & Cascade Depth */}
      <div className="metric-card" data-testid="metric-hierarchy-card">
        <div className="metric-card-header">
          <IconHierarchy size={16} className="metric-card-icon" />
          <span className="metric-card-title">Spans & Depth</span>
        </div>
        <div className="metric-card-body">
          <div className="metric-main-value">{metrics.totalSpans} spans</div>
          <div className="metric-sub-values">
            <span>
              Max Cascade Depth: <strong>{metrics.maxDepth}</strong>
            </span>
            <span className="bullet-sep">•</span>
            <span>
              Agents: <strong>{agentCount}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Metric Card 3: Latency Distribution */}
      <div className="metric-card" data-testid="metric-latency-card">
        <div className="metric-card-header">
          <IconTrendingUp size={16} className="metric-card-icon" />
          <span className="metric-card-title">Latency Distribution</span>
        </div>
        <div className="metric-card-body">
          <div className="metric-latency-row">
            <span className="latency-pill p50">
              <label>P50</label>
              <strong>{formatDuration(metrics.latencyP50)}</strong>
            </span>
            <span className="latency-pill p95">
              <label>P95</label>
              <strong>{formatDuration(metrics.latencyP95)}</strong>
            </span>
            <span className="latency-pill p99">
              <label>P99</label>
              <strong>{formatDuration(metrics.latencyP99)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Metric Card 4: Token Distribution & Cost */}
      <div className="metric-card metric-card-tokens" data-testid="metric-tokens-card">
        <div className="metric-card-header">
          <IconCpu size={16} className="metric-card-icon" />
          <span className="metric-card-title">Token Distribution</span>
          <span className="metric-cost-tag">{formatCostUsd(metrics.totalCostUsd)}</span>
        </div>
        <div className="metric-card-body">
          <div className="metric-main-value">
            {formatTokens(metrics.totalTokens.totalTokens)}{" "}
            <span className="text-unit">tokens</span>
          </div>
          {/* Proportional Token Bar */}
          <div
            className="token-proportion-bar"
            title={`Prompt: ${promptPct.toFixed(1)}%, Completion: ${compPct.toFixed(1)}%, Reasoning: ${reasonPct.toFixed(1)}%`}
          >
            <div
              className="tok-seg tok-prompt"
              style={{ width: `${promptPct}%` }}
              title={`Prompt / Input: ${formatTokens(metrics.totalTokens.promptTokens)}`}
            />
            <div
              className="tok-seg tok-completion"
              style={{ width: `${compPct}%` }}
              title={`Completion / Output: ${formatTokens(metrics.totalTokens.completionTokens)}`}
            />
            <div
              className="tok-seg tok-reasoning"
              style={{ width: `${reasonPct}%` }}
              title={`Reasoning: ${formatTokens(metrics.totalTokens.reasoningTokens)}`}
            />
          </div>
          <div className="metric-token-legend">
            <span className="leg-item prompt">
              <span className="leg-dot" /> Input: {formatTokens(metrics.totalTokens.promptTokens)}
            </span>
            <span className="leg-item comp">
              <span className="leg-dot" /> Output:{" "}
              {formatTokens(metrics.totalTokens.completionTokens)}
            </span>
            <span className="leg-item reasoning">
              <span className="leg-dot" /> Reason:{" "}
              {formatTokens(metrics.totalTokens.reasoningTokens)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
