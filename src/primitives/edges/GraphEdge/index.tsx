import type { CSSProperties, FC, KeyboardEvent, MouseEvent } from "react";
import { memo, useCallback } from "react";

import type { PositionedEdge } from "../../../types/graphData";

import { EdgeBadgeOverlay } from "./EdgeBadgeOverlay";
import { resolveSafeBadgePlacement } from "./collision";
import { resolveEdgeKind } from "./edgeKinds";
import "./GraphEdge.css";

export type { CollisionOptions, CollisionResolutionResult, SafeBadgePlacement } from "./collision";
export {
  computePolylineLength,
  computePolylineMidpoint,
  computeSafeBadgePlacement,
  doesRectOverlap,
  findCollidingNodes,
  preventBadgeCollision,
  rectContainsPoint,
  resolveSafeBadgePlacement,
} from "./collision";
export type { EdgeBadgeOverlayProps } from "./EdgeBadgeOverlay";
export {
  EdgeBadgeOverlay,
  MAX_BADGE_WIDTH,
  MAX_DETAIL_LENGTH,
  formatCompactBadgeDetail,
  resolveEdgeDisplayText,
  sanitizeStepBadge,
} from "./EdgeBadgeOverlay";
export type { EdgeMarkerDefsProps } from "./EdgeMarkerDefs";
export { EdgeMarkerDefs } from "./EdgeMarkerDefs";
export type { EdgeKindDescriptor, SemanticEdgeKind } from "./edgeKinds";
export {
  DEFAULT_EDGE_KIND,
  describeEdgeKind,
  EDGE_KIND_DESCRIPTORS,
  getEdgeIconComponent,
  resolveEdgeKind,
} from "./edgeKinds";

export function resolveEdgeMarkerId(params: {
  isSelected?: boolean;
  isHighlighted?: boolean;
  sourceAccentColor?: string;
  kind?: string;
  isCycle?: boolean;
}): string {
  if (params.isSelected) return "edge-arrowhead-selected";
  if (params.isHighlighted) return "edge-arrowhead-highlighted";

  if (params.sourceAccentColor) {
    const norm = params.sourceAccentColor.toLowerCase();
    if (norm === "#8b5cf6") return "edge-arrowhead-prompt";
    if (norm === "#3b82f6") return "edge-arrowhead-planner";
    if (norm === "#06b6d4") return "edge-arrowhead-worker";
    if (norm === "#10b981") return "edge-arrowhead-gate";
    if (norm === "#818cf8") return "edge-arrowhead-critic";
    if (norm === "#f43f5e") return "edge-arrowhead-loop";
    if (norm === "#6366f1") return "edge-arrowhead-data";
    if (norm === "#64748b") return "edge-arrowhead-dependency";
    if (norm === "#94a3b8" || norm === "#71717a" || norm === "#3f3f46")
      return "edge-arrowhead-default";
  }

  if (params.isCycle) return "edge-arrowhead-loop";
  if (params.kind === "spawn" || params.kind === "dispatch") return "edge-arrowhead-spawn";
  if (params.kind === "data" || params.kind === "handoff") return "edge-arrowhead-data";
  if (params.kind === "dependency") return "edge-arrowhead-dependency";
  if (params.kind === "loop" || params.kind === "pushback") return "edge-arrowhead-loop";
  if (params.kind === "gate" || params.kind === "validation") return "edge-arrowhead-gate";
  if (params.kind === "critic" || params.kind === "signoff") return "edge-arrowhead-critic";
  if (params.kind === "sequence") return "edge-arrowhead-sequence";

  return "edge-arrowhead-sequence";
}

export interface GraphEdgeProps {
  edge: PositionedEdge;
  sourceX?: number;
  sourceY?: number;
  targetX?: number;
  targetY?: number;
  isSelected?: boolean;
  isHovered?: boolean;
  isHighlighted?: boolean;
  renderBadge?: boolean;
  showPorts?: boolean;
  sourceAccentColor?: string;
  onClick?: (edgeId: string) => void;
}

const areGraphEdgePropsEqual = (prevProps: GraphEdgeProps, nextProps: GraphEdgeProps): boolean => {
  return (
    prevProps.edge === nextProps.edge &&
    prevProps.sourceX === nextProps.sourceX &&
    prevProps.sourceY === nextProps.sourceY &&
    prevProps.targetX === nextProps.targetX &&
    prevProps.targetY === nextProps.targetY &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isHovered === nextProps.isHovered &&
    prevProps.isHighlighted === nextProps.isHighlighted &&
    prevProps.renderBadge === nextProps.renderBadge &&
    prevProps.showPorts === nextProps.showPorts &&
    prevProps.sourceAccentColor === nextProps.sourceAccentColor &&
    prevProps.onClick === nextProps.onClick
  );
};

export const GraphEdge: FC<GraphEdgeProps> = memo(
  ({
    edge,
    sourceX,
    sourceY,
    targetX,
    targetY,
    isSelected = false,
    isHovered = false,
    isHighlighted = false,
    renderBadge = true,
    showPorts = false,
    sourceAccentColor,
    onClick,
  }) => {
    let dPath = edge.path || "";
    let placement = resolveSafeBadgePlacement(edge);

    if (
      (!dPath || dPath.trim().length === 0) &&
      typeof sourceX === "number" &&
      typeof sourceY === "number" &&
      typeof targetX === "number" &&
      typeof targetY === "number" &&
      Number.isFinite(sourceX) &&
      Number.isFinite(sourceY) &&
      Number.isFinite(targetX) &&
      Number.isFinite(targetY)
    ) {
      dPath = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
      if (!placement && (sourceX !== targetX || sourceY !== targetY)) {
        placement = {
          x: (sourceX + targetX) / 2,
          y: (sourceY + targetY) / 2,
        };
      }
    }

    const isInteractive = Boolean(onClick);

    const handleEdgeClick = useCallback(
      (e: MouseEvent<HTMLElement | SVGGElement>): void => {
        e.stopPropagation();
        onClick?.(edge.id);
      },
      [onClick, edge.id],
    );

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<SVGGElement>): void => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          e.stopPropagation();
          onClick(edge.id);
        }
      },
      [onClick, edge.id],
    );

    const semanticKind = resolveEdgeKind(edge);
    const isHighlightedEdge = Boolean(
      isHighlighted || (edge as { isHighlighted?: boolean }).isHighlighted,
    );

    const isHighTraffic = Boolean(
      edge.isHighTraffic ||
      (edge.traffic && ((edge.traffic.volume ?? 0) > 1 || (edge.traffic.messagesCount ?? 0) > 1)) ||
      edge.isCycle ||
      edge.traffic?.status === "congested",
    );

    const glowColor =
      edge.traffic?.glowColor ?? sourceAccentColor ?? (isHighTraffic ? "#06b6d4" : undefined);

    const markerName = resolveEdgeMarkerId({
      isSelected,
      isHighlighted: isHighlightedEdge,
      sourceAccentColor,
      kind: edge.kind,
      isCycle: Boolean(edge.isCycle),
    });
    const markerId = `url(#${markerName})`;

    const edgeGroupStyle: CSSProperties | undefined = sourceAccentColor
      ? ({ "--edge-source-accent": sourceAccentColor } as CSSProperties)
      : undefined;

    const ariaLabel = isInteractive
      ? edge.label
        ? `Edge ${edge.label}`
        : `Edge ${edge.id}`
      : undefined;

    const groupClassName = [
      "graph-edge-group",
      `kind-${semanticKind}`,
      isHighTraffic && "high-traffic",
      isSelected && "selected",
      isHighlightedEdge && "is-highlighted",
      isHovered && "is-hovered",
      isInteractive && "is-clickable",
    ]
      .filter(Boolean)
      .join(" ");

    const pathClassName = [
      "graph-edge-path",
      `kind-${semanticKind}`,
      isSelected && "selected",
      isHighlightedEdge && "is-highlighted",
      isHovered && "is-hovered",
      (edge.isCycle || semanticKind === "loop") && "cycle",
      isHighTraffic && "high-traffic",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <g
        className={groupClassName}
        style={edgeGroupStyle}
        onClick={isInteractive ? handleEdgeClick : undefined}
        onKeyDown={isInteractive ? handleKeyDown : undefined}
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        aria-label={ariaLabel}
        shapeRendering="geometricPrecision"
        textRendering="geometricPrecision"
      >
        <path
          d={dPath}
          className="edge-backdrop"
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
        {isHighTraffic && (
          <path
            d={dPath}
            className="edge-glow-backdrop"
            stroke={glowColor || "#06b6d4"}
            vectorEffect="non-scaling-stroke"
            shapeRendering="geometricPrecision"
            textRendering="geometricPrecision"
          />
        )}
        <path
          d={dPath}
          className={pathClassName}
          markerEnd={edge.directed !== false ? markerId : undefined}
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
        {edge.sharedAnchor && (
          <circle
            cx={edge.sharedAnchor.x}
            cy={edge.sharedAnchor.y}
            r={4}
            fill={glowColor || "#38bdf8"}
            className="shared-anchor-junction"
          />
        )}
        {showPorts && edge.sourcePort && (
          <circle
            cx={edge.sourcePort.point.x}
            cy={edge.sourcePort.point.y}
            r={3.5}
            fill="#10b981"
            className="port-attachment-point source-port"
          />
        )}
        {showPorts && edge.targetPort && (
          <circle
            cx={edge.targetPort.point.x}
            cy={edge.targetPort.point.y}
            r={3.5}
            fill="#f43f5e"
            className="port-attachment-point target-port"
          />
        )}
        {renderBadge && placement !== null && (
          <EdgeBadgeOverlay
            x={placement.x}
            y={placement.y}
            label={edge.label}
            badge={edge.badge}
            container={edge.container}
            kind={edge.kind}
            stepNumber={edge.stepNumber}
            isCycle={edge.isCycle}
            isSelected={isSelected}
            isHovered={isHovered}
            badgeRect={placement.badgeRect ?? edge.badgeRect}
            anchorPoint={placement.anchorPoint ?? edge.anchorPoint}
            leaderPoints={placement.leaderPoints ?? edge.leaderPoints}
            traffic={edge.traffic}
            isHighTraffic={isHighTraffic}
            bundleCount={edge.bundleCount}
            sourceAccentColor={sourceAccentColor}
            onClick={isInteractive ? handleEdgeClick : undefined}
          />
        )}
      </g>
    );
  },
  areGraphEdgePropsEqual,
);

GraphEdge.displayName = "GraphEdge";
