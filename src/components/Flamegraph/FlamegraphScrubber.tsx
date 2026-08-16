import React from "react";
import { IconPlus, IconMinus, IconRefresh, IconZoomIn } from "@tabler/icons-react";
import type { ProfileSpan, ViewportRange } from "./types";
import { formatDuration } from "./flamegraphEngine";

export interface FlamegraphScrubberProps {
  timelineBounds: ViewportRange;
  viewport: ViewportRange;
  spans: ProfileSpan[];
  zoom: number;
  onRangeChange: (range: Partial<ViewportRange>) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onResetScrubber: () => void;
}

export const FlamegraphScrubber: React.FC<FlamegraphScrubberProps> = ({
  timelineBounds,
  viewport,
  spans,
  zoom,
  onRangeChange,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onResetScrubber,
}) => {
  const totalDuration = Math.max(1, timelineBounds.end - timelineBounds.start);
  const vStart = Math.max(timelineBounds.start, viewport.start);
  const vEnd = Math.min(timelineBounds.end, viewport.end);

  const startPct = Math.max(
    0,
    Math.min(100, ((vStart - timelineBounds.start) / totalDuration) * 100),
  );
  const endPct = Math.max(0, Math.min(100, ((vEnd - timelineBounds.start) / totalDuration) * 100));
  const windowWidthPct = Math.max(1, endPct - startPct);

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = Number(e.target.value);
    const newStart = timelineBounds.start + (rawVal / 100) * totalDuration;
    if (newStart < viewport.end) {
      onRangeChange({ start: newStart });
    }
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = Number(e.target.value);
    const newEnd = timelineBounds.start + (rawVal / 100) * totalDuration;
    if (newEnd > viewport.start) {
      onRangeChange({ end: newEnd });
    }
  };

  return (
    <div className="flamegraph-scrubber-container" data-testid="flamegraph-scrubber">
      <div className="scrubber-controls-bar">
        <div className="scrubber-info">
          <span className="scrubber-label">Timeline Range:</span>
          <span className="scrubber-window-value" data-testid="scrubber-window-value">
            {formatDuration(vStart - timelineBounds.start)} –{" "}
            {formatDuration(vEnd - timelineBounds.start)}{" "}
            <span className="scrubber-total-text">/ {formatDuration(totalDuration)}</span>
          </span>
        </div>

        <div className="scrubber-zoom-controls">
          <span className="zoom-badge" data-testid="zoom-level-badge">
            <IconZoomIn size={14} />
            {`${zoom.toFixed(1)}x`}
          </span>
          <button
            type="button"
            className="gvui-btn-icon scrubber-btn"
            onClick={onZoomIn}
            title="Zoom In (+)"
            aria-label="Zoom In"
            data-testid="zoom-in-btn"
          >
            <IconPlus size={14} />
          </button>
          <button
            type="button"
            className="gvui-btn-icon scrubber-btn"
            onClick={onZoomOut}
            title="Zoom Out (-)"
            aria-label="Zoom Out"
            data-testid="zoom-out-btn"
          >
            <IconMinus size={14} />
          </button>
          <button
            type="button"
            className="gvui-btn-icon scrubber-btn"
            onClick={onResetZoom}
            title="Reset Zoom"
            aria-label="Reset Zoom"
            data-testid="reset-zoom-btn"
          >
            <IconRefresh size={14} />
          </button>
          <button
            type="button"
            className="gvui-btn-sm scrubber-btn-reset-range"
            onClick={onResetScrubber}
            data-testid="reset-scrubber-btn"
          >
            Reset Range
          </button>
        </div>
      </div>

      {/* Mini timeline track */}
      <div className="scrubber-track-wrapper">
        <div className="scrubber-minimap-spans">
          {spans.slice(0, 50).map((s) => {
            const left = ((s.startTime - timelineBounds.start) / totalDuration) * 100;
            const width = Math.max(0.3, ((s.endTime - s.startTime) / totalDuration) * 100);
            return (
              <div
                key={s.id}
                className={`minimap-span-tick ${s.status === "error" ? "error" : ""}`}
                style={{
                  left: `${Math.max(0, Math.min(100, left))}%`,
                  width: `${Math.max(0.2, Math.min(100, width))}%`,
                }}
              />
            );
          })}
        </div>

        {/* Selected Viewport Highlight */}
        <div
          className="scrubber-window-highlight"
          data-testid="scrubber-window-highlight"
          style={{
            left: `${startPct}%`,
            width: `${windowWidthPct}%`,
          }}
        />

        {/* Sliders for start and end */}
        <input
          type="range"
          min="0"
          max="100"
          step="0.5"
          value={startPct}
          onChange={handleStartChange}
          className="scrubber-range-slider start-slider"
          aria-label="Scrubber Start Time"
          data-testid="scrubber-start-slider"
        />
        <input
          type="range"
          min="0"
          max="100"
          step="0.5"
          value={endPct}
          onChange={handleEndChange}
          className="scrubber-range-slider end-slider"
          aria-label="Scrubber End Time"
          data-testid="scrubber-end-slider"
        />
      </div>

      {/* Time marks */}
      <div className="scrubber-scale-ticks">
        <span>0ms</span>
        <span>{formatDuration(totalDuration * 0.25)}</span>
        <span>{formatDuration(totalDuration * 0.5)}</span>
        <span>{formatDuration(totalDuration * 0.75)}</span>
        <span>{formatDuration(totalDuration)}</span>
      </div>
    </div>
  );
};
