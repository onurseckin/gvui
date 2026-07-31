import { describe, expect, it } from "bun:test";
import { CUSTOM_LAYOUT_SCENARIOS } from "../../../features/GraphTesting/data/customLayoutScenarios";
import { resolveCustomLayoutConfig } from "./config";
import { routeAllEdges } from "./edgeRouter";
import { validateCustomLayout } from "./layoutValidator";
import { computeNodeLayout } from "./nodeLayout";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("edgeRouter", () => {
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
