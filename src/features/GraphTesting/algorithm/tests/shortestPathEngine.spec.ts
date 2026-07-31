import { describe, expect, it } from "bun:test";
import { TEST_SCENARIOS } from "../../data/testScenarios";
import { computeShortestPathLayout } from "../shortestPathEngine";

describe("ShortestPathEngine Ground Zero Tests", () => {
  it("should calculate basic layout result for test scenarios", () => {
    const result = computeShortestPathLayout(TEST_SCENARIOS[1]);
    expect(Boolean(result.nodes && result.nodes.length > 0)).toBe(true);
    expect(result.edges.length).toBe(TEST_SCENARIOS[1].edges.length);
    expect(result.badges.length).toBe(TEST_SCENARIOS[1].edges.length);
  });
});
