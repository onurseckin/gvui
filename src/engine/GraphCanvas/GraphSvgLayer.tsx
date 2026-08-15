import type { CSSProperties, FC } from "react";
import { memo } from "react";
import { EdgeMarkerDefs, GraphEdge } from "../../primitives/edges/GraphEdge";
import type { PositionedEdge } from "../../types/graphData";

export interface GraphSvgLayerProps {
  styledEdges: PositionedEdge[];
  hiddenNodeIds: Set<string>;
  selectedNodeId: string | null;
  selectedNodeAccent?: string;
}

export const GraphSvgLayer: FC<GraphSvgLayerProps> = memo(function GraphSvgLayer({
  styledEdges,
  hiddenNodeIds,
  selectedNodeId,
  selectedNodeAccent,
}) {
  const edgeStyle: CSSProperties | undefined = selectedNodeAccent
    ? ({ "--accent-color": selectedNodeAccent } as CSSProperties)
    : undefined;

  return (
    <svg className="graph-svg-layer" style={edgeStyle}>
      <EdgeMarkerDefs />
      {styledEdges.map((edge) => {
        if (hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)) {
          return null;
        }
        const isEdgeConnected =
          selectedNodeId === null ||
          edge.source === selectedNodeId ||
          edge.target === selectedNodeId;
        const isEdgeSelected =
          selectedNodeId !== null &&
          (edge.source === selectedNodeId || edge.target === selectedNodeId);

        return (
          <g
            key={edge.id}
            style={{ opacity: isEdgeConnected ? 1 : 0.18, transition: "opacity 0.2s ease" }}
          >
            <GraphEdge edge={edge} isSelected={isEdgeSelected} renderBadge={false} />
          </g>
        );
      })}
    </svg>
  );
});

GraphSvgLayer.displayName = "GraphSvgLayer";
