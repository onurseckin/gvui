import type { PositionedNode } from "../../types/graphData";

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
