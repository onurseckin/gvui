import type { FC, KeyboardEvent, MouseEvent } from "react";
import { memo, useCallback } from "react";
import { IconAlertCircle, IconFileText, IconRocket } from "@tabler/icons-react";
import type { Point, Rect } from "../../../engine/layout/custom/types";
import type { BadgeDetail, EdgeContainerDetail } from "../../../types/graphData";
import { getTablerIconComponent } from "../../nodes/NodeCard/nodeKinds";

export interface EdgeBadgeOverlayProps {
  x: number;
  y: number;
  label?: string;
  badge?: BadgeDetail;
  container?: EdgeContainerDetail;
  stepNumber?: number | string;
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
    container,
    stepNumber,
    isCycle = false,
    isSelected = false,
    badgeRect,
    leaderPoints,
    anchorPoint,
    onClick,
  }) => {
    const handleClick = useCallback(
      (e: MouseEvent<SVGGElement>) => {
        e.stopPropagation();
        onClick?.(e);
      },
      [onClick],
    );

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<SVGGElement>) => {
        if ((e.key === "Enter" || e.key === " ") && onClick) {
          e.preventDefault();
          onClick(e as unknown as MouseEvent<SVGGElement>);
        }
      },
      [onClick],
    );

    const effectiveStep =
      container?.stepBadge ?? (stepNumber !== undefined ? String(stepNumber) : undefined);
    const titleText = container?.title ?? badge?.text ?? label;
    const detailText = container?.detail;
    const hasBadge =
      Boolean(titleText && titleText.trim().length > 0) || Boolean(effectiveStep) || isCycle;
    if (!hasBadge) return null;

    const displayText = isCycle
      ? titleText && titleText.trim().length > 0
        ? `CYCLE (${titleText})`
        : "CYCLE"
      : (titleText ?? (effectiveStep ? `Step ${effectiveStep}` : ""));

    const iconKey = container?.icon ?? badge?.icon;
    let IconComp = getTablerIconComponent(iconKey);
    if (!IconComp && iconKey) {
      if (isCycle || container?.variant === "warning" || badge?.variant === "warning")
        IconComp = IconAlertCircle;
      else if (container?.variant === "info" || badge?.variant === "info") IconComp = IconRocket;
      else if (container?.variant === "success" || badge?.variant === "success")
        IconComp = IconFileText;
    } else if (isCycle && !IconComp) {
      IconComp = IconAlertCircle;
    }

    const stepPillWidth = effectiveStep ? effectiveStep.length * 6.5 + 16 : 0;
    const iconWidth = IconComp ? 16 : 0;
    const textWidth = displayText.length * 6.8;
    const detailWidth = detailText ? detailText.length * 6.0 + 12 : 0;
    const computedWidth = Math.max(68, stepPillWidth + iconWidth + textWidth + detailWidth + 24);

    const width = badgeRect ? badgeRect.width : computedWidth;
    const height = badgeRect ? badgeRect.height : 26;
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

    const variant = isCycle ? "warning" : (container?.variant ?? badge?.variant ?? "neutral");
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
          rx={6}
          ry={6}
          fill="#111114"
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
              padding: "0 6px",
              boxSizing: "border-box",
            }}
          >
            {effectiveStep && (
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  padding: "0 4px",
                  borderRadius: "3px",
                  backgroundColor: "rgba(255, 255, 255, 0.12)",
                  color: "#f4f4f5",
                  letterSpacing: "0.02em",
                }}
              >
                {effectiveStep}
              </span>
            )}
            {IconComp ? <IconComp size={12} className="edge-badge-icon" /> : null}
            <span className="edge-badge-label">{displayText}</span>
            {detailText && (
              <span
                style={{
                  fontSize: "9.5px",
                  opacity: 0.8,
                  padding: "0 3px",
                  borderRadius: "2px",
                  backgroundColor: "rgba(0, 0, 0, 0.3)",
                }}
              >
                {detailText}
              </span>
            )}
          </div>
        </foreignObject>
      </g>
    );
  },
);

EdgeBadgeOverlay.displayName = "EdgeBadgeOverlay";
