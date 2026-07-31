import { describe, expect, it } from "bun:test";
import { resolveCustomLayoutConfig } from "./config";
import { generatePortCandidates } from "./portCandidates";
import { assignPortSidesGlobally, enumeratePortAlternatives } from "./portAssignment";
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
      candidatesMap.set(
        e.id,
        generatePortCandidates(e, srcNode, targets[idx], "forward", nodePositions, config),
      );
    });

    const result = assignPortSidesGlobally(edges, candidatesMap, config);

    expect(result.assignments.size).toBe(3);
    const assignedSrcSides = Array.from(result.assignments.values()).map((a) => a.srcSide);
    expect(assignedSrcSides.length).toBe(3);
  });

  it("uses top, right, bottom, left before reusing a side for a high-degree hub with remote nodes in four quadrants", () => {
    const config = resolveCustomLayoutConfig({ sideReusePenalty: 100 });
    const hubNode: NormalizedNode & Point = { id: "Hub", width: 100, height: 50, x: 200, y: 200 };

    const remoteNodes: Record<string, NormalizedNode & Point> = {
      N_top: { id: "N_top", width: 100, height: 50, x: 200, y: 0 },
      N_right: { id: "N_right", width: 100, height: 50, x: 400, y: 200 },
      N_bottom: { id: "N_bottom", width: 100, height: 50, x: 200, y: 400 },
      N_left: { id: "N_left", width: 100, height: 50, x: 0, y: 200 },
    };

    const edges: NormalizedEdge[] = [
      { id: "e_top", source: "Hub", target: "N_top" },
      { id: "e_right", source: "Hub", target: "N_right" },
      { id: "e_bottom", source: "Hub", target: "N_bottom" },
      { id: "e_left", source: "Hub", target: "N_left" },
    ];

    const nodePositions = new Map<string, Point>([
      ["Hub", { x: 200, y: 200 }],
      ["N_top", { x: 200, y: 0 }],
      ["N_right", { x: 400, y: 200 }],
      ["N_bottom", { x: 200, y: 400 }],
      ["N_left", { x: 0, y: 200 }],
    ]);

    const candidatesMap = new Map();
    for (const e of edges) {
      const tgtNode = remoteNodes[e.target];
      const role =
        e.target === "N_top"
          ? "feedback"
          : e.target === "N_left" || e.target === "N_right"
            ? "cross"
            : "forward";
      candidatesMap.set(
        e.id,
        generatePortCandidates(e, hubNode, tgtNode, role, nodePositions, config),
      );
    }

    const result = assignPortSidesGlobally(edges, candidatesMap, config);

    const hubSrcSides = edges.map((e) => result.assignments.get(e.id)?.srcSide);
    const uniqueSides = new Set(hubSrcSides);

    expect(uniqueSides.size).toBe(4);
    expect(uniqueSides.has("top")).toBe(true);
    expect(uniqueSides.has("right")).toBe(true);
    expect(uniqueSides.has("bottom")).toBe(true);
    expect(uniqueSides.has("left")).toBe(true);
  });

  it("enumerates deduplicated port alternatives ordered by base cost up to limit excluding current assignment", () => {
    const srcNode: NormalizedNode & Point = { id: "A", width: 100, height: 50, x: 100, y: 0 };
    const tgtNode: NormalizedNode & Point = { id: "B", width: 100, height: 50, x: 100, y: 200 };
    const edge: NormalizedEdge = { id: "e1", source: "A", target: "B" };
    const config = resolveCustomLayoutConfig();
    const nodePositions = new Map<string, Point>([
      ["A", { x: 100, y: 0 }],
      ["B", { x: 100, y: 200 }],
    ]);

    const candidates = generatePortCandidates(
      edge,
      srcNode,
      tgtNode,
      "forward",
      nodePositions,
      config,
    );
    const current = { srcSide: "bottom" as const, tgtSide: "top" as const };

    const alternatives = enumeratePortAlternatives("e1", current, candidates, 3);

    expect(alternatives.length).toBe(3);
    expect(
      alternatives.some((alt) => alt.srcSide === "bottom" && alt.tgtSide === "top"),
    ).toBe(false);

    const keys = alternatives.map((a) => `${a.srcSide}:${a.tgtSide}`);
    expect(new Set(keys).size).toBe(3);
  });
});
