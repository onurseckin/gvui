import type { Point, Rect, Segment } from "./types";

export function isFinitePoint(p: Point): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

export function expandRect(rect: Rect, margin: number): Rect {
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

export function rectsOverlapStrict(r1: Rect, r2: Rect, epsilon = 0.001): boolean {
  return (
    r1.x < r2.x + r2.width - epsilon &&
    r1.x + r1.width > r2.x + epsilon &&
    r1.y < r2.y + r2.height - epsilon &&
    r1.y + r1.height > r2.y + epsilon
  );
}

export function pointInRectInterior(p: Point, rect: Rect, epsilon = 0.001): boolean {
  return (
    p.x > rect.x + epsilon &&
    p.x < rect.x + rect.width - epsilon &&
    p.y > rect.y + epsilon &&
    p.y < rect.y + rect.height - epsilon
  );
}

export function pointOnRectBoundary(p: Point, rect: Rect, epsilon = 0.001): boolean {
  const onLeft = Math.abs(p.x - rect.x) <= epsilon && p.y >= rect.y - epsilon && p.y <= rect.y + rect.height + epsilon;
  const onRight = Math.abs(p.x - (rect.x + rect.width)) <= epsilon && p.y >= rect.y - epsilon && p.y <= rect.y + rect.height + epsilon;
  const onTop = Math.abs(p.y - rect.y) <= epsilon && p.x >= rect.x - epsilon && p.x <= rect.x + rect.width + epsilon;
  const onBottom = Math.abs(p.y - (rect.y + rect.height)) <= epsilon && p.x >= rect.x - epsilon && p.x <= rect.x + rect.width + epsilon;

  return onLeft || onRight || onTop || onBottom;
}

export function isOrthogonalSegment(s: Segment, epsilon = 0.001): boolean {
  return Math.abs(s.a.x - s.b.x) <= epsilon || Math.abs(s.a.y - s.b.y) <= epsilon;
}

export function segmentLength(s: Segment): number {
  return Math.abs(s.b.x - s.a.x) + Math.abs(s.b.y - s.a.y);
}

export function segmentsCross(s1: Segment, s2: Segment, epsilon = 0.001): boolean {
  const s1Horiz = Math.abs(s1.a.y - s1.b.y) <= epsilon;
  const s1Vert = Math.abs(s1.a.x - s1.b.x) <= epsilon;
  const s2Horiz = Math.abs(s2.a.y - s2.b.y) <= epsilon;
  const s2Vert = Math.abs(s2.a.x - s2.b.x) <= epsilon;

  if (s1Horiz && s2Vert) {
    const s1MinX = Math.min(s1.a.x, s1.b.x);
    const s1MaxX = Math.max(s1.a.x, s1.b.x);
    const s2MinY = Math.min(s2.a.y, s2.b.y);
    const s2MaxY = Math.max(s2.a.y, s2.b.y);

    const x = s2.a.x;
    const y = s1.a.y;

    return (
      x > s1MinX + epsilon &&
      x < s1MaxX - epsilon &&
      y > s2MinY + epsilon &&
      y < s2MaxY - epsilon
    );
  }

  if (s1Vert && s2Horiz) {
    const s1MinY = Math.min(s1.a.y, s1.b.y);
    const s1MaxY = Math.max(s1.a.y, s1.b.y);
    const s2MinX = Math.min(s2.a.x, s2.b.x);
    const s2MaxX = Math.max(s2.a.x, s2.b.x);

    const x = s1.a.x;
    const y = s2.a.y;

    return (
      x > s2MinX + epsilon &&
      x < s2MaxX - epsilon &&
      y > s1MinY + epsilon &&
      y < s1MaxY - epsilon
    );
  }

  return false;
}

export function collinearOverlapLength(s1: Segment, s2: Segment, epsilon = 0.001): number {
  const s1Horiz = Math.abs(s1.a.y - s1.b.y) <= epsilon;
  const s2Horiz = Math.abs(s2.a.y - s2.b.y) <= epsilon;
  const s1Vert = Math.abs(s1.a.x - s1.b.x) <= epsilon;
  const s2Vert = Math.abs(s2.a.x - s2.b.x) <= epsilon;

  if (s1Horiz && s2Horiz && Math.abs(s1.a.y - s2.a.y) <= epsilon) {
    const min1 = Math.min(s1.a.x, s1.b.x);
    const max1 = Math.max(s1.a.x, s1.b.x);
    const min2 = Math.min(s2.a.x, s2.b.x);
    const max2 = Math.max(s2.a.x, s2.b.x);

    const overlapMin = Math.max(min1, min2);
    const overlapMax = Math.min(max1, max2);

    return Math.max(0, overlapMax - overlapMin);
  }

  if (s1Vert && s2Vert && Math.abs(s1.a.x - s2.a.x) <= epsilon) {
    const min1 = Math.min(s1.a.y, s1.b.y);
    const max1 = Math.max(s1.a.y, s1.b.y);
    const min2 = Math.min(s2.a.y, s2.b.y);
    const max2 = Math.max(s2.a.y, s2.b.y);

    const overlapMin = Math.max(min1, min2);
    const overlapMax = Math.min(max1, max2);

    return Math.max(0, overlapMax - overlapMin);
  }

  return 0;
}

export function segmentIntersectsRectInterior(s: Segment, rect: Rect, epsilon = 0.001): boolean {
  if (pointInRectInterior(s.a, rect, epsilon) || pointInRectInterior(s.b, rect, epsilon)) {
    return true;
  }

  const sHoriz = Math.abs(s.a.y - s.b.y) <= epsilon;
  const sVert = Math.abs(s.a.x - s.b.x) <= epsilon;

  if (sHoriz) {
    const minX = Math.min(s.a.x, s.b.x);
    const maxX = Math.max(s.a.x, s.b.x);
    const y = s.a.y;

    if (y > rect.y + epsilon && y < rect.y + rect.height - epsilon) {
      const overlapMin = Math.max(minX, rect.x);
      const overlapMax = Math.min(maxX, rect.x + rect.width);
      if (overlapMax - overlapMin > epsilon) return true;
    }
  }

  if (sVert) {
    const minY = Math.min(s.a.y, s.b.y);
    const maxY = Math.max(s.a.y, s.b.y);
    const x = s.a.x;

    if (x > rect.x + epsilon && x < rect.x + rect.width - epsilon) {
      const overlapMin = Math.max(minY, rect.y);
      const overlapMax = Math.min(maxY, rect.y + rect.height);
      if (overlapMax - overlapMin > epsilon) return true;
    }
  }

  return false;
}

export function simplifyOrthogonalPath(points: Point[], epsilon = 0.001): Point[] {
  if (points.length <= 1) return [...points];

  // Step 1: Filter duplicate adjacent points
  const nonDupes: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = nonDupes[nonDupes.length - 1];
    const curr = points[i];
    if (Math.abs(curr.x - prev.x) > epsilon || Math.abs(curr.y - prev.y) > epsilon) {
      nonDupes.push(curr);
    }
  }

  if (nonDupes.length <= 2) return nonDupes;

  // Step 2: Remove collinear middle points
  const result: Point[] = [nonDupes[0]];
  for (let i = 1; i < nonDupes.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = nonDupes[i];
    const next = nonDupes[i + 1];

    const isCollinearX = Math.abs(prev.x - curr.x) <= epsilon && Math.abs(curr.x - next.x) <= epsilon;
    const isCollinearY = Math.abs(prev.y - curr.y) <= epsilon && Math.abs(curr.y - next.y) <= epsilon;

    if (!isCollinearX && !isCollinearY) {
      result.push(curr);
    }
  }

  result.push(nonDupes[nonDupes.length - 1]);
  return result;
}

export function pathManhattanLength(points: Point[]): number {
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    length += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  }
  return length;
}

export function pointAtPathRatio(points: Point[], ratio: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0] };

  const totalLen = pathManhattanLength(points);
  if (totalLen === 0) return { ...points[0] };

  const targetDist = Math.max(0, Math.min(1, ratio)) * totalLen;
  let accum = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const segLen = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);

    if (accum + segLen >= targetDist || i === points.length - 2) {
      const remaining = targetDist - accum;
      const t = segLen > 0 ? Math.max(0, Math.min(1, remaining / segLen)) : 0;
      return {
        x: a.x + t * (b.x - a.x),
        y: a.y + t * (b.y - a.y),
      };
    }

    accum += segLen;
  }

  return { ...points[points.length - 1] };
}

export function canonicalSegmentKey(s: Segment): string {
  const p1 = s.a.x < s.b.x || (s.a.x === s.b.x && s.a.y <= s.b.y) ? s.a : s.b;
  const p2 = p1 === s.a ? s.b : s.a;
  return `${p1.x},${p1.y}:${p2.x},${p2.y}`;
}
