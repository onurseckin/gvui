import type { Point } from "../../engine/layout/custom/types";

const EPSILON = 1e-9;

/**
 * Validates and sanitizes a point to ensure coordinates are finite numbers.
 */
export function isValidPoint(point: Point | null | undefined): point is Point {
  return (
    point !== null &&
    point !== undefined &&
    typeof point.x === "number" &&
    typeof point.y === "number" &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y)
  );
}

/**
 * 2D cross product of vectors OA and OB (where O is origin point a).
 * A positive cross-product indicates a counter-clockwise turn,
 * negative indicates a clockwise turn, and zero indicates collinearity.
 */
export function crossProduct(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * Euclidean distance between two 2D points.
 */
export function pointDistance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

/**
 * Deduplicates points within EPSILON tolerance.
 */
export function deduplicatePoints(points: Point[]): Point[] {
  const valid = points.filter(isValidPoint);
  if (valid.length <= 1) return valid;

  const result: Point[] = [];
  for (const pt of valid) {
    const isDuplicate = result.some(
      (existing) => Math.abs(existing.x - pt.x) < EPSILON && Math.abs(existing.y - pt.y) < EPSILON,
    );
    if (!isDuplicate) {
      result.push(pt);
    }
  }
  return result;
}

/**
 * Computes the 2D Convex Hull of a set of points using Monotone Chain (Andrew's algorithm).
 * Runs in O(n log n) time and returns vertices ordered counter-clockwise.
 *
 * @param points - Array of input 2D points
 * @param includeCollinear - If true, collinear boundary points are included in the hull
 */
export function computeConvexHull(points: Point[], includeCollinear = false): Point[] {
  const uniquePoints = deduplicatePoints(points);

  if (uniquePoints.length <= 2) {
    return uniquePoints;
  }

  // Sort points lexicographically by x-coordinate, then y-coordinate
  const sorted = [...uniquePoints].sort((a, b) => {
    if (Math.abs(a.x - b.x) > EPSILON) {
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  // Check if all points are completely collinear
  const p0 = sorted[0];
  const pLast = sorted[sorted.length - 1];
  let allCollinear = true;
  for (let i = 1; i < sorted.length - 1; i++) {
    if (Math.abs(crossProduct(p0, pLast, sorted[i])) > EPSILON) {
      allCollinear = false;
      break;
    }
  }

  if (allCollinear) {
    return includeCollinear ? sorted : [p0, pLast];
  }

  const lowerHull: Point[] = [];
  for (const point of sorted) {
    while (lowerHull.length >= 2) {
      const cross = crossProduct(
        lowerHull[lowerHull.length - 2],
        lowerHull[lowerHull.length - 1],
        point,
      );
      if (includeCollinear ? cross < -EPSILON : cross <= EPSILON) {
        lowerHull.pop();
      } else {
        break;
      }
    }
    lowerHull.push(point);
  }

  const upperHull: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const point = sorted[i];
    while (upperHull.length >= 2) {
      const cross = crossProduct(
        upperHull[upperHull.length - 2],
        upperHull[upperHull.length - 1],
        point,
      );
      if (includeCollinear ? cross < -EPSILON : cross <= EPSILON) {
        upperHull.pop();
      } else {
        break;
      }
    }
    upperHull.push(point);
  }

  // Remove the last point of each half because it's duplicated at the ends
  lowerHull.pop();
  upperHull.pop();

  return lowerHull.concat(upperHull);
}

/**
 * Tests whether a point lies inside a 2D polygon using the Ray Casting algorithm.
 */
export function isPointInsidePolygon(point: Point, polygon: Point[]): boolean {
  if (!isValidPoint(point) || polygon.length < 3) return false;

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];

    const intersect =
      pi.y > point.y !== pj.y > point.y &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y + EPSILON) + pi.x;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}
