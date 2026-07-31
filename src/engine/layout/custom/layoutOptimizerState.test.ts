import { describe, expect, it } from "bun:test";
import { CUSTOM_LAYOUT_SCENARIOS } from "../../../features/GraphTesting/data/customLayoutScenarios";
import { resolveCustomLayoutConfig } from "./config";
import { computeCustomLayout } from "./computeCustomLayout";
import { searchBestLayoutState } from "./layoutOptimizerState";
import { createInitialSearchState } from "./searchState";
import { evaluateSearchState } from "./stateEvaluator";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("layoutOptimizerState", () => {
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

  it("does not retain Scenario #20's badge-spacing demand below the current effective rank gap", () => {
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

    expect(evaluation.exactDemands).toEqual([]);
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
