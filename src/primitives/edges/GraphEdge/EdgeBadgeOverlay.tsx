import {
  IconAlertTriangle,
  IconBolt,
  IconCertificate,
  IconFileText,
  IconFlame,
  IconLink,
  IconRocket,
  IconShieldCheck,
} from "@tabler/icons-react";
import type { FC, KeyboardEvent, MouseEvent } from "react";
import { memo, useCallback } from "react";
import type { Point, Rect } from "../../../engine/layout/custom/types";
import type {
  BadgeDetail,
  EdgeContainerDetail,
  EdgeKind,
  EdgeTrafficDetail,
} from "../../../types/graphData";
import { formatTokens } from "../../nodes/NodeCard/nodeCardModel";
import { getTablerIconComponent } from "../../nodes/NodeCard/nodeKinds";
import { describeEdgeKind, getEdgeIconComponent, resolveEdgeKind } from "./edgeKinds";

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
  bundleIndex?: number;
  onClick?: (e: MouseEvent<SVGGElement>) => void;
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
  bundleIndex,
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

  const effectiveStep =
    container?.stepBadge ?? (stepNumber !== undefined ? String(stepNumber) : undefined);
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
    : (titleText ?? (effectiveStep ? `Step ${effectiveStep}` : descriptor.label));

  // Determine Icon
  const iconKey = container?.icon ?? badge?.icon;
  let IconComp = getTablerIconComponent(iconKey) ?? getEdgeIconComponent(iconKey);

  if (!IconComp && iconKey) {
    const v = container?.variant ?? badge?.variant;
    IconComp =
      isCycle || v === "warning" || v === "loop"
        ? IconAlertTriangle
        : v === "info" || v === "spawn"
          ? IconRocket
          : v === "success" || v === "gate"
            ? IconShieldCheck
            : v === "critic"
              ? IconCertificate
              : v === "dependency"
                ? IconLink
                : v === "data"
                  ? IconFileText
                  : undefined;
  } else if (!IconComp && isCycle) {
    IconComp = IconAlertTriangle;
  } else if (!IconComp && descriptor.IconComponent) {
    IconComp = descriptor.IconComponent;
  }

  // Variant determination
  const variant = isCycle
    ? "loop"
    : (container?.variant ?? badge?.variant ?? descriptor.badgeVariant);

  // Traffic summary snippet
  let trafficSnippet: string | null = null;
  if (traffic) {
    if ((traffic.messagesCount ?? 0) > 1 || (traffic.volume ?? 0) > 1) {
      trafficSnippet = `${traffic.messagesCount ?? traffic.volume} msgs`;
    } else if (typeof traffic.tokens === "number" && traffic.tokens > 0) {
      trafficSnippet = `${formatTokens(traffic.tokens)} tok`;
    }
  }

  const bundleSnippet = bundleCount && bundleCount > 1 ? `x${bundleCount}` : null;

  const computedWidth = Math.max(
    68,
    (effectiveStep ? effectiveStep.length * 6.5 + 16 : 0) +
      (IconComp ? 18 : 0) +
      displayText.length * 6.8 +
      (detailText ? detailText.length * 6.0 + 12 : 0) +
      (trafficSnippet ? trafficSnippet.length * 6.2 + 20 : 0) +
      (bundleSnippet ? bundleSnippet.length * 6.2 + 14 : 0) +
      24,
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
      className={`edge-badge-group kind-${semanticKind} ${isSelected ? "selected" : ""} ${isCycle ? "cycle" : ""} ${effectiveHighTraffic ? "high-traffic" : ""} ${badge?.clickable || onClick ? "is-clickable" : ""}`.trim()}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Edge: ${displayText}${trafficSnippet ? `, Traffic: ${trafficSnippet}` : ""}`}
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

          {trafficSnippet && (
            <span
              className={`edge-traffic-chip ${traffic?.status === "congested" ? "is-congested" : "is-active"}`}
              style={{
                fontSize: "9.5px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                padding: "1px 5px",
                borderRadius: "3px",
                backgroundColor: isCycle ? "rgba(245, 158, 11, 0.2)" : "rgba(6, 182, 212, 0.2)",
                color: isCycle ? "#fcd34d" : "#67e8f9",
                border: isCycle
                  ? "1px solid rgba(245, 158, 11, 0.4)"
                  : "1px solid rgba(6, 182, 212, 0.4)",
              }}
            >
              {isCycle ? <IconFlame size={10} /> : <IconBolt size={10} />}
              <span>{trafficSnippet}</span>
            </span>
          )}

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
});

EdgeBadgeOverlay.displayName = "EdgeBadgeOverlay";
