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
        const isEdgeSelected = selectedNodeId === edge.source || selectedNodeId === edge.target;
        const badgeX = edge.labelX ?? 0;
        const badgeY = edge.labelY ?? 0;

        return (
          <g key={`badge-${edge.id}`} style={{ pointerEvents: "auto" }}>
            <EdgeBadgeOverlay
              x={badgeX}
              y={badgeY}
              label={edge.label}
              badge={edge.badge}
              isCycle={edge.isCycle}
              isSelected={isEdgeSelected}
              badgeRect={edge.badgeRect}
              anchorPoint={edge.anchorPoint}
              leaderPoints={edge.leaderPoints}
            />
          </g>
        );
      })}
    </svg>
  );
});

GraphBadgeLayer.displayName = "GraphBadgeLayer";
