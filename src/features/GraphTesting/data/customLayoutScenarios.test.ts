import { describe, expect, it } from "bun:test";
import { CUSTOM_LAYOUT_SCENARIOS } from "./customLayoutScenarios";

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
});
