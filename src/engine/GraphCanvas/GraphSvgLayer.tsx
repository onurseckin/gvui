import type { FC } from "react";
import { memo } from "react";
import { EdgeMarkerDefs, GraphEdge } from "../../primitives/edges/GraphEdge";
import type { PositionedEdge } from "../../types/graphData";

export interface GraphSvgLayerProps {
  styledEdges: PositionedEdge[];
  hiddenNodeIds: Set<string>;
  selectedNodeId: string | null;
}

export const GraphSvgLayer: FC<GraphSvgLayerProps> = memo(function GraphSvgLayer({
  styledEdges,
  hiddenNodeIds,
  selectedNodeId,
}) {
  return (
    <svg className="graph-svg-layer">
      <EdgeMarkerDefs />
      {styledEdges.map((edge) => {
        if (hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)) {
          return null;
        }
        const isEdgeSelected = selectedNodeId === edge.source || selectedNodeId === edge.target;
        return (
          <GraphEdge key={edge.id} edge={edge} isSelected={isEdgeSelected} renderBadge={false} />
        );
      })}
    </svg>
  );
});

GraphSvgLayer.displayName = "GraphSvgLayer";
