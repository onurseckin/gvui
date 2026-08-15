import { describe, expect, it } from "bun:test";
import type { Rect } from "../../../engine/layout/custom/types";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import {
  computeSafeBadgePlacement,
  doesRectOverlap,
  findCollidingNodes,
  preventBadgeCollision,
  rectContainsPoint,
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
});
