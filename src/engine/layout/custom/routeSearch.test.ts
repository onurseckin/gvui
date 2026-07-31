import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { collinearOverlapLength, segmentIntersectsRectInterior, segmentsCross } from "./geometry";
import { compareRouteCost, searchOrthogonalRoute, type RouteCost } from "./routeSearch";
import { buildRoutingGrid } from "./routingGrid";
import type { NormalizedNode, OccupancyRecord, Point, PortRef, Rect } from "./types";

describe("routeSearch", () => {
  it("direct visible ports produce shortest orthogonal route", () => {
    const nodes: (NormalizedNode & Point)[] = [
      { id: "A", width: 100, height: 50, x: 100, y: 0 },
      { id: "B", width: 100, height: 50, x: 100, y: 200 },
    ];

    const sourcePort: PortRef = {
      nodeId: "A",
      side: "bottom",
      index: 0,
      point: { x: 150, y: 50 },
      stub: { x: 150, y: 70 },
    };

    const targetPort: PortRef = {
      nodeId: "B",
      side: "top",
      index: 0,
      point: { x: 150, y: 200 },
      stub: { x: 150, y: 180 },
    };

    const boundingBox: Rect = { x: 0, y: 0, width: 300, height: 300 };
    const config = resolveCustomLayoutConfig();
    const grid = buildRoutingGrid(nodes, [sourcePort, targetPort], boundingBox, config);
    const occupancy: OccupancyRecord[] = [];

    const route = searchOrthogonalRoute("e1", sourcePort, targetPort, grid, occupancy, config);

    expect(route).toBeDefined();
    expect(route?.points).toEqual([
      { x: 150, y: 50 },
      { x: 150, y: 200 },
    ]);
  });

  it("central rectangle is routed around", () => {
    const nodes: (NormalizedNode & Point)[] = [
      { id: "A", width: 100, height: 50, x: 100, y: 0 },
      { id: "OBS", width: 80, height: 50, x: 110, y: 90 }, // Blocking central corridor
      { id: "B", width: 100, height: 50, x: 100, y: 200 },
    ];

    const sourcePort: PortRef = {
      nodeId: "A",
      side: "bottom",
      index: 0,
      point: { x: 150, y: 50 },
      stub: { x: 150, y: 70 },
    };

    const targetPort: PortRef = {
      nodeId: "B",
      side: "top",
      index: 0,
      point: { x: 150, y: 200 },
      stub: { x: 150, y: 180 },
    };

    const boundingBox: Rect = { x: 0, y: 0, width: 350, height: 300 };
    const config = resolveCustomLayoutConfig();
    const grid = buildRoutingGrid(nodes, [sourcePort, targetPort], boundingBox, config);
    const occupancy: OccupancyRecord[] = [];

    const route = searchOrthogonalRoute("e1", sourcePort, targetPort, grid, occupancy, config);

    expect(route).toBeDefined();
    expect(route!.points.length).toBeGreaterThan(2);

    const obsRect: Rect = { x: 110, y: 90, width: 80, height: 50 };
    for (let i = 0; i < route!.points.length - 1; i++) {
      const seg = { a: route!.points[i], b: route!.points[i + 1] };
      expect(segmentIntersectsRectInterior(seg, obsRect, config.epsilon)).toBe(false);
    }
  });

  it("uses a bounded grid dogleg when A* reaches its state cap", () => {
    const nodes: (NormalizedNode & Point)[] = [
      { id: "A", width: 100, height: 50, x: 100, y: 0 },
      { id: "OBS", width: 80, height: 50, x: 110, y: 90 },
      { id: "B", width: 100, height: 50, x: 100, y: 200 },
    ];
    const sourcePort: PortRef = {
      nodeId: "A",
      side: "bottom",
      index: 0,
      point: { x: 150, y: 50 },
      stub: { x: 150, y: 70 },
    };
    const targetPort: PortRef = {
      nodeId: "B",
      side: "top",
      index: 0,
      point: { x: 150, y: 200 },
      stub: { x: 150, y: 180 },
    };
    const config = resolveCustomLayoutConfig();
    const grid = buildRoutingGrid(
      nodes,
      [sourcePort, targetPort],
      { x: 0, y: 0, width: 350, height: 300 },
      config,
    );

    const route = searchOrthogonalRoute("e1", sourcePort, targetPort, grid, [], config, {
      maxIterations: 1,
      allowDoglegFallback: true,
    });

    expect(route).toBeDefined();
    for (let index = 0; index < route!.points.length - 1; index++) {
      expect(
        segmentIntersectsRectInterior(
          { a: route!.points[index], b: route!.points[index + 1] },
          { x: 110, y: 90, width: 80, height: 50 },
          config.epsilon,
        ),
      ).toBe(false);
    }
  });

  it("fewer bends win when lengths are equal", () => {
    const nodes: (NormalizedNode & Point)[] = [
      { id: "A", width: 100, height: 50, x: 0, y: 0 },
      { id: "B", width: 100, height: 50, x: 200, y: 200 },
    ];

    const sourcePort: PortRef = {
      nodeId: "A",
      side: "right",
      index: 0,
      point: { x: 100, y: 25 },
      stub: { x: 120, y: 25 },
    };

    const targetPort: PortRef = {
      nodeId: "B",
      side: "top",
      index: 0,
      point: { x: 250, y: 200 },
      stub: { x: 250, y: 180 },
    };

    const boundingBox: Rect = { x: 0, y: 0, width: 400, height: 400 };
    const config = resolveCustomLayoutConfig();
    const grid = buildRoutingGrid(nodes, [sourcePort, targetPort], boundingBox, config);
    const occupancy: OccupancyRecord[] = [];

    const route = searchOrthogonalRoute("e1", sourcePort, targetPort, grid, occupancy, config);

    expect(route).toBeDefined();
    // 1 bend between stubs: (120, 25) -> (250, 25) -> (250, 180)
    // Points simplified: (100, 25) -> (250, 25) -> (250, 200) => 3 points (1 bend)
    expect(route?.points.length).toBe(3);
  });

  it("occupied grid edge is never reused", () => {
    const nodes: (NormalizedNode & Point)[] = [
      { id: "A", width: 100, height: 50, x: 100, y: 0 },
      { id: "B", width: 100, height: 50, x: 100, y: 200 },
    ];

    const sourcePort: PortRef = {
      nodeId: "A",
      side: "bottom",
      index: 0,
      point: { x: 150, y: 50 },
      stub: { x: 150, y: 70 },
    };

    const targetPort: PortRef = {
      nodeId: "B",
      side: "top",
      index: 0,
      point: { x: 150, y: 200 },
      stub: { x: 150, y: 180 },
    };

    const boundingBox: Rect = { x: 0, y: 0, width: 300, height: 300 };
    const config = resolveCustomLayoutConfig();
    const grid = buildRoutingGrid(nodes, [sourcePort, targetPort], boundingBox, config);

    const occupiedSegment = { a: { x: 150, y: 70 }, b: { x: 150, y: 180 } };
    const occupancy: OccupancyRecord[] = [{ edgeId: "e1", segment: occupiedSegment }];

    const route = searchOrthogonalRoute("e2", sourcePort, targetPort, grid, occupancy, config);

    expect(route).toBeDefined();
    for (let i = 0; i < route!.points.length - 1; i++) {
      const seg = { a: route!.points[i], b: route!.points[i + 1] };
      expect(collinearOverlapLength(seg, occupiedSegment, config.epsilon)).toBe(0);
    }
  });

  it("high crossing penalty selects a non-crossing detour", () => {
    const nodes: (NormalizedNode & Point)[] = [
      { id: "A", width: 100, height: 50, x: 0, y: 100 },
      { id: "B", width: 100, height: 50, x: 300, y: 100 },
    ];

    const sourcePort: PortRef = {
      nodeId: "A",
      side: "right",
      index: 0,
      point: { x: 100, y: 125 },
      stub: { x: 120, y: 125 },
    };

    const targetPort: PortRef = {
      nodeId: "B",
      side: "left",
      index: 0,
      point: { x: 300, y: 125 },
      stub: { x: 280, y: 125 },
    };

    const boundingBox: Rect = { x: 0, y: 0, width: 500, height: 400 };
    const config = resolveCustomLayoutConfig({ crossingPenalty: 2000 });
    const grid = buildRoutingGrid(nodes, [sourcePort, targetPort], boundingBox, config);

    // Vertical barrier at x=200 crossing y=125
    const crossingOccupancy: OccupancyRecord = {
      edgeId: "e_cross",
      segment: { a: { x: 200, y: 80 }, b: { x: 200, y: 170 } },
    };

    const route = searchOrthogonalRoute(
      "e1",
      sourcePort,
      targetPort,
      grid,
      [crossingOccupancy],
      config,
    );

    expect(route).toBeDefined();
    // Ensure no segment in route crosses crossingOccupancy
    for (let i = 0; i < route!.points.length - 1; i++) {
      const seg = { a: route!.points[i], b: route!.points[i + 1] };
      expect(segmentsCross(seg, crossingOccupancy.segment, config.epsilon)).toBe(false);
    }
  });

  it("enforces visiting requiredCorridorX before reaching target stub", () => {
    const nodes: (NormalizedNode & Point)[] = [
      { id: "A", width: 100, height: 50, x: 200, y: 0 },
      { id: "B", width: 100, height: 50, x: 200, y: 200 },
    ];

    const sourcePort: PortRef = {
      nodeId: "A",
      side: "left",
      index: 0,
      point: { x: 200, y: 25 },
      stub: { x: 180, y: 25 },
    };

    const targetPort: PortRef = {
      nodeId: "B",
      side: "left",
      index: 0,
      point: { x: 200, y: 225 },
      stub: { x: 180, y: 225 },
    };

    const boundingBox: Rect = { x: 0, y: 0, width: 400, height: 300 };
    const config = resolveCustomLayoutConfig();
    const grid = buildRoutingGrid(nodes, [sourcePort, targetPort], boundingBox, config, 2);

    const requiredCorridorX = 160;
    const route = searchOrthogonalRoute("e1", sourcePort, targetPort, grid, [], config, {
      requiredCorridorX,
    });

    expect(route).toBeDefined();
    const visitsCorridor = route!.points.some(
      (p) => Math.abs(p.x - requiredCorridorX) < config.epsilon,
    );
    expect(visitsCorridor).toBe(true);
  });

  describe("crossing-first route search", () => {
    it("prefers an arbitrarily long crossing-free path", () => {
      const longClean: RouteCost = {
        crossings: 0,
        hairpins: 0,
        bends: 2,
        directionDeviation: 0,
        length: 100000,
        nearObstaclePenalty: 0,
      };
      const shortCrossed: RouteCost = {
        crossings: 1,
        hairpins: 0,
        bends: 0,
        directionDeviation: 0,
        length: 10,
        nearObstaclePenalty: 0,
      };
      expect(compareRouteCost(longClean, shortCrossed)).toBeLessThan(0);
    });

    it("grid search selects long clean detour over short crossed path when crossingPenalty = 0", () => {
      const nodes: (NormalizedNode & Point)[] = [
        { id: "A", width: 100, height: 50, x: 0, y: 100 },
        { id: "B", width: 100, height: 50, x: 300, y: 100 },
      ];

      const sourcePort: PortRef = {
        nodeId: "A",
        side: "right",
        index: 0,
        point: { x: 100, y: 125 },
        stub: { x: 120, y: 125 },
      };

      const targetPort: PortRef = {
        nodeId: "B",
        side: "left",
        index: 0,
        point: { x: 300, y: 125 },
        stub: { x: 280, y: 125 },
      };

      const boundingBox: Rect = { x: 0, y: 0, width: 500, height: 400 };
      const config = resolveCustomLayoutConfig({ crossingPenalty: 0 });
      const grid = buildRoutingGrid(nodes, [sourcePort, targetPort], boundingBox, config);

      // Vertical barrier at x=200 crossing y=125 from y=80 to y=170
      const crossingOccupancy: OccupancyRecord = {
        edgeId: "e_cross",
        segment: { a: { x: 200, y: 80 }, b: { x: 200, y: 170 } },
      };

      const route = searchOrthogonalRoute(
        "e1",
        sourcePort,
        targetPort,
        grid,
        [crossingOccupancy],
        config,
      );

      expect(route).toBeDefined();
      for (let i = 0; i < route!.points.length - 1; i++) {
        const seg = { a: route!.points[i], b: route!.points[i + 1] };
        expect(segmentsCross(seg, crossingOccupancy.segment, config.epsilon)).toBe(false);
      }
    });

    it("prefers route with no U-turn over route with 1 hairpin when crossings tie", () => {
      const noHairpin: RouteCost = {
        crossings: 0,
        hairpins: 0,
        bends: 3,
        directionDeviation: 0,
        length: 100,
        nearObstaclePenalty: 0,
      };
      const withHairpin: RouteCost = {
        crossings: 0,
        hairpins: 1,
        bends: 1,
        directionDeviation: 0,
        length: 20,
        nearObstaclePenalty: 0,
      };
      expect(compareRouteCost(noHairpin, withHairpin)).toBeLessThan(0);
    });

    it("tracks search statistics and stays below expanded-state ceiling", () => {
      const nodes: (NormalizedNode & Point)[] = [
        { id: "A", width: 100, height: 50, x: 0, y: 0 },
        { id: "B", width: 100, height: 50, x: 200, y: 100 },
        { id: "C", width: 100, height: 50, x: 100, y: 300 },
      ];

      const sourcePort: PortRef = {
        nodeId: "A",
        side: "right",
        index: 0,
        point: { x: 100, y: 25 },
        stub: { x: 120, y: 25 },
      };

      const targetPort: PortRef = {
        nodeId: "C",
        side: "left",
        index: 0,
        point: { x: 100, y: 325 },
        stub: { x: 80, y: 325 },
      };

      const boundingBox: Rect = { x: 0, y: 0, width: 400, height: 400 };
      const config = resolveCustomLayoutConfig();
      const grid = buildRoutingGrid(nodes, [sourcePort, targetPort], boundingBox, config);
      const occupancy: OccupancyRecord[] = [
        { edgeId: "e_obs", segment: { a: { x: 120, y: 25 }, b: { x: 120, y: 325 } } },
      ];

      const route = searchOrthogonalRoute("e1", sourcePort, targetPort, grid, occupancy, config);

      expect(route).toBeDefined();
      expect(route?.stats).toBeDefined();
      expect(route!.stats!.expandedStates).toBeGreaterThan(0);
      expect(route!.stats!.expandedStates).toBeLessThan(1500);
      expect(route!.stats!.stopReason).toBe("target_reached");
    });
  });
});
