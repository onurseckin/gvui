import { describe, expect, it } from "bun:test";
import { computeCustomLayout } from "./computeCustomLayout";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("computeCustomLayout", () => {
  it("computes complete layout result with node positions, edge routes, and validation metrics", async () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B" }];

    const result = await computeCustomLayout(nodes, edges);

    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(1);
    expect(result.validation.isValid).toBe(true);
    expect(result.status).toBe("success");
  });

  it("routes public engine through optimizer to resolve route and badge conflicts in multi-pass pipeline", async () => {
    const nodes: NormalizedNode[] = [
      { id: "N1", width: 100, height: 50 },
      { id: "N2", width: 100, height: 50 },
      { id: "N3", width: 100, height: 50 },
      { id: "N4", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "N1", target: "N3", label: "Route1" },
      { id: "e2", source: "N2", target: "N4", label: "Route2" },
      { id: "e3", source: "N1", target: "N4", label: "Route3" },
      { id: "e4", source: "N2", target: "N3", label: "Route4" },
    ];

    const result = await computeCustomLayout(nodes, edges, { maxGlobalPasses: 5 });

    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(4);
    expect(result.badges).toHaveLength(4);
    expect(result.validation.isValid).toBe(true);
    expect(result.status).toBe("unresolved_soft_conflicts");
    expect(Array.isArray(result.crossings)).toBe(true);
  });

  it("exercises maxGlobalPasses bound and returns best historical layout on failure", async () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 400, height: 400 },
      { id: "B", width: 400, height: 400 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B", label: "HUGE_LABEL_INSIDE_TIGHT_CLEARANCE_1" },
      { id: "e2", source: "A", target: "B", label: "HUGE_LABEL_INSIDE_TIGHT_CLEARANCE_2" },
      { id: "e3", source: "A", target: "B", label: "HUGE_LABEL_INSIDE_TIGHT_CLEARANCE_3" },
    ];

    const result = await computeCustomLayout(nodes, edges, {
      nodeGap: 2,
      rankGap: 2,
      badgeClearance: 100,
      maxGlobalPasses: 1,
      maxBadgeCandidatesPerEdge: 1,
      maxBadgeBacktrackSteps: 1,
    });

    expect(result).toBeDefined();
    expect(result.nodes).toHaveLength(2);
    expect(result.status).toBe("unresolved_soft_conflicts");
    expect(result.validation.isValid).toBe(true);
  });

  it("forwards optimizationStats on CustomLayoutResult", async () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B" }];

    const result = await computeCustomLayout(nodes, edges);

    expect(result.optimizationStats).toBeDefined();
    expect(result.optimizationStats?.globalPasses).toBeGreaterThanOrEqual(1);
    expect(typeof result.optimizationStats?.evaluatedPortStates).toBe("number");
    expect(typeof result.optimizationStats?.spacingExpansions).toBe("number");
    expect(typeof result.optimizationStats?.repeatedStateStop).toBe("boolean");
  });
});
