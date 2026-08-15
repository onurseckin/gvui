import type { Point, Rect } from "../../../engine/layout/custom/types";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";

export interface CollisionOptions {
  /** Clearance / margin in pixels to keep between badge and node bounding boxes. Default 8px. */
  clearance?: number;
  /** Max search radius for repositioning if primary offsets collide. Default 200px. */
  maxDisplacement?: number;
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
