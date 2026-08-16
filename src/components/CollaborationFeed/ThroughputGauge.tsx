import React from "react";
import { IconActivity, IconBolt, IconClock, IconCoins, IconFlame } from "@tabler/icons-react";
import type { ThroughputMetrics } from "./types";

export interface ThroughputGaugeProps {
  metrics: ThroughputMetrics;
}

export function formatTokenNumber(num?: number): string {
  if (num === undefined || num === null || Number.isNaN(num) || !Number.isFinite(num)) {
    return "0";
  }
  const absNum = Math.abs(num);
  if (absNum >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (absNum >= 1_000) {
    return `${(num / 1_000).toFixed(1)}k`;
  }
  return num.toLocaleString();
}

export function formatLatency(ms?: number): string {
  if (ms === undefined || ms === null || Number.isNaN(ms) || !Number.isFinite(ms) || ms <= 0) {
    return "0 ms";
  }
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export const ThroughputGauge: React.FC<ThroughputGaugeProps> = ({ metrics }) => {
  const { tokensPerSec, promptTokens, completionTokens, totalTokens, latencyMs, peakTokensPerSec } =
    metrics;

  // Rate bar fill percentage relative to peak (or fallback 1000 tps base)
  const maxScale = Math.max(peakTokensPerSec, 100);
  const fillPercentage = Math.min(100, Math.max(0, (tokensPerSec / maxScale) * 100));

  // Latency status color
  const latencyStatusColor =
    latencyMs === 0
      ? "#a1a1aa"
      : latencyMs < 500
        ? "#34d399" // Fast (green)
        : latencyMs < 2000
          ? "#facc15" // Moderate (yellow)
          : "#f87171"; // Slow (red)

  return (
    <div className="gvui-throughput-gauge" data-testid="throughput-gauge">
      <div className="gvui-throughput-metrics-row">
        {/* Live Throughput */}
        <div className="gvui-metric-card" data-testid="metric-tps">
          <div className="gvui-metric-card__label">
            <IconBolt size={12} color="#38bdf8" />
            <span>Throughput</span>
          </div>
          <div className="gvui-metric-card__value gvui-metric-card__value--highlight">
            {tokensPerSec > 0 ? `${tokensPerSec.toFixed(1)}` : "0.0"}
            <span style={{ fontSize: 10, fontWeight: 500, marginLeft: 2, color: "#94a3b8" }}>
              tok/s
            </span>
          </div>
          <div className="gvui-metric-card__sub">
            Peak: {peakTokensPerSec > 0 ? `${peakTokensPerSec.toFixed(0)} tok/s` : "0 tok/s"}
          </div>
        </div>

        {/* Total Tokens */}
        <div className="gvui-metric-card" data-testid="metric-total-tokens">
          <div className="gvui-metric-card__label">
            <IconCoins size={12} color="#f59e0b" />
            <span>Total Tokens</span>
          </div>
          <div className="gvui-metric-card__value">{formatTokenNumber(totalTokens)}</div>
          <div className="gvui-metric-card__sub">
            In: {formatTokenNumber(promptTokens)} / Out: {formatTokenNumber(completionTokens)}
          </div>
        </div>

        {/* Cognitive Latency */}
        <div className="gvui-metric-card" data-testid="metric-latency">
          <div className="gvui-metric-card__label">
            <IconClock size={12} color={latencyStatusColor} />
            <span>Latency</span>
          </div>
          <div className="gvui-metric-card__value" style={{ color: latencyStatusColor }}>
            {formatLatency(latencyMs)}
          </div>
          <div className="gvui-metric-card__sub">
            {latencyMs === 0
              ? "idle"
              : latencyMs < 500
                ? "optimal"
                : latencyMs < 2000
                  ? "nominal"
                  : "high"}
          </div>
        </div>

        {/* Activity Status */}
        <div className="gvui-metric-card" data-testid="metric-samples">
          <div className="gvui-metric-card__label">
            <IconActivity size={12} color="#a855f7" />
            <span>Events</span>
          </div>
          <div className="gvui-metric-card__value">{metrics.sampleCount}</div>
          <div className="gvui-metric-card__sub">
            <IconFlame size={10} style={{ display: "inline", verticalAlign: "middle" }} />
            {tokensPerSec > 0 ? " Active streaming" : " Standby"}
          </div>
        </div>
      </div>

      {/* Real-time Rate Bar */}
      <div
        className="gvui-rate-bar-container"
        title={`Current: ${tokensPerSec} tok/s, Peak: ${peakTokensPerSec} tok/s`}
      >
        <div
          className="gvui-rate-bar-fill"
          style={{ width: `${tokensPerSec > 0 ? Math.max(fillPercentage, 3) : 0}%` }}
        />
      </div>
    </div>
  );
};
