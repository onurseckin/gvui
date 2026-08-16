import { describe, expect, it } from "bun:test";
import type { Point, Rect } from "../../../engine/layout/custom/types";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import {
  computePolylineLength,
  computePolylineMidpoint,
  computeSafeBadgePlacement,
  doesRectOverlap,
  findCollidingNodes,
  preventBadgeCollision,
  rectContainsPoint,
  resolveSafeBadgePlacement,
} from "./collision";

describe("Edge Badge Collision Prevention", () => {
  const sampleNode: Rect = { x: 100, y: 100, width: 200, height: 100 };
  const badgeInsideNode: Rect = { x: 150, y: 130, width: 80, height: 26 };
  const badgeOutsideNode: Rect = { x: 350, y: 100, width: 80, height: 26 };

  describe("doesRectOverlap", () => {
    it("detects when two rectangles overlap", () => {
      expect(doesRectOverlap(sampleNode, badgeInsideNode)).toBe(true);
    });

    it("detects when two rectangles do not overlap", () => {
      expect(doesRectOverlap(sampleNode, badgeOutsideNode)).toBe(false);
    });

    it("respects clearance parameter", () => {
      // Adjacent rect with 0 clearance doesn't overlap
      const adjacent: Rect = { x: 300, y: 100, width: 80, height: 26 };
      expect(doesRectOverlap(sampleNode, adjacent, 0)).toBe(false);
      // But with 10px clearance, it overlaps the clearance buffer
      expect(doesRectOverlap(sampleNode, adjacent, 10)).toBe(true);
    });
  });

  describe("rectContainsPoint", () => {
    it("returns true when point is inside rectangle", () => {
      expect(rectContainsPoint(sampleNode, { x: 150, y: 150 })).toBe(true);
    });

    it("returns false when point is outside rectangle", () => {
      expect(rectContainsPoint(sampleNode, { x: 50, y: 50 })).toBe(false);
    });
  });

  describe("findCollidingNodes", () => {
    it("finds all nodes that collide with a badge", () => {
      const node2: Rect = { x: 500, y: 500, width: 100, height: 100 };
      const colliding = findCollidingNodes(badgeInsideNode, [sampleNode, node2]);
      expect(colliding).toHaveLength(1);
      expect(colliding[0]).toEqual(sampleNode);
    });

    it("returns empty array when badge does not collide with any node", () => {
      const colliding = findCollidingNodes(badgeOutsideNode, [sampleNode]);
      expect(colliding).toHaveLength(0);
    });
  });

  describe("preventBadgeCollision", () => {
    it("returns unchanged rectangle when no collision occurs", () => {
      const result = preventBadgeCollision(badgeOutsideNode, [sampleNode]);
      expect(result.adjusted).toBe(false);
      expect(result.rect).toEqual(badgeOutsideNode);
      expect(result.leaderPoints).toBe(undefined);
    });

    it("repositions badge outside node bounding box when collision occurs", () => {
      const anchor = { x: 190, y: 143 };
      const result = preventBadgeCollision(badgeInsideNode, [sampleNode], anchor);

      expect(result.adjusted).toBe(true);
      // The repositioned badge must not collide with the node
      expect(doesRectOverlap(result.rect, sampleNode, 6)).toBe(false);
      // Leader points must connect the original anchor to the new position
      expect(result.leaderPoints).toBeDefined();
      expect(result.leaderPoints).toHaveLength(2);
      expect(result.leaderPoints?.[0]).toEqual(anchor);
    });

    it("handles multiple crowded nodes and finds clear space", () => {
      const node1: Rect = { x: 100, y: 100, width: 100, height: 100 };
      const node2: Rect = { x: 210, y: 100, width: 100, height: 100 };
      const overlappingBadge: Rect = { x: 150, y: 120, width: 80, height: 26 };

      const result = preventBadgeCollision(overlappingBadge, [node1, node2]);
      expect(result.adjusted).toBe(true);
      expect(doesRectOverlap(result.rect, node1, 4)).toBe(false);
      expect(doesRectOverlap(result.rect, node2, 4)).toBe(false);
    });
  });

  describe("computeSafeBadgePlacement", () => {
    it("computes safe position for a PositionedEdge and PositionedNode array", () => {
      const edge: PositionedEdge = {
        id: "e1",
        source: "n1",
        target: "n2",
        path: "M 0 0 L 300 300",
        label: "dispatch payload",
        labelX: 150,
        labelY: 150,
        badgeRect: { x: 110, y: 137, width: 80, height: 26 },
      };

      const nodes: PositionedNode[] = [
        {
          id: "n1",
          name: "Node 1",
          x: 100,
          y: 100,
          width: 200,
          height: 100,
        },
      ];

      const safePlacement = computeSafeBadgePlacement(edge, nodes);
      expect(doesRectOverlap(safePlacement.badgeRect, nodes[0], 6)).toBe(false);
      expect(safePlacement.x).toBe(safePlacement.badgeRect.x + safePlacement.badgeRect.width / 2);
      expect(safePlacement.y).toBe(safePlacement.badgeRect.y + safePlacement.badgeRect.height / 2);
    });
  });

  describe("computePolylineMidpoint", () => {
    it("returns null for empty array or points with length < 2", () => {
      expect(computePolylineMidpoint([])).toBeNull();
      expect(computePolylineMidpoint([{ x: 10, y: 10 }])).toBeNull();
      expect(computePolylineMidpoint(undefined as unknown as Point[])).toBeNull();
    });

    it("computes exact midpoint for 2-point line segments", () => {
      const horizontal = computePolylineMidpoint([
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ]);
      expect(horizontal).toEqual({ x: 50, y: 50 });

      const diagonal = computePolylineMidpoint([
        { x: 20, y: 40 },
        { x: 80, y: 100 },
      ]);
      expect(diagonal).toEqual({ x: 50, y: 70 });
    });

    it("computes arc-length parametric midpoint for an L-shaped polyline", () => {
      // 2 segments of length 100 each -> total length = 200, midpoint at path distance 100 -> exactly at vertex (100, 0)
      const points = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
      ];
      const mid = computePolylineMidpoint(points);
      expect(mid).toEqual({ x: 100, y: 0 });
    });

    it("computes arc-length parametric midpoint on the longer first segment", () => {
      // Segment 1 length 200, Segment 2 length 100 -> total length 300, midpoint at distance 150 -> (150, 0)
      const points = [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 100 },
      ];
      const mid = computePolylineMidpoint(points);
      expect(mid).toEqual({ x: 150, y: 0 });
    });

    it("computes arc-length parametric midpoint on the longer second segment", () => {
      // Segment 1 length 100, Segment 2 length 300 -> total length 400, midpoint at distance 200 -> (100, 100)
      const points = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 300 },
      ];
      const mid = computePolylineMidpoint(points);
      expect(mid).toEqual({ x: 100, y: 100 });
    });

    it("computes exact midpoint for 3-segment zigzag polylines", () => {
      // Seg 0: (0,0)->(50,0) (len 50)
      // Seg 1: (50,0)->(50,50) (len 50)
      // Seg 2: (50,50)->(100,50) (len 50)
      // Total length = 150, target = 75 -> inside Seg 1 with remaining 25 -> (50, 25)
      const points = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 50 },
      ];
      const mid = computePolylineMidpoint(points);
      expect(mid).toEqual({ x: 50, y: 25 });
    });

    it("handles zero-length polyline gracefully", () => {
      const coincident = [
        { x: 42, y: 84 },
        { x: 42, y: 84 },
      ];
      const mid = computePolylineMidpoint(coincident);
      expect(mid).toEqual({ x: 42, y: 84 });
    });
    it("returns null if any point has NaN or Infinity coordinates", () => {
      expect(
        computePolylineMidpoint([
          { x: Number.NaN, y: 0 },
          { x: 100, y: 100 },
        ]),
      ).toBeNull();
      expect(
        computePolylineMidpoint([
          { x: 0, y: Number.POSITIVE_INFINITY },
          { x: 100, y: 100 },
        ]),
      ).toBeNull();
      expect(
        computePolylineMidpoint([
          { x: 0, y: 0 },
          { x: 100, y: Number.NEGATIVE_INFINITY },
        ]),
      ).toBeNull();
    });
  });

  describe("computePolylineLength", () => {
    it("returns 0 for empty or single-point arrays", () => {
      expect(computePolylineLength([])).toBe(0);
      expect(computePolylineLength([{ x: 10, y: 20 }])).toBe(0);
    });

    it("returns 0 if any point has NaN or Infinity coordinates", () => {
      expect(
        computePolylineLength([
          { x: Number.NaN, y: 0 },
          { x: 100, y: 100 },
        ]),
      ).toBe(0);
      expect(
        computePolylineLength([
          { x: 0, y: Number.POSITIVE_INFINITY },
          { x: 100, y: 100 },
        ]),
      ).toBe(0);
      expect(
        computePolylineLength([
          { x: 0, y: 0 },
          { x: 100, y: Number.NEGATIVE_INFINITY },
        ]),
      ).toBe(0);
    });

    it("calculates exact length for 2-point segments", () => {
      expect(
        computePolylineLength([
          { x: 0, y: 0 },
          { x: 30, y: 40 },
        ]),
      ).toBe(50);
    });

    it("calculates accumulated length across multi-segment polylines", () => {
      expect(
        computePolylineLength([
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ]),
      ).toBe(200);
    });
  });

  describe("resolveSafeBadgePlacement", () => {
    it("returns pre-computed badgeRect center if valid dimensions exist", () => {
      const edge: PositionedEdge = {
        id: "e-rect",
        source: "n1",
        target: "n2",
        path: "M 0 0 L 100 100",
        badgeRect: { x: 40, y: 60, width: 80, height: 26 },
        anchorPoint: { x: 80, y: 73 },
      };
      const placement = resolveSafeBadgePlacement(edge);
      expect(placement).not.toBeNull();
      expect(placement?.x).toBe(80);
      expect(placement?.y).toBe(73);
      expect(placement?.badgeRect).toEqual(edge.badgeRect);
    });

    it("returns explicit non-zero labelX/labelY coordinates", () => {
      const edge: PositionedEdge = {
        id: "e-label",
        source: "n1",
        target: "n2",
        path: "M 0 0 L 100 100",
        labelX: 120,
        labelY: 80,
      };
      const placement = resolveSafeBadgePlacement(edge);
      expect(placement).not.toBeNull();
      expect(placement?.x).toBe(120);
      expect(placement?.y).toBe(80);
    });

    it("retains valid origin-crossing polyline midpoints at (0, 0) when total arc length > 0", () => {
      const originCrossingEdge: PositionedEdge = {
        id: "e-origin-cross",
        source: "n1",
        target: "n2",
        path: "M -100 0 L 100 0",
        points: [
          { x: -100, y: 0 },
          { x: 100, y: 0 },
        ],
      };
      const placement = resolveSafeBadgePlacement(originCrossingEdge);
      expect(placement).not.toBeNull();
      expect(placement?.x).toBe(0);
      expect(placement?.y).toBe(0);
    });

    it("retains diagonal origin-crossing polyline midpoint at (0, 0)", () => {
      const diagonalOriginEdge: PositionedEdge = {
        id: "e-diag-origin",
        source: "n1",
        target: "n2",
        path: "M -50 -50 L 50 50",
        points: [
          { x: -50, y: -50 },
          { x: 50, y: 50 },
        ],
      };
      const placement = resolveSafeBadgePlacement(diagonalOriginEdge);
      expect(placement).not.toBeNull();
      expect(placement?.x).toBe(0);
      expect(placement?.y).toBe(0);
    });

    it("strictly suppresses (returns null) for zero-length polyline at origin", () => {
      const zeroPolylineEdge: PositionedEdge = {
        id: "e-zero-poly",
        source: "n1",
        target: "n2",
        path: "",
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      };
      expect(resolveSafeBadgePlacement(zeroPolylineEdge)).toBeNull();
    });

    it("strictly suppresses (returns null) for unpositioned origin default badgeRect without anchorPoint", () => {
      const defaultOriginBadgeRectEdge: PositionedEdge = {
        id: "e-origin-badgerect-default",
        source: "n1",
        target: "n2",
        path: "",
        badgeRect: { x: 0, y: 0, width: 80, height: 26 },
      };
      expect(resolveSafeBadgePlacement(defaultOriginBadgeRectEdge)).toBeNull();
    });

    it("strictly suppresses (returns null) for origin default badgeRect with zero-length polyline at origin", () => {
      const originBadgeRectZeroPointsEdge: PositionedEdge = {
        id: "e-origin-badgerect-zero-points",
        source: "n1",
        target: "n2",
        path: "",
        badgeRect: { x: 0, y: 0, width: 80, height: 26 },
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
      };
      expect(resolveSafeBadgePlacement(originBadgeRectZeroPointsEdge)).toBeNull();
    });

    it("allows origin badgeRect when explicit anchorPoint is provided", () => {
      const anchoredOriginBadgeRectEdge: PositionedEdge = {
        id: "e-anchored-origin-badgerect",
        source: "n1",
        target: "n2",
        path: "",
        badgeRect: { x: 0, y: 0, width: 80, height: 26 },
        anchorPoint: { x: 40, y: 13 },
      };
      const placement = resolveSafeBadgePlacement(anchoredOriginBadgeRectEdge);
      expect(placement).not.toBeNull();
      expect(placement?.x).toBe(40);
      expect(placement?.y).toBe(13);
      expect(placement?.anchorPoint).toEqual({ x: 40, y: 13 });
    });

    it("allows origin badgeRect when valid non-zero polyline points exist", () => {
      const polylineOriginBadgeRectEdge: PositionedEdge = {
        id: "e-poly-origin-badgerect",
        source: "n1",
        target: "n2",
        path: "M -100 0 L 100 0",
        badgeRect: { x: 0, y: 0, width: 80, height: 26 },
        points: [
          { x: -100, y: 0 },
          { x: 100, y: 0 },
        ],
      };
      const placement = resolveSafeBadgePlacement(polylineOriginBadgeRectEdge);
      expect(placement).not.toBeNull();
      expect(placement?.x).toBe(40);
      expect(placement?.y).toBe(13);
    });

    it("strictly suppresses unpositioned edges with labelX: 0, labelY: 0 and no points", () => {
      const ghostEdge: PositionedEdge = {
        id: "ghost-edge",
        source: "n1",
        target: "n2",
        path: "",
        labelX: 0,
        labelY: 0,
      };
      expect(resolveSafeBadgePlacement(ghostEdge)).toBeNull();
    });

    it("strictly suppresses unpositioned edges with no geometric data", () => {
      const unpositionedEdge: PositionedEdge = {
        id: "unpos",
        source: "n1",
        target: "n2",
        path: "",
      };
      expect(resolveSafeBadgePlacement(unpositionedEdge)).toBeNull();
    });

    it("strictly suppresses edges with NaN or Infinity in labelX or labelY", () => {
      const nanLabelXEdge: PositionedEdge = {
        id: "nan-label-x",
        source: "n1",
        target: "n2",
        path: "",
        labelX: Number.NaN,
        labelY: 100,
      };
      expect(resolveSafeBadgePlacement(nanLabelXEdge)).toBeNull();

      const infLabelYEdge: PositionedEdge = {
        id: "inf-label-y",
        source: "n1",
        target: "n2",
        path: "",
        labelX: 100,
        labelY: Number.POSITIVE_INFINITY,
      };
      expect(resolveSafeBadgePlacement(infLabelYEdge)).toBeNull();
    });

    it("strictly suppresses edges with non-finite or invalid badgeRect coordinates or dimensions", () => {
      const nanBadgeRectEdge: PositionedEdge = {
        id: "nan-rect",
        source: "n1",
        target: "n2",
        path: "",
        badgeRect: { x: Number.NaN, y: 100, width: 80, height: 26 },
      };
      expect(resolveSafeBadgePlacement(nanBadgeRectEdge)).toBeNull();

      const infBadgeRectEdge: PositionedEdge = {
        id: "inf-rect",
        source: "n1",
        target: "n2",
        path: "",
        badgeRect: { x: 100, y: 100, width: Number.POSITIVE_INFINITY, height: 26 },
      };
      expect(resolveSafeBadgePlacement(infBadgeRectEdge)).toBeNull();

      const zeroWidthBadgeRectEdge: PositionedEdge = {
        id: "zero-width-rect",
        source: "n1",
        target: "n2",
        path: "",
        badgeRect: { x: 100, y: 100, width: 0, height: 26 },
      };
      expect(resolveSafeBadgePlacement(zeroWidthBadgeRectEdge)).toBeNull();
    });

    it("strictly suppresses edges with points array containing NaN or Infinity", () => {
      const nanPointsEdge: PositionedEdge = {
        id: "nan-points",
        source: "n1",
        target: "n2",
        path: "",
        points: [
          { x: Number.NaN, y: 0 },
          { x: 100, y: 100 },
        ],
      };
      expect(resolveSafeBadgePlacement(nanPointsEdge)).toBeNull();

      const infPointsEdge: PositionedEdge = {
        id: "inf-points",
        source: "n1",
        target: "n2",
        path: "",
        points: [
          { x: 0, y: 0 },
          { x: 100, y: Number.POSITIVE_INFINITY },
        ],
      };
      expect(resolveSafeBadgePlacement(infPointsEdge)).toBeNull();
    });

    it("strictly suppresses unplaced edge with single point at origin", () => {
      const singleOriginEdge: PositionedEdge = {
        id: "single-origin",
        source: "n1",
        target: "n2",
        path: "",
        points: [{ x: 0, y: 0 }],
      };
      expect(resolveSafeBadgePlacement(singleOriginEdge)).toBeNull();
    });

    it("strictly suppresses zero-coordinate edge with empty points array", () => {
      const emptyPointsEdge: PositionedEdge = {
        id: "empty-points",
        source: "n1",
        target: "n2",
        path: "",
        points: [],
      };
      expect(resolveSafeBadgePlacement(emptyPointsEdge)).toBeNull();
    });

    it("computes safe badge placement with leader points when colliding with congested node cluster", () => {
      const crowdedNodes: PositionedNode[] = [
        { id: "node-1", name: "Node 1", x: 100, y: 100, width: 120, height: 80 },
        { id: "node-2", name: "Node 2", x: 230, y: 100, width: 120, height: 80 },
      ];
      const collidingEdge: PositionedEdge = {
        id: "edge-congested",
        source: "node-1",
        target: "node-2",
        path: "M 160 140 L 290 140",
        labelX: 160,
        labelY: 140,
        badgeRect: { x: 120, y: 120, width: 80, height: 26 },
      };

      const safePlacement = computeSafeBadgePlacement(collidingEdge, crowdedNodes, {
        clearance: 10,
      });
      expect(safePlacement).toBeDefined();
      expect(safePlacement.badgeRect).toBeDefined();
      // Ensure the resolved badge rect does not collide with either node
      for (const node of crowdedNodes) {
        expect(doesRectOverlap(safePlacement.badgeRect, node, 10)).toBe(false);
      }
      expect(safePlacement.leaderPoints).toBeDefined();
    });
  });
});
