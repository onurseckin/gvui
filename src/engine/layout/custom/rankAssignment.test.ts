import { describe, expect, it } from "bun:test";
import { classifyEdgeRoles } from "./cycleBreaking";
import { normalizeGraph } from "./normalizeGraph";
import { assignRanks } from "./rankAssignment";
import { detectStronglyConnectedComponents } from "./stronglyConnectedComponents";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("rankAssignment", () => {
  it("assigns root nodes rank 0 and downstream nodes rank = parent + 1", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
      { id: "C", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "C" },
    ];

    const norm = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(norm);
    const roles = classifyEdgeRoles(norm, scc);
    const ranks = assignRanks(norm, roles);

    expect(ranks.nodeRankMap.get("A")).toBe(0);
    expect(ranks.nodeRankMap.get("B")).toBe(1);
    expect(ranks.nodeRankMap.get("C")).toBe(2);
    expect(ranks.maxRank).toBe(2);
  });

  it("places both middle nodes of a diamond graph on the same rank", () => {
    const nodes: NormalizedNode[] = [
      { id: "SRC", width: 100, height: 50 },
      { id: "M1", width: 100, height: 50 },
      { id: "M2", width: 100, height: 50 },
      { id: "SINK", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "SRC", target: "M1" },
      { id: "e2", source: "SRC", target: "M2" },
      { id: "e3", source: "M1", target: "SINK" },
      { id: "e4", source: "M2", target: "SINK" },
    ];

    const norm = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(norm);
    const roles = classifyEdgeRoles(norm, scc);
    const ranks = assignRanks(norm, roles);

    expect(ranks.nodeRankMap.get("SRC")).toBe(0);
    expect(ranks.nodeRankMap.get("M1")).toBe(1);
    expect(ranks.nodeRankMap.get("M2")).toBe(1);
    expect(ranks.nodeRankMap.get("SINK")).toBe(2);
  });

  it("does not let feedback or self edges force rank increases", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "A", isCycle: true },
      { id: "e3", source: "A", target: "A" },
    ];

    const norm = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(norm);
    const roles = classifyEdgeRoles(norm, scc);
    const ranks = assignRanks(norm, roles);

    expect(ranks.nodeRankMap.get("A")).toBe(0);
    expect(ranks.nodeRankMap.get("B")).toBe(1);
  });

  it("starts roots of disconnected components at rank 0", () => {
    const nodes: NormalizedNode[] = [
      { id: "A1", width: 100, height: 50 },
      { id: "A2", width: 100, height: 50 },
      { id: "B1", width: 100, height: 50 },
      { id: "B2", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A1", target: "A2" },
      { id: "e2", source: "B1", target: "B2" },
    ];

    const norm = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(norm);
    const roles = classifyEdgeRoles(norm, scc);
    const ranks = assignRanks(norm, roles);

    expect(ranks.nodeRankMap.get("A1")).toBe(0);
    expect(ranks.nodeRankMap.get("B1")).toBe(0);
    expect(ranks.nodeRankMap.get("A2")).toBe(1);
    expect(ranks.nodeRankMap.get("B2")).toBe(1);
  });
});
