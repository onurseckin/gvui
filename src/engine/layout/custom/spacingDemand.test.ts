import { describe, expect, it } from "bun:test";
import { DEFAULT_CUSTOM_LAYOUT_CONFIG } from "./config";
import type { MeasuredBadge } from "./spacingDemand";
import { computeBadgeSpacingDemands, resolveEffectiveSpacingOverrides } from "./spacingDemand";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("spacingDemand", () => {
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
      const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B", label: "Same Rank Edge" }];
      const badgeMeasurements = new Map<string, MeasuredBadge>([
        ["e1", { width: 80, height: 28 }],
      ]);
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
      expect(requests[0].minimum).toBe(80 + 2 * DEFAULT_CUSTOM_LAYOUT_CONFIG.badgeClearance);
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
});
