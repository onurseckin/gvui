import type { FC, KeyboardEvent, MouseEvent } from "react";
import { memo, useCallback } from "react";
import {
  IconAlertCircle,
  IconArrowRight,
  IconFileText,
  IconGitMerge,
  IconRocket,
} from "@tabler/icons-react";
import type { Point, Rect } from "../../../engine/layout/custom/types";
import type { BadgeDetail } from "../../../types/graphData";
import { getTablerIconComponent } from "../../nodes/NodeCard/nodeKinds";

export interface EdgeBadgeOverlayProps {
  x: number;
  y: number;
  label?: string;
  badge?: BadgeDetail;
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
    badge,
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

    const badgeText = badge?.text ?? label;
    const hasBadge = Boolean(badgeText && badgeText.trim().length > 0) || isCycle;
    if (!hasBadge) return null;

    const displayText = isCycle
      ? badgeText && badgeText.trim().length > 0
        ? `CYCLE (${badgeText})`
        : "CYCLE"
      : (badgeText ?? "");

    const iconKey = badge?.icon;
    let IconComp = getTablerIconComponent(iconKey);
    if (!IconComp) {
      if (isCycle || badge?.variant === "warning") IconComp = IconAlertCircle;
      else if (badge?.variant === "info") IconComp = IconRocket;
      else if (badge?.variant === "success") IconComp = IconFileText;
      else if (badge?.text?.toLowerCase().includes("join")) IconComp = IconGitMerge;
      else if (badge?.text) IconComp = IconArrowRight;
    }

    const iconPadding = IconComp ? 20 : 0;
    const width = badgeRect
      ? badgeRect.width
      : Math.max(64, displayText.length * 7.5 + 24 + iconPadding);
    const height = badgeRect ? badgeRect.height : 28;
    const renderX = badgeRect ? badgeRect.x + badgeRect.width / 2 : x;
    const renderY = badgeRect ? badgeRect.y + badgeRect.height / 2 : y;

    const hasLeaderPoints = Boolean(leaderPoints && leaderPoints.length >= 2);
    const anchor = anchorPoint ?? (hasLeaderPoints && leaderPoints ? leaderPoints[0] : undefined);
    const anchorIsOutsideBadge =
      anchor !== undefined &&
      (anchor.x < renderX - width / 2 ||
        anchor.x > renderX + width / 2 ||
        anchor.y < renderY - height / 2 ||
        anchor.y > renderY + height / 2);

    const showLeaderPath = anchorIsOutsideBadge && hasLeaderPoints;
    const showLeaderLine = anchorIsOutsideBadge && !hasLeaderPoints && anchorPoint !== undefined;

    const leaderSvgPath =
      showLeaderPath && leaderPoints
        ? leaderPoints
            .reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x} ${p.y}`, "")
            .trim()
        : "";

    const variant = isCycle ? "warning" : (badge?.variant ?? "neutral");
    const isClickable = badge?.clickable ?? Boolean(onClick);

    return (
      <g
        transform={`translate(${renderX}, ${renderY})`}
        className={`edge-badge-group ${isSelected ? "selected" : ""} ${isCycle ? "cycle" : ""} ${isClickable ? "is-clickable" : ""}`.trim()}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
      >
        {showLeaderPath && (
          <path
            d={leaderSvgPath}
            stroke="#38bdf8"
            strokeWidth="1"
            strokeDasharray="3,3"
            fill="none"
            transform={`translate(${-renderX}, ${-renderY})`}
          />
        )}
        {showLeaderLine && anchorPoint && (
          <line
            x1={anchorPoint.x - renderX}
            y1={anchorPoint.y - renderY}
            x2={0}
            y2={0}
            stroke="#38bdf8"
            strokeWidth="1"
            strokeDasharray="3,3"
          />
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
          className={`edge-badge-rect variant-${variant} ${isSelected ? "selected" : ""} ${isCycle ? "cycle" : ""}`.trim()}
        />
        <foreignObject
          x={-width / 2}
          y={-height / 2}
          width={width}
          height={height}
          style={{ pointerEvents: "none" }}
        >
          <div
            className={`edge-badge-inner variant-${variant}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
              gap: "5px",
              padding: "0 8px",
              boxSizing: "border-box",
            }}
          >
            {IconComp ? <IconComp size={13} className="edge-badge-icon" /> : null}
            <span className="edge-badge-label">{displayText}</span>
          </div>
        </foreignObject>
      </g>
    );
  },
);

EdgeBadgeOverlay.displayName = "EdgeBadgeOverlay";
