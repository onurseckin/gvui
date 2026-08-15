import type { FC } from "react";
import { memo, useMemo } from "react";
import { EdgeBadgeOverlay, resolveSafeBadgePlacement } from "../../primitives/edges/GraphEdge";
import type { SafeBadgePlacement } from "../../primitives/edges/GraphEdge";
import { describeNodeKind } from "../../primitives/nodes/NodeCard/nodeKinds";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";

export type { SafeBadgePlacement };
export { resolveSafeBadgePlacement };

export interface GraphBadgeLayerProps {
  positionedEdges: PositionedEdge[];
  hiddenNodeIds: Set<string>;
  selectedNodeId: string | null;
  positionedNodes?: PositionedNode[];
  nodeAccentMap?: Map<string, string>;
  onSelectEdge?: (edgeId: string, sourceNodeId?: string) => void;
}

export const GraphBadgeLayer: FC<GraphBadgeLayerProps> = memo(function GraphBadgeLayer({
  positionedEdges,
  hiddenNodeIds,
  selectedNodeId,
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

        const placement = resolveSafeBadgePlacement(edge);
        if (!placement) {
          return null;
        }

        const isEdgeSelected = selectedNodeId === edge.source || selectedNodeId === edge.target;
        const sourceAccentColor = nodeAccentMap.get(edge.source);

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
              sourceAccentColor={sourceAccentColor}
              onClick={onSelectEdge ? () => onSelectEdge(edge.id, edge.source) : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
});

GraphBadgeLayer.displayName = "GraphBadgeLayer";
