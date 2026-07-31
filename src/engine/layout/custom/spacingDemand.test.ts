import { describe, expect, it } from "bun:test";
import { DEFAULT_CUSTOM_LAYOUT_CONFIG } from "./config";
import type { MeasuredBadge } from "./spacingDemand";
import {
  canonicalizeExactSpacingDemands,
  computeBadgeSpacingDemands,
  requiredSameRankBadgeGap,
  resolveEffectiveSpacingOverrides,
} from "./spacingDemand";
import type { ExactSpacingDemand, NormalizedEdge, NormalizedNode } from "./types";

describe("spacingDemand", () => {
  it("reserves a same-rank badge corridor plus endpoint approach clearance", () => {
    expect(requiredSameRankBadgeGap(80, DEFAULT_CUSTOM_LAYOUT_CONFIG)).toBe(
      80 +
        Math.max(
          DEFAULT_CUSTOM_LAYOUT_CONFIG.nodeGap,
          2 * DEFAULT_CUSTOM_LAYOUT_CONFIG.badgeClearance +
            2 * DEFAULT_CUSTOM_LAYOUT_CONFIG.portStubLength,
        ),
    );
  });

  describe("computeBadgeSpacingDemands", () => {
    it("returns an empty array for an unlabeled graph", () => {
      const nodes: NormalizedNode[] = [
        { id: "A", width: 100, height: 40 },
        { id: "B", width: 100, height: 40 },
      ];
      const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B" }];
      const badgeMeasurements = new Map<string, MeasuredBadge>();
      const ranks = new Map<string, number>([
        ["A", 0],
        ["B", 1],
      ]);

      const requests = computeBadgeSpacingDemands(
        nodes,
        edges,
        badgeMeasurements,
        ranks,
        DEFAULT_CUSTOM_LAYOUT_CONFIG,
      );

      expect(requests).toEqual([]);
    });

    it("emits a node-gap request with reason same-rank-label for same-rank edge label", () => {
      const nodes: NormalizedNode[] = [
        { id: "A", width: 100, height: 40 },
        { id: "B", width: 100, height: 40 },
      ];
      const edges: NormalizedEdge[] = [
        { id: "e1", source: "A", target: "B", label: "Same Rank Edge" },
      ];
      const badgeMeasurements = new Map<string, MeasuredBadge>([["e1", { width: 80, height: 28 }]]);
      const ranks = new Map<string, number>([
        ["A", 0],
        ["B", 0],
      ]);

      const requests = computeBadgeSpacingDemands(
        nodes,
        edges,
        badgeMeasurements,
        ranks,
        DEFAULT_CUSTOM_LAYOUT_CONFIG,
      );

      expect(requests).toHaveLength(1);
      expect(requests[0].edgeId).toBe("e1");
      expect(requests[0].kind).toBe("node-gap");
      expect(requests[0].rank).toBe(0);
      expect(requests[0].reason).toBe("same-rank-label");
      expect(requests[0].minimum).toBe(requiredSameRankBadgeGap(80, DEFAULT_CUSTOM_LAYOUT_CONFIG));
    });

    it("emits rank-gap or node-gap requests for parallel edge labels", () => {
      const nodes: NormalizedNode[] = [
        { id: "A", width: 100, height: 40 },
        { id: "B", width: 100, height: 40 },
      ];
      const edges: NormalizedEdge[] = [
        { id: "e1", source: "A", target: "B", label: "Label 1" },
        { id: "e2", source: "A", target: "B", label: "Label 2" },
      ];
      const badgeMeasurements = new Map<string, MeasuredBadge>([
        ["e1", { width: 70, height: 28 }],
        ["e2", { width: 70, height: 28 }],
      ]);
      const ranks = new Map<string, number>([
        ["A", 0],
        ["B", 1],
      ]);

      const requests = computeBadgeSpacingDemands(
        nodes,
        edges,
        badgeMeasurements,
        ranks,
        DEFAULT_CUSTOM_LAYOUT_CONFIG,
      );

      expect(requests.length).toBeGreaterThan(0);
      const rankGapReqs = requests.filter((r) => r.kind === "rank-gap");
      expect(rankGapReqs.length).toBeGreaterThan(0);
      expect(rankGapReqs[0].reason).toBe("parallel-labels");
      expect(rankGapReqs[0].rank).toBe(0);
    });
  });

  describe("resolveEffectiveSpacingOverrides", () => {
    it("correctly merges requests into SpacingOverrides", () => {
      const requests = [
        {
          edgeId: "e1",
          kind: "node-gap" as const,
          rank: 0,
          minimum: 100,
          reason: "same-rank-label" as const,
        },
        {
          edgeId: "e2",
          kind: "node-gap" as const,
          rank: 0,
          minimum: 120,
          reason: "same-rank-label" as const,
        },
        {
          edgeId: "e3",
          kind: "node-gap" as const,
          afterNodeId: "A",
          minimum: 90,
          reason: "same-rank-label" as const,
        },
        {
          edgeId: "e4",
          kind: "rank-gap" as const,
          rank: 1,
          minimum: 150,
          reason: "parallel-labels" as const,
        },
      ];

      const overrides = resolveEffectiveSpacingOverrides(requests, 56, 120);

      expect(overrides.nodeGapByRank?.get(0)).toBe(120);
      expect(overrides.nodeGapAfterNodeId?.get("A")).toBe(90);
      expect(overrides.rankGapAfterRank?.get(1)).toBe(150);
    });
  });

  describe("canonicalizeExactSpacingDemands", () => {
    it("retains every unresolved label edge sharing an unchanged spacing scope", () => {
      const demands: ExactSpacingDemand[] = [
        {
          kind: "rank-gap",
          rank: 0,
          affectedEdgeIds: ["label-a"],
          minimum: 120,
          reason: "blocked-direct-badge",
        },
        {
          kind: "rank-gap",
          rank: 0,
          affectedEdgeIds: ["label-b"],
          minimum: 120,
          reason: "blocked-direct-badge",
        },
      ];

      expect(canonicalizeExactSpacingDemands(demands)).toEqual([
        {
          kind: "rank-gap",
          rank: 0,
          affectedEdgeIds: ["label-a", "label-b"],
          minimum: 120,
          reason: "blocked-direct-badge",
        },
      ]);
    });

    it("uses the same representative for equal minima regardless of request order", () => {
      const rankGap: ExactSpacingDemand = {
        kind: "rank-gap",
        rank: 0,
        affectedEdgeIds: ["rank-edge"],
        minimum: 120,
        reason: "parallel-labels",
      };
      const laneY: ExactSpacingDemand = {
        kind: "lane-y",
        rank: 0,
        affectedEdgeIds: ["lane-edge"],
        minimum: 120,
        reason: "same-rank-label",
      };

      expect(canonicalizeExactSpacingDemands([rankGap, laneY])).toEqual(
        canonicalizeExactSpacingDemands([laneY, rankGap]),
      );
    });
  });
});
