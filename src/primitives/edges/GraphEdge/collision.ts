import type { Point, Rect } from "../../../engine/layout/custom/types";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";

export interface CollisionOptions {
  /** Clearance / margin in pixels to keep between badge and node bounding boxes. Default 8px. */
  clearance?: number;
  /** Max search radius for repositioning if primary offsets collide. Default 200px. */
  maxDisplacement?: number;
}

/**
 * Computes the exact arc-length parametric midpoint along a polyline path.
 * Returns null if points array is empty or has fewer than 2 points.
 */
export function computePolylineMidpoint(points: readonly Point[]): Point | null {
  if (!points || points.length < 2) return null;
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      return null;
    }
  }
  if (points.length === 2) {
    return {
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
    };
  }

  let totalLength = 0;
  const segLengths: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segLengths.push(len);
    totalLength += len;
  }

  if (!Number.isFinite(totalLength) || totalLength === 0) return points[0];

  const target = totalLength / 2;
  let accumulated = 0;
  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i];
    if (accumulated + segLen >= target) {
      const t = segLen > 0 ? (target - accumulated) / segLen : 0;
      return {
        x: points[i].x + t * (points[i + 1].x - points[i].x),
        y: points[i].y + t * (points[i + 1].y - points[i].y),
      };
    }
    accumulated += segLen;
  }

  return points[points.length - 1];
}

export interface CollisionResolutionResult {
  rect: Rect;
  adjusted: boolean;
  anchorPoint?: Point;
  leaderPoints?: Point[];
}

/**
 * Checks whether two axis-aligned bounding rectangles overlap, taking into account clearance.
 */
export function doesRectOverlap(r1: Rect, r2: Rect, clearance = 0): boolean {
  return !(
    r1.x + r1.width + clearance <= r2.x ||
    r1.x - clearance >= r2.x + r2.width ||
    r1.y + r1.height + clearance <= r2.y ||
    r1.y - clearance >= r2.y + r2.height
  );
}

/**
 * Checks whether a rectangle contains or is adjacent to a point within a tolerance margin.
 */
export function rectContainsPoint(r: Rect, p: Point, margin = 0): boolean {
  return (
    p.x >= r.x - margin &&
    p.x <= r.x + r.width + margin &&
    p.y >= r.y - margin &&
    p.y <= r.y + r.height + margin
  );
}

/**
 * Finds all node rectangles that intersect with a given badge rectangle.
 */
export function findCollidingNodes(badgeRect: Rect, nodes: Rect[], clearance = 6): Rect[] {
  return nodes.filter((node) => doesRectOverlap(badgeRect, node, clearance));
}

/**
 * Resolves collisions between an edge badge bounding rectangle and node cards.
 * If the badge overlaps any node card, it calculates the closest collision-free position
 * outside all node bounding boxes and generates leader points connecting the anchor to the badge.
 */
export function preventBadgeCollision(
  badgeRect: Rect,
  nodes: Rect[],
  preferredAnchor?: Point,
  options?: CollisionOptions,
): CollisionResolutionResult {
  const clearance = options?.clearance ?? 8;
  const colliding = findCollidingNodes(badgeRect, nodes, clearance);

  if (colliding.length === 0) {
    return {
      rect: badgeRect,
      adjusted: false,
      anchorPoint: preferredAnchor,
    };
  }

  const anchor: Point = preferredAnchor ?? {
    x: badgeRect.x + badgeRect.width / 2,
    y: badgeRect.y + badgeRect.height / 2,
  };

  const candidates: Rect[] = [];

  // Generate candidate escape positions based on all colliding nodes
  for (const node of colliding) {
    // 1. Above node
    candidates.push({
      x: badgeRect.x,
      y: node.y - badgeRect.height - clearance,
      width: badgeRect.width,
      height: badgeRect.height,
    });
    // 2. Below node
    candidates.push({
      x: badgeRect.x,
      y: node.y + node.height + clearance,
      width: badgeRect.width,
      height: badgeRect.height,
    });
    // 3. Left of node
    candidates.push({
      x: node.x - badgeRect.width - clearance,
      y: badgeRect.y,
      width: badgeRect.width,
      height: badgeRect.height,
    });
    // 4. Right of node
    candidates.push({
      x: node.x + node.width + clearance,
      y: badgeRect.y,
      width: badgeRect.width,
      height: badgeRect.height,
    });
    // 5. Diagonal placements
    candidates.push({
      x: node.x + node.width + clearance,
      y: node.y - badgeRect.height - clearance,
      width: badgeRect.width,
      height: badgeRect.height,
    });
    candidates.push({
      x: node.x - badgeRect.width - clearance,
      y: node.y - badgeRect.height - clearance,
      width: badgeRect.width,
      height: badgeRect.height,
    });
    candidates.push({
      x: node.x + node.width + clearance,
      y: node.y + node.height + clearance,
      width: badgeRect.width,
      height: badgeRect.height,
    });
    candidates.push({
      x: node.x - badgeRect.width - clearance,
      y: node.y + node.height + clearance,
      width: badgeRect.width,
      height: badgeRect.height,
    });
  }

  // Filter candidates that are completely collision-free with all nodes
  const validCandidates = candidates.filter((cand) => {
    return !nodes.some((node) => doesRectOverlap(cand, node, clearance));
  });

  if (validCandidates.length > 0) {
    // Sort by squared distance to anchor point to find the minimal displacement
    validCandidates.sort((a, b) => {
      const ax = a.x + a.width / 2;
      const ay = a.y + a.height / 2;
      const bx = b.x + b.width / 2;
      const by = b.y + b.height / 2;
      const distA = (ax - anchor.x) ** 2 + (ay - anchor.y) ** 2;
      const distB = (bx - anchor.x) ** 2 + (by - anchor.y) ** 2;
      return distA - distB;
    });

    const best = validCandidates[0];
    const bestCenter: Point = {
      x: best.x + best.width / 2,
      y: best.y + best.height / 2,
    };

    return {
      rect: best,
      adjusted: true,
      anchorPoint: anchor,
      leaderPoints: [anchor, bestCenter],
    };
  }

  // Fallback: if all standard offsets are crowded, shift upwards by cumulative node bounds
  const minY = Math.min(...colliding.map((n) => n.y));
  const fallbackRect: Rect = {
    x: badgeRect.x,
    y: minY - badgeRect.height - clearance * 2,
    width: badgeRect.width,
    height: badgeRect.height,
  };
  const fallbackCenter: Point = {
    x: fallbackRect.x + fallbackRect.width / 2,
    y: fallbackRect.y + fallbackRect.height / 2,
  };

  return {
    rect: fallbackRect,
    adjusted: true,
    anchorPoint: anchor,
    leaderPoints: [anchor, fallbackCenter],
  };
}

/**
 * Computes a collision-free badge placement for an edge given current positioned nodes.
 */
export function computeSafeBadgePlacement(
  edge: PositionedEdge,
  nodes: PositionedNode[],
  options?: CollisionOptions,
): {
  x: number;
  y: number;
  badgeRect: Rect;
  anchorPoint?: Point;
  leaderPoints?: Point[];
} {
  const defaultWidth = 80;
  const defaultHeight = 26;

  const rawRect: Rect = edge.badgeRect ?? {
    x: (edge.labelX ?? 0) - defaultWidth / 2,
    y: (edge.labelY ?? 0) - defaultHeight / 2,
    width: defaultWidth,
    height: defaultHeight,
  };

  const anchor = edge.anchorPoint ?? {
    x: edge.labelX ?? rawRect.x + rawRect.width / 2,
    y: edge.labelY ?? rawRect.y + rawRect.height / 2,
  };

  const nodeRects: Rect[] = nodes.map((n) => ({
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
  }));

  const resolution = preventBadgeCollision(rawRect, nodeRects, anchor, options);

  return {
    x: resolution.rect.x + resolution.rect.width / 2,
    y: resolution.rect.y + resolution.rect.height / 2,
    badgeRect: resolution.rect,
    anchorPoint: resolution.anchorPoint,
    leaderPoints: resolution.leaderPoints ?? edge.leaderPoints,
  };
}

export interface SafeBadgePlacement {
  x: number;
  y: number;
  badgeRect?: Rect;
  anchorPoint?: Point;
  leaderPoints?: Point[];
}

/**
 * Computes the total Euclidean arc length of a polyline.
 * Returns 0 if points array has fewer than 2 points.
 */
export function computePolylineLength(points: readonly Point[]): number {
  if (!points || points.length < 2) return 0;
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      return 0;
    }
  }
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return Number.isFinite(total) ? total : 0;
}

/**
 * Resolves a safe coordinate and layout geometry for an edge badge.
 * - Respects pre-computed `edge.badgeRect` if present with positive dimensions and finite coordinates.
 * - Respects explicit non-origin finite `labelX` / `labelY`.
 * - Computes polyline midpoint if `edge.points` has non-zero total arc length (even if midpoint is (0,0)).
 * - Strictly suppresses (returns null) for unpositioned (0,0) ghost badges, empty/zero-length polylines at origin, or missing/non-finite coordinates.
 */
export function resolveSafeBadgePlacement(edge: PositionedEdge): SafeBadgePlacement | null {
  // Case 1: Pre-computed layout bounding box
  if (
    edge.badgeRect &&
    Number.isFinite(edge.badgeRect.x) &&
    Number.isFinite(edge.badgeRect.y) &&
    Number.isFinite(edge.badgeRect.width) &&
    Number.isFinite(edge.badgeRect.height) &&
    edge.badgeRect.width > 0 &&
    edge.badgeRect.height > 0
  ) {
    // Guard against uninitialized default origin badgeRect:
    // If badgeRect is at (0,0), anchorPoint is missing, and points is empty/missing or zero-length, treat as uninitialized default and suppress
    const isOriginBadgeRect = edge.badgeRect.x === 0 && edge.badgeRect.y === 0;
    const hasNoAnchor = !edge.anchorPoint;
    const hasNoOrZeroPoints =
      !edge.points ||
      edge.points.length === 0 ||
      (computePolylineLength(edge.points) === 0 &&
        edge.points[0]?.x === 0 &&
        edge.points[0]?.y === 0);

    if (isOriginBadgeRect && hasNoAnchor && hasNoOrZeroPoints) {
      return null;
    }

    return {
      x: edge.badgeRect.x + edge.badgeRect.width / 2,
      y: edge.badgeRect.y + edge.badgeRect.height / 2,
      badgeRect: edge.badgeRect,
      anchorPoint: edge.anchorPoint,
      leaderPoints: edge.leaderPoints,
    };
  }

  // Case 2: Explicit non-zero label coordinates
  if (
    typeof edge.labelX === "number" &&
    typeof edge.labelY === "number" &&
    Number.isFinite(edge.labelX) &&
    Number.isFinite(edge.labelY) &&
    (edge.labelX !== 0 || edge.labelY !== 0)
  ) {
    return {
      x: edge.labelX,
      y: edge.labelY,
      anchorPoint: edge.anchorPoint,
      leaderPoints: edge.leaderPoints,
    };
  }

  // Case 3: Polyline midpoint calculation
  if (edge.points && edge.points.length >= 2) {
    const totalLength = computePolylineLength(edge.points);
    if (totalLength > 0) {
      const mid = computePolylineMidpoint(edge.points);
      if (mid) {
        return {
          x: mid.x,
          y: mid.y,
          anchorPoint: edge.anchorPoint,
          leaderPoints: edge.leaderPoints,
        };
      }
    } else {
      // Coincident points: allow if at non-origin position and finite
      const first = edge.points[0];
      if (
        first &&
        Number.isFinite(first.x) &&
        Number.isFinite(first.y) &&
        (first.x !== 0 || first.y !== 0)
      ) {
        return {
          x: first.x,
          y: first.y,
          anchorPoint: edge.anchorPoint,
          leaderPoints: edge.leaderPoints,
        };
      }
    }
  }

  // Strict Invariant: Suppress ghost text when no valid position exists or unassigned (0,0)
  return null;
}
