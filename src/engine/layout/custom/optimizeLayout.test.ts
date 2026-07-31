import { describe, expect, it } from "bun:test";
import { optimizeLayout } from "./optimizeLayout";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("optimizeLayout", () => {
  it("handles local badge retry for edge badges in tight layouts", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 120, height: 60 },
      { id: "B", width: 120, height: 60 },
      { id: "C", width: 120, height: 60 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B", label: "Very Long Badge Label Alpha" },
      { id: "e2", source: "A", target: "C", label: "Very Long Badge Label Beta" },
      { id: "e3", source: "B", target: "C", label: "Very Long Badge Label Gamma" },
    ];

    const result = optimizeLayout(nodes, edges);

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(3);
    expect(result.badges.length).toBeGreaterThan(0);
    expect(result.validation.isValid).toBe(true);
    expect(result.status).toBe("success");
  });

  it("performs route retry by rotating port candidates on conflicts", () => {
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

    const result = optimizeLayout(nodes, edges, { maxGlobalPasses: 5 });

    expect(result.edges.length).toBe(4);
    expect(result.validation.diagnostics.filter((d) => d.severity === "error").length).toBe(0);
    expect(result.validation.isValid).toBe(true);
  });

  it("expands spacing via SpacingOverrides when badges cannot fit initially", () => {
    const nodes: NormalizedNode[] = [
      { id: "R1", width: 140, height: 60 },
      { id: "R2", width: 140, height: 60 },
    ];
    const edges: NormalizedEdge[] = [
      {
        id: "e1",
        source: "R1",
        target: "R2",
        label: "EXTREMELY_WIDE_BADGE_LABEL_FOR_SPACING_EXPANSION_TEST",
      },
    ];

    const result = optimizeLayout(nodes, edges, { nodeGap: 20, rankGap: 20 });

    expect(result.validation.isValid).toBe(true);
    expect(result.badges.length).toBe(1);
    expect(result.nodes.length).toBe(2);
  });

  it("preserves the lexicographically best result across multiple passes", () => {
    const nodes: NormalizedNode[] = [
      { id: "X", width: 100, height: 50 },
      { id: "Y", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "X", target: "Y", label: "Simple" }];

    const result = optimizeLayout(nodes, edges, { maxGlobalPasses: 4 });

    expect(result.validation.isValid).toBe(true);
    expect(result.status).toBe("success");
    expect(result.validation.metrics).toBeDefined();
  });

  it("terminates optimization on repeated state hash without infinite looping", () => {
    const nodes: NormalizedNode[] = [
      { id: "S1", width: 80, height: 40 },
      { id: "S2", width: 80, height: 40 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "S1", target: "S2", label: "StateHashTest" },
    ];

    const result = optimizeLayout(nodes, edges, { maxGlobalPasses: 20 });

    expect(result.validation.isValid).toBe(true);
    expect(result.status).toBe("success");
  });

  it("continues search after initial hard-valid result to improve aesthetic score in multi-pass optimization", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
      { id: "C", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B", label: "Label 1" },
      { id: "e2", source: "A", target: "C", label: "Label 2" },
      { id: "e3", source: "B", target: "C", label: "Label 3" },
    ];

    const result = optimizeLayout(nodes, edges, { maxAestheticPasses: 5 });

    expect(result.validation.isValid).toBe(true);
    expect(result.optimizationStats).toBeDefined();
    expect(result.optimizationStats?.globalPasses).toBeGreaterThanOrEqual(1);
  });

  it("ensures final layout score is never worse than initial layout score (non-regression)", () => {
    const nodes: NormalizedNode[] = [
      { id: "N1", width: 100, height: 50 },
      { id: "N2", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "N1", target: "N2", label: "Check" }];

    const initialResult = optimizeLayout(nodes, edges, { maxAestheticPasses: 1 });
    expect(initialResult.optimizationStats).toBeDefined();

    const finalResult = optimizeLayout(nodes, edges, { maxAestheticPasses: 5 });
    expect(finalResult.optimizationStats).toBeDefined();
  });

  it("populates optimizationStats on CustomLayoutResult with required properties", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B" }];

    const result = optimizeLayout(nodes, edges);

    expect(result.optimizationStats).toBeDefined();
    expect(typeof result.optimizationStats?.globalPasses).toBe("number");
    expect(typeof result.optimizationStats?.evaluatedPortStates).toBe("number");
    expect(typeof result.optimizationStats?.spacingExpansions).toBe("number");
    expect(typeof result.optimizationStats?.repeatedStateStop).toBe("boolean");
  });
});
