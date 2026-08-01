import type { FC, MouseEvent } from "react";
import { memo, useCallback } from "react";

import type { PositionedEdge } from "../../../types/graphData";

import { EdgeBadgeOverlay } from "./EdgeBadgeOverlay";
import "./GraphEdge.css";

export { EdgeMarkerDefs } from "./EdgeMarkerDefs";
export type { EdgeMarkerDefsProps } from "./EdgeMarkerDefs";
export { EdgeBadgeOverlay } from "./EdgeBadgeOverlay";
export type { EdgeBadgeOverlayProps } from "./EdgeBadgeOverlay";

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

    const markerId = edge.isCycle
      ? "url(#edge-arrowhead-cycle)"
      : isSelected
        ? "url(#edge-arrowhead-selected)"
        : "url(#edge-arrowhead)";

    return (
      <g
        className="graph-edge-group"
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
        <path
          d={dPath}
          className={`graph-edge-path ${isSelected ? "selected" : ""} ${edge.isCycle ? "cycle" : ""} ${isAnimated ? "animated" : ""}`}
          markerEnd={edge.directed !== false ? markerId : undefined}
          vectorEffect="non-scaling-stroke"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
        />
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
            isCycle={edge.isCycle}
            isSelected={isSelected}
            badgeRect={edge.badgeRect}
            anchorPoint={edge.anchorPoint}
            leaderPoints={edge.leaderPoints}
          />
        )}
      </g>
    );
  },
  areGraphEdgePropsEqual,
);

GraphEdge.displayName = "GraphEdge";
