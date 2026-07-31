import { describe, expect, it } from "bun:test";
import {
  canonicalSegmentKey,
  collinearOverlapLength,
  expandRect,
  isFinitePoint,
  isOrthogonalSegment,
  pathManhattanLength,
  pointAtPathRatio,
  pointInRectInterior,
  pointOnRectBoundary,
  rectsOverlapStrict,
  segmentIntersectsRectInterior,
  segmentLength,
  segmentsCross,
  simplifyOrthogonalPath,
} from "./geometry";
import type { Point, Rect, Segment } from "./types";

describe("geometry kernel", () => {
  describe("point and rectangle operations", () => {
    it("validates finite points", () => {
      expect(isFinitePoint({ x: 10, y: 20 })).toBe(true);
      expect(isFinitePoint({ x: NaN, y: 20 })).toBe(false);
      expect(isFinitePoint({ x: 10, y: Infinity })).toBe(false);
    });

    it("expands rectangle by padding margin", () => {
      const rect: Rect = { x: 10, y: 20, width: 100, height: 50 };
      const expanded = expandRect(rect, 10);
      expect(expanded).toEqual({ x: 0, y: 10, width: 120, height: 70 });
    });

    it("distinguishes strict overlap vs boundary touching", () => {
      const r1: Rect = { x: 0, y: 0, width: 10, height: 10 };
      const r2: Rect = { x: 5, y: 5, width: 10, height: 10 };
      const r3: Rect = { x: 10, y: 0, width: 10, height: 10 };

      expect(rectsOverlapStrict(r1, r2)).toBe(true);
      expect(rectsOverlapStrict(r1, r3)).toBe(false); // Touching at x=10 is not strict overlap
    });

    it("identifies points inside, outside, and on boundary", () => {
      const rect: Rect = { x: 0, y: 0, width: 10, height: 10 };

      expect(pointInRectInterior({ x: 5, y: 5 }, rect)).toBe(true);
      expect(pointInRectInterior({ x: 0, y: 5 }, rect)).toBe(false); // Boundary is not interior
      expect(pointOnRectBoundary({ x: 0, y: 5 }, rect)).toBe(true);
      expect(pointOnRectBoundary({ x: 5, y: 5 }, rect)).toBe(false);
    });
  });

  describe("orthogonal segment operations", () => {
    it("checks if segment is orthogonal", () => {
      expect(isOrthogonalSegment({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } })).toBe(true);
      expect(isOrthogonalSegment({ a: { x: 0, y: 0 }, b: { x: 0, y: 10 } })).toBe(true);
      expect(isOrthogonalSegment({ a: { x: 0, y: 0 }, b: { x: 10, y: 10 } })).toBe(false);
    });

    it("calculates segment length", () => {
      expect(segmentLength({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } })).toBe(10);
      expect(segmentLength({ a: { x: 0, y: 0 }, b: { x: 0, y: 25 } })).toBe(25);
    });

    it("detects perpendicular segment crossings", () => {
      const horiz: Segment = { a: { x: 0, y: 5 }, b: { x: 10, y: 5 } };
      const vertIntersecting: Segment = { a: { x: 5, y: 0 }, b: { x: 5, y: 10 } };
      const vertNonIntersecting: Segment = { a: { x: 15, y: 0 }, b: { x: 15, y: 10 } };

      expect(segmentsCross(horiz, vertIntersecting)).toBe(true);
      expect(segmentsCross(horiz, vertNonIntersecting)).toBe(false);
    });

    it("calculates positive collinear overlap length", () => {
      const s1: Segment = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 } };
      const s2: Segment = { a: { x: 5, y: 0 }, b: { x: 15, y: 0 } };
      const s3: Segment = { a: { x: 10, y: 0 }, b: { x: 20, y: 0 } };

      expect(collinearOverlapLength(s1, s2)).toBe(5);
      expect(collinearOverlapLength(s1, s3)).toBe(0); // Endpoint touching only is 0 length overlap
    });

    it("detects segment intersection with rectangle interior", () => {
      const rect: Rect = { x: 10, y: 10, width: 20, height: 20 };
      const penetratingSeg: Segment = { a: { x: 0, y: 20 }, b: { x: 40, y: 20 } };
      const boundarySeg: Segment = { a: { x: 0, y: 10 }, b: { x: 40, y: 10 } };

      expect(segmentIntersectsRectInterior(penetratingSeg, rect)).toBe(true);
      expect(segmentIntersectsRectInterior(boundarySeg, rect)).toBe(false);
    });
  });

  describe("orthogonal path operations", () => {
    it("simplifies paths by removing duplicate and collinear points while preserving bends", () => {
      const rawPath: Point[] = [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ];

      const simplified = simplifyOrthogonalPath(rawPath);
      expect(simplified).toEqual([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ]);
    });

    it("calculates path Manhattan length", () => {
      const path: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 20 },
      ];
      expect(pathManhattanLength(path)).toBe(30);
    });

    it("locates point at path distance ratio", () => {
      const path: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 20 },
      ];
      expect(pointAtPathRatio(path, 0.5)).toEqual({ x: 10, y: 5 });
    });

    it("generates deterministic canonical segment key regardless of point order", () => {
      const seg1: Segment = { a: { x: 0, y: 5 }, b: { x: 10, y: 5 } };
      const seg2: Segment = { a: { x: 10, y: 5 }, b: { x: 0, y: 5 } };

      expect(canonicalSegmentKey(seg1)).toBe(canonicalSegmentKey(seg2));
    });
  });
});
