import type { FC } from "react";
import { memo } from "react";
import { EdgeBadgeOverlay } from "../../primitives/edges/GraphEdge";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";

export interface GraphBadgeLayerProps {
  positionedEdges: PositionedEdge[];
  hiddenNodeIds: Set<string>;
  selectedNodeId: string | null;
  positionedNodes?: PositionedNode[];
}

export const GraphBadgeLayer: FC<GraphBadgeLayerProps> = memo(function GraphBadgeLayer({
  positionedEdges,
  hiddenNodeIds,
  selectedNodeId,
  positionedNodes,
}) {
  return (
    <svg
      className="graph-svg-badge-layer"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 10,
      }}
    >
      {positionedEdges.map((edge) => {
        if (hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)) {
          return null;
        }
        const isEdgeSelected = selectedNodeId === edge.source || selectedNodeId === edge.target;

        const placement = {
          x: edge.labelX ?? 0,
          y: edge.labelY ?? 0,
          badgeRect: edge.badgeRect,
          anchorPoint: edge.anchorPoint,
          leaderPoints: edge.leaderPoints,
        };

        return (
          <g key={`badge-${edge.id}`} style={{ pointerEvents: "auto" }}>
            <EdgeBadgeOverlay
              x={placement.x}
              y={placement.y}
              label={edge.label}
              badge={edge.badge}
              container={edge.container}
              kind={edge.kind}
              stepNumber={edge.stepNumber}
              isCycle={edge.isCycle}
              isSelected={isEdgeSelected}
              badgeRect={placement.badgeRect}
              anchorPoint={placement.anchorPoint}
              leaderPoints={placement.leaderPoints}
              traffic={edge.traffic}
              isHighTraffic={edge.isHighTraffic}
              bundleCount={edge.bundleCount}
              bundleIndex={edge.bundleIndex}
            />
          </g>
        );
      })}
    </svg>
  );
});

GraphBadgeLayer.displayName = "GraphBadgeLayer";
