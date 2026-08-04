import { describe, expect, it } from "bun:test";
import { CUSTOM_LAYOUT_SCENARIOS } from "./customLayoutScenarios";
import { computeGraphLayout } from "../../../engine/layout/layoutDispatcher";
import type { GraphDataset } from "../../../types/graphData";
import type { TestScenario } from "../types";

function toGraphDataset(scenario: TestScenario): GraphDataset {
  return {
    id: `scenario-${scenario.id}`,
    title: scenario.title,
    nodes: scenario.nodes.map((n) => ({ id: n.id, name: n.name })),
    edges: scenario.edges.map((e, i) => ({
      id: `e-${e.source}-${e.target}-${i}`,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: e.isCycle,
      layoutRole: e.layoutRole,
    })),
  };
}

describe("CUSTOM_LAYOUT_SCENARIOS", () => {
  it("defines all 20 plan-specified scenarios with valid IDs and non-empty metadata", () => {
    const scenarioKeys = Object.keys(CUSTOM_LAYOUT_SCENARIOS).map(Number);
    expect(scenarioKeys.length).toBe(20);

    for (let id = 1; id <= 20; id++) {
      const scenario = CUSTOM_LAYOUT_SCENARIOS[id];
      expect(scenario).toBeDefined();
      expect(scenario.id).toBe(id);
      expect(typeof scenario.title).toBe("string");
      expect(Array.isArray(scenario.nodes)).toBe(true);
      expect(Array.isArray(scenario.edges)).toBe(true);
    }
  });

  it("ensures all node IDs and edge source/target endpoints are valid within each scenario", () => {
    for (const scenario of Object.values(CUSTOM_LAYOUT_SCENARIOS)) {
      const nodeIds = new Set(scenario.nodes.map((n) => n.id));
      expect(nodeIds.size).toBe(scenario.nodes.length);

      for (const edge of scenario.edges) {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      }
    }
  });

  it("computes a v2 layered layout for every scenario without throwing", async () => {
    // Regression coverage for the full plan-specified scenario library against the real v2
    // dispatcher/engine (WASM), not just the static fixture shape asserted above — this is what
    // would have caught the v1 `dense_kubernetes_mesh` failure mode (docs/planning/layout-engine-v2/
    // 04-config-and-quality.md § 3a): an engine that returns `status !== "success"` on a fixture
    // instead of surfacing a diagnostic.
    for (const scenario of Object.values(CUSTOM_LAYOUT_SCENARIOS)) {
      const dataset = toGraphDataset(scenario);
      const result = await computeGraphLayout(dataset, "layered");

      expect(result.nodes).toHaveLength(scenario.nodes.length);
      expect(result.edges).toHaveLength(scenario.edges.length);
      for (const node of result.nodes) {
        expect(Number.isFinite(node.x)).toBe(true);
        expect(Number.isFinite(node.y)).toBe(true);
      }
    }
  });
});
