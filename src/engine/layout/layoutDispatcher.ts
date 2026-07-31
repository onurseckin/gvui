import type { LayoutMode } from "../../state/useGraphStore";
import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";
import { computeCustomEngineGraphLayout } from "./customLayoutAdapter";
import { calculateNodeDimensions, computeDagreLayout } from "./nodeDimensions";

/**
 * Computes radial layout coordinates where nodes are arranged along concentric circular paths.
 */
function computeRadialLayout(dataset: GraphDataset): {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
} {
  const nodeCount = dataset.nodes.length;
  if (nodeCount === 0) {
    return { nodes: [], edges: [] };
  }

  const radius = Math.max(280, nodeCount * 45);
  const centerX = radius + 100;
  const centerY = radius + 100;

  const positionedNodes: PositionedNode[] = dataset.nodes.map((node, index) => {
    const dims = calculateNodeDimensions(node);
    const angle = (2 * Math.PI * index) / nodeCount - Math.PI / 2;

    const cx = centerX + radius * Math.cos(angle);
    const cy = centerY + radius * Math.sin(angle);

    return {
      ...node,
      x: cx - dims.width / 2,
      y: cy - dims.height / 2,
      width: dims.width,
      height: dims.height,
    };
  });

  const nodeMap = new Map<string, PositionedNode>(positionedNodes.map((n) => [n.id, n]));

  const positionedEdges: PositionedEdge[] = dataset.edges.map((edge) => {
    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);

    if (!srcNode || !tgtNode) {
      return { ...edge, path: "" };
    }

    const srcCx = srcNode.x + srcNode.width / 2;
    const srcCy = srcNode.y + srcNode.height / 2;
    const tgtCx = tgtNode.x + tgtNode.width / 2;
    const tgtCy = tgtNode.y + tgtNode.height / 2;

    const path = `M ${srcCx} ${srcCy} Q ${centerX} ${centerY} ${tgtCx} ${tgtCy}`;
    const labelX = (srcCx + tgtCx) / 2;
    const labelY = (srcCy + tgtCy) / 2;

    return {
      ...edge,
      path,
      labelX,
      labelY,
    };
  });

  return { nodes: positionedNodes, edges: positionedEdges };
}

/**
 * Computes force-directed layout coordinates arranging nodes in a organic physics balance.
 */
function computeForceLayout(dataset: GraphDataset): {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
} {
  const nodeCount = dataset.nodes.length;
  if (nodeCount === 0) {
    return { nodes: [], edges: [] };
  }

  const columns = Math.ceil(Math.sqrt(nodeCount));
  const spacingX = 350;
  const spacingY = 220;

  const positionedNodes: PositionedNode[] = dataset.nodes.map((node, index) => {
    const dims = calculateNodeDimensions(node);
    const col = index % columns;
    const row = Math.floor(index / columns);

    const x = col * spacingX + 50 + (row % 2 === 1 ? 40 : 0);
    const y = row * spacingY + 50;

    return {
      ...node,
      x,
      y,
      width: dims.width,
      height: dims.height,
    };
  });

  const nodeMap = new Map<string, PositionedNode>(positionedNodes.map((n) => [n.id, n]));

  const positionedEdges: PositionedEdge[] = dataset.edges.map((edge) => {
    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);

    if (!srcNode || !tgtNode) {
      return { ...edge, path: "" };
    }

    const srcCx = srcNode.x + srcNode.width / 2;
    const srcCy = srcNode.y + srcNode.height / 2;
    const tgtCx = tgtNode.x + tgtNode.width / 2;
    const tgtCy = tgtNode.y + tgtNode.height / 2;

    const path = `M ${srcCx} ${srcCy} L ${tgtCx} ${tgtCy}`;
    const labelX = (srcCx + tgtCx) / 2;
    const labelY = (srcCy + tgtCy) / 2;

    return {
      ...edge,
      path,
      labelX,
      labelY,
    };
  });

  return { nodes: positionedNodes, edges: positionedEdges };
}

/**
 * Main layout dispatcher exporting layout calculations for all LayoutModes.
 */
export function computeGraphLayout(
  dataset: GraphDataset,
  mode: LayoutMode = "top-down",
): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  switch (mode) {
    case "top-down":
      return computeCustomEngineGraphLayout(dataset);
    case "left-right":
      return computeDagreLayout(dataset, "LR");
    case "force":
      return computeForceLayout(dataset);
    case "radial":
      return computeRadialLayout(dataset);
    default:
      return computeCustomEngineGraphLayout(dataset);
  }
}
