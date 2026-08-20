import type { CSSProperties, FC, KeyboardEvent, MouseEvent } from "react";
import { memo, useCallback } from "react";
import type { Point, Rect } from "../../../engine/layout/custom/types";
import type {
  BadgeDetail,
  EdgeContainerDetail,
  EdgeKind,
  EdgeTrafficDetail,
} from "../../../types/graphData";
import {
  describeEdgeKind,
  edgeKindStyleVars,
  resolveEdgeAccent,
  resolveEdgeKind,
} from "./edgeKinds";
import "./EdgeBadgeOverlay.css";

export const MAX_BADGE_WIDTH = 280;
export const MAX_DETAIL_LENGTH = 24;

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
  isHovered?: boolean;
  badgeRect?: Rect;
  leaderPoints?: Point[];
  anchorPoint?: Point;
  traffic?: EdgeTrafficDetail;
  isHighTraffic?: boolean;
  bundleCount?: number;
  /** The edge's own accent; defaults to the kind accent. Never a node's colour. */
  accentColor?: string;
  renderMode?: "svg" | "html";
  asHtml?: boolean;
  onClick?: (e: MouseEvent<HTMLElement | SVGGElement>) => void;
}

/**
 * Truncates multi-line sentence details to a compact canvas chip string (max 24 characters with ellipsis).
 * Flattens newlines and redundant whitespace while preserving full detail in edge data structures.
 */
export function formatCompactBadgeDetail(
  detail?: string,
  maxLength: number = MAX_DETAIL_LENGTH,
): string | undefined {
  if (detail === undefined || detail === null) return undefined;
  const flattened = String(detail)
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!flattened) return undefined;
  if (flattened.length <= maxLength) return flattened;
  const sliceLen = Math.max(0, maxLength - 3);
  return `${flattened.slice(0, sliceLen).trimEnd()}...`;
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

const BRACKET_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ["<", ">"],
];

function stripMatchingOuterBrackets(s: string): string {
  let result = s.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [open, close] of BRACKET_PAIRS) {
      if (result.startsWith(open) && result.endsWith(close) && result.length >= 2) {
        result = result.slice(open.length, result.length - close.length).trim();
        changed = true;
      }
    }
  }
  return result;
}

/**
 * Resolves the display text for an edge badge, robustly stripping legacy compound and nested
 * "CYCLE", "CYCLE (...)", "CYCLE: (...)", "CYCLE - [...]", "EDGE:", "EDGE -" wrappers and returning
 * the clean underlying message directly (or "Feedback Loop" if empty cycle).
 */
export function resolveEdgeDisplayText(
  titleText: string | undefined,
  descriptorLabel: string,
  isCycle: boolean,
): string {
  if (titleText && titleText.trim().length > 0) {
    let cleaned = titleText
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    let previous = "";

    while (cleaned !== previous && cleaned.length > 0) {
      previous = cleaned;
      // Strip leading cycle keywords with optional delimiters (: - — – / or whitespace)
      cleaned = cleaned.replace(/^cycle(?:\s*[-:/\u2013\u2014]\s*|\s+)?/i, "").trim();
      // Strip leading edge keywords with optional delimiters (: - — – / or whitespace)
      cleaned = cleaned.replace(/^edge(?:\s*[-:/\u2013\u2014]\s*|\s+)?/i, "").trim();
      // Strip matched outer brackets () [] {} <>
      cleaned = stripMatchingOuterBrackets(cleaned);
      // Strip residual leading/trailing delimiter punctuation if any
      cleaned = cleaned
        .replace(/^[-:,\u2013\u2014\s]+/, "")
        .replace(/[-:,\u2013\u2014\s]+$/, "")
        .trim();
    }

    if (cleaned.length > 0) {
      return cleaned;
    }
  }
  return isCycle ? "Feedback Loop" : descriptorLabel;
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
  isHovered = false,
  badgeRect,
  leaderPoints,
  anchorPoint,
  traffic,
  isHighTraffic = false,
  bundleCount,
  accentColor,
  renderMode = "svg",
  asHtml = false,
  onClick,
}) {
  const isInteractive = Boolean(onClick || badge?.clickable);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLElement | SVGGElement>) => {
      e.stopPropagation();
      onClick?.(e);
    },
    [onClick],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement | SVGGElement>) => {
      if (
        (e.key === "Enter" || e.key === " " || e.key === "Spacebar") &&
        isInteractive &&
        onClick
      ) {
        e.preventDefault();
        e.stopPropagation();
        // Synthesize click activation from keyboard event
        onClick(e as unknown as MouseEvent<HTMLElement | SVGGElement>);
      }
    },
    [isInteractive, onClick],
  );

  const semanticKind = resolveEdgeKind({ kind, isCycle });
  const descriptor = describeEdgeKind(semanticKind);

  const effectiveStep = sanitizeStepBadge(container?.stepBadge ?? stepNumber);
  const rawTitle = container?.title ?? badge?.text ?? label;

  const compactDetail = formatCompactBadgeDetail(container?.detail);

  const hasTraffic = Boolean(traffic || isHighTraffic);
  const effectiveHighTraffic =
    isHighTraffic ||
    Boolean((traffic && (traffic.volume ?? 0) > 1) || traffic?.status === "congested" || isCycle);

  if (!rawTitle?.trim() && !effectiveStep && !isCycle && !kind && !hasTraffic) return null;

  // `isCycle` only names the badge when the dataset declared no kind, mirroring resolveEdgeKind.
  // A declared probe that happens to be a back-edge must not be labelled "Feedback Loop".
  const cycleDecidesLabel = isCycle && !kind;
  let displayText = resolveEdgeDisplayText(rawTitle, descriptor.label, cycleDecidesLabel);

  // Clean redundant step prefix from displayText if effectiveStep is already set on the badge
  if (displayText && effectiveStep) {
    const escapedStep = effectiveStep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const redundantStepRegex = new RegExp(`^step\\s*${escapedStep}\\s*[:-\\s]\\s*`, "i");
    displayText = displayText.replace(redundantStepRegex, "").trim();
  }

  // Variant determination
  const variant = cycleDecidesLabel
    ? "loop"
    : (container?.variant ?? badge?.variant ?? descriptor.badgeVariant);

  const bundleSnippet =
    typeof bundleCount === "number" && bundleCount > 1 ? `x${bundleCount}` : null;

  // Measure composite single-line text width without icon chrome or traffic chips, bounded by MAX_BADGE_WIDTH
  const computedWidth = Math.min(
    MAX_BADGE_WIDTH,
    Math.max(
      54,
      (effectiveStep ? effectiveStep.length * 7 + 14 : 0) +
        displayText.length * 6.8 +
        (compactDetail ? compactDetail.length * 6.0 + 10 : 0) +
        (bundleSnippet ? bundleSnippet.length * 6.2 + 12 : 0) +
        20,
    ),
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
      ? leaderPoints
          .reduce(
            (acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x - renderX} ${p.y - renderY}`,
            "",
          )
          .trim()
      : "";

  const edgeAccent = accentColor ?? resolveEdgeAccent({ kind, isCycle });
  const glowColor = traffic?.glowColor ?? edgeAccent;
  const glowStyle = glowColor
    ? { filter: `drop-shadow(0 0 6px ${glowColor})`, stroke: glowColor }
    : undefined;

  const groupStyle: CSSProperties = {
    cursor: isInteractive ? "pointer" : "default",
    ...edgeKindStyleVars(descriptor, edgeAccent),
  };

  const groupClassName = [
    "edge-badge-group",
    `kind-${semanticKind}`,
    isSelected && "selected",
    isHovered && "is-hovered",
    isCycle && "cycle",
    effectiveHighTraffic && "high-traffic",
    isInteractive && "is-clickable has-click",
  ]
    .filter(Boolean)
    .join(" ");

  const rectClassName = [
    "edge-badge-rect",
    `variant-${variant}`,
    `kind-${semanticKind}`,
    isSelected && "selected",
    isHovered && "is-hovered",
    isCycle && "cycle",
    effectiveHighTraffic && "high-traffic",
  ]
    .filter(Boolean)
    .join(" ");

  const badgeContent = (
    <div
      className={`edge-badge-inner variant-${variant} kind-${semanticKind}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        gap: "6px",
        padding: "0 8px",
        boxSizing: "border-box",
        textAlign: "center",
        lineHeight: 1.2,
        minWidth: 0,
        flexShrink: 1,
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
            flexShrink: 0,
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
            flexShrink: 0,
          }}
          title={`Bundle size: ${bundleCount}`}
        >
          {bundleSnippet}
        </span>
      )}

      {compactDetail && (
        <span
          className="edge-badge-detail"
          style={{
            fontSize: "9.5px",
            opacity: 0.8,
            padding: "0 3px",
            borderRadius: "2px",
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flexShrink: 1,
          }}
        >
          {compactDetail}
        </span>
      )}
    </div>
  );

  // Native HTML overlay rendering without <foreignObject>
  if (renderMode === "html" || asHtml) {
    return (
      <div
        className={`edge-badge-html-overlay ${groupClassName}`}
        onClick={isInteractive ? handleClick : undefined}
        onKeyDown={isInteractive ? handleKeyDown : undefined}
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        aria-label={`Edge ${effectiveStep ? `${effectiveStep}: ` : ""}${displayText}`}
        style={{
          position: "absolute",
          left: renderX - width / 2,
          top: renderY - height / 2,
          width,
          height,
          ...groupStyle,
        }}
      >
        {badgeContent}
      </div>
    );
  }

  // Native SVG rendering with <foreignObject> wrapper for flex layout
  return (
    <g
      transform={`translate(${renderX}, ${renderY})`}
      className={groupClassName}
      onClick={isInteractive ? handleClick : undefined}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={`Edge ${effectiveStep ? `${effectiveStep}: ` : ""}${displayText}`}
      style={groupStyle}
    >
      {showLeaderPath && (
        <path
          d={leaderSvgPath}
          stroke={edgeAccent}
          strokeWidth="1"
          strokeDasharray="3,3"
          fill="none"
        />
      )}
      {showLeaderLine && anchorPoint && (
        <line
          x1={anchorPoint.x - renderX}
          y1={anchorPoint.y - renderY}
          x2={0}
          y2={0}
          stroke={edgeAccent}
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
        style={glowStyle}
        className={rectClassName}
      />
      <foreignObject
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        style={{ pointerEvents: "none" }}
      >
        {badgeContent}
      </foreignObject>
    </g>
  );
});

EdgeBadgeOverlay.displayName = "EdgeBadgeOverlay";
