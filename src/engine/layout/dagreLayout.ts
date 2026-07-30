import dagre from "@dagrejs/dagre";
import type {
  GraphDataset,
  GraphNodeData,
  PositionedEdge,
  PositionedNode,
} from "../../types/graphData";

/**
 * Calculates dynamic node dimensions based on node content (title, badges, tools, description)
 * to prevent node overlapping in graph layout rendering.
 */
export function calculateNodeDimensions(node: GraphNodeData): { width: number; height: number } {
  const titleWidth = node.name.length * 9 + 48;

  let badgeWidth = 0;
  let badgeRows = 0;
  if (node.badges && node.badges.length > 0) {
    const totalBadgeChars = node.badges.reduce((acc, b) => acc + (b.label?.length || 0) + 2, 0);
    badgeWidth = totalBadgeChars * 8 + 32;
    badgeRows = Math.ceil(node.badges.length / 2);
  }

  let toolWidth = 0;
  let toolRows = 0;
  if (node.tools && node.tools.length > 0) {
    const totalToolChars = node.tools.reduce((acc, t) => acc + (t.name?.length || 0) + 2, 0);
    toolWidth = totalToolChars * 8 + 32;
    toolRows = Math.ceil(node.tools.length / 2);
  }

  const modelLength = (node.model?.length || 0) + (node.harnessModel?.length || 0);
  const modelWidth = modelLength > 0 ? modelLength * 8 + 40 : 0;

  const calculatedWidth = Math.max(240, titleWidth, badgeWidth, toolWidth, modelWidth);
  const width = Math.min(380, calculatedWidth);

  let height = 80;
  if (node.description) {
    const descLines = Math.ceil(node.description.length / 35);
    height += descLines * 18 + 10;
  }
  if (badgeRows > 0) {
    height += badgeRows * 26 + 8;
  }
  if (toolRows > 0) {
    height += toolRows * 26 + 8;
  }
  if (node.model || node.harnessModel) {
    height += 24;
  }
  if (node.context) {
    height += 28;
  }

  height = Math.max(120, Math.ceil(height));

  return { width, height };
}

/**
 * Builds an SVG path string from an array of 2D points.
 */
function buildSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let pathStr = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    pathStr += ` L ${points[i].x} ${points[i].y}`;
  }
  return pathStr;
}

/**
 * Computes node coordinates and edge paths using the Dagre hierarchical positioning algorithm.
 */
export function computeDagreLayout(
  dataset: GraphDataset,
  direction: "TB" | "LR" = "TB",
): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: 50,
    ranksep: 70,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const dimensionsMap = new Map<string, { width: number; height: number }>();

  dataset.nodes.forEach((node) => {
    const dims = calculateNodeDimensions(node);
    dimensionsMap.set(node.id, dims);
    g.setNode(node.id, { width: dims.width, height: dims.height });
  });

  dataset.edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  const positionedNodes: PositionedNode[] = dataset.nodes.map((node) => {
    const dagreNode = g.node(node.id);
    const dims = dimensionsMap.get(node.id) ?? { width: 240, height: 120 };

    const centerX = dagreNode?.x ?? dims.width / 2;
    const centerY = dagreNode?.y ?? dims.height / 2;

    return {
      ...node,
      x: centerX - dims.width / 2,
      y: centerY - dims.height / 2,
      width: dims.width,
      height: dims.height,
    };
  });

  const positionedNodesMap = new Map<string, PositionedNode>(positionedNodes.map((n) => [n.id, n]));

  const positionedEdges: PositionedEdge[] = dataset.edges.map((edge) => {
    const dagreEdge = g.edge(edge.source, edge.target);
    const points = dagreEdge?.points ?? [];

    let path = "";
    let labelX: number | undefined;
    let labelY: number | undefined;

    if (points.length >= 2) {
      path = buildSvgPath(points);
      const midIndex = Math.floor(points.length / 2);
      labelX = dagreEdge?.x ?? points[midIndex].x;
      labelY = dagreEdge?.y ?? points[midIndex].y;
    } else {
      const srcNode = positionedNodesMap.get(edge.source);
      const tgtNode = positionedNodesMap.get(edge.target);

      if (srcNode && tgtNode) {
        const srcCx = srcNode.x + srcNode.width / 2;
        const srcCy = srcNode.y + srcNode.height / 2;
        const tgtCx = tgtNode.x + tgtNode.width / 2;
        const tgtCy = tgtNode.y + tgtNode.height / 2;

        path = `M ${srcCx} ${srcCy} L ${tgtCx} ${tgtCy}`;
        labelX = (srcCx + tgtCx) / 2;
        labelY = (srcCy + tgtCy) / 2;
      }
    }

    return {
      ...edge,
      path,
      ...(labelX !== undefined ? { labelX } : {}),
      ...(labelY !== undefined ? { labelY } : {}),
    };
  });

  return { nodes: positionedNodes, edges: positionedEdges };
}
