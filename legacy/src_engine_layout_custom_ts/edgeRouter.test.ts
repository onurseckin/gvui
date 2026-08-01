import { describe, expect, it } from "bun:test";
import { CUSTOM_LAYOUT_SCENARIOS } from "../../src/features/GraphTesting/data/customLayoutScenarios";
import { resolveCustomLayoutConfig } from "./config";
import { generatePermutations, replaceConflictReservations, routeAllEdges } from "./edgeRouter";
import { validateCustomLayout } from "./layoutValidator";
import { computeNodeLayout } from "./nodeLayout";
import { RouteOccupancyLedger } from "./routeOccupancy";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("edgeRouter", () => {
  it("replaces every conflicting reservation without retaining its prior route", () => {
    const ledger = new RouteOccupancyLedger();
    const oldRoutes = new Map([
      [
        "e-a",
        {
          edgeId: "e-a",
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
          ],
        },
      ],
      [
        "e-b",
        {
          edgeId: "e-b",
          points: [
            { x: 0, y: 20 },
            { x: 100, y: 20 },
          ],
        },
      ],
    ]);
    for (const route of oldRoutes.values()) {
      ledger.commitRoute(route.edgeId, route.points);
    }

    const replacementRoutes = new Map([
      [
        "e-a",
        {
          edgeId: "e-a",
          points: [
            { x: 0, y: 10 },
            { x: 100, y: 10 },
          ],
        },
      ],
      [
        "e-b",
        {
          edgeId: "e-b",
          points: [
            { x: 0, y: 30 },
            { x: 100, y: 30 },
          ],
        },
      ],
    ]);

    replaceConflictReservations(ledger, ["e-a", "e-b"], replacementRoutes, new Map());

    expect(ledger.getReservations().map((reservation) => reservation.segment)).toEqual([
      { a: { x: 0, y: 10 }, b: { x: 100, y: 10 } },
      { a: { x: 0, y: 30 }, b: { x: 100, y: 30 } },
    ]);
  });

  it("uses explicit port orders when distributing edge endpoints", () => {
    const config = resolveCustomLayoutConfig({ portEndpointPadding: 0 });
    const nodes: NormalizedNode[] = [
      { id: "A", width: 300, height: 60 },
      { id: "B", width: 100, height: 60 },
      { id: "C", width: 100, height: 60 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e-A-B", source: "A", target: "B" },
      { id: "e-A-C", source: "A", target: "C" },
    ];
    const nodeLayout = computeNodeLayout(nodes, edges, config);

    const result = routeAllEdges(nodeLayout, config, {
      sideAssignments: new Map([
        ["e-A-B", { srcSide: "bottom", tgtSide: "top" }],
        ["e-A-C", { srcSide: "bottom", tgtSide: "top" }],
      ]),
      portOrders: { "A:bottom": ["e-A-C:src", "e-A-B:src"] },
    });

    const aToB = result.routes.find((route) => route.edgeId === "e-A-B");
    const aToC = result.routes.find((route) => route.edgeId === "e-A-C");
    expect(aToB).toBeDefined();
    expect(aToC).toBeDefined();
    expect(aToC!.sourcePort.index).toBe(0);
    expect(aToB!.sourcePort.index).toBe(1);
  });
  it("generates permutations deterministically up to limit", () => {
    const items = ["e1", "e2", "e3"];
    const perms = generatePermutations(items, 10);
    expect(perms.length).toBe(6);
    expect(perms[0]).toEqual(["e1", "e2", "e3"]);

    const permsCapped = generatePermutations(items, 4);
    expect(permsCapped.length).toBe(4);
  });
  it("routes all edges with distinct non-overlapping collinear segments", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 120, height: 50 },
      { id: "B", width: 120, height: 50 },
      { id: "C", width: 120, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "C" },
      { id: "eSelf", source: "A", target: "A" },
    ];

    const config = resolveCustomLayoutConfig();
    const nodeLayout = computeNodeLayout(nodes, edges, config);

    const routerResult = routeAllEdges(nodeLayout, config);

    expect(routerResult.routes.length).toBe(3);
    expect(routerResult.status).toBe("success");
  });

  it("routes scenario #19 with zero node penetration and zero shared length before badges", () => {
    const scenario = CUSTOM_LAYOUT_SCENARIOS[19];
    const nodes: NormalizedNode[] = scenario.nodes.map((n) => ({
      id: n.id,
      label: n.name,
      width: n.w,
      height: n.h,
    }));
    const edges: NormalizedEdge[] = scenario.edges.map((e, idx) => ({
      id: `e-${e.source}-${e.target}-${idx}`,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: e.isCycle,
      layoutRole: e.layoutRole,
    }));

    const config = resolveCustomLayoutConfig();
    const nodeLayout = computeNodeLayout(nodes, edges, config);
    const routerResult = routeAllEdges(nodeLayout, config);

    const validation = validateCustomLayout(
      {
        nodes: nodeLayout.normalizedGraph.nodes.map((n) => ({
          ...n,
          ...(nodeLayout.nodePositions.get(n.id) ?? { x: 0, y: 0 }),
        })),
        edges: routerResult.routes,
        badges: [],
      },
      config,
    );

    expect(validation.metrics.edgeNodePenetrations).toBe(0);
    expect(validation.metrics.sharedEdgeSegmentLength).toBe(0);
  });

  it("routes scenario #20 with zero node penetration and zero shared length before badges", () => {
    const scenario = CUSTOM_LAYOUT_SCENARIOS[20];
    const nodes: NormalizedNode[] = scenario.nodes.map((n) => ({
      id: n.id,
      label: n.name,
      width: n.w,
      height: n.h,
    }));
    const edges: NormalizedEdge[] = scenario.edges.map((e, idx) => ({
      id: `e-${e.source}-${e.target}-${idx}`,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: e.isCycle,
      layoutRole: e.layoutRole,
    }));

    const config = resolveCustomLayoutConfig({ maxRouteOrderVariants: 2 });
    const nodeLayout = computeNodeLayout(nodes, edges, config);
    const routerResult = routeAllEdges(nodeLayout, config);

    const validation = validateCustomLayout(
      {
        nodes: nodeLayout.normalizedGraph.nodes.map((n) => ({
          ...n,
          ...(nodeLayout.nodePositions.get(n.id) ?? { x: 0, y: 0 }),
        })),
        edges: routerResult.routes,
        badges: [],
      },
      config,
    );

    expect(validation.metrics.edgeNodePenetrations).toBe(0);
    expect(validation.metrics.sharedEdgeSegmentLength).toBe(0);
  });

  it("routes scenario #5 with zero crossings and zero shared length before badges", () => {
    const scenario = CUSTOM_LAYOUT_SCENARIOS[5];
    const nodes: NormalizedNode[] = scenario.nodes.map((n) => ({
      id: n.id,
      label: n.name,
      width: n.w,
      height: n.h,
    }));
    const edges: NormalizedEdge[] = scenario.edges.map((e, idx) => ({
      id: `e-${e.source}-${e.target}-${idx}`,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: e.isCycle,
      layoutRole: e.layoutRole,
    }));

    const config = resolveCustomLayoutConfig();
    const nodeLayout = computeNodeLayout(nodes, edges, config);
    const routerResult = routeAllEdges(nodeLayout, config);

    const validation = validateCustomLayout(
      {
        nodes: nodeLayout.normalizedGraph.nodes.map((n) => ({
          ...n,
          ...(nodeLayout.nodePositions.get(n.id) ?? { x: 0, y: 0 }),
        })),
        edges: routerResult.routes,
        badges: [],
      },
      config,
    );

    expect(validation.metrics.crossingCount).toBe(0);
    expect(validation.metrics.sharedEdgeSegmentLength).toBe(0);
  });

  it("routes scenario #6 with zero crossings and zero shared length before badges", () => {
    const scenario = CUSTOM_LAYOUT_SCENARIOS[6];
    const nodes: NormalizedNode[] = scenario.nodes.map((n) => ({
      id: n.id,
      label: n.name,
      width: n.w,
      height: n.h,
    }));
    const edges: NormalizedEdge[] = scenario.edges.map((e, idx) => ({
      id: `e-${e.source}-${e.target}-${idx}`,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: e.isCycle,
      layoutRole: e.layoutRole,
    }));

    const config = resolveCustomLayoutConfig();
    const nodeLayout = computeNodeLayout(nodes, edges, config);
    const routerResult = routeAllEdges(nodeLayout, config);

    const validation = validateCustomLayout(
      {
        nodes: nodeLayout.normalizedGraph.nodes.map((n) => ({
          ...n,
          ...(nodeLayout.nodePositions.get(n.id) ?? { x: 0, y: 0 }),
        })),
        edges: routerResult.routes,
        badges: [],
      },
      config,
    );

    expect(validation.metrics.crossingCount).toBe(0);
    expect(validation.metrics.sharedEdgeSegmentLength).toBe(0);
  });
});
