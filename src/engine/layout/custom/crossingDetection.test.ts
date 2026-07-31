import { describe, expect, test } from "bun:test";
import { detectEdgeCrossings, getBridgeOwnerEdgeId } from "./crossingDetection";
import type { EdgeRole, RoutedPath } from "./types";

describe("crossingDetection", () => {
  test("detects interior perpendicular crossings", () => {
    const edgeA: RoutedPath = {
      edgeId: "e1",
      sourcePort: {
        nodeId: "nA",
        side: "left",
        index: 0,
        point: { x: 0, y: 50 },
        stub: { x: 10, y: 50 },
      },
      targetPort: {
        nodeId: "nB",
        side: "right",
        index: 0,
        point: { x: 100, y: 50 },
        stub: { x: 90, y: 50 },
      },
      points: [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
    };

    const edgeB: RoutedPath = {
      edgeId: "e2",
      sourcePort: {
        nodeId: "nC",
        side: "top",
        index: 0,
        point: { x: 50, y: 0 },
        stub: { x: 50, y: 10 },
      },
      targetPort: {
        nodeId: "nD",
        side: "bottom",
        index: 0,
        point: { x: 50, y: 100 },
        stub: { x: 50, y: 90 },
      },
      points: [
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ],
    };

    const crossings = detectEdgeCrossings([edgeA, edgeB]);
    expect(crossings.length).toBe(1);
    expect(crossings[0].edgeIdA).toBe("e1");
    expect(crossings[0].edgeIdB).toBe("e2");
    expect(crossings[0].point).toEqual({ x: 50, y: 50 });
  });

  test("excludes endpoint contacts", () => {
    // edgeA ends at (50, 50), edgeB starts at (50, 50)
    const edgeA: RoutedPath = {
      edgeId: "e1",
      sourcePort: {
        nodeId: "nA",
        side: "left",
        index: 0,
        point: { x: 0, y: 50 },
        stub: { x: 10, y: 50 },
      },
      targetPort: {
        nodeId: "nB",
        side: "right",
        index: 0,
        point: { x: 50, y: 50 },
        stub: { x: 40, y: 50 },
      },
      points: [
        { x: 0, y: 50 },
        { x: 50, y: 50 },
      ],
    };

    const edgeB: RoutedPath = {
      edgeId: "e2",
      sourcePort: {
        nodeId: "nC",
        side: "top",
        index: 0,
        point: { x: 50, y: 50 },
        stub: { x: 50, y: 60 },
      },
      targetPort: {
        nodeId: "nD",
        side: "bottom",
        index: 0,
        point: { x: 50, y: 100 },
        stub: { x: 50, y: 90 },
      },
      points: [
        { x: 50, y: 50 },
        { x: 50, y: 100 },
      ],
    };

    const crossings = detectEdgeCrossings([edgeA, edgeB]);
    expect(crossings.length).toBe(0);
  });

  test("assigns deterministic bridgeOwnerEdgeId based on edge role priority", () => {
    const edgeA: RoutedPath = {
      edgeId: "e1",
      sourcePort: {
        nodeId: "nA",
        side: "left",
        index: 0,
        point: { x: 0, y: 50 },
        stub: { x: 10, y: 50 },
      },
      targetPort: {
        nodeId: "nB",
        side: "right",
        index: 0,
        point: { x: 100, y: 50 },
        stub: { x: 90, y: 50 },
      },
      points: [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
    };

    const edgeB: RoutedPath = {
      edgeId: "e2",
      sourcePort: {
        nodeId: "nC",
        side: "top",
        index: 0,
        point: { x: 50, y: 0 },
        stub: { x: 50, y: 10 },
      },
      targetPort: {
        nodeId: "nD",
        side: "bottom",
        index: 0,
        point: { x: 50, y: 100 },
        stub: { x: 50, y: 90 },
      },
      points: [
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ],
    };

    const roleMap = new Map<string, EdgeRole>([
      ["e1", "forward"],
      ["e2", "feedback"],
    ]);

    const owner = getBridgeOwnerEdgeId(
      { id: "e1", role: "forward" },
      { id: "e2", role: "feedback" },
    );
    expect(owner).toBe("e2");

    const crossings = detectEdgeCrossings([edgeA, edgeB], roleMap);
    expect(crossings.length).toBe(1);
    expect(crossings[0].bridgeOwnerEdgeId).toBe("e2");
  });

  test("assigns deterministic bridgeOwnerEdgeId based on edge ID when roles are equal", () => {
    const owner = getBridgeOwnerEdgeId(
      { id: "edge-b", role: "forward" },
      { id: "edge-a", role: "forward" },
    );
    expect(owner).toBe("edge-b");
  });
});
