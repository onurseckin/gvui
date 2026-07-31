import dagre from "@dagrejs/dagre";
import type {
  GraphDataset,
  GraphNodeData,
  PositionedEdge,
  PositionedNode,
} from "../../types/graphData";

export interface Point2D {
  x: number;
  y: number;
}

export type NodeSide = "Top" | "Right" | "Bottom" | "Left";

/**
 * Determines departure or arrival side of node (Top, Right, Bottom, Left)
 * based on center-to-center angle theta = atan2(dy, dx) in radians.
 * Angle ranges in radians:
 * - Right:  [-pi/4, pi/4)
 * - Bottom: [pi/4, 3*pi/4)
 * - Left:   [3*pi/4, pi] or [-pi, -3*pi/4)
 * - Top:    [-3*pi/4, -pi/4)
 */
export function getSideFromAngle(theta: number): NodeSide {
  if (theta >= -Math.PI / 4 && theta < Math.PI / 4) {
    return "Right";
  } else if (theta >= Math.PI / 4 && theta < (3 * Math.PI) / 4) {
    return "Bottom";
  } else if (theta >= (-3 * Math.PI) / 4 && theta < -Math.PI / 4) {
    return "Top";
  } else {
    return "Left";
  }
}

/**
 * Calculates exact port coordinate on node boundary given fractional offset alpha = i / (m + 1).
 */
export function calculatePortPosition(
  node: { x: number; y: number; width: number; height: number },
  side: NodeSide,
  alpha: number,
): Point2D {
  switch (side) {
    case "Top":
      return { x: node.x + alpha * node.width, y: node.y };
    case "Bottom":
      return { x: node.x + alpha * node.width, y: node.y + node.height };
    case "Left":
      return { x: node.x, y: node.y + alpha * node.height };
    case "Right":
      return { x: node.x + node.width, y: node.y + alpha * node.height };
  }
}

/**
 * Creates a perpendicular stub coordinate extending outward from a node border side.
 */
export function createPortStub(port: Point2D, side: NodeSide, distance = 14): Point2D {
  switch (side) {
    case "Top":
      return { x: port.x, y: port.y - distance };
    case "Bottom":
      return { x: port.x, y: port.y + distance };
    case "Left":
      return { x: port.x - distance, y: port.y };
    case "Right":
      return { x: port.x + distance, y: port.y };
  }
}

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
export function buildSvgPath(points: Point2D[]): string {
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
export function clipPointToNodeRect(node: PositionedNode, targetPoint: Point2D): Point2D {
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

/**
 * Checks if a 2D line segment (p1 -> p2) intersects a rectangular node bounding box (with margin).
 */
export function doesSegmentIntersectBox(
  p1: Point2D,
  p2: Point2D,
  box: { x: number; y: number; width: number; height: number },
  margin = 12,
): boolean {
  const minX = box.x - margin;
  const maxX = box.x + box.width + margin;
  const minY = box.y - margin;
  const maxY = box.y + box.height + margin;

  let u1 = 0;
  let u2 = 1;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  const p = [-dx, dx, -dy, dy];
  const q = [p1.x - minX, maxX - p1.x, p1.y - minY, maxY - p1.y];

  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > u2) return false;
        if (r > u1) u1 = r;
      } else {
        if (r < u1) return false;
        if (r < u2) u2 = r;
      }
    }
  }
  return u1 <= u2;
}

/**
 * Inserts obstacle avoidance waypoints if direct segment (startStub -> endStub) intersects an intermediate node card.
 */
export function avoidNodeObstacles(
  startStub: Point2D,
  endStub: Point2D,
  nodes: PositionedNode[],
  srcId: string,
  tgtId: string,
): Point2D[] {
  let waypoints: Point2D[] = [startStub, endStub];

  for (const node of nodes) {
    if (node.id === srcId || node.id === tgtId) continue;

    if (doesSegmentIntersectBox(startStub, endStub, node, 16)) {
      const srcCenter = { x: startStub.x, y: startStub.y };
      const nodeCenter = { x: node.x + node.width / 2, y: node.y + node.height / 2 };

      // Determine bypass direction
      const bypassX = srcCenter.x >= nodeCenter.x ? node.x + node.width + 32 : node.x - 32;

      const w1: Point2D = { x: bypassX, y: startStub.y };
      const w2: Point2D = { x: bypassX, y: endStub.y };
      waypoints = [startStub, w1, w2, endStub];
      break;
    }
  }

  return waypoints;
}

/**
 * Converts a single 2D vector segment (p1 -> p2) into 1 or 2 sub-segments aligned strictly
 * to the nearest 45° angle (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°).
 */
export function snapSegmentTo8Dir(p1: Point2D, p2: Point2D): Point2D[] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  if (Math.hypot(dx, dy) < 0.001) {
    return [{ ...p1 }];
  }

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx < 0.001 || absDy < 0.001 || Math.abs(absDx - absDy) < 0.001) {
    return [{ ...p1 }, { ...p2 }];
  }

  const signX = Math.sign(dx);
  const signY = Math.sign(dy);

  if (absDx > absDy) {
    const midPoint: Point2D = {
      x: p1.x + signX * absDy,
      y: p2.y,
    };
    return [{ ...p1 }, midPoint, { ...p2 }];
  } else {
    const midPoint: Point2D = {
      x: p2.x,
      y: p1.y + signY * absDx,
    };
    return [{ ...p1 }, midPoint, { ...p2 }];
  }
}

/**
 * Simplifies a polyline by removing collinear points along identical directional vectors.
 */
function simplifyPolyline(points: Point2D[]): Point2D[] {
  if (points.length <= 2) return points;

  const simplified: Point2D[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = simplified[simplified.length - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    const crossProduct = dx1 * dy2 - dy1 * dx2;
    const dotProduct = dx1 * dx2 + dy1 * dy2;

    if (Math.abs(crossProduct) < 0.001 && dotProduct > 0) {
      continue;
    }

    simplified.push(curr);
  }

  simplified.push(points[points.length - 1]);
  return simplified;
}

/**
 * Simplifies a polyline by removing collinear points along identical directional vectors.
 */
export function snapPolyline8Dir(points: Point2D[]): Point2D[] {
  if (points.length < 2) return points;
  return simplifyPolyline(points);
}

export interface PathMidpointResult {
  x: number;
  y: number;
  normal: Point2D;
}

/**
 * Calculates total arc-length L = sum(distance(P_i, P_{i+1})) along all points in the polyline path.
 * Finds the exact point (x, y) at distance s = L / 2 along the path (50% total path length),
 * along with the perpendicular unit normal vector to the segment containing the midpoint.
 */
export function findTotalPathMidpoint(points: Point2D[]): PathMidpointResult {
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

      let normal: Point2D = { x: 0, y: 1 };
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
    nodesep: 150,
    ranksep: 120,
    marginx: 80,
    marginy: 80,
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

  const positionedEdges: PositionedEdge[] = dataset.edges.map((edge) => {
    const dagreEdge = g.edge(edge.source, edge.target, edge.id) as
      | { points?: Array<{ x: number; y: number }> }
      | undefined;
    const rawPoints = dagreEdge?.points ?? [];
    let points: Point2D[] = rawPoints.map((p) => ({ x: p.x, y: p.y }));

    const srcNode = positionedNodesMap.get(edge.source);
    const tgtNode = positionedNodesMap.get(edge.target);

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

    if (points.length >= 2) {
      if (srcNode) {
        let targetForSrc: Point2D | undefined;
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
        let sourceForTgt: Point2D | undefined;
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
    }

    const path = points.length >= 2 ? buildSvgPath(points) : "";
    const midResult = points.length >= 2 ? findTotalPathMidpoint(points) : { x: 0, y: 0 };

    return {
      ...edge,
      path,
      ...(midResult.x !== undefined ? { labelX: midResult.x } : {}),
      ...(midResult.y !== undefined ? { labelY: midResult.y } : {}),
    };
  });

  return { nodes: positionedNodes, edges: positionedEdges };
}
