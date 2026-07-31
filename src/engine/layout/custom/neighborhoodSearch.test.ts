import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { generateNeighborhoodStates } from "./neighborhoodSearch";
import { createInitialSearchState } from "./searchState";
import { evaluateSearchState } from "./stateEvaluator";
import type { NormalizedEdge, NormalizedNode, RoutedPath } from "./types";

describe("neighborhoodSearch", () => {
  it("generates neighbor states for edges with crossings and port side swaps", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
      { id: "X", width: 100, height: 50 },
      { id: "Y", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "Y" },
      { id: "e2", source: "B", target: "X" },
    ];

    const config = resolveCustomLayoutConfig();
    const state = createInitialSearchState();
    const evalResult = evaluateSearchState(nodes, edges, state, config);

    const neighbors = generateNeighborhoodStates(state, evalResult, config);
    expect(Array.isArray(neighbors)).toBe(true);
  });

  it("generates outer feedback alternatives from classified metadata, not edge-id text", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig();
    const edge: NormalizedEdge = { id: "e-C-A-2", source: "C", target: "A", isCycle: true };
    const route = {
      edgeId: edge.id,
      points: [
        { x: 0, y: 100 },
        { x: 0, y: 0 },
      ],
      sourcePort: {
        nodeId: "C",
        side: "top",
        index: 0,
        point: { x: 0, y: 100 },
        stub: { x: 0, y: 80 },
      },
      targetPort: {
        nodeId: "A",
        side: "bottom",
        index: 0,
        point: { x: 0, y: 0 },
        stub: { x: 0, y: 20 },
      },
    } satisfies RoutedPath;

    const evalResult = {
      routes: [route],
      classifiedEdges: [{ ...edge, role: "feedback" }],
      validation: { crossings: [], diagnostics: [] },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const alternatives = generateNeighborhoodStates(state, evalResult, config)
      .map((neighbor) => neighbor.sideAssignments.get(edge.id))
      .filter(
        (assignment): assignment is NonNullable<typeof assignment> => assignment !== undefined,
      );

    expect(alternatives.slice(0, 2)).toEqual([
      { srcSide: "left", tgtSide: "left" },
      { srcSide: "right", tgtSide: "right" },
    ]);
  });

  it("keeps clean outer feedback routes eligible for score-improving side alternatives", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig();
    const edge: NormalizedEdge = { id: "e-C-A-2", source: "C", target: "A", isCycle: true };
    const route = {
      edgeId: edge.id,
      points: [
        { x: -40, y: 100 },
        { x: -40, y: 0 },
      ],
      sourcePort: {
        nodeId: "C",
        side: "left",
        index: 0,
        point: { x: 0, y: 100 },
        stub: { x: -40, y: 100 },
      },
      targetPort: {
        nodeId: "A",
        side: "left",
        index: 0,
        point: { x: 0, y: 0 },
        stub: { x: -40, y: 0 },
      },
    } satisfies RoutedPath;
    const evalResult = {
      routes: [route],
      classifiedEdges: [{ ...edge, role: "feedback", reversed: true }],
      validation: { crossings: [], diagnostics: [] },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const alternatives = generateNeighborhoodStates(state, evalResult, config)
      .map((neighbor) => neighbor.sideAssignments.get(edge.id))
      .filter(
        (assignment): assignment is NonNullable<typeof assignment> => assignment !== undefined,
      );

    expect(alternatives.slice(0, 2)).toEqual([
      { srcSide: "right", tgtSide: "right" },
      { srcSide: "left", tgtSide: "top" },
    ]);
  });

  it("restarts routing without a no-op spacing demand when a side trial blocks badge placement", () => {
    const state = createInitialSearchState();
    state.sideAssignments.set("e1", { srcSide: "left", tgtSide: "left" });
    const config = resolveCustomLayoutConfig();
    const evalResult = {
      routes: [],
      classifiedEdges: [],
      validation: { crossings: [], diagnostics: [] },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
      resetSideAssignments: true,
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const neighbors = generateNeighborhoodStates(state, evalResult, config);

    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].sideAssignments).toEqual(new Map());
    expect(neighbors[0].exactDemands).toEqual([]);
  });

  it("gives every edge named by a diagnostic a port-side alternative", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 2 });
    const evalResult = {
      routes: [],
      classifiedEdges: [
        { id: "e-badge", source: "A", target: "B", role: "forward", reversed: false },
        { id: "e-sibling", source: "A", target: "C", role: "forward", reversed: false },
      ],
      validation: {
        crossings: [],
        diagnostics: [{ ids: ["e-badge", "e-sibling"] }],
      },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const changedEdgeIds = generateNeighborhoodStates(state, evalResult, config)
      .flatMap((neighbor) => Array.from(neighbor.sideAssignments.keys()))
      .sort();

    expect(changedEdgeIds).toEqual(["e-badge", "e-sibling"]);
  });

  it("gives a clean forward hairpin a port-side alternative", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 2 });
    const edge: NormalizedEdge = { id: "e-hairpin", source: "B", target: "C" };
    const route = {
      edgeId: edge.id,
      points: [
        { x: 140, y: 320 },
        { x: 140, y: 340 },
        { x: 493, y: 340 },
        { x: 493, y: 320 },
      ],
      sourcePort: {
        nodeId: "B",
        side: "bottom",
        index: 0,
        point: { x: 140, y: 320 },
        stub: { x: 140, y: 340 },
      },
      targetPort: {
        nodeId: "C",
        side: "bottom",
        index: 0,
        point: { x: 493, y: 320 },
        stub: { x: 493, y: 340 },
      },
    } satisfies RoutedPath;
    const evalResult = {
      routes: [route],
      classifiedEdges: [{ ...edge, role: "forward", reversed: false }],
      validation: { crossings: [], diagnostics: [] },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const alternatives = generateNeighborhoodStates(state, evalResult, config)
      .map((neighbor) => neighbor.sideAssignments.get(edge.id))
      .filter(
        (assignment): assignment is NonNullable<typeof assignment> => assignment !== undefined,
      );

    expect(alternatives.length).toBeGreaterThan(0);
    expect(alternatives[0]).not.toEqual({ srcSide: "bottom", tgtSide: "bottom" });
  });

  it("gives an edge named by a spacing demand a port-side alternative", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 2 });
    const evalResult = {
      routes: [],
      classifiedEdges: [
        { id: "e-demand", source: "A", target: "B", role: "forward", reversed: false },
      ],
      validation: { crossings: [], diagnostics: [] },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [
        {
          kind: "rank-gap",
          rank: 0,
          affectedEdgeIds: ["e-demand"],
          minimum: 88,
          reason: "blocked-direct-badge",
        },
      ],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const alternatives = generateNeighborhoodStates(state, evalResult, config)
      .map((neighbor) => neighbor.sideAssignments.get("e-demand"))
      .filter(
        (assignment): assignment is NonNullable<typeof assignment> => assignment !== undefined,
      );

    expect(alternatives.length).toBeGreaterThan(0);
  });

  it("keeps spacing expansion first without exceeding the neighbor limit", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 1 });
    const exactDemands = [
      {
        kind: "rank-gap" as const,
        rank: 0,
        affectedEdgeIds: ["e-demand"],
        minimum: 88,
        reason: "blocked-direct-badge" as const,
      },
    ];
    const evalResult = {
      routes: [],
      classifiedEdges: [
        { id: "e-demand", source: "A", target: "B", role: "forward", reversed: false },
      ],
      validation: { crossings: [], diagnostics: [{ ids: ["e-demand"] }] },
      nodeLayout: { orderedLayers: [] },
      exactDemands,
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const neighbors = generateNeighborhoodStates(state, evalResult, config);

    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].exactDemands).toEqual(exactDemands);
  });

  it("does not let clean feedback fillers starve a demanded edge beyond the neighbor cap", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 2 });
    const exactDemands = [
      {
        kind: "rank-gap" as const,
        rank: 0,
        affectedEdgeIds: ["z-demand"],
        minimum: 88,
        reason: "blocked-direct-badge" as const,
      },
    ];
    const evalResult = {
      routes: [],
      classifiedEdges: [
        { id: "a-feedback", source: "C", target: "A", role: "feedback", reversed: true },
        { id: "b-feedback", source: "D", target: "A", role: "feedback", reversed: true },
        { id: "c-feedback", source: "E", target: "A", role: "feedback", reversed: true },
        { id: "z-demand", source: "A", target: "B", role: "forward", reversed: false },
      ],
      validation: { crossings: [], diagnostics: [] },
      nodeLayout: { orderedLayers: [] },
      exactDemands,
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const neighbors = generateNeighborhoodStates(state, evalResult, config);

    expect(neighbors).toHaveLength(2);
    expect(neighbors[0].exactDemands).toEqual(exactDemands);
    expect(neighbors[1].sideAssignments.has("z-demand")).toBe(true);
  });

  it("gives a clean forward route with excess bends a port-side alternative", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 2 });
    const edge: NormalizedEdge = { id: "e-bends", source: "B", target: "C" };
    const route = {
      edgeId: edge.id,
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 40, y: 20 },
        { x: 40, y: 40 },
        { x: 60, y: 40 },
      ],
      sourcePort: {
        nodeId: "B",
        side: "right",
        index: 0,
        point: { x: 0, y: 0 },
        stub: { x: 20, y: 0 },
      },
      targetPort: {
        nodeId: "C",
        side: "left",
        index: 0,
        point: { x: 60, y: 40 },
        stub: { x: 40, y: 40 },
      },
    } satisfies RoutedPath;
    const evalResult = {
      routes: [route],
      classifiedEdges: [{ ...edge, role: "forward", reversed: false }],
      validation: { crossings: [], diagnostics: [] },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const alternatives = generateNeighborhoodStates(state, evalResult, config)
      .map((neighbor) => neighbor.sideAssignments.get(edge.id))
      .filter(
        (assignment): assignment is NonNullable<typeof assignment> => assignment !== undefined,
      );

    expect(alternatives.length).toBeGreaterThan(0);
  });

  it("uses routed sides for unassigned edges and ignores diagnostic node IDs", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 2 });
    const route = {
      edgeId: "e-C-A-2",
      points: [
        { x: 0, y: 100 },
        { x: 0, y: 0 },
      ],
      sourcePort: {
        nodeId: "C",
        side: "left",
        index: 0,
        point: { x: 0, y: 100 },
        stub: { x: -20, y: 100 },
      },
      targetPort: {
        nodeId: "A",
        side: "left",
        index: 0,
        point: { x: 0, y: 0 },
        stub: { x: -20, y: 0 },
      },
    } satisfies RoutedPath;
    const evalResult = {
      routes: [route],
      classifiedEdges: [
        { id: route.edgeId, source: "C", target: "A", role: "feedback", reversed: true },
      ],
      validation: { crossings: [], diagnostics: [{ ids: [route.edgeId, "C"] }] },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const alternatives = generateNeighborhoodStates(state, evalResult, config)
      .map((neighbor) => neighbor.sideAssignments)
      .filter((assignments) => assignments.has(route.edgeId));

    expect(alternatives).toHaveLength(2);
    expect(alternatives[0].get(route.edgeId)).toEqual({ srcSide: "right", tgtSide: "right" });
    expect(alternatives.every((assignments) => !assignments.has("C"))).toBe(true);
  });

  it("canonicalizes stale port orders before preserving them in side-move neighbors", () => {
    const state = createInitialSearchState();
    state.portOrders["A:bottom"] = ["removed:src", "e1:src"];
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 2 });
    const makeRoute = (edgeId: string, targetNodeId: string, sourceX: number) =>
      ({
        edgeId,
        points: [
          { x: sourceX, y: 50 },
          { x: sourceX, y: 200 },
        ],
        sourcePort: {
          nodeId: "A",
          side: "bottom",
          index: 0,
          point: { x: sourceX, y: 50 },
          stub: { x: sourceX, y: 70 },
        },
        targetPort: {
          nodeId: targetNodeId,
          side: "top",
          index: 0,
          point: { x: sourceX, y: 200 },
          stub: { x: sourceX, y: 180 },
        },
      }) satisfies RoutedPath;
    const evalResult = {
      routes: [makeRoute("e1", "B", 25), makeRoute("e2", "C", 75)],
      classifiedEdges: [
        { id: "e1", source: "A", target: "B", role: "forward", reversed: false },
        { id: "e2", source: "A", target: "C", role: "forward", reversed: false },
      ],
      validation: { crossings: [], diagnostics: [{ ids: ["e2"] }] },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const sideMoveNeighbors = generateNeighborhoodStates(state, evalResult, config);

    expect(sideMoveNeighbors).toHaveLength(2);
    for (const neighbor of sideMoveNeighbors) {
      expect(neighbor.portOrders["A:bottom"]).toEqual(["e1:src", "e2:src"]);
    }
  });
});
