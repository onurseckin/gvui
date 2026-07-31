import { describe, expect, it } from "bun:test";
import type { Point } from "./types";
import {
  determineCrossingBridgeOwner,
  pointsToSvgPath,
  renderPathWithCrossingBridges,
} from "./svgPath";

describe("svgPath", () => {
  describe("pointsToSvgPath", () => {
    it("returns empty string for empty points array", () => {
      expect(pointsToSvgPath([])).toBe("");
    });

    it("returns M command for a single point", () => {
      expect(pointsToSvgPath([{ x: 10, y: 20 }])).toBe("M 10 20");
    });

    it("generates M and L commands for orthogonal points", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ];
      expect(pointsToSvgPath(points)).toBe("M 0 0 L 100 0 L 100 50");
    });

    it("filters duplicate adjacent points and simplifies collinear middle points", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ];
      expect(pointsToSvgPath(points)).toBe("M 0 0 L 100 0 L 100 50");
    });

    it("rounds coordinates to at most 3 decimal places", () => {
      const points: Point[] = [
        { x: 10.12345, y: 20.56789 },
        { x: 30.1, y: 40.0 },
      ];
      expect(pointsToSvgPath(points)).toBe("M 10.123 20.568 L 30.1 40");
    });
  });

  describe("renderPathWithCrossingBridges", () => {
    it("returns plain path when no crossings are provided", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ];
      expect(renderPathWithCrossingBridges(points, [])).toBe("M 0 0 L 100 0");
    });

    it("inserts bridge arc for crossing on a horizontal segment", () => {
      const points: Point[] = [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ];
      const crossings: Point[] = [{ x: 50, y: 50 }];

      const pathStr = renderPathWithCrossingBridges(points, crossings, 6);
      expect(pathStr).toBe("M 0 50 L 44 50 A 6 6 0 0 0 56 50 L 100 50");
    });

    it("inserts bridge arc for crossing on a vertical segment", () => {
      const points: Point[] = [
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ];
      const crossings: Point[] = [{ x: 50, y: 50 }];

      const pathStr = renderPathWithCrossingBridges(points, crossings, 6);
      expect(pathStr).toBe("M 50 0 L 50 44 A 6 6 0 0 0 50 56 L 50 100");
    });

    it("sorts crossings by distance along the path", () => {
      const points: Point[] = [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ];
      const crossings: Point[] = [
        { x: 70, y: 50 },
        { x: 30, y: 50 },
      ];

      const pathStr = renderPathWithCrossingBridges(points, crossings, 6);
      expect(pathStr).toBe(
        "M 0 50 L 24 50 A 6 6 0 0 0 36 50 L 64 50 A 6 6 0 0 0 76 50 L 100 50"
      );
    });

    it("preserves path start and end points exactly", () => {
      const points: Point[] = [
        { x: 10, y: 20 },
        { x: 100, y: 20 },
      ];
      const crossings: Point[] = [{ x: 50, y: 20 }];

      const pathStr = renderPathWithCrossingBridges(points, crossings, 6);
      expect(pathStr.startsWith("M 10 20")).toBe(true);
      expect(pathStr.endsWith("L 100 20")).toBe(true);
    });

    it("handles multiple close crossings with reduced radius", () => {
      const points: Point[] = [
        { x: 0, y: 50 },
        { x: 20, y: 50 },
      ];
      const crossings: Point[] = [
        { x: 8, y: 50 },
        { x: 12, y: 50 },
      ];

      const pathStr = renderPathWithCrossingBridges(points, crossings, 6);
      expect(pathStr).toContain("A");
      expect(pathStr.startsWith("M 0 50")).toBe(true);
      expect(pathStr.endsWith("L 20 50")).toBe(true);
    });
  });

  describe("determineCrossingBridgeOwner", () => {
    it("gives bridge priority to forward edge over feedback edge", () => {
      const edgeA = { id: "e1", role: "forward" as const };
      const edgeB = { id: "e2", role: "feedback" as const };
      // Forward stays straight, feedback receives bridge
      const owner = determineCrossingBridgeOwner(edgeA, edgeB);
      expect(owner.bridgedEdgeId).toBe("e2");
      expect(owner.straightEdgeId).toBe("e1");
    });

    it("gives bridge priority to forward edge over cross edge", () => {
      const edgeA = { id: "e1", role: "cross" as const };
      const edgeB = { id: "e2", role: "forward" as const };
      const owner = determineCrossingBridgeOwner(edgeA, edgeB);
      expect(owner.bridgedEdgeId).toBe("e1");
      expect(owner.straightEdgeId).toBe("e2");
    });

    it("uses edge ID tie breaker when roles are equal", () => {
      const edgeA = { id: "edge-b", role: "forward" as const };
      const edgeB = { id: "edge-a", role: "forward" as const };
      // Lower ID "edge-a" stays straight, higher ID "edge-b" gets bridge
      const owner = determineCrossingBridgeOwner(edgeA, edgeB);
      expect(owner.straightEdgeId).toBe("edge-a");
      expect(owner.bridgedEdgeId).toBe("edge-b");
    });
  });
});
