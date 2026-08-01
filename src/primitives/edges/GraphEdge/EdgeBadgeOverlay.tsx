import type { FC, KeyboardEvent, MouseEvent } from "react";
import { memo, useCallback } from "react";
import type { Point, Rect } from "../../../engine/layout/custom/types";

export interface EdgeBadgeOverlayProps {
  x: number;
  y: number;
  label?: string;
  isCycle?: boolean;
  isSelected?: boolean;
  badgeRect?: Rect;
  leaderPoints?: Point[];
  anchorPoint?: Point;
  onClick?: (e: MouseEvent<SVGGElement>) => void;
}

export const EdgeBadgeOverlay: FC<EdgeBadgeOverlayProps> = memo(
  ({
    x,
    y,
    label,
    isCycle = false,
    isSelected = false,
    badgeRect,
    leaderPoints,
    anchorPoint,
    onClick,
  }) => {
    const handleClick = useCallback(
      (e: MouseEvent<SVGGElement>): void => {
        e.stopPropagation();
        onClick?.(e);
      },
      [onClick],
    );

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<SVGGElement>): void => {
        if ((e.key === "Enter" || e.key === " ") && onClick) {
          e.preventDefault();
          onClick(e as unknown as MouseEvent<SVGGElement>);
        }
      },
      [onClick],
    );

    const hasBadge = Boolean(label && label.trim().length > 0) || isCycle;
    if (!hasBadge) {
      return null;
    }

    const displayText = isCycle
      ? label && label.trim().length > 0
        ? `CYCLE (${label})`
        : "CYCLE"
      : (label ?? "");

    const width = badgeRect ? badgeRect.width : Math.max(60, displayText.length * 8 + 24);
    const height = badgeRect ? badgeRect.height : 28;
    const renderX = badgeRect ? badgeRect.x + badgeRect.width / 2 : x;
    const renderY = badgeRect ? badgeRect.y + badgeRect.height / 2 : y;

    const hasLeaderPoints = Boolean(leaderPoints && leaderPoints.length >= 2);
    const hasLeaderLine =
      !hasLeaderPoints &&
      Boolean(anchorPoint && Math.hypot(anchorPoint.x - renderX, anchorPoint.y - renderY) > 4);

    const leaderSvgPath =
      hasLeaderPoints && leaderPoints
        ? leaderPoints
            .reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x} ${p.y}`, "")
            .trim()
        : "";

    return (
      <g
        transform={`translate(${renderX}, ${renderY})`}
        className={`edge-badge-group ${isSelected ? "selected" : ""} ${isCycle ? "cycle" : ""}`.trim()}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
      >
        {hasLeaderPoints ? (
          <path
            d={leaderSvgPath}
            stroke="#38bdf8"
            strokeWidth="1"
            strokeDasharray="3,3"
            fill="none"
            transform={`translate(${-renderX}, ${-renderY})`}
          />
        ) : (
          hasLeaderLine &&
          anchorPoint && (
            <line
              x1={anchorPoint.x - renderX}
              y1={anchorPoint.y - renderY}
              x2={0}
              y2={0}
              stroke="#38bdf8"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
          )
        )}
        <rect
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          rx={14}
          ry={14}
          fill="#18181b"
          opacity={1}
          stroke="#27272a"
          className={`edge-badge-rect ${isSelected ? "selected" : ""} ${isCycle ? "cycle" : ""}`.trim()}
        />
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#ffffff"
          fontSize="11"
          fontFamily="var(--font-mono)"
          fontWeight="600"
          className="edge-badge-text"
        >
          {displayText}
        </text>
      </g>
    );
  },
);

EdgeBadgeOverlay.displayName = "EdgeBadgeOverlay";
