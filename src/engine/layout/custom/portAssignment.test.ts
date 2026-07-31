import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { generatePortCandidates } from "./portCandidates";
import { assignPortSidesGlobally } from "./portAssignment";
import type { NormalizedEdge, NormalizedNode, Point } from "./types";

describe("portAssignment", () => {
  it("assigns bottom-to-top side pair for a single forward edge", () => {
    const srcNode: NormalizedNode & Point = { id: "A", width: 100, height: 50, x: 100, y: 0 };
    const tgtNode: NormalizedNode & Point = { id: "B", width: 100, height: 50, x: 100, y: 200 };
    const edge: NormalizedEdge = { id: "e1", source: "A", target: "B" };
    const config = resolveCustomLayoutConfig();

    const nodePositions = new Map<string, Point>([
      ["A", { x: 100, y: 0 }],
      ["B", { x: 100, y: 200 }],
    ]);

    const candidatesMap = new Map([
      ["e1", generatePortCandidates(edge, srcNode, tgtNode, "forward", nodePositions, config)],
    ]);

    const result = assignPortSidesGlobally([edge], candidatesMap, config);

    expect(result.assignments.get("e1")?.srcSide).toBe("bottom");
    expect(result.assignments.get("e1")?.tgtSide).toBe("top");
  });

  it("spreads multiple fan-out edges across sides when side reuse penalty is high", () => {
    const srcNode: NormalizedNode & Point = { id: "A", width: 100, height: 50, x: 200, y: 0 };
    const config = resolveCustomLayoutConfig({ sideReusePenalty: 1000 });

    const targets: (NormalizedNode & Point)[] = [
      { id: "B1", width: 100, height: 50, x: 0, y: 200 },
      { id: "B2", width: 100, height: 50, x: 200, y: 200 },
      { id: "B3", width: 100, height: 50, x: 400, y: 200 },
    ];

    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B1" },
      { id: "e2", source: "A", target: "B2" },
      { id: "e3", source: "A", target: "B3" },
    ];

    const nodePositions = new Map<string, Point>([
      ["A", { x: 200, y: 0 }],
      ["B1", { x: 0, y: 200 }],
      ["B2", { x: 200, y: 200 }],
      ["B3", { x: 400, y: 200 }],
    ]);

    const candidatesMap = new Map();
    edges.forEach((e, idx) => {
      candidatesMap.set(e.id, generatePortCandidates(e, srcNode, targets[idx], "forward", nodePositions, config));
    });

    const result = assignPortSidesGlobally(edges, candidatesMap, config);

    expect(result.assignments.size).toBe(3);
    const assignedSrcSides = Array.from(result.assignments.values()).map((a) => a.srcSide);
    expect(assignedSrcSides.length).toBe(3);
  });
});
