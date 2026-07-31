import { describe, expect, it } from "bun:test";
import {
  DEFAULT_CUSTOM_LAYOUT_CONFIG,
  LayoutConfigurationError,
  resolveCustomLayoutConfig,
} from "./config";

describe("CustomLayoutConfig", () => {
  it("provides valid default configuration values", () => {
    const config = DEFAULT_CUSTOM_LAYOUT_CONFIG;
    expect(config.nodeGap).toBeGreaterThan(0);
    expect(config.rankGap).toBeGreaterThan(0);
    expect(config.portStubLength).toBeGreaterThan(0);
    expect(config.obstacleClearance).toBeGreaterThan(0);
    expect(config.laneSpacing).toBeGreaterThan(0);
    expect(config.badgeClearance).toBeGreaterThan(0);
    expect(config.bendPenalty).toBeGreaterThanOrEqual(0);
    expect(config.crossingPenalty).toBeGreaterThanOrEqual(0);
    expect(config.directionPenalty).toBeGreaterThanOrEqual(0);
    expect(config.sideReusePenalty).toBeGreaterThanOrEqual(0);
    expect(config.nearObstaclePenalty).toBeGreaterThanOrEqual(0);
  });

  it("merges partial configuration over defaults without mutating defaults", () => {
    const originalNodeGap = DEFAULT_CUSTOM_LAYOUT_CONFIG.nodeGap;
    const resolved = resolveCustomLayoutConfig({ nodeGap: 100 });

    expect(resolved.nodeGap).toBe(100);
    expect(resolved.rankGap).toBe(DEFAULT_CUSTOM_LAYOUT_CONFIG.rankGap);
    expect(DEFAULT_CUSTOM_LAYOUT_CONFIG.nodeGap).toBe(originalNodeGap);
  });

  it("throws LayoutConfigurationError for non-positive gap dimensions", () => {
    expect(() => resolveCustomLayoutConfig({ nodeGap: 0 })).toThrow(LayoutConfigurationError);
    expect(() => resolveCustomLayoutConfig({ rankGap: -10 })).toThrow(LayoutConfigurationError);
    expect(() => resolveCustomLayoutConfig({ portStubLength: -5 })).toThrow(LayoutConfigurationError);
    expect(() => resolveCustomLayoutConfig({ obstacleClearance: 0 })).toThrow(LayoutConfigurationError);
    expect(() => resolveCustomLayoutConfig({ laneSpacing: 0 })).toThrow(LayoutConfigurationError);
    expect(() => resolveCustomLayoutConfig({ badgeClearance: -1 })).toThrow(LayoutConfigurationError);
    expect(() => resolveCustomLayoutConfig({ maxBadgeCandidatesPerEdge: 0 })).toThrow(LayoutConfigurationError);
    expect(() => resolveCustomLayoutConfig({ maxBadgeBacktrackSteps: -5 })).toThrow(LayoutConfigurationError);
  });

  it("throws LayoutConfigurationError for negative cost penalties", () => {
    expect(() => resolveCustomLayoutConfig({ bendPenalty: -1 })).toThrow(LayoutConfigurationError);
    expect(() => resolveCustomLayoutConfig({ crossingPenalty: -100 })).toThrow(LayoutConfigurationError);
    expect(() => resolveCustomLayoutConfig({ directionPenalty: -1 })).toThrow(LayoutConfigurationError);
    expect(() => resolveCustomLayoutConfig({ sideReusePenalty: -1 })).toThrow(LayoutConfigurationError);
    expect(() => resolveCustomLayoutConfig({ nearObstaclePenalty: -1 })).toThrow(LayoutConfigurationError);
  });
});
