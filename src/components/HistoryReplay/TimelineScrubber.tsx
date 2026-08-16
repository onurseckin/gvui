import type { FC, MouseEvent } from "react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import type { ReplayBookmark, ReplayEvent } from "./types";

export interface TimelineScrubberProps {
  events: readonly ReplayEvent[];
  currentEventIndex: number;
  bookmarks?: readonly ReplayBookmark[];
  onSeek: (index: number) => void;
  className?: string;
}

export const TimelineScrubber: FC<TimelineScrubberProps> = memo(function TimelineScrubber({
  events,
  currentEventIndex,
  bookmarks = [],
  onSeek,
  className = "",
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

  const totalEvents = events.length;
  const clampedCurrentIndex =
    totalEvents > 0 ? Math.max(0, Math.min(currentEventIndex, totalEvents - 1)) : 0;
  const currentEvent = events[clampedCurrentIndex] ?? null;

  const progressPercent = useMemo(() => {
    if (totalEvents <= 1) return 0;
    return (clampedCurrentIndex / (totalEvents - 1)) * 100;
  }, [clampedCurrentIndex, totalEvents]);

  const handleTrackClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current || totalEvents === 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const fraction = Math.max(0, Math.min(1, clickX / rect.width));
      const targetIndex = Math.round(fraction * (totalEvents - 1));
      onSeek(targetIndex);
    },
    [totalEvents, onSeek],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current || totalEvents === 0) return;
      const rect = trackRef.current.getBoundingClientRect();
      const moveX = e.clientX - rect.left;
      const fraction = Math.max(0, Math.min(1, moveX / rect.width));
      const targetIndex = Math.round(fraction * (totalEvents - 1));
      setHoverIndex(targetIndex);
      setHoverX(moveX);
    },
    [totalEvents],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
  }, []);

  const hoverEvent = hoverIndex !== null && events[hoverIndex] ? events[hoverIndex] : null;

  return (
    <div className={`timeline-scrubber-container ${className}`} data-testid="timeline-scrubber">
      <div className="timeline-scrubber-top">
        <div className="timeline-scrubber-current-event">
          <span>
            Event {totalEvents > 0 ? clampedCurrentIndex + 1 : 0} / {totalEvents}
          </span>
          {currentEvent && (
            <span
              className={`timeline-event-kind-tag ${
                currentEvent.isFailure
                  ? "failure"
                  : currentEvent.isCritic
                    ? "critic"
                    : currentEvent.isMilestone
                      ? "milestone"
                      : ""
              }`}
            >
              {currentEvent.kind}
            </span>
          )}
          {currentEvent?.actor && (
            <span style={{ color: "#a1a1aa", fontSize: "11px" }}>by {currentEvent.actor}</span>
          )}
        </div>
        <div>
          {currentEvent?.timestamp && (
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "11px" }}>
              {new Date(currentEvent.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      <div
        ref={trackRef}
        className="timeline-track-wrapper"
        onClick={handleTrackClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        role="slider"
        aria-label="Execution History Timeline"
        aria-valuemin={0}
        aria-valuemax={totalEvents > 0 ? totalEvents - 1 : 0}
        aria-valuenow={clampedCurrentIndex}
        tabIndex={0}
      >
        <div className="timeline-track-bar">
          <div className="timeline-progress-fill" style={{ width: `${progressPercent}%` }} />

          {/* Bookmarks & Key Markers */}
          {bookmarks.map((bm) => {
            if (totalEvents <= 1) return null;
            const leftPct = (bm.eventIndex / (totalEvents - 1)) * 100;
            const pinClass =
              bm.category === "failure"
                ? "pin-failure"
                : bm.category === "critic"
                  ? "pin-critic"
                  : bm.category === "milestone"
                    ? "pin-milestone"
                    : "pin-custom";

            return (
              <div
                key={bm.id}
                className={`timeline-pin ${pinClass}`}
                style={{ left: `${leftPct}%` }}
                title={`${bm.label} (${bm.category})`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(bm.eventIndex);
                }}
                data-testid={`timeline-pin-${bm.category}`}
              />
            );
          })}

          {/* Current Scrubber Head */}
          {totalEvents > 0 && (
            <div
              className="timeline-head-thumb"
              style={{ left: `${progressPercent}%` }}
              data-testid="timeline-head-thumb"
            />
          )}
        </div>

        {/* Hover Tooltip */}
        {hoverEvent && hoverIndex !== null && (
          <div
            className="timeline-hover-tooltip"
            style={{ left: `${hoverX}px` }}
            data-testid="timeline-hover-tooltip"
          >
            <div className="timeline-hover-tooltip-title">
              Event #{hoverEvent.sequence}: {hoverEvent.kind}
            </div>
            <div className="timeline-hover-tooltip-sub">
              Actor: {hoverEvent.actor} | {new Date(hoverEvent.timestamp).toLocaleTimeString()}
            </div>
            {hoverEvent.summary && (
              <div style={{ color: "#e4e4e7", marginTop: "2px" }}>{hoverEvent.summary}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
