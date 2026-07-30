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
  const titleWidth = node.name.length * 9.5 + 64;

  let badgeWidth = 0;
  let badgeRows = 0;
  if (node.badges && node.badges.length > 0) {
    const totalBadgeChars = node.badges.reduce(
      (acc, b) => acc + (b.label ? b.label.length : 0) + 2,
      0,
    );
    badgeWidth = totalBadgeChars * 8 + 32;
    badgeRows = Math.ceil(node.badges.length / 2);
  }

  let toolWidth = 0;
  let toolRows = 0;
  if (node.tools && node.tools.length > 0) {
    const totalToolChars = node.tools.reduce((acc, t) => acc + (t.name ? t.name.length : 0) + 2, 0);
    toolWidth = totalToolChars * 8 + 32;
    toolRows = Math.ceil(node.tools.length / 2);
  }

  const modelLength =
    (node.model ? node.model.length : 0) + (node.harnessModel ? node.harnessModel.length : 0);
  const modelWidth = modelLength > 0 ? modelLength * 8 + 40 : 0;

  let contextLength = 0;
  if (node.context) {
    if (node.context.repoPath) {
      contextLength += node.context.repoPath.length;
    }
    if (node.context.previousOutputs && Array.isArray(node.context.previousOutputs)) {
      contextLength += node.context.previousOutputs.reduce(
        (acc, p) => acc + (p.fromNode ? p.fromNode.length : 0) + (p.summary ? p.summary.length : 0),
        0,
      );
    }
  }
  const contextWidth = contextLength > 0 ? contextLength * 8 + 32 : node.context ? 120 : 0;

  let metadataWidth = 0;
  if (node.metadata && Object.keys(node.metadata).length > 0) {
    const metadataStr = JSON.stringify(node.metadata);
    metadataWidth = metadataStr.length * 7 + 32;
  }

  const width = Math.ceil(
    Math.max(titleWidth, badgeWidth, toolWidth, modelWidth, contextWidth, metadataWidth),
  );

  let height = 44;

  if (node.description) {
    const approxCharsPerLine = Math.max(20, Math.floor((width - 32) / 8));
    const descLines = Math.ceil(node.description.length / approxCharsPerLine);
    height += descLines * 18 + 8;
  }

  if (badgeRows > 0) {
    height += badgeRows * 26 + 6;
  }

  if (toolRows > 0) {
    height += toolRows * 26 + 6;
  }

  if (node.model || node.harnessModel) {
    height += 24;
  }

  if (node.context) {
    height += 28;
  }

  if (node.metadata && Object.keys(node.metadata).length > 0) {
    height += 24;
  }

  height = Math.ceil(height);

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
    const dims = dimensionsMap.get(node.id) ?? calculateNodeDimensions(node);

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
