import type { FC, KeyboardEvent, MouseEvent } from "react";
import { memo, useCallback } from "react";
import type { Point, Rect } from "../../../engine/layout/custom/types";
import type {
  BadgeDetail,
  EdgeContainerDetail,
  EdgeKind,
  EdgeTrafficDetail,
} from "../../../types/graphData";
import { describeEdgeKind, resolveEdgeKind } from "./edgeKinds";

export interface EdgeBadgeOverlayProps {
  x: number;
  y: number;
  label?: string;
  badge?: BadgeDetail;
  container?: EdgeContainerDetail;
  kind?: EdgeKind;
  stepNumber?: number | string;
  isCycle?: boolean;
  isSelected?: boolean;
  badgeRect?: Rect;
  leaderPoints?: Point[];
  anchorPoint?: Point;
  traffic?: EdgeTrafficDetail;
  isHighTraffic?: boolean;
  bundleCount?: number;
  onClick?: (e: MouseEvent<SVGGElement>) => void;
}

/**
 * Sanitizes step badge text or numbers to guarantee pure numbers or cycle arrows (e.g. "2", "3", "3 -> 2"),
 * strictly stripping any "Step" or "step" prefixes/labels.
 */
export function sanitizeStepBadge(raw?: string | number): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  const str = String(raw).trim();
  if (!str) return undefined;
  const cleaned = str.replace(/^step[\s:#-]*/i, "").trim();
  return cleaned || undefined;
}

export const EdgeBadgeOverlay: FC<EdgeBadgeOverlayProps> = memo(function EdgeBadgeOverlay({
  x,
  y,
  label,
  badge,
  container,
  kind,
  stepNumber,
  isCycle = false,
  isSelected = false,
  badgeRect,
  leaderPoints,
  anchorPoint,
  traffic,
  isHighTraffic = false,
  bundleCount,
  onClick,
}) {
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

  const semanticKind = resolveEdgeKind({ kind, isCycle });
  const descriptor = describeEdgeKind(semanticKind);

  const effectiveStep = sanitizeStepBadge(container?.stepBadge ?? stepNumber);
  const titleText = container?.title ?? badge?.text ?? label;
  const detailText = container?.detail;

  const hasTraffic = Boolean(traffic || isHighTraffic);
  const effectiveHighTraffic =
    isHighTraffic ||
    Boolean((traffic && (traffic.volume ?? 0) > 1) || traffic?.status === "congested" || isCycle);

  if (!titleText?.trim() && !effectiveStep && !isCycle && !kind && !hasTraffic) return null;

  const displayText = isCycle
    ? titleText?.trim()
      ? `CYCLE (${titleText})`
      : "CYCLE"
    : (titleText ?? descriptor.label);

  // Variant determination
  const variant = isCycle
    ? "loop"
    : (container?.variant ?? badge?.variant ?? descriptor.badgeVariant);

  const bundleSnippet =
    typeof bundleCount === "number" && bundleCount > 1 ? `x${bundleCount}` : null;

  // Measure composite single-line text width without icon chrome or traffic chips
  const computedWidth = Math.max(
    54,
    (effectiveStep ? effectiveStep.length * 7 + 14 : 0) +
      displayText.length * 6.8 +
      (detailText ? detailText.length * 6.0 + 10 : 0) +
      (bundleSnippet ? bundleSnippet.length * 6.2 + 12 : 0) +
      20,
  );
  const width = badgeRect ? Math.max(badgeRect.width, computedWidth) : computedWidth;
  const height = badgeRect ? Math.max(badgeRect.height, 26) : 26;
  const renderX = badgeRect ? badgeRect.x + badgeRect.width / 2 : x;
  const renderY = badgeRect ? badgeRect.y + badgeRect.height / 2 : y;

  const hasLeaderPoints = Boolean(leaderPoints && leaderPoints.length >= 2);
  const anchor = anchorPoint ?? (hasLeaderPoints && leaderPoints ? leaderPoints[0] : undefined);
  const isOutside =
    anchor !== undefined &&
    (anchor.x < renderX - width / 2 ||
      anchor.x > renderX + width / 2 ||
      anchor.y < renderY - height / 2 ||
      anchor.y > renderY + height / 2);
  const showLeaderPath = isOutside && hasLeaderPoints;
  const showLeaderLine = isOutside && !hasLeaderPoints && anchorPoint !== undefined;
  const leaderSvgPath =
    showLeaderPath && leaderPoints
      ? leaderPoints.reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x} ${p.y}`, "").trim()
      : "";

  const glowColor =
    traffic?.glowColor ?? (isCycle ? "#f59e0b" : effectiveHighTraffic ? "#06b6d4" : undefined);
  const glowStyle = glowColor
    ? { filter: `drop-shadow(0 0 6px ${glowColor})`, stroke: glowColor }
    : undefined;

  return (
    <g
      transform={`translate(${renderX}, ${renderY})`}
      className={`edge-badge-group kind-${semanticKind} ${isSelected ? "selected" : ""} ${isCycle ? "cycle" : ""} ${effectiveHighTraffic ? "high-traffic" : ""} is-clickable ${badge?.clickable || onClick ? "has-click" : ""}`.trim()}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Edge ${effectiveStep ? `${effectiveStep}: ` : ""}${displayText}`}
      style={{ cursor: "pointer" }}
    >
      {showLeaderPath && (
        <path
          d={leaderSvgPath}
          stroke={descriptor.accent || "#38bdf8"}
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
          stroke={descriptor.accent || "#38bdf8"}
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
        fill="#0d0d10"
        style={glowStyle}
        className={`edge-badge-rect variant-${variant} kind-${semanticKind} ${isSelected ? "selected" : ""} ${isCycle ? "cycle" : ""} ${effectiveHighTraffic ? "high-traffic" : ""}`.trim()}
      />
      <foreignObject
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        style={{ pointerEvents: "none" }}
      >
        <div
          className={`edge-badge-inner variant-${variant} kind-${semanticKind}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            gap: "6px",
            padding: "0 6px",
            boxSizing: "border-box",
          }}
        >
          {effectiveStep && (
            <span
              className="edge-step-badge"
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
          <span className="edge-badge-label">{displayText}</span>

          {bundleSnippet && (
            <span
              className="edge-bundle-chip"
              style={{
                fontSize: "9px",
                fontWeight: 700,
                padding: "0 4px",
                borderRadius: "3px",
                backgroundColor: "rgba(129, 140, 248, 0.2)",
                color: "#c7d2fe",
                border: "1px solid rgba(129, 140, 248, 0.35)",
              }}
              title={`Bundle size: ${bundleCount}`}
            >
              {bundleSnippet}
            </span>
          )}

          {detailText && (
            <span
              className="edge-badge-detail"
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
});

EdgeBadgeOverlay.displayName = "EdgeBadgeOverlay";
