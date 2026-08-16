import type { Point } from "../../engine/layout/custom/types";
import type { PositionedNode } from "../../types/graphData";
import {
  computeConvexHull,
  crossProduct,
  deduplicatePoints,
  isValidPoint,
  pointDistance,
} from "./convexHull";
import type { CanvasGroup, GroupBounds } from "./types";

const EPSILON = 1e-9;
const DEFAULT_PADDING = 24;
const DEFAULT_CORNER_RADIUS = 12;

/**
 * Returns the 4 corner points of a positioned node rectangle.
 */
export function computeNodeCorners(node: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Point[] {
  if (
    !Number.isFinite(node.x) ||
    !Number.isFinite(node.y) ||
    !Number.isFinite(node.width) ||
    !Number.isFinite(node.height)
  ) {
    return [];
  }

  return [
    { x: node.x, y: node.y },
    { x: node.x + node.width, y: node.y },
    { x: node.x + node.width, y: node.y + node.height },
    { x: node.x, y: node.y + node.height },
  ];
}

/**
 * Computes the axis-aligned bounding box around a set of rectangular nodes with custom padding.
 */
export function computeBoundingBox(
  nodes: Array<{ x: number; y: number; width: number; height: number }>,
  padding = DEFAULT_PADDING,
): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
} | null {
  const validNodes = nodes.filter(
    (n) =>
      Number.isFinite(n.x) &&
      Number.isFinite(n.y) &&
      Number.isFinite(n.width) &&
      Number.isFinite(n.height) &&
      n.width > 0 &&
      n.height > 0,
  );

  if (validNodes.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of validNodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  const safePadding = Math.max(0, Number.isFinite(padding) ? padding : DEFAULT_PADDING);
  const x = minX - safePadding;
  const y = minY - safePadding;
  const width = maxX - minX + safePadding * 2;
  const height = maxY - minY + safePadding * 2;
  const centerX = minX + (maxX - minX) / 2;
  const centerY = minY + (maxY - minY) / 2;

  return {
    minX,
    minY,
    maxX,
    maxY,
    x,
    y,
    width,
    height,
    centerX,
    centerY,
  };
}

/**
 * Expands a 2D convex polygon outward by a given offset distance.
 * Computes edge normals and intersection offsets with miter limits.
 */
export function expandPolygon(polygon: Point[], offset: number): Point[] {
  const valid = deduplicatePoints(polygon.filter(isValidPoint));
  if (valid.length === 0) return [];
  if (offset <= 0) return valid;

  if (valid.length === 1) {
    const pt = valid[0];
    return [
      { x: pt.x - offset, y: pt.y - offset },
      { x: pt.x + offset, y: pt.y - offset },
      { x: pt.x + offset, y: pt.y + offset },
      { x: pt.x - offset, y: pt.y + offset },
    ];
  }

  if (valid.length === 2) {
    const p1 = valid[0];
    const p2 = valid[1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * offset;
    const ny = (dx / len) * offset;

    return [
      { x: p1.x + nx - (dx / len) * offset, y: p1.y + ny - (dy / len) * offset },
      { x: p2.x + nx + (dx / len) * offset, y: p2.y + ny + (dy / len) * offset },
      { x: p2.x - nx + (dx / len) * offset, y: p2.y - ny + (dy / len) * offset },
      { x: p1.x - nx - (dx / len) * offset, y: p1.y - ny - (dy / len) * offset },
    ];
  }

  const n = valid.length;

  // Determine if polygon is ordered counter-clockwise (CCW)
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const cur = valid[i];
    const next = valid[(i + 1) % n];
    signedArea += cur.x * next.y - next.x * cur.y;
  }

  // If points are collinear (area ~ 0), expand the segment between extreme points
  if (Math.abs(signedArea) < EPSILON) {
    const p0 = valid[0];
    const pLast = valid[valid.length - 1];
    return expandPolygon([p0, pLast], offset);
  }

  const isCCW = signedArea >= 0;
  const expanded: Point[] = [];

  // Calculate outward normals for each edge
  const edgeNormals: Point[] = [];
  for (let i = 0; i < n; i++) {
    const cur = valid[i];
    const next = valid[(i + 1) % n];
    const dx = next.x - cur.x;
    const dy = next.y - cur.y;
    const len = Math.hypot(dx, dy) || 1;
    // Outward normal: for CCW (dy, -dx), for CW (-dy, dx)
    const nx = isCCW ? dy / len : -dy / len;
    const ny = isCCW ? -dx / len : dx / len;
    edgeNormals.push({ x: nx, y: ny });
  }

  // Calculate expanded vertices at edge intersections with miter limiting
  for (let i = 0; i < n; i++) {
    const prevEdgeIdx = (i - 1 + n) % n;
    const nPrev = edgeNormals[prevEdgeIdx];
    const nCur = edgeNormals[i];

    // Bisector normal vector
    const bisectorX = nPrev.x + nCur.x;
    const bisectorY = nPrev.y + nCur.y;
    const bisectorLen = Math.hypot(bisectorX, bisectorY);

    let offsetVectorX: number;
    let offsetVectorY: number;

    if (bisectorLen < EPSILON) {
      // Parallel opposite edges
      offsetVectorX = nCur.x * offset;
      offsetVectorY = nCur.y * offset;
    } else {
      const cosHalfAngle = (nPrev.x * nCur.x + nPrev.y * nCur.y + 1) / 2;
      // Clamp miter factor between 1.0 and 2.5 to avoid extreme spiky corners
      const miterFactor = Math.min(2.5, 1 / Math.max(0.2, Math.sqrt(Math.max(0, cosHalfAngle))));
      const unitBisectorX = bisectorX / bisectorLen;
      const unitBisectorY = bisectorY / bisectorLen;
      offsetVectorX = unitBisectorX * offset * miterFactor;
      offsetVectorY = unitBisectorY * offset * miterFactor;
    }

    expanded.push({
      x: valid[i].x + offsetVectorX,
      y: valid[i].y + offsetVectorY,
    });
  }

  return expanded;
}

/**
 * Generates an SVG path string for a rounded rectangle.
 */
export function generateRoundedBoxSvgPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = DEFAULT_CORNER_RADIUS,
): string {
  if (width <= 0 || height <= 0) return "";
  const r = Math.min(radius, width / 2, height / 2);
  if (r <= 0) {
    return `M ${x} ${y} h ${width} v ${height} h ${-width} Z`;
  }
  return `M ${x + r} ${y} h ${width - 2 * r} a ${r} ${r} 0 0 1 ${r} ${r} v ${height - 2 * r} a ${r} ${r} 0 0 1 ${-r} ${r} h ${-(width - 2 * r)} a ${r} ${r} 0 0 1 ${-r} ${-r} v ${-(height - 2 * r)} a ${r} ${r} 0 0 1 ${r} ${-r} Z`;
}

/**
 * Generates an SVG path string for a polygon with rounded corners using quadratic bezier curves.
 */
export function generateRoundedPolygonSvgPath(
  points: Point[],
  cornerRadius = DEFAULT_CORNER_RADIUS,
): string {
  const valid = deduplicatePoints(points.filter(isValidPoint));
  if (valid.length === 0) return "";

  if (valid.length === 1) {
    const p = valid[0];
    return generateRoundedBoxSvgPath(p.x - 20, p.y - 20, 40, 40, cornerRadius);
  }

  if (valid.length === 2) {
    const p1 = valid[0];
    const p2 = valid[1];
    const minX = Math.min(p1.x, p2.x) - 16;
    const minY = Math.min(p1.y, p2.y) - 16;
    const width = Math.abs(p2.x - p1.x) + 32;
    const height = Math.abs(p2.y - p1.y) + 32;
    return generateRoundedBoxSvgPath(minX, minY, width, height, cornerRadius);
  }

  // Check if all points are collinear
  const p0 = valid[0];
  const pLast = valid[valid.length - 1];
  let allCollinear = true;
  for (let i = 1; i < valid.length - 1; i++) {
    if (Math.abs(crossProduct(p0, pLast, valid[i])) > EPSILON) {
      allCollinear = false;
      break;
    }
  }
  if (allCollinear) {
    return generateRoundedPolygonSvgPath([p0, pLast], cornerRadius);
  }

  const n = valid.length;
  const pathCommands: string[] = [];

  for (let i = 0; i < n; i++) {
    const prev = valid[(i - 1 + n) % n];
    const curr = valid[i];
    const next = valid[(i + 1) % n];

    const dPrev = pointDistance(curr, prev);
    const dNext = pointDistance(curr, next);

    const safeRadius = Math.min(cornerRadius, dPrev / 2, dNext / 2);

    if (safeRadius < 0.5) {
      if (i === 0) {
        pathCommands.push(`M ${curr.x} ${curr.y}`);
      } else {
        pathCommands.push(`L ${curr.x} ${curr.y}`);
      }
      continue;
    }

    // Point before corner
    const startX = curr.x + ((prev.x - curr.x) / dPrev) * safeRadius;
    const startY = curr.y + ((prev.y - curr.y) / dPrev) * safeRadius;

    // Point after corner
    const endX = curr.x + ((next.x - curr.x) / dNext) * safeRadius;
    const endY = curr.y + ((next.y - curr.y) / dNext) * safeRadius;

    if (i === 0) {
      pathCommands.push(`M ${startX} ${startY}`);
    } else {
      pathCommands.push(`L ${startX} ${startY}`);
    }

    pathCommands.push(`Q ${curr.x} ${curr.y} ${endX} ${endY}`);
  }

  pathCommands.push("Z");
  return pathCommands.join(" ");
}

/**
 * Computes complete group bounds, convex hull, and SVG path for a canvas group.
 */
export function computeGroupBounds(
  group: CanvasGroup,
  nodesMap: Map<string, PositionedNode>,
  hiddenNodeIds?: Set<string>,
): GroupBounds | null {
  const memberNodes: PositionedNode[] = [];
  for (const nodeId of group.memberNodeIds) {
    if (hiddenNodeIds && hiddenNodeIds.has(nodeId)) {
      continue;
    }
    const node = nodesMap.get(nodeId);
    if (node) {
      memberNodes.push(node);
    }
  }

  if (memberNodes.length === 0) {
    return null;
  }

  const padding = group.padding ?? DEFAULT_PADDING;
  const cornerRadius = group.cornerRadius ?? DEFAULT_CORNER_RADIUS;
  const bbox = computeBoundingBox(memberNodes, padding);
  if (!bbox) return null;

  let hullPoints: Point[] = [];
  let paddedHullPoints: Point[] = [];
  let svgPath = "";

  if (group.shapeMode === "hull") {
    // Collect all corner points from all member nodes
    const allCorners: Point[] = [];
    for (const node of memberNodes) {
      allCorners.push(...computeNodeCorners(node));
    }

    hullPoints = computeConvexHull(allCorners, false);
    paddedHullPoints = expandPolygon(hullPoints, padding);
    svgPath = generateRoundedPolygonSvgPath(paddedHullPoints, cornerRadius);
    if (!svgPath) {
      svgPath = generateRoundedBoxSvgPath(bbox.x, bbox.y, bbox.width, bbox.height, cornerRadius);
    }
  } else {
    // Default box shape
    svgPath = generateRoundedBoxSvgPath(bbox.x, bbox.y, bbox.width, bbox.height, cornerRadius);
  }

  return {
    minX: bbox.minX,
    minY: bbox.minY,
    maxX: bbox.maxX,
    maxY: bbox.maxY,
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height,
    centerX: bbox.centerX,
    centerY: bbox.centerY,
    nodeCount: memberNodes.length,
    hullPoints,
    paddedHullPoints,
    svgPath,
  };
}

/**
 * Computes new positions for nodes after dragging a group by (deltaX, deltaY).
 * Pure function with zero mutation of the input array.
 */
export function computeGroupDragOffsets(
  nodes: PositionedNode[],
  memberNodeIds: readonly string[] | Set<string>,
  deltaX: number,
  deltaY: number,
): PositionedNode[] {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || (deltaX === 0 && deltaY === 0)) {
    return nodes;
  }

  const memberSet = memberNodeIds instanceof Set ? memberNodeIds : new Set(memberNodeIds);

  return nodes.map((node) => {
    if (!memberSet.has(node.id)) {
      return node;
    }
    return {
      ...node,
      x: Math.round((node.x + deltaX) * 10) / 10,
      y: Math.round((node.y + deltaY) * 10) / 10,
    };
  });
}
