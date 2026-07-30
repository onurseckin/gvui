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
  const titleWidth = node.name.length * 11 + 90;

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

  const descWidth = node.description ? node.description.length * 8 + 32 : 0;

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
    Math.max(
      120,
      titleWidth,
      badgeWidth,
      toolWidth,
      modelWidth,
      descWidth,
      contextWidth,
      metadataWidth,
    ),
  );

  const baseHeader = 36;
  let bodySectionsHeight = 0;

  if (node.description) {
    const approxCharsPerLine = Math.max(20, Math.floor((width - 32) / 8));
    const descLines = Math.ceil(node.description.length / approxCharsPerLine);
    bodySectionsHeight += descLines * 15 + 2;
  }

  if (badgeRows > 0) {
    bodySectionsHeight += badgeRows * 20 + 2;
  }

  if (toolRows > 0) {
    bodySectionsHeight += toolRows * 20 + 2;
  }

  if (node.model || node.harnessModel) {
    bodySectionsHeight += 16;
  }

  if (node.context) {
    const contextKeys = Object.keys(node.context);
    if (contextKeys.length > 0) {
      bodySectionsHeight += contextKeys.length * 16 + 2;
    }
  }

  if (node.metadata && Object.keys(node.metadata).length > 0) {
    bodySectionsHeight += 16;
  }

  const height = Math.ceil(baseHeader + bodySectionsHeight + 12);

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
 * Clips a ray from the center of a node rectangle towards a target point to the node's boundary rectangle.
 */
function clipPointToNodeRect(
  node: PositionedNode,
  targetPoint: { x: number; y: number },
): { x: number; y: number } {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;

  const dx = targetPoint.x - cx;
  const dy = targetPoint.y - cy;

  if (dx === 0 && dy === 0) {
    return { x: cx, y: cy };
  }

  const xMin = node.x;
  const xMax = node.x + node.width;
  const yMin = node.y;
  const yMax = node.y + node.height;

  let tx = Infinity;
  let ty = Infinity;

  if (dx > 0) {
    tx = (xMax - cx) / dx;
  } else if (dx < 0) {
    tx = (xMin - cx) / dx;
  }

  if (dy > 0) {
    ty = (yMax - cy) / dy;
  } else if (dy < 0) {
    ty = (yMin - cy) / dy;
  }

  const t = Math.min(tx, ty);

  return {
    x: cx + t * dx,
    y: cy + t * dy,
  };
}

export interface PathMidpointResult {
  x: number;
  y: number;
  normal: { x: number; y: number };
}

/**
 * Calculates total arc-length L = sum(distance(P_i, P_{i+1})) along all points in the polyline path.
 * Finds the exact point (x, y) at distance s = L / 2 along the path (50% total path length),
 * along with the perpendicular unit normal vector to the segment containing the midpoint.
 */
export function findTotalPathMidpoint(points: Array<{ x: number; y: number }>): PathMidpointResult {
  if (points.length === 0) {
    return { x: 0, y: 0, normal: { x: 0, y: 1 } };
  }
  if (points.length === 1) {
    return { x: points[0].x, y: points[0].y, normal: { x: 0, y: 1 } };
  }

  const segmentLengths: number[] = [];
  let totalLength = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    segmentLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) {
    return { x: points[0].x, y: points[0].y, normal: { x: 0, y: 1 } };
  }

  const targetDist = totalLength / 2;
  let accumulated = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const len = segmentLengths[i];
    const p1 = points[i];
    const p2 = points[i + 1];

    if (accumulated + len >= targetDist || i === points.length - 2) {
      const remaining = targetDist - accumulated;
      const t = len > 0 ? Math.max(0, Math.min(1, remaining / len)) : 0;

      const x = p1.x + t * (p2.x - p1.x);
      const y = p1.y + t * (p2.y - p1.y);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLen = len > 0 ? len : Math.hypot(dx, dy);

      let normal = { x: 0, y: 1 };
      if (segLen > 0) {
        normal = { x: -dy / segLen, y: dx / segLen };
      }

      return { x, y, normal };
    }

    accumulated += len;
  }

  const lastPt = points[points.length - 1];
  return { x: lastPt.x, y: lastPt.y, normal: { x: 0, y: 1 } };
}

/**
 * Computes node coordinates and edge paths using the Dagre hierarchical positioning algorithm.
 */
export function computeDagreLayout(
  dataset: GraphDataset,
  direction: "TB" | "LR" = "TB",
): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: direction,
    nodesep: 80,
    ranksep: 90,
    marginx: 50,
    marginy: 50,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const dimensionsMap = new Map<string, { width: number; height: number }>();

  dataset.nodes.forEach((node) => {
    const dims = calculateNodeDimensions(node);
    dimensionsMap.set(node.id, dims);
    g.setNode(node.id, { width: dims.width, height: dims.height });
  });

  dataset.edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target, {}, edge.id);
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

  // Group edges by undirected node pair key (source/target pair) for multi-edge parallel offsetting
  const edgePairGroups = new Map<string, number[]>();
  dataset.edges.forEach((edge, index) => {
    const pairKey =
      edge.source < edge.target
        ? `${edge.source}---${edge.target}`
        : `${edge.target}---${edge.source}`;
    const group = edgePairGroups.get(pairKey) ?? [];
    group.push(index);
    edgePairGroups.set(pairKey, group);
  });

  const edgePairInfo = new Map<number, { groupIndex: number; groupTotal: number }>();
  edgePairGroups.forEach((indices) => {
    indices.forEach((edgeIdx, groupIndex) => {
      edgePairInfo.set(edgeIdx, { groupIndex, groupTotal: indices.length });
    });
  });

  const edgeNormals: Array<{ x: number; y: number } | undefined> = [];

  const positionedEdges: PositionedEdge[] = dataset.edges.map((edge, edgeIdx) => {
    const dagreEdge = g.edge(edge.source, edge.target, edge.id) as
      | { points?: Array<{ x: number; y: number }> }
      | undefined;
    const rawPoints = dagreEdge?.points ?? [];
    let points: Array<{ x: number; y: number }> = rawPoints.map((p) => ({ x: p.x, y: p.y }));

    let path = "";
    let labelX: number | undefined;
    let labelY: number | undefined;
    let normal: { x: number; y: number } | undefined;

    const srcNode = positionedNodesMap.get(edge.source);
    const tgtNode = positionedNodesMap.get(edge.target);

    // If points from dagre are empty or insufficient, construct direct segment between centers
    if (points.length < 2 && srcNode && tgtNode) {
      const srcCx = srcNode.x + srcNode.width / 2;
      const srcCy = srcNode.y + srcNode.height / 2;
      const tgtCx = tgtNode.x + tgtNode.width / 2;
      const tgtCy = tgtNode.y + tgtNode.height / 2;
      points = [
        { x: srcCx, y: srcCy },
        { x: tgtCx, y: tgtCy },
      ];
    }

    // Offset path control points / bend coordinates for parallel multi-edges perpendicular to direction vector by ±35px
    const pairInfo = edgePairInfo.get(edgeIdx);
    const groupTotal = pairInfo?.groupTotal ?? 1;
    const groupIndex = pairInfo?.groupIndex ?? 0;
    const offset = groupTotal > 1 ? (groupIndex - (groupTotal - 1) / 2) * 70 : 0;

    if (offset !== 0 && points.length >= 2) {
      const pStart = points[0];
      const pEnd = points[points.length - 1];
      const dx = pEnd.x - pStart.x;
      const dy = pEnd.y - pStart.y;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        const nx = -dy / len;
        const ny = dx / len;

        if (points.length === 2) {
          const midX = (pStart.x + pEnd.x) / 2 + offset * nx;
          const midY = (pStart.y + pEnd.y) / 2 + offset * ny;
          points = [pStart, { x: midX, y: midY }, pEnd];
        } else {
          for (let k = 1; k < points.length - 1; k++) {
            points[k].x += offset * nx;
            points[k].y += offset * ny;
          }
        }
      }
    }

    if (points.length >= 2) {
      if (srcNode) {
        let targetForSrc: { x: number; y: number } | undefined;
        for (let i = 1; i < points.length; i++) {
          const p = points[i];
          const isInsideSrc =
            p.x >= srcNode.x &&
            p.x <= srcNode.x + srcNode.width &&
            p.y >= srcNode.y &&
            p.y <= srcNode.y + srcNode.height;
          if (!isInsideSrc) {
            targetForSrc = p;
            break;
          }
        }
        if (!targetForSrc && points.length > 1) {
          targetForSrc = points[1];
        }
        if (targetForSrc) {
          points[0] = clipPointToNodeRect(srcNode, targetForSrc);
        }
      }

      if (tgtNode) {
        let sourceForTgt: { x: number; y: number } | undefined;
        for (let i = points.length - 2; i >= 0; i--) {
          const p = points[i];
          const isInsideTgt =
            p.x >= tgtNode.x &&
            p.x <= tgtNode.x + tgtNode.width &&
            p.y >= tgtNode.y &&
            p.y <= tgtNode.y + tgtNode.height;
          if (!isInsideTgt) {
            sourceForTgt = p;
            break;
          }
        }
        if (!sourceForTgt && points.length > 1) {
          sourceForTgt = points[points.length - 2];
        }
        if (sourceForTgt) {
          points[points.length - 1] = clipPointToNodeRect(tgtNode, sourceForTgt);
        }
      }

      path = buildSvgPath(points);
      const midResult = findTotalPathMidpoint(points);
      labelX = midResult.x;
      labelY = midResult.y;
      normal = midResult.normal;
    }

    edgeNormals.push(normal);

    return {
      ...edge,
      path,
      ...(labelX !== undefined ? { labelX } : {}),
      ...(labelY !== undefined ? { labelY } : {}),
    };
  });

  // 2D edge badge collision detection and offset pass
  const MAX_COLLISION_PASSES = 15;
  for (let pass = 0; pass < MAX_COLLISION_PASSES; pass++) {
    let hasCollision = false;

    for (let i = 0; i < positionedEdges.length; i++) {
      const e1 = positionedEdges[i];
      if (e1.labelX === undefined || e1.labelY === undefined) continue;

      for (let j = i + 1; j < positionedEdges.length; j++) {
        const e2 = positionedEdges[j];
        if (e2.labelX === undefined || e2.labelY === undefined) continue;

        let dx = Math.abs(e2.labelX - e1.labelX);
        let dy = Math.abs(e2.labelY - e1.labelY);

        if (dx < 84 && dy < 34) {
          hasCollision = true;
          let norm = edgeNormals[j] ?? { x: 0, y: 1 };
          if (norm.x === 0 && norm.y === 0) {
            norm = { x: 0, y: 1 };
          }

          let steps = 0;
          while (dx < 84 && dy < 34 && steps < 10) {
            const relX = e2.labelX - e1.labelX;
            const relY = e2.labelY - e1.labelY;
            const dot = relX * norm.x + relY * norm.y;
            const dir = dot >= 0 ? 1 : -1;
            const step = 36;

            e2.labelX += dir * norm.x * step;
            e2.labelY += dir * norm.y * step;

            dx = Math.abs(e2.labelX - e1.labelX);
            dy = Math.abs(e2.labelY - e1.labelY);
            steps++;
          }
        }
      }
    }

    if (!hasCollision) {
      break;
    }
  }

  return { nodes: positionedNodes, edges: positionedEdges };
}
