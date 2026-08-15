import type { FC } from "react";
import { memo } from "react";
import { EdgeBadgeOverlay } from "../../primitives/edges/GraphEdge";
import type { PositionedEdge } from "../../types/graphData";

export interface GraphBadgeLayerProps {
  positionedEdges: PositionedEdge[];
  hiddenNodeIds: Set<string>;
  selectedNodeId: string | null;
}

export const GraphBadgeLayer: FC<GraphBadgeLayerProps> = memo(function GraphBadgeLayer({
  positionedEdges,
  hiddenNodeIds,
  selectedNodeId,
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
        // Only render badge overlay if the edge has a valid positioned badgeRect, label coordinates, or route points
        const hasPlacement =
          edge.badgeRect !== undefined ||
          (edge.labelX !== undefined && edge.labelY !== undefined) ||
          (edge.points !== undefined && edge.points.length > 0);

        if (!hasPlacement) {
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
            />
          </g>
        );
      })}
    </svg>
  );
});

GraphBadgeLayer.displayName = "GraphBadgeLayer";
