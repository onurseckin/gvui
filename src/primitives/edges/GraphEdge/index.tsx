import type { FC, MouseEvent } from "react";

import type { PositionedEdge } from "../../../types/graphData";

import { computeEdgePath, type EdgePathType } from "./computeEdgePath";
import { EdgeBadgeOverlay } from "./EdgeBadgeOverlay";
import "./GraphEdge.css";

export type { ComputeEdgePathOptions, EdgePathType } from "./computeEdgePath";
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
  pathType?: EdgePathType;
  isSelected?: boolean;
  isHovered?: boolean;
  isAnimated?: boolean;
  onClick?: (edgeId: string) => void;
}

export const GraphEdge: FC<GraphEdgeProps> = ({
  edge,
  sourceX,
  sourceY,
  targetX,
  targetY,
  pathType = "bezier",
  isSelected = false,
  isAnimated = false,
  onClick,
}) => {
  let dPath = edge.path;
  let badgeX = edge.labelX ?? 0;
  let badgeY = edge.labelY ?? 0;

  if (
    typeof sourceX === "number" &&
    typeof sourceY === "number" &&
    typeof targetX === "number" &&
    typeof targetY === "number"
  ) {
    const computed = computeEdgePath({ sourceX, sourceY, targetX, targetY, pathType });
    dPath = computed.path;
    badgeX = computed.labelX;
    badgeY = computed.labelY;
  }

  const handleEdgeClick = (e: MouseEvent<SVGGElement>): void => {
    e.stopPropagation();
    onClick?.(edge.id);
  };

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
      <EdgeBadgeOverlay
        x={badgeX}
        y={badgeY}
        label={edge.label}
        isCycle={edge.isCycle}
        isSelected={isSelected}
      />
    </g>
  );
};
