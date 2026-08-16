/**
 * Execution Timing Breakdown & Waterfall Latency View Component.
 * Displays latency distributions, TTFB, throughput, and event Gantt chart.
 * 100% Zero-any type-safe implementation.
 */

import type { FC } from "react";
import { stripAnsi } from "../../engine/sandbox/ansiParser";
import { useCommandSandboxStore } from "./useCommandSandboxStore";

export interface TimingBreakdownViewProps {
  className?: string;
}

export const TimingBreakdownView: FC<TimingBreakdownViewProps> = ({ className = "" }) => {
  const timingBreakdown = useCommandSandboxStore((state) => state.timingBreakdown);
  const recordedTrace = useCommandSandboxStore((state) => state.recordedTrace);

  if (!timingBreakdown || !recordedTrace) {
    return (
      <div className={`timing-breakdown-view empty ${className}`}>
        <div className="empty-notice">No execution timing data available</div>
      </div>
    );
  }

  const totalDur = Math.max(1, timingBreakdown.totalDurationMs);
  const events = recordedTrace.events;

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className={`timing-breakdown-view ${className}`}>
      {/* Top Metric Cards */}
      <div className="timing-metrics-grid">
        <div className="timing-card highlight">
          <span className="card-label">Total Execution Time</span>
          <span className="card-value">{timingBreakdown.totalDurationMs} ms</span>
          <span className="card-sub">{timingBreakdown.pipelineStagesCount} pipeline stages</span>
        </div>

        <div className="timing-card">
          <span className="card-label">Time to First Byte (TTFB)</span>
          <span className="card-value">{timingBreakdown.ttfbMs} ms</span>
          <span className="card-sub">
            {((timingBreakdown.ttfbMs / totalDur) * 100).toFixed(1)}% of total run
          </span>
        </div>

        <div className="timing-card">
          <span className="card-label">Avg Chunk Latency</span>
          <span className="card-value">{timingBreakdown.averageChunkLatencyMs} ms</span>
          <span className="card-sub">Max: {timingBreakdown.maxChunkLatencyMs} ms</span>
        </div>

        <div className="timing-card">
          <span className="card-label">Throughput & Size</span>
          <span className="card-value">{formatBytes(timingBreakdown.bytesTotal)}</span>
          <span className="card-sub">{timingBreakdown.throughputBytesPerSec} B/sec</span>
        </div>
      </div>

      {/* Waterfall / Gantt Chart */}
      <div className="waterfall-section">
        <h3>Execution Timeline Waterfall</h3>
        <div className="waterfall-chart-container">
          <div className="waterfall-scale-header">
            <span>0ms</span>
            <span>{Math.round(totalDur * 0.25)}ms</span>
            <span>{Math.round(totalDur * 0.5)}ms</span>
            <span>{Math.round(totalDur * 0.75)}ms</span>
            <span>{totalDur}ms</span>
          </div>

          <div className="waterfall-bars">
            {events.map((ev, idx) => {
              const startPct = (ev.timestampMs / totalDur) * 100;
              const nextEv = events[idx + 1];
              const endTimestamp = nextEv ? nextEv.timestampMs : ev.timestampMs + 2;
              const barWidthPct = Math.max(0.5, ((endTimestamp - ev.timestampMs) / totalDur) * 100);

              let barTypeClass = "type-stdout";
              if (ev.type === "stderr_chunk") barTypeClass = "type-stderr";
              else if (ev.type === "pipeline_step") barTypeClass = "type-stage";
              else if (ev.type === "spawn") barTypeClass = "type-spawn";
              else if (ev.type === "exit") barTypeClass = "type-exit";

              return (
                <div key={`waterfall-row-${ev.id}-${idx}`} className="waterfall-row">
                  <div className="waterfall-row-meta">
                    <span className="event-type-tag">{ev.type}</span>
                    <span className="event-time-tag">+{ev.timestampMs}ms</span>
                  </div>

                  <div className="waterfall-track">
                    <div
                      className={`waterfall-bar ${barTypeClass}`}
                      style={{
                        left: `${startPct}%`,
                        width: `${barWidthPct}%`,
                      }}
                      title={`[${ev.timestampMs}ms] ${ev.type}: ${ev.data.trim()}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Events Breakdown Table */}
      <div className="events-table-section">
        <h3>Trace Event Distribution</h3>
        <div className="events-table-wrapper">
          <table className="events-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Timestamp</th>
                <th>Event Type</th>
                <th>Stream</th>
                <th>Payload Preview</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, idx) => (
                <tr key={`ev-row-${ev.id}-${idx}`}>
                  <td className="col-idx">{idx + 1}</td>
                  <td className="col-time">+{ev.timestampMs}ms</td>
                  <td className="col-type">
                    <span className={`event-badge badge-${ev.type}`}>{ev.type}</span>
                  </td>
                  <td className="col-stream">{ev.stream ?? "system"}</td>
                  <td className="col-data">
                    <code>{stripAnsi(ev.data).trim()}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
