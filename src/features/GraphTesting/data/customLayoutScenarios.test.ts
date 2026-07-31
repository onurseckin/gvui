import { describe, expect, it } from "bun:test";
import { CUSTOM_LAYOUT_SCENARIOS } from "./customLayoutScenarios";

describe("CUSTOM_LAYOUT_SCENARIOS", () => {
  it("exports a non-empty record of test scenarios", () => {
    expect(CUSTOM_LAYOUT_SCENARIOS).toBeDefined();
    const scenarioKeys = Object.keys(CUSTOM_LAYOUT_SCENARIOS);
    expect(scenarioKeys.length).toBeGreaterThan(0);
  });

  it("contains required scenarios #1 through #5 ordered complex to basic", () => {
    expect(CUSTOM_LAYOUT_SCENARIOS[1]).toBeDefined();
    expect(CUSTOM_LAYOUT_SCENARIOS[1].title.includes("Full Microservice Mesh")).toBe(true);

    expect(CUSTOM_LAYOUT_SCENARIOS[2]).toBeDefined();
    expect(CUSTOM_LAYOUT_SCENARIOS[2].title.includes("Fan-Out")).toBe(true);

    expect(CUSTOM_LAYOUT_SCENARIOS[3]).toBeDefined();
    expect(CUSTOM_LAYOUT_SCENARIOS[3].title.includes("Diamond")).toBe(true);

    expect(CUSTOM_LAYOUT_SCENARIOS[4]).toBeDefined();
    expect(CUSTOM_LAYOUT_SCENARIOS[4].title.includes("Feedback Loop")).toBe(true);

    expect(CUSTOM_LAYOUT_SCENARIOS[5]).toBeDefined();
    expect(CUSTOM_LAYOUT_SCENARIOS[5].title.includes("Two-Node")).toBe(true);
  });

  it("verifies all test scenarios load cleanly with non-empty nodes and edges", () => {
    for (const [keyStr, scenario] of Object.entries(CUSTOM_LAYOUT_SCENARIOS)) {
      const scenarioKey = Number(keyStr);
      expect(scenario.id).toBe(scenarioKey);
      expect(typeof scenario.title).toBe("string");
      expect(scenario.title.length).toBeGreaterThan(0);

      expect(Array.isArray(scenario.nodes)).toBe(true);
      expect(scenario.nodes.length).toBeGreaterThan(0);

      expect(Array.isArray(scenario.edges)).toBe(true);
      expect(scenario.edges.length).toBeGreaterThan(0);

      const nodeIds = new Set<string>();
      for (const node of scenario.nodes) {
        expect(typeof node.id).toBe("string");
        expect(node.id.length).toBeGreaterThan(0);
        expect(nodeIds.has(node.id)).toBe(false);
        nodeIds.add(node.id);

        expect(typeof node.name).toBe("string");
        expect(typeof node.desc).toBe("string");
        expect(typeof node.x).toBe("number");
        expect(typeof node.y).toBe("number");
        expect(typeof node.w).toBe("number");
        expect(node.w).toBeGreaterThan(0);
        expect(typeof node.h).toBe("number");
        expect(node.h).toBeGreaterThan(0);
      }

      for (const edge of scenario.edges) {
        expect(typeof edge.source).toBe("string");
        expect(typeof edge.target).toBe("string");
        expect(typeof edge.label).toBe("string");
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      }
    }
  });
});
