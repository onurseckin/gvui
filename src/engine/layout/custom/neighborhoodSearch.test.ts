import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import {
  generateAestheticTrialStates,
  generateCrossingCompletionStates,
  generateNeighborhoodStates,
} from "./neighborhoodSearch";
import { generatePortCandidates } from "./portCandidates";
import { computeStateHash, createInitialSearchState } from "./searchState";
import { evaluateSearchState } from "./stateEvaluator";
import type { NormalizedEdge, NormalizedNode, RoutedPath } from "./types";

function makeRoute(
  edgeId: string,
  sourceNodeId: string,
  targetNodeId: string,
  sourceSide: "top" | "right" | "bottom" | "left" = "bottom",
  targetSide: "top" | "right" | "bottom" | "left" = "top",
): RoutedPath {
  return {
    edgeId,
    points: [
      { x: 100, y: 80 },
      { x: 100, y: 220 },
    ],
    sourcePort: {
      nodeId: sourceNodeId,
      side: sourceSide,
      index: 0,
      point: { x: 100, y: 80 },
      stub: { x: 100, y: 100 },
    },
    targetPort: {
      nodeId: targetNodeId,
      side: targetSide,
      index: 0,
      point: { x: 100, y: 220 },
      stub: { x: 100, y: 200 },
    },
  };
}

function assignmentSignature(states: ReturnType<typeof createInitialSearchState>[]): string[] {
  return states.map((state) =>
    Array.from(state.sideAssignments.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([edgeId, assignment]) => `${edgeId}:${assignment.srcSide}/${assignment.tgtSide}`)
      .join("|"),
  );
}

function stateSignatures(states: ReturnType<typeof createInitialSearchState>[]): string[] {
  return states.map(computeStateHash);
}

function changedEndpointCount(
  assignment: { srcSide: string; tgtSide: string },
  current: { srcSide: string; tgtSide: string },
): number {
  return (
    Number(assignment.srcSide !== current.srcSide) + Number(assignment.tgtSide !== current.tgtSide)
  );
}

describe("neighborhoodSearch", () => {
  it("limits aesthetic trials to two one-endpoint moves per defect route deterministically", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig();
    const defectRoute = makeRoute("defect", "S0", "T0", "right", "left");
    defectRoute.points = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 },
      { x: 80, y: 40 },
      { x: 80, y: 80 },
      { x: 120, y: 80 },
    ];
    const cleanRoute = makeRoute("clean", "S1", "T1");
    const classifiedEdges = [
      { id: "defect", source: "S0", target: "T0", role: "forward" as const, reversed: false },
      { id: "clean", source: "S1", target: "T1", role: "forward" as const, reversed: false },
    ];
    const evaluation = {
      routes: [defectRoute, cleanRoute],
      classifiedEdges,
      nodes: [
        { id: "S0", width: 80, height: 40, x: 0, y: 0 },
        { id: "T0", width: 80, height: 40, x: 200, y: 200 },
        { id: "S1", width: 80, height: 40, x: 0, y: 200 },
        { id: "T1", width: 80, height: 40, x: 200, y: 0 },
      ],
      validation: { crossings: [], diagnostics: [] },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;
    const reversed = {
      ...evaluation,
      routes: [...evaluation.routes].reverse(),
      classifiedEdges: [...classifiedEdges].reverse(),
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const forwardTrials = generateAestheticTrialStates(state, evaluation, config);
    const reversedTrials = generateAestheticTrialStates(state, reversed, config);
    expect(forwardTrials).toHaveLength(2);
    expect(
      forwardTrials.every(
        (trial) => trial.sideAssignments.size === 1 && trial.sideAssignments.has("defect"),
      ),
    ).toBe(true);
    expect(stateSignatures(reversedTrials)).toEqual(stateSignatures(forwardTrials));
  });

  it("bounds coordinated aesthetic completions and carries discovered spacing demands", () => {
    const state = createInitialSearchState();
    state.sideAssignments.set("defect", { srcSide: "right", tgtSide: "left" });
    const config = resolveCustomLayoutConfig();
    const demand = {
      kind: "rank-gap" as const,
      rank: 0,
      affectedEdgeIds: ["defect"],
      minimum: 180,
      reason: "blocked-direct-badge" as const,
    };
    const evaluation = {
      routes: [
        makeRoute("defect", "S0", "T0", "right", "left"),
        makeRoute("partner", "S1", "T1", "bottom", "top"),
      ],
      classifiedEdges: [
        {
          id: "defect",
          source: "S0",
          target: "T0",
          role: "forward" as const,
          reversed: false,
        },
        {
          id: "partner",
          source: "S1",
          target: "T1",
          role: "forward" as const,
          reversed: false,
        },
      ],
      validation: {
        crossings: [
          {
            edgeIdA: "defect",
            edgeIdB: "partner",
            point: { x: 100, y: 100 },
            bridgeOwnerEdgeId: "defect",
          },
        ],
        diagnostics: [],
      },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [demand],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const completions = generateCrossingCompletionStates(state, evaluation, config, 2);
    expect(completions.length).toBeLessThanOrEqual(2);
    expect(completions.length).toBeGreaterThan(0);
    expect(completions.every((completion) => completion.exactDemands[0] === demand)).toBe(true);
  });

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

  it("emits one coordinated repair per edge-disjoint crossing component plus one batch", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 12 });
    const edges = ["a", "b", "c", "d"].map((id, index) => ({
      id,
      source: `S${index}`,
      target: `T${index}`,
      role: "forward" as const,
      reversed: false,
    }));
    const evalResult = {
      nodes: [
        { id: "S0", width: 80, height: 40, x: 40, y: 40 },
        { id: "T0", width: 80, height: 40, x: 40, y: 220 },
        { id: "S1", width: 80, height: 40, x: 280, y: 40 },
        { id: "T1", width: 80, height: 40, x: 280, y: 220 },
        { id: "S2", width: 80, height: 40, x: 520, y: 40 },
        { id: "T2", width: 80, height: 40, x: 520, y: 220 },
        { id: "S3", width: 80, height: 40, x: 760, y: 40 },
        { id: "T3", width: 80, height: 40, x: 760, y: 220 },
      ],
      routes: edges.map((edge) => makeRoute(edge.id, edge.source, edge.target)),
      classifiedEdges: edges,
      validation: {
        crossings: [
          { edgeIdA: "a", edgeIdB: "b", point: { x: 150, y: 150 } },
          { edgeIdA: "c", edgeIdB: "d", point: { x: 220, y: 150 } },
        ],
        diagnostics: [{ ids: ["a"] }, { ids: ["c"] }],
      },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const neighbors = generateNeighborhoodStates(state, evalResult, config);
    const repairAB = neighbors.find(
      (neighbor) => neighbor.sideAssignments.has("a") && neighbor.sideAssignments.has("b"),
    );
    const repairCD = neighbors.find(
      (neighbor) => neighbor.sideAssignments.has("c") && neighbor.sideAssignments.has("d"),
    );
    const batch = neighbors.find((neighbor) => neighbor.sideAssignments.size === 4);

    expect(repairAB).toBeDefined();
    expect(repairCD).toBeDefined();
    expect(batch).toBeDefined();
    expect(repairAB?.sideAssignments.get("a")).toBeDefined();
    expect(repairAB?.sideAssignments.get("b")).toBeDefined();
  });

  it("rejects an invalid mirrored partner and uses a candidate valid for that partner", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 12 });
    const primary = {
      id: "primary",
      source: "PS",
      target: "PT",
      role: "forward" as const,
      reversed: false,
    };
    const partner = {
      id: "partner",
      source: "QS",
      target: "QT",
      role: "forward" as const,
      reversed: false,
    };
    const nodes = [
      { id: "PS", width: 80, height: 40, x: 20, y: 20 },
      { id: "PT", width: 80, height: 40, x: 20, y: 220 },
      { id: "QS", width: 80, height: 40, x: 320, y: 20 },
      { id: "QT", width: 80, height: 40, x: 320, y: 220 },
      { id: "BLOCK", width: 18, height: 36, x: 295, y: 22 },
    ];
    const evalResult = {
      nodes,
      routes: [
        makeRoute(primary.id, primary.source, primary.target),
        makeRoute(partner.id, partner.source, partner.target),
      ],
      classifiedEdges: [primary, partner],
      validation: {
        crossings: [{ edgeIdA: primary.id, edgeIdB: partner.id, point: { x: 200, y: 150 } }],
        diagnostics: [{ ids: [primary.id] }],
      },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const repair = generateNeighborhoodStates(state, evalResult, config).find(
      (neighbor) =>
        neighbor.sideAssignments.has(primary.id) && neighbor.sideAssignments.has(partner.id),
    );
    const primaryAssignment = repair?.sideAssignments.get(primary.id);
    const partnerAssignment = repair?.sideAssignments.get(partner.id);
    expect(primaryAssignment).toBeDefined();
    expect(partnerAssignment).toBeDefined();

    const blindMirror = {
      srcSide: primaryAssignment!.tgtSide,
      tgtSide: primaryAssignment!.srcSide,
    };
    const positions = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
    const partnerCandidates = generatePortCandidates(
      partner,
      nodes.find((node) => node.id === partner.source)!,
      nodes.find((node) => node.id === partner.target)!,
      partner.role,
      positions,
      config,
      nodes,
    ).map((candidate) => `${candidate.srcSide}/${candidate.tgtSide}`);

    expect(partnerCandidates.includes(`${blindMirror.srcSide}/${blindMirror.tgtSide}`)).toBe(false);
    expect(
      partnerCandidates.includes(`${partnerAssignment!.srcSide}/${partnerAssignment!.tgtSide}`),
    ).toBe(true);
  });

  it("retains both ordinary-primary moves and an ordinary partner move beside feedback repair", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 16 });
    const evalResult = {
      routes: [
        makeRoute("ordinary-primary", "S0", "T0"),
        makeRoute("ordinary-partner", "S1", "T1"),
        makeRoute("feedback", "S2", "T2", "left", "left"),
        makeRoute("feedback-partner", "S3", "T3"),
      ],
      classifiedEdges: [
        {
          id: "ordinary-primary",
          source: "S0",
          target: "T0",
          role: "forward",
          reversed: false,
        },
        {
          id: "ordinary-partner",
          source: "S1",
          target: "T1",
          role: "forward",
          reversed: false,
        },
        { id: "feedback", source: "S2", target: "T2", role: "feedback", reversed: true },
        {
          id: "feedback-partner",
          source: "S3",
          target: "T3",
          role: "forward",
          reversed: false,
        },
      ],
      validation: {
        crossings: [
          {
            edgeIdA: "ordinary-primary",
            edgeIdB: "ordinary-partner",
            point: { x: 100, y: 100 },
          },
          {
            edgeIdA: "feedback",
            edgeIdB: "feedback-partner",
            point: { x: 200, y: 100 },
          },
        ],
        diagnostics: [{ ids: ["ordinary-primary"] }],
      },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const neighbors = generateNeighborhoodStates(state, evalResult, config);
    const ordinaryPrimaryMoves = neighbors.filter(
      (neighbor) =>
        neighbor.sideAssignments.size === 1 && neighbor.sideAssignments.has("ordinary-primary"),
    );

    expect(ordinaryPrimaryMoves).toHaveLength(2);
    expect(
      neighbors.some(
        (neighbor) =>
          neighbor.sideAssignments.size === 1 && neighbor.sideAssignments.has("feedback-partner"),
      ),
    ).toBe(true);
  });

  it("uses deterministic valid one-endpoint crossing candidates and leaves a feedback partner untouched", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 8 });
    const edges = [
      { id: "feedback", source: "S0", target: "T0", role: "feedback" as const, reversed: true },
      { id: "ordinary", source: "S1", target: "T1", role: "forward" as const, reversed: false },
    ];
    const base = {
      nodes: [
        { id: "S0", width: 80, height: 40, x: 240, y: 220 },
        { id: "T0", width: 80, height: 40, x: 40, y: 40 },
        { id: "S1", width: 80, height: 40, x: 60, y: 40 },
        { id: "T1", width: 80, height: 40, x: 320, y: 220 },
      ],
      routes: [
        makeRoute("feedback", "S0", "T0", "bottom", "top"),
        makeRoute("ordinary", "S1", "T1", "bottom", "top"),
      ],
      classifiedEdges: edges,
      validation: {
        crossings: [{ edgeIdA: "feedback", edgeIdB: "ordinary", point: { x: 180, y: 150 } }],
        diagnostics: [],
      },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;
    const reversed = {
      ...base,
      nodes: [...base.nodes].reverse(),
      routes: [...base.routes].reverse(),
      classifiedEdges: [...base.classifiedEdges].reverse(),
      validation: {
        ...base.validation,
        crossings: [...base.validation.crossings!].reverse(),
      },
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const neighbors = generateNeighborhoodStates(state, base, config);
    const reversedNeighbors = generateNeighborhoodStates(state, reversed, config);
    const repair = neighbors.find((neighbor) => neighbor.sideAssignments.has("feedback"));
    const feedbackAssignment = repair?.sideAssignments.get("feedback");

    expect(repair?.sideAssignments.has("ordinary")).toBe(false);
    expect(feedbackAssignment).toBeDefined();
    expect(feedbackAssignment).not.toEqual({ srcSide: "bottom", tgtSide: "top" });
    expect(assignmentSignature(neighbors)).toEqual(assignmentSignature(reversedNeighbors));
  });

  it("retains a two-candidate one-endpoint portfolio for diagnostic-only and demand-only edges", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 2 });
    const edge = {
      id: "diagnostic",
      source: "S",
      target: "T",
      role: "forward" as const,
      reversed: false,
    };
    const evalResult = {
      nodes: [
        { id: "S", width: 80, height: 40, x: 100, y: 40 },
        { id: "T", width: 80, height: 40, x: 100, y: 220 },
      ],
      routes: [makeRoute(edge.id, edge.source, edge.target)],
      classifiedEdges: [edge],
      validation: { crossings: [], diagnostics: [{ ids: [edge.id] }] },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [
        {
          kind: "rank-gap",
          rank: 0,
          affectedEdgeIds: [edge.id],
          minimum: 100,
          reason: "blocked-direct-badge",
        },
      ],
    } as unknown as ReturnType<typeof evaluateSearchState>;
    state.exactDemands = [...evalResult.exactDemands];

    const neighbors = generateNeighborhoodStates(state, evalResult, config);
    const assignments = neighbors
      .map((neighbor) => neighbor.sideAssignments.get(edge.id))
      .filter(
        (assignment): assignment is NonNullable<typeof assignment> => assignment !== undefined,
      );

    expect(assignments).toHaveLength(2);
    expect(
      assignments.map((assignment) =>
        changedEndpointCount(assignment, { srcSide: "bottom", tgtSide: "top" }),
      ),
    ).toEqual([1, 1]);
    expect(assignments[0].srcSide).toBe("bottom");
    expect(assignments[1].tgtSide).toBe("top");
  });

  it("keeps a clean feedback move within a strict capped, state-fair neighborhood", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 5 });
    const evalResult = {
      routes: [
        makeRoute("a", "S0", "T0"),
        makeRoute("b", "S1", "T1"),
        makeRoute("feedback", "S2", "T2", "left", "left"),
      ],
      classifiedEdges: [
        { id: "a", source: "S0", target: "T0", role: "forward", reversed: false },
        { id: "b", source: "S1", target: "T1", role: "forward", reversed: false },
        { id: "feedback", source: "S2", target: "T2", role: "feedback", reversed: true },
      ],
      validation: {
        crossings: [{ edgeIdA: "a", edgeIdB: "b", point: { x: 150, y: 150 } }],
        diagnostics: [{ ids: ["a"] }],
      },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const neighbors = generateNeighborhoodStates(state, evalResult, config);

    expect(neighbors.length).toBeLessThanOrEqual(config.maxNeighborsPerState);
    expect(neighbors.some((neighbor) => neighbor.sideAssignments.has("feedback"))).toBe(true);
  });

  it("reserves capped slots for coordinated, feedback, port-order, and layer-order moves", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 5 });
    const componentEdges = Array.from({ length: 10 }, (_, index) => ({
      id: `edge-${index.toString().padStart(2, "0")}`,
      source: `S${index}`,
      target: `T${index}`,
      role: "forward" as const,
      reversed: false,
    }));
    const feedback = {
      id: "feedback",
      source: "FS",
      target: "FT",
      role: "feedback" as const,
      reversed: true,
    };
    const routes = [
      ...componentEdges.map((edge) => makeRoute(edge.id, edge.source, edge.target)),
      makeRoute(feedback.id, feedback.source, feedback.target, "left", "left"),
    ];
    routes[0].sourcePort.nodeId = "SHARED";
    routes[1].sourcePort.nodeId = "SHARED";
    const evalResult = {
      routes,
      classifiedEdges: [...componentEdges, feedback],
      validation: {
        crossings: Array.from({ length: 5 }, (_, index) => ({
          edgeIdA: componentEdges[index * 2].id,
          edgeIdB: componentEdges[index * 2 + 1].id,
          point: { x: 100 + index * 10, y: 100 },
        })),
        diagnostics: [{ ids: [componentEdges[0].id] }],
      },
      nodeLayout: { orderedLayers: [[{ id: "L0" }, { id: "L1" }]] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const firstLevel = generateNeighborhoodStates(state, evalResult, config);
    const firstComponent = firstLevel.find((neighbor) => neighbor.sideAssignments.size === 2);
    expect(firstComponent).toBeDefined();
    const secondLevel = generateNeighborhoodStates(firstComponent!, evalResult, config);

    expect(firstLevel).toHaveLength(5);
    expect(firstLevel.some((neighbor) => neighbor.sideAssignments.size >= 2)).toBe(true);
    expect(firstLevel.some((neighbor) => neighbor.sideAssignments.has(feedback.id))).toBe(true);
    expect(firstLevel.some((neighbor) => Object.keys(neighbor.portOrders).length > 0)).toBe(true);
    expect(firstLevel.some((neighbor) => neighbor.layerOrders.size > 0)).toBe(true);
    expect(
      secondLevel.some(
        (neighbor) =>
          neighbor.sideAssignments.has("edge-02") && neighbor.sideAssignments.has("edge-03"),
      ),
    ).toBe(true);
  });

  it("keeps capped port and layer candidates deterministic when routes are reversed", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 5 });
    const routes = [
      makeRoute("a", "SHARED", "T0"),
      makeRoute("b", "SHARED", "T1"),
      makeRoute("c", "S2", "T2"),
      makeRoute("d", "S3", "T3"),
      makeRoute("feedback", "S4", "T4", "left", "left"),
    ];
    const classifiedEdges = [
      { id: "a", source: "SHARED", target: "T0", role: "forward" as const, reversed: false },
      { id: "b", source: "SHARED", target: "T1", role: "forward" as const, reversed: false },
      { id: "c", source: "S2", target: "T2", role: "forward" as const, reversed: false },
      { id: "d", source: "S3", target: "T3", role: "forward" as const, reversed: false },
      { id: "feedback", source: "S4", target: "T4", role: "feedback" as const, reversed: true },
    ];
    const evaluation = {
      routes,
      classifiedEdges,
      validation: {
        crossings: [
          { edgeIdA: "a", edgeIdB: "b", point: { x: 100, y: 100 } },
          { edgeIdA: "c", edgeIdB: "d", point: { x: 200, y: 100 } },
        ],
        diagnostics: [{ ids: ["a"] }],
      },
      nodeLayout: { orderedLayers: [[{ id: "L0" }, { id: "L1" }, { id: "L2" }]] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;
    const reversed = {
      ...evaluation,
      routes: [...routes].reverse(),
      classifiedEdges: [...classifiedEdges].reverse(),
      validation: {
        ...evaluation.validation,
        crossings: [...evaluation.validation.crossings!].reverse(),
      },
    } as unknown as ReturnType<typeof evaluateSearchState>;

    expect(stateSignatures(generateNeighborhoodStates(state, evaluation, config))).toEqual(
      stateSignatures(generateNeighborhoodStates(state, reversed, config)),
    );
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

  it("admits a capped priority edge from a child state on the next expansion level", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 16 });
    const edgeIds = Array.from(
      { length: 17 },
      (_, index) => `e-${index.toString().padStart(2, "0")}`,
    );
    const evalResult = {
      routes: [],
      classifiedEdges: edgeIds.map((id) => ({
        id,
        source: "A",
        target: "B",
        role: "forward" as const,
        reversed: false,
      })),
      validation: { crossings: [], diagnostics: [{ ids: edgeIds }] },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const firstLevel = generateNeighborhoodStates(state, evalResult, config);
    const secondLevel = generateNeighborhoodStates(firstLevel[0], evalResult, config);

    expect(firstLevel).toHaveLength(16);
    expect(firstLevel.some((neighbor) => neighbor.sideAssignments.has("e-16"))).toBe(false);
    expect(secondLevel.some((neighbor) => neighbor.sideAssignments.has("e-16"))).toBe(true);
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

  it("does not freeze implicit geometric port ordering while trying a side repair", () => {
    const state = createInitialSearchState();
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 2 });
    const evalResult = {
      routes: [makeRoute("e1", "A", "B")],
      classifiedEdges: [{ id: "e1", source: "A", target: "B", role: "forward", reversed: false }],
      validation: { crossings: [], diagnostics: [{ ids: ["e1"] }] },
      nodeLayout: { orderedLayers: [] },
      exactDemands: [],
    } as unknown as ReturnType<typeof evaluateSearchState>;

    const neighbors = generateNeighborhoodStates(state, evalResult, config);

    expect(neighbors).toHaveLength(2);
    expect(neighbors.every((neighbor) => Object.keys(neighbor.portOrders).length === 0)).toBe(true);
  });

  it("canonicalizes stale port orders before preserving them in side-move neighbors", () => {
    const state = createInitialSearchState();
    state.portOrders["A:bottom"] = ["removed:src", "e1:src"];
    const config = resolveCustomLayoutConfig({ maxNeighborsPerState: 4 });
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

    const sideMoveNeighbors = generateNeighborhoodStates(state, evalResult, config).filter(
      (neighbor) => neighbor.sideAssignments.has("e2"),
    );

    expect(sideMoveNeighbors).toHaveLength(2);
    for (const neighbor of sideMoveNeighbors) {
      expect(neighbor.portOrders["A:bottom"]).toEqual(["e1:src", "e2:src"]);
    }
  });
});
