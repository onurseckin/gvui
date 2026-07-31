import { describe, expect, test } from "bun:test";
import { compareLayoutScore, countPathHairpins } from "./layoutObjective";
import type { LayoutScore } from "./types";

function score(overrides: Partial<LayoutScore> = {}): LayoutScore {
  return {
    hardErrorCount: 0,
    nodeNodeOverlaps: 0,
    edgeNodePenetrations: 0,
    sharedEdgeSegmentLength: 0,
    badgeNodeOverlaps: 0,
    badgeBadgeOverlaps: 0,
    badgeUnrelatedEdgeOverlaps: 0,
    crossingCount: 0,
    ordinaryLeaderCount: 0,
    hairpinCount: 0,
    bendCount: 0,
    directionDeviationPenalty: 0,
    totalLength: 0,
    portSideImbalance: 0,
    feedbackLeaderCount: 0,
    totalLeaderLength: 0,
    totalArea: 0,
    stateHash: "",
    ...overrides,
  };
}

describe("layoutObjective", () => {
  test("prefers zero crossings over any reduction in length or area", () => {
    const crossingFree = score({ totalLength: 100000, totalArea: 10000000 });
    const compactWithCrossing = score({ crossingCount: 1, totalLength: 10, totalArea: 100 });
    expect(compareLayoutScore(crossingFree, compactWithCrossing)).toBeLessThan(0);
  });

  test("prefers no ordinary leader over fewer bends", () => {
    const direct = score({ bendCount: 10 });
    const leader = score({ ordinaryLeaderCount: 1, bendCount: 0 });
    expect(compareLayoutScore(direct, leader)).toBeLessThan(0);
  });

  test("uses area only after route and port aesthetics tie", () => {
    const small = score({ totalArea: 100 });
    const large = score({ totalArea: 200 });
    expect(compareLayoutScore(small, large)).toBeLessThan(0);
  });

  test("counts U-shaped axis reversals as hairpins", () => {
    expect(
      countPathHairpins([
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 20 },
        { x: 10, y: 20 },
      ]),
    ).toBe(1);
  });

  test("does not count a normal L route as a hairpin", () => {
    expect(
      countPathHairpins([
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 20 },
      ]),
    ).toBe(0);
  });
});
