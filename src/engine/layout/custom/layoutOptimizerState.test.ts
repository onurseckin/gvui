import { describe, expect, it } from "bun:test";
import { CUSTOM_LAYOUT_SCENARIOS } from "../../../features/GraphTesting/data/customLayoutScenarios";
import { resolveCustomLayoutConfig } from "./config";
import { computeCustomLayout } from "./computeCustomLayout";
import { deriveSearchStateBudgets, searchBestLayoutState } from "./layoutOptimizerState";
import { generateNeighborhoodStates } from "./neighborhoodSearch";
import { createInitialSearchState } from "./searchState";
import { evaluateSearchState } from "./stateEvaluator";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("layoutOptimizerState", () => {
  it("derives a structural conflict-permutation cap without shrinking other budgets", () => {
    const nodes: NormalizedNode[] = Array.from({ length: 6 }, (_, index) => ({
      id: `n${index}`,
      width: 100,
      height: 50,
    }));
    const denseEdges: NormalizedEdge[] = Array.from({ length: 15 }, (_, index) => ({
      id: `e${index}`,
      source: `n${Math.floor(index / 3)}`,
      target: `n${Math.floor(index / 3) + 1}`,
    }));
    const config = resolveCustomLayoutConfig();

    expect(deriveSearchStateBudgets(nodes, denseEdges, config)).toEqual({
      maxLayoutStates: 50,
      maxAestheticEvaluations: 12,
      maxAStarStatesPerRoute: 2000,
      maxConflictPermutations: 1,
    });
    expect(
      deriveSearchStateBudgets(
        nodes,
        denseEdges,
        resolveCustomLayoutConfig({ maxLayoutStates: 10 }),
      ),
    ).toEqual({
      maxLayoutStates: 10,
      maxAestheticEvaluations: 12,
      maxAStarStatesPerRoute: 2000,
      maxConflictPermutations: 1,
    });

    expect(deriveSearchStateBudgets(nodes, [], config)).toEqual({
      maxLayoutStates: 50,
      maxAestheticEvaluations: 12,
      maxAStarStatesPerRoute: 2000,
      maxConflictPermutations: 32,
    });

    const feedbackRichEdges = Array.from(
      { length: 11 },
      (_, index): NormalizedEdge => ({
        id: `feedback-${index}`,
        source: `n${index % 6}`,
        target: `n${(index + 1) % 6}`,
        isCycle: index < 3,
        layoutRole: index < 3 ? "feedback" : undefined,
      }),
    );
    expect(deriveSearchStateBudgets(nodes, feedbackRichEdges, config)).toEqual({
      maxLayoutStates: 50,
      maxAestheticEvaluations: 12,
      maxAStarStatesPerRoute: 2000,
      maxConflictPermutations: 1,
    });
    expect(
      deriveSearchStateBudgets(
        nodes,
        denseEdges,
        resolveCustomLayoutConfig({ maxConflictPermutations: 1 }),
      ),
    ).toEqual({
      maxLayoutStates: 50,
      maxAestheticEvaluations: 12,
      maxAStarStatesPerRoute: 2000,
      maxConflictPermutations: 1,
    });
  });

  it("runs Best-First Search returning best evaluation and stats", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B" }];

    const config = resolveCustomLayoutConfig({ maxLayoutStates: 10 });
    const result = searchBestLayoutState(nodes, edges, config);

    expect(result.bestState).toBeDefined();
    expect(result.bestEvaluation.validation.isValid).toBe(true);
    expect(result.stats.totalEvaluatedStates).toBeGreaterThan(0);
  });

  it("keeps public layout results deterministic by excluding wall-clock duration", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B" }];

    const result = computeCustomLayout(nodes, edges);

    expect(result.optimizationStats?.durationMs).toBe(undefined);
  });

  it("does not mutate a candidate's side assignments while applying badge spacing", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B", label: "long label" }];
    const state = createInitialSearchState();
    state.sideAssignments.set("e1", { srcSide: "left", tgtSide: "left" });

    evaluateSearchState(nodes, edges, state, resolveCustomLayoutConfig({ rankGap: 10 }));

    expect(state.sideAssignments.get("e1")).toEqual({ srcSide: "left", tgtSide: "left" });
  });

  it("keeps assigned port sides while applying newly discovered badge spacing", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B", label: "long label" }];
    const state = createInitialSearchState();
    state.sideAssignments.set("e1", { srcSide: "left", tgtSide: "left" });

    const evaluation = evaluateSearchState(
      nodes,
      edges,
      state,
      resolveCustomLayoutConfig({ rankGap: 10 }),
    );

    expect(evaluation.exactDemands).toHaveLength(1);
    expect(evaluation.routes[0]?.sourcePort.side).toBe("left");
    expect(evaluation.routes[0]?.targetPort.side).toBe("left");
  });

  it("reproduces the selected state's geometry and validation", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B", label: "long label" }];
    const initialState = createInitialSearchState();
    initialState.sideAssignments.set("e1", { srcSide: "left", tgtSide: "left" });
    const config = resolveCustomLayoutConfig({ rankGap: 10, maxLayoutStates: 5 });

    const result = searchBestLayoutState(nodes, edges, config, { initialState });
    const reproduced = evaluateSearchState(nodes, edges, result.bestState, config);

    expect(reproduced.routes).toEqual(result.bestEvaluation.routes);
    expect(reproduced.badges).toEqual(result.bestEvaluation.badges);
    expect(reproduced.validation).toEqual(result.bestEvaluation.validation);
  });

  it("retains Scenario #20 badge-spacing metadata even when the effective rank gap is unchanged", () => {
    const scenario = CUSTOM_LAYOUT_SCENARIOS[20];
    const nodes: NormalizedNode[] = scenario.nodes.map((node) => ({
      id: node.id,
      label: node.name,
      width: node.w,
      height: node.h,
    }));
    const edges: NormalizedEdge[] = scenario.edges.map((edge, index) => ({
      id: `e-${edge.source}-${edge.target}-${index}`,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      isCycle: edge.isCycle,
      layoutRole: edge.layoutRole,
    }));

    const evaluation = evaluateSearchState(
      nodes,
      edges,
      createInitialSearchState(),
      resolveCustomLayoutConfig(),
    );

    expect(evaluation.exactDemands).toEqual([
      {
        kind: "rank-gap",
        rank: 1,
        affectedEdgeIds: ["e-AUTH-CACHE-3", "e-ORDER-DB-8", "e-USER-PAY-5"],
        minimum: 88,
        reason: "blocked-direct-badge",
      },
    ]);
  });

  it("emits an explicit reset when an assigned Scenario #20 route still blocks its badge", () => {
    const scenario = CUSTOM_LAYOUT_SCENARIOS[20];
    const nodes: NormalizedNode[] = scenario.nodes.map((node) => ({
      id: node.id,
      label: node.name,
      width: node.w,
      height: node.h,
    }));
    const edges: NormalizedEdge[] = scenario.edges.map((edge, index) => ({
      id: `e-${edge.source}-${edge.target}-${index}`,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      isCycle: edge.isCycle,
      layoutRole: edge.layoutRole,
    }));
    const state = createInitialSearchState();
    state.sideAssignments.set("e-ORDER-DB-8", { srcSide: "left", tgtSide: "left" });
    const config = resolveCustomLayoutConfig();

    const evaluation = evaluateSearchState(nodes, edges, state, config);

    expect(
      evaluation.validation.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === "MISSING_BADGE" && diagnostic.ids.includes("e-ORDER-DB-8"),
      ),
    ).toBe(true);
    expect(evaluation.resetSideAssignments).toBe(true);

    const resetNeighbors = generateNeighborhoodStates(state, evaluation, config).filter(
      (neighbor) => neighbor.sideAssignments.size === 0,
    );
    expect(resetNeighbors).toHaveLength(1);
    expect(resetNeighbors[0]?.exactDemands).toEqual(evaluation.exactDemands);
  });

  it("merges every actionable badge-spacing request from one evaluation", () => {
    const nodes: NormalizedNode[] = ["A", "B", "C", "D"].map((id) => ({
      id,
      width: 100,
      height: 50,
    }));
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B", label: "long label one" },
      { id: "e2", source: "B", target: "C" },
      { id: "e3", source: "C", target: "D", label: "long label two" },
    ];

    const evaluation = evaluateSearchState(
      nodes,
      edges,
      createInitialSearchState(),
      resolveCustomLayoutConfig({ rankGap: 10 }),
    );

    expect(evaluation.exactDemands).toHaveLength(2);
    expect(evaluation.exactDemands[0].affectedEdgeIds).toEqual(["e1"]);
    expect(evaluation.exactDemands[0].kind).toBe("rank-gap");
    expect(evaluation.exactDemands[0].rank).toBe(0);
    expect(evaluation.exactDemands[1].affectedEdgeIds).toEqual(["e3"]);
    expect(evaluation.exactDemands[1].kind).toBe("rank-gap");
    expect(evaluation.exactDemands[1].rank).toBe(2);
  });
});
