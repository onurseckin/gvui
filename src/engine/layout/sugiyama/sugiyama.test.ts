import { describe, expect, it } from "bun:test";
import {
  assignCoordinates,
  assignRanksAndDummyNodes,
  computeSugiyamaLayout,
  countCrossingsBetweenRanks,
  countTotalCrossings,
  decycleGraph,
  reduceCrossings,
  type SugiyamaEdge,
  type SugiyamaNode,
} from "./index";

describe("Sugiyama Phase 1: Decycle", () => {
  it("leaves acyclic DAG edges unchanged", () => {
    const nodes: SugiyamaNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
      { id: "C", width: 100, height: 50 },
    ];
    const edges: SugiyamaEdge[] = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "C" },
    ];

    const res = decycleGraph(nodes, edges);
    expect(res.reversedEdgeIds.size).toBe(0);
    expect(res.edges[0]!.source).toBe("A");
    expect(res.edges[0]!.target).toBe("B");
  });

  it("detects and reverses back-edges in cycles, then restores them", () => {
    const nodes: SugiyamaNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
      { id: "C", width: 100, height: 50 },
    ];
    const edges: SugiyamaEdge[] = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "C" },
      { id: "e3", source: "C", target: "A" }, // cycle!
    ];

    const res = decycleGraph(nodes, edges);
    expect(res.reversedEdgeIds.size).toBe(1);
    expect(res.reversedEdgeIds.has("e3")).toBe(true);

    // Reversed edge in DAG
    const e3 = res.edges.find((e) => e.id === "e3");
    expect(e3?.source).toBe("A");
    expect(e3?.target).toBe("C");
    expect(e3?.isReversed).toBe(true);

    // Restore test
    const restored = res.restore(res.edges);
    const restoredE3 = restored.find((e) => e.id === "e3");
    expect(restoredE3?.source).toBe("C");
    expect(restoredE3?.target).toBe("A");
    expect(restoredE3?.isCycle).toBe(true);
  });
});

describe("Sugiyama Phase 2: Ranking & Dummy Nodes", () => {
  it("assigns topological ranks correctly", () => {
    const nodes: SugiyamaNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
      { id: "C", width: 100, height: 50 },
    ];
    const edges: SugiyamaEdge[] = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "C" },
    ];

    const res = assignRanksAndDummyNodes(nodes, edges);
    expect(res.ranks.length).toBe(3);
    expect(res.ranks[0]![0]!.id).toBe("A");
    expect(res.ranks[1]![0]!.id).toBe("B");
    expect(res.ranks[2]![0]!.id).toBe("C");
  });

  it("inserts virtual dummy nodes for edges spanning multiple ranks", () => {
    const nodes: SugiyamaNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
      { id: "C", width: 100, height: 50 },
    ];
    const edges: SugiyamaEdge[] = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "C" },
      { id: "e3", source: "A", target: "C" }, // spans rank 0 -> 2
    ];

    const res = assignRanksAndDummyNodes(nodes, edges);
    expect(res.dummyNodes.length).toBe(1);
    expect(res.dummyNodes[0]!.rank).toBe(1);
    expect(res.dummyNodes[0]!.isVirtual).toBe(true);
    expect(res.dummyNodes[0]!.originalEdgeId).toBe("e3");
  });
});

describe("Sugiyama Phase 3: Crossing Reduction", () => {
  it("measures edge crossings accurately", () => {
    const rank0: SugiyamaNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const rank1: SugiyamaNode[] = [
      { id: "C", width: 100, height: 50 },
      { id: "D", width: 100, height: 50 },
    ];
    // Crossing edges: A -> D, B -> C
    const edges: SugiyamaEdge[] = [
      { id: "e1", source: "A", target: "D" },
      { id: "e2", source: "B", target: "C" },
    ];

    expect(countCrossingsBetweenRanks(rank0, rank1, edges)).toBe(1);
    expect(countTotalCrossings([rank0, rank1], edges)).toBe(1);
  });

  it("reduces edge crossings using barycenter and 2-opt swaps", () => {
    const rank0: SugiyamaNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const rank1: SugiyamaNode[] = [
      { id: "C", width: 100, height: 50 },
      { id: "D", width: 100, height: 50 },
    ];
    const edges: SugiyamaEdge[] = [
      { id: "e1", source: "A", target: "D" },
      { id: "e2", source: "B", target: "C" },
    ];

    const res = reduceCrossings([rank0, rank1], edges, 10);
    expect(res.crossings).toBe(0);
  });
});

describe("Sugiyama Phase 4 & Full Pipeline", () => {
  it("computes full 4-phase Sugiyama layout", () => {
    const nodes: SugiyamaNode[] = [
      { id: "start", width: 120, height: 60 },
      { id: "task1", width: 120, height: 60 },
      { id: "task2", width: 120, height: 60 },
      { id: "end", width: 120, height: 60 },
    ];
    const edges: SugiyamaEdge[] = [
      { id: "e1", source: "start", target: "task1" },
      { id: "e2", source: "start", target: "task2" },
      { id: "e3", source: "task1", target: "end" },
      { id: "e4", source: "task2", target: "end" },
    ];

    const result = computeSugiyamaLayout(nodes, edges, {
      rankSeparation: 100,
      nodeSeparation: 50,
      direction: "TB",
    });

    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(4);
    expect(result.width).toBeGreaterThan(100);
    expect(result.height).toBeGreaterThan(100);

    const startNode = result.nodes.find((n) => n.id === "start");
    const endNode = result.nodes.find((n) => n.id === "end");
    expect(startNode?.y ?? 0).toBeLessThan(endNode?.y ?? 0);

    for (const edge of result.edges) {
      expect(edge.points).toBeDefined();
      expect(edge.points!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("handles empty nodes gracefully", () => {
    const result = computeSugiyamaLayout([], []);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.crossings).toBe(0);
  });

  it("supports LR direction transform", () => {
    const nodes: SugiyamaNode[] = [
      { id: "1", width: 100, height: 50 },
      { id: "2", width: 100, height: 50 },
    ];
    const edges: SugiyamaEdge[] = [{ id: "e1", source: "1", target: "2" }];

    const result = computeSugiyamaLayout(nodes, edges, { direction: "LR" });
    const n1 = result.nodes.find((n) => n.id === "1");
    const n2 = result.nodes.find((n) => n.id === "2");
    expect(n1?.x ?? 0).toBeLessThan(n2?.x ?? 0);
  });

  it("assignCoordinates handles raw layered ranks and assigns coordinates", () => {
    const r0: SugiyamaNode[] = [{ id: "A", width: 80, height: 40 }];
    const r1: SugiyamaNode[] = [{ id: "B", width: 80, height: 40 }];
    const edges: SugiyamaEdge[] = [{ id: "e1", source: "A", target: "B" }];
    const coords = assignCoordinates([r0, r1], edges, edges, { direction: "TB" });
    expect(coords.nodes).toHaveLength(2);
    expect(coords.edges).toHaveLength(1);
    expect(coords.nodes[0].y).toBeLessThan(coords.nodes[1].y!);
  });
});
