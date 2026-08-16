/**
 * Replay Timeline Scrubber Component with interactive tick markers and time display.
 * 100% Zero-any type-safe implementation.
 */

import type { ChangeEvent, FC } from "react";
import type { TimelineEvent } from "../../engine/sandbox/types";

export interface ReplayTimelineProps {
  currentTimeMs: number;
  totalDurationMs: number;
  events: TimelineEvent[];
  onSeek: (timeMs: number) => void;
  className?: string;
}

export const ReplayTimeline: FC<ReplayTimelineProps> = ({
  currentTimeMs,
  totalDurationMs,
  events,
  onSeek,
  className = "",
}) => {
  const duration = Math.max(1, totalDurationMs);
  const progressPercent = Math.min(100, Math.max(0, (currentTimeMs / duration) * 100));

  const handleSliderChange = (e: ChangeEvent<HTMLInputElement>) => {
    const timeVal = parseFloat(e.target.value);
    onSeek(timeVal);
  };

  const formatMs = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className={`replay-timeline-container ${className}`}>
      <div className="replay-timeline-header">
        <div className="timeline-time-info">
          <span className="current-time">{formatMs(currentTimeMs)}</span>
          <span className="time-divider">/</span>
          <span className="total-time">{formatMs(totalDurationMs)}</span>
          <span className="progress-badge">{progressPercent.toFixed(1)}%</span>
        </div>
        <div className="timeline-legend">
          <span className="legend-item">
            <span className="legend-dot stdout" /> stdout
          </span>
          <span className="legend-item">
            <span className="legend-dot stderr" /> stderr
          </span>
          <span className="legend-item">
            <span className="legend-dot step" /> stage
          </span>
        </div>
      </div>

      <div className="replay-timeline-track-wrapper">
        <div className="replay-timeline-track">
          <div className="replay-timeline-fill" style={{ width: `${progressPercent}%` }} />

          {/* Event markers on timeline */}
          {events.map((ev, idx) => {
            const leftPct = (ev.timestampMs / duration) * 100;
            const isPassed = ev.timestampMs <= currentTimeMs;
            let markerClass = "event-marker-stdout";
            if (ev.type === "stderr_chunk") markerClass = "event-marker-stderr";
            else if (ev.type === "pipeline_step") markerClass = "event-marker-step";
            else if (ev.type === "exit") markerClass = "event-marker-exit";

            return (
              <div
                key={`ev-marker-${ev.id}-${idx}`}
                className={`timeline-event-marker ${markerClass} ${isPassed ? "passed" : ""}`}
                style={{ left: `${leftPct}%` }}
                title={`[${formatMs(ev.timestampMs)}] ${ev.type}: ${ev.data.trim()}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(ev.timestampMs);
                }}
              />
            );
          })}
        </div>

        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={currentTimeMs}
          onChange={handleSliderChange}
          className="replay-timeline-slider"
          aria-label="Timeline scrubbing slider"
        />
      </div>
    </div>
  );
};
