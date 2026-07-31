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
});
