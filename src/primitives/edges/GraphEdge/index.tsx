import type { CSSProperties, FC, KeyboardEvent, MouseEvent } from "react";
import { memo, useCallback } from "react";

import type { PositionedEdge } from "../../../types/graphData";

import { EdgeBadgeOverlay } from "./EdgeBadgeOverlay";
import { resolveSafeBadgePlacement } from "./collision";
import { describeEdgeKind, resolveEdgeKind } from "./edgeKinds";
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
      (e: MouseEvent<SVGGElement>): void => {
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
    const descriptor = describeEdgeKind(semanticKind);
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
      edge.traffic?.glowColor ??
      sourceAccentColor ??
      (edge.isCycle ? "#f59e0b" : isHighTraffic ? "#06b6d4" : undefined);

    const markerId = isSelected
      ? "url(#edge-arrowhead-selected)"
      : isHighlightedEdge
        ? "url(#edge-arrowhead-highlighted)"
        : edge.isCycle
          ? "url(#edge-arrowhead-cycle)"
          : `url(#${descriptor.markerId})`;

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
