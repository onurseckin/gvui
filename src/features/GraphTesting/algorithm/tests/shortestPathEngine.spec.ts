import { describe, expect, it } from "bun:test";
import { computeCustomLayout } from "../../../../engine/layout/custom";
import type { NormalizedEdge, NormalizedNode } from "../../../../engine/layout/custom/types";
import { CUSTOM_LAYOUT_SCENARIOS } from "../../data/customLayoutScenarios";

describe("CustomLayoutEngine Basic Tests", () => {
  it("should calculate basic layout result for test scenarios", () => {
    const scenario = CUSTOM_LAYOUT_SCENARIOS[3];
    const normalizedNodes: NormalizedNode[] = scenario.nodes.map((n) => ({
      id: n.id,
      label: n.name,
      width: n.w,
      height: n.h,
    }));
    const normalizedEdges: NormalizedEdge[] = scenario.edges.map((e, idx) => ({
      id: `e-${e.source}-${e.target}-${idx}`,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: e.isCycle,
    }));

    const result = computeCustomLayout(normalizedNodes, normalizedEdges);
    expect(Boolean(result.nodes && result.nodes.length > 0)).toBe(true);
    expect(result.edges.length).toBe(scenario.edges.length);
  });
});
