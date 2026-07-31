import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";
import { computeCustomLayout } from "./custom";
import type { NormalizedEdge, NormalizedNode } from "./custom";
import { renderPathWithCrossingBridges } from "./custom/svgPath";
import { calculateNodeDimensions } from "./nodeDimensions";

/**
 * Computes graph layout coordinates using the custom directed layout and orthogonal routing engine.
 * Converts GraphDataset nodes and edges into normalized engine inputs, runs state-space optimization,
 * and maps the resulting node positions, orthogonal edge SVG paths, crossing bridges, and badge locations
 * back to standard PositionedNode and PositionedEdge outputs for rendering on GraphCanvas.
 */
export function computeCustomEngineGraphLayout(dataset: GraphDataset): {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
} {
  if (!dataset || dataset.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const normalizedNodes: NormalizedNode[] = dataset.nodes.map((node) => {
    const dims = calculateNodeDimensions(node);
    return {
      id: node.id,
      label: node.name,
      width: dims.width,
      height: dims.height,
    };
  });

  const normalizedEdges: NormalizedEdge[] = dataset.edges.map((edge, idx) => ({
    id: edge.id || `e-${edge.source}-${edge.target}-${idx}`,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    isCycle: edge.isCycle,
  }));

  const layoutResult = computeCustomLayout(normalizedNodes, normalizedEdges);

  const nodePosMap = new Map(layoutResult.nodes.map((n) => [n.id, n]));

  const positionedNodes: PositionedNode[] = dataset.nodes.map((node) => {
    const pos = nodePosMap.get(node.id) ?? { x: 0, y: 0, width: 120, height: 60 };
    return {
      ...node,
      x: pos.x,
      y: pos.y,
      width: pos.width,
      height: pos.height,
    };
  });

  const badgeMap = new Map(layoutResult.badges.map((b) => [b.edgeId, b]));
  const crossingPoints = (layoutResult.crossings ?? []).map((c) => c.point);

  const positionedEdges: PositionedEdge[] = dataset.edges.map((edge, idx) => {
    const edgeId = edge.id || `e-${edge.source}-${edge.target}-${idx}`;
    const route = layoutResult.edges.find((r) => r.edgeId === edgeId);
    const badge = badgeMap.get(edgeId);

    let path = "";
    if (route && route.points.length >= 2) {
      path = renderPathWithCrossingBridges(route.points, crossingPoints);
    } else {
      const srcNode = nodePosMap.get(edge.source);
      const tgtNode = nodePosMap.get(edge.target);
      if (srcNode && tgtNode) {
        const srcCx = srcNode.x + srcNode.width / 2;
        const srcCy = srcNode.y + srcNode.height / 2;
        const tgtCx = tgtNode.x + tgtNode.width / 2;
        const tgtCy = tgtNode.y + tgtNode.height / 2;
        path = `M ${srcCx} ${srcCy} L ${tgtCx} ${tgtCy}`;
      }
    }

    return {
      ...edge,
      path,
      labelX: badge?.anchorPoint.x,
      labelY: badge?.anchorPoint.y,
    };
  });

  return { nodes: positionedNodes, edges: positionedEdges };
}
