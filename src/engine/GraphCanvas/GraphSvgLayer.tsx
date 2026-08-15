import type { CSSProperties, FC } from "react";
import { memo, useMemo } from "react";
import { EdgeMarkerDefs, GraphEdge } from "../../primitives/edges/GraphEdge";
import { describeNodeKind } from "../../primitives/nodes/NodeCard/nodeKinds";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";

export interface GraphSvgLayerProps {
  styledEdges: PositionedEdge[];
  hiddenNodeIds: Set<string>;
  selectedNodeId: string | null;
  selectedNodeAccent?: string;
  positionedNodes?: PositionedNode[];
  nodeAccentMap?: Map<string, string>;
  onSelectEdge?: (edgeId: string, sourceNodeId?: string) => void;
}

export const GraphSvgLayer: FC<GraphSvgLayerProps> = memo(function GraphSvgLayer({
  styledEdges,
  hiddenNodeIds,
  selectedNodeId,
  selectedNodeAccent,
  positionedNodes,
  nodeAccentMap: propNodeAccentMap,
  onSelectEdge,
}) {
  const nodeAccentMap = useMemo(() => {
    if (propNodeAccentMap) return propNodeAccentMap;
    const map = new Map<string, string>();
    if (positionedNodes) {
      for (const node of positionedNodes) {
        map.set(node.id, describeNodeKind(node).accent);
      }
    }
    return map;
  }, [propNodeAccentMap, positionedNodes]);

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
        const sourceAccentColor = nodeAccentMap.get(edge.source);

        return (
          <g
            key={edge.id}
            style={{ opacity: isEdgeConnected ? 1 : 0.18, transition: "opacity 0.2s ease" }}
          >
            <GraphEdge
              edge={edge}
              isSelected={isEdgeSelected}
              renderBadge={false}
              sourceAccentColor={sourceAccentColor}
              onClick={onSelectEdge ? () => onSelectEdge(edge.id, edge.source) : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
});

GraphSvgLayer.displayName = "GraphSvgLayer";
