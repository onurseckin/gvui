import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { generatePortCandidates } from "./portCandidates";
import type { NormalizedEdge, NormalizedNode, Point } from "./types";

describe("portCandidates", () => {
  it("generates 16 side pairs for a normal non-self edge", () => {
    const srcNode: NormalizedNode & Point = { id: "A", width: 100, height: 50, x: 0, y: 0 };
    const tgtNode: NormalizedNode & Point = { id: "B", width: 100, height: 50, x: 0, y: 200 };
    const edge: NormalizedEdge = { id: "e1", source: "A", target: "B" };

    const nodePositions = new Map<string, Point>([
      ["A", { x: 0, y: 0 }],
      ["B", { x: 0, y: 200 }],
    ]);

    const candidates = generatePortCandidates(edge, srcNode, tgtNode, "forward", nodePositions, resolveCustomLayoutConfig());

    expect(candidates.length).toBe(16);
  });

  it("assigns lowest base cost to bottom-to-top for a straight vertical forward edge", () => {
    const srcNode: NormalizedNode & Point = { id: "A", width: 100, height: 50, x: 100, y: 0 };
    const tgtNode: NormalizedNode & Point = { id: "B", width: 100, height: 50, x: 100, y: 200 };
    const edge: NormalizedEdge = { id: "e1", source: "A", target: "B" };

    const nodePositions = new Map<string, Point>([
      ["A", { x: 100, y: 0 }],
      ["B", { x: 100, y: 200 }],
    ]);

    const candidates = generatePortCandidates(edge, srcNode, tgtNode, "forward", nodePositions, resolveCustomLayoutConfig());
    const best = candidates.sort((a, b) => a.baseCost - b.baseCost)[0];

    expect(best.srcSide).toBe("bottom");
    expect(best.tgtSide).toBe("top");
  });
});
