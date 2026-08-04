import { describe, expect, it } from "bun:test";
import {
  DEFAULT_CUSTOM_LAYOUT_CONFIG,
  LayoutConfigurationError,
  resolveCustomLayoutConfig,
  validateCustomLayoutConfig,
  type CustomLayoutConfig,
} from "./config";

/**
 * Every field of Rust's `CustomLayoutConfig`, camelCased as serde puts it on the wire, transcribed
 * from crates/gvui/src/0_common/0_2_config.rs.
 *
 * Transcribed rather than derived because the two sides are separate languages with no shared
 * schema: this list is the seam. A field added on one side and forgotten on the other is exactly
 * the failure it exists to catch, and it fails loudly here instead of silently dropping a knob on
 * the way through `resolve_custom_layout_config`.
 */
const RUST_CONFIG_FIELDS: string[] = [
  "direction",
  "nodeGap",
  "rankGap",
  "componentGap",
  "graphPadding",
  "laneSpacing",
  "portPitch",
  "portStubLength",
  "portEndpointPadding",
  "cornerRadius",
  "edgeStyle",
  "labelPlacement",
  "badgeClearance",
  "maxLabelWidth",
  "maxLabelLines",
  "minNodeWidth",
  "maxNodeWidth",
  "targetAspectRatio",
  "maxNodesPerRank",
  "balanceRanks",
  "bundleParallelEdges",
  "compaction",
  "flexiblePortSides",
  "flowSideBias",
  "straightShotAlignment",
  "sameRankPeerEdges",
  "crossingAwareLanes",
  "laneOrderMaxSegments",
  "portDestinationAffinity",
  "sideFaceCapacity",
  "ranker",
  "ordering",
  "orderingSweeps",
  "orderingSeeds",
  "coordinator",
  "bkAlign",
  "dummyPriority",
  "stressIterations",
  "stressIdealEdgeLength",
  "overlapRemovalPasses",
  "radialRingGap",
  "radialRoot",
  "timeBudgetMs",
  "maxDummyChainLength",
  "assertConstraints",
  "epsilon",
  "zoomSensitivity",
];

/** `null` when `fn` returned normally — lets a "does not throw" case use a declared matcher. */
function captureError(fn: () => void): unknown {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}

describe("CustomLayoutConfig mirrors the Rust struct", () => {
  it("declares exactly the fields Rust declares, no more and no fewer", () => {
    expect(Object.keys(DEFAULT_CUSTOM_LAYOUT_CONFIG).sort()).toEqual(
      [...RUST_CONFIG_FIELDS].sort(),
    );
  });

  it("carries the routing knobs with the Rust defaults", () => {
    expect(DEFAULT_CUSTOM_LAYOUT_CONFIG.flexiblePortSides).toBe(true);
    expect(DEFAULT_CUSTOM_LAYOUT_CONFIG.flowSideBias).toBe(1);
    expect(DEFAULT_CUSTOM_LAYOUT_CONFIG.straightShotAlignment).toBe(true);
    expect(DEFAULT_CUSTOM_LAYOUT_CONFIG.sameRankPeerEdges).toBe(true);
    expect(DEFAULT_CUSTOM_LAYOUT_CONFIG.crossingAwareLanes).toBe(true);
    expect(DEFAULT_CUSTOM_LAYOUT_CONFIG.laneOrderMaxSegments).toBe(1024);
    expect(DEFAULT_CUSTOM_LAYOUT_CONFIG.portDestinationAffinity).toBe(true);
    expect(DEFAULT_CUSTOM_LAYOUT_CONFIG.sideFaceCapacity).toBe(2);
  });

  it("defaults labelPlacement to on-edge so no badge needs a leader line", () => {
    expect(DEFAULT_CUSTOM_LAYOUT_CONFIG.labelPlacement).toBe("on-edge");
  });

  it("defaults direction to top-down, the single source of flow direction", () => {
    expect(DEFAULT_CUSTOM_LAYOUT_CONFIG.direction).toBe("top-down");
  });
});

describe("validateCustomLayoutConfig", () => {
  const base = (): CustomLayoutConfig => ({ ...DEFAULT_CUSTOM_LAYOUT_CONFIG });

  it("accepts the defaults", () => {
    expect(captureError(() => validateCustomLayoutConfig(base()))).toBeNull();
  });

  it("accepts flowSideBias of 0, which means 'price the side's corner honestly'", () => {
    expect(
      captureError(() => validateCustomLayoutConfig({ ...base(), flowSideBias: 0 })),
    ).toBeNull();
  });

  it("accepts a negative flowSideBias, which asks for side attachment despite its corner", () => {
    // The only signed knob in the config. A side attachment always costs one corner more than a
    // flow-face one, so nothing at or above zero can ever choose it; rejecting negatives would
    // leave the setting with no reachable effect at all.
    expect(
      captureError(() => validateCustomLayoutConfig({ ...base(), flowSideBias: -2 })),
    ).toBeNull();
  });

  it("rejects a non-finite flowSideBias", () => {
    const error = captureError(() =>
      validateCustomLayoutConfig({ ...base(), flowSideBias: Number.POSITIVE_INFINITY }),
    );
    expect(error instanceof LayoutConfigurationError).toBe(true);
  });
});

describe("resolveCustomLayoutConfig", () => {
  it("merges the v3 knobs over the defaults", () => {
    const resolved = resolveCustomLayoutConfig({
      flexiblePortSides: false,
      flowSideBias: 2.5,
      straightShotAlignment: false,
      sameRankPeerEdges: false,
      edgeStyle: "octilinear",
    });
    expect(resolved.flexiblePortSides).toBe(false);
    expect(resolved.flowSideBias).toBe(2.5);
    expect(resolved.straightShotAlignment).toBe(false);
    expect(resolved.sameRankPeerEdges).toBe(false);
    expect(resolved.edgeStyle).toBe("octilinear");
    // Untouched fields still come from the defaults.
    expect(resolved.direction).toBe(DEFAULT_CUSTOM_LAYOUT_CONFIG.direction);
  });

  it("ignores keys that are not config fields rather than copying them through", () => {
    // `bendPenalty` is a retired v1 knob an older client may still be sending. The index
    // signature is what lets the literal carry it without TS rejecting the excess property.
    const legacyPartial: Partial<CustomLayoutConfig> & Record<string, unknown> = {
      bendPenalty: 4,
    };
    const resolved = resolveCustomLayoutConfig(legacyPartial);
    expect(Object.keys(resolved).sort()).toEqual(Object.keys(DEFAULT_CUSTOM_LAYOUT_CONFIG).sort());
  });
});
