import type { FC, KeyboardEvent, MouseEvent } from "react";
import { memo, useCallback } from "react";

import {
  getBadgeDisplayText,
  hasBadge,
  measureBadgeRect,
} from "../../../engine/layout/custom/badgeMeasurement";
import { pointsToSvgPath } from "../../../engine/layout/custom/svgPath";
import type { Point } from "../../../engine/layout/custom/types";

export interface EdgeBadgeOverlayProps {
  x: number;
  y: number;
  label?: string;
  isCycle?: boolean;
  isSelected?: boolean;
  leaderPoints?: Point[];
  anchorPoint?: Point;
  onClick?: (e: MouseEvent<SVGGElement>) => void;
}

export const EdgeBadgeOverlay: FC<EdgeBadgeOverlayProps> = memo(({
  x,
  y,
  label,
  isCycle = false,
  isSelected = false,
  leaderPoints,
  anchorPoint,
  onClick,
}) => {
  const handleClick = useCallback((e: MouseEvent<SVGGElement>): void => {
    e.stopPropagation();
    onClick?.(e);
  }, [onClick]);

  const handleKeyDown = useCallback((e: KeyboardEvent<SVGGElement>): void => {
    if ((e.key === "Enter" || e.key === " ") && onClick) {
      e.preventDefault();
      onClick(e as unknown as MouseEvent<SVGGElement>);
    }
  }, [onClick]);

  if (!hasBadge(label, isCycle)) {
    return null;
  }

  const displayText = getBadgeDisplayText(label, isCycle) ?? "";
  const rect = measureBadgeRect(label ?? "", undefined, isCycle);
  const width = rect.width;
  const height = rect.height;

  const hasLeaderPoints = Boolean(leaderPoints && leaderPoints.length >= 2);
  const hasLeaderLine =
    !hasLeaderPoints &&
    Boolean(anchorPoint && Math.hypot(anchorPoint.x - x, anchorPoint.y - y) > 4);

  return (
    <g
      transform={`translate(${x}, ${y})`}
      className={`edge-badge-group ${isSelected ? "selected" : ""} ${isCycle ? "cycle" : ""}`.trim()}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {hasLeaderPoints && leaderPoints ? (
        <path
          d={pointsToSvgPath(leaderPoints)}
          stroke="#38bdf8"
          strokeWidth="1"
          strokeDasharray="3,3"
          fill="none"
          transform={`translate(${-x}, ${-y})`}
        />
      ) : (
        hasLeaderLine &&
        anchorPoint && (
          <line
            x1={anchorPoint.x - x}
            y1={anchorPoint.y - y}
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
});

EdgeBadgeOverlay.displayName = "EdgeBadgeOverlay";
