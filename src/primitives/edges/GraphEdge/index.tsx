import type { FC, MouseEvent } from "react";
import { memo, useCallback } from "react";

import type { PositionedEdge } from "../../../types/graphData";

import { EdgeBadgeOverlay } from "./EdgeBadgeOverlay";
import { describeEdgeKind, resolveEdgeKind } from "./edgeKinds";
import "./GraphEdge.css";

export type { CollisionOptions, CollisionResolutionResult } from "./collision";
export {
  computeSafeBadgePlacement,
  doesRectOverlap,
  findCollidingNodes,
  preventBadgeCollision,
  rectContainsPoint,
} from "./collision";
export type { EdgeBadgeOverlayProps } from "./EdgeBadgeOverlay";
export { EdgeBadgeOverlay } from "./EdgeBadgeOverlay";
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
  isAnimated?: boolean;
  renderBadge?: boolean;
  showPorts?: boolean;
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
    prevProps.isAnimated === nextProps.isAnimated &&
    prevProps.renderBadge === nextProps.renderBadge &&
    prevProps.showPorts === nextProps.showPorts &&
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
    isAnimated = false,
    renderBadge = true,
    showPorts = false,
    onClick,
  }) => {
    let dPath = edge.path || "";
    let badgeX = edge.labelX ?? 0;
    let badgeY = edge.labelY ?? 0;

    if (
      (!dPath || dPath.trim().length === 0) &&
      typeof sourceX === "number" &&
      typeof sourceY === "number" &&
      typeof targetX === "number" &&
      typeof targetY === "number"
    ) {
      dPath = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
      badgeX = (sourceX + targetX) / 2;
      badgeY = (sourceY + targetY) / 2;
    }

    const handleEdgeClick = useCallback(
      (e: MouseEvent<SVGGElement>): void => {
        e.stopPropagation();
        onClick?.(edge.id);
      },
      [onClick, edge.id],
    );

    const semanticKind = resolveEdgeKind(edge);
    const descriptor = describeEdgeKind(semanticKind);

    const isHighTraffic = Boolean(
      edge.isHighTraffic ||
      (edge.traffic && ((edge.traffic.volume ?? 0) > 1 || (edge.traffic.messagesCount ?? 0) > 1)) ||
      edge.isCycle ||
      edge.traffic?.status === "congested",
    );

    const glowColor =
      edge.traffic?.glowColor ?? (edge.isCycle ? "#f59e0b" : isHighTraffic ? "#06b6d4" : undefined);

    const markerId = isSelected
      ? "url(#edge-arrowhead-selected)"
      : edge.isCycle
        ? "url(#edge-arrowhead-cycle)"
        : `url(#${descriptor.markerId})`;

    const shouldAnimate =
      isAnimated ||
      descriptor.animated ||
      Boolean(edge.isCycle || semanticKind === "loop" || isHighTraffic);

    return (
      <g
        className={`graph-edge-group kind-${semanticKind} ${isHighTraffic ? "high-traffic" : ""}`}
        onClick={handleEdgeClick}
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
          className={`graph-edge-path kind-${semanticKind} ${isSelected ? "selected" : ""} ${edge.isCycle || semanticKind === "loop" ? "cycle" : ""} ${isHighTraffic ? "high-traffic" : ""} ${shouldAnimate ? "animated" : ""}`}
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
        {renderBadge && (
          <EdgeBadgeOverlay
            x={badgeX}
            y={badgeY}
            label={edge.label}
            badge={edge.badge}
            container={edge.container}
            kind={edge.kind}
            stepNumber={edge.stepNumber}
            isCycle={edge.isCycle}
            isSelected={isSelected}
            badgeRect={edge.badgeRect}
            anchorPoint={edge.anchorPoint}
            leaderPoints={edge.leaderPoints}
            traffic={edge.traffic}
            isHighTraffic={isHighTraffic}
            bundleCount={edge.bundleCount}
            bundleIndex={edge.bundleIndex}
          />
        )}
      </g>
    );
  },
  areGraphEdgePropsEqual,
);

GraphEdge.displayName = "GraphEdge";
