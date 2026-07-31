import { describe, expect, it } from "bun:test";
import { normalizeGraph } from "./normalizeGraph";
import { detectStronglyConnectedComponents } from "./stronglyConnectedComponents";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("stronglyConnectedComponents", () => {
  it("produces one single-node non-cyclic SCC per node for a DAG chain", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
      { id: "C", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "C" },
    ];

    const graph = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(graph);

    expect(scc.components.length).toBe(3);
    expect(scc.cyclicComponentIds.size).toBe(0);
    expect(scc.components).toEqual([["A"], ["B"], ["C"]]);
  });

  it("groups a reciprocal pair into a two-node cyclic SCC", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "A" },
    ];

    const graph = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(graph);

    expect(scc.components).toEqual([["A", "B"]]);
    expect(scc.cyclicComponentIds.has("A,B")).toBe(true);
  });

  it("groups a 3-node cycle into a single cyclic SCC", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
      { id: "C", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "C" },
      { id: "e3", source: "C", target: "A" },
    ];

    const graph = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(graph);

    expect(scc.components).toEqual([["A", "B", "C"]]);
    expect(scc.cyclicComponentIds.has("A,B,C")).toBe(true);
  });

  it("marks a self-loop node as a single-node cyclic SCC", () => {
    const nodes: NormalizedNode[] = [{ id: "A", width: 100, height: 50 }];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "A" }];

    const graph = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(graph);

    expect(scc.components).toEqual([["A"]]);
    expect(scc.cyclicComponentIds.has("A")).toBe(true);
  });

  it("detects two disconnected cyclic SCCs deterministically", () => {
    const nodes: NormalizedNode[] = [
      { id: "X2", width: 100, height: 50 },
      { id: "X1", width: 100, height: 50 },
      { id: "Y2", width: 100, height: 50 },
      { id: "Y1", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "X1", target: "X2" },
      { id: "e2", source: "X2", target: "X1" },
      { id: "e3", source: "Y1", target: "Y2" },
      { id: "e4", source: "Y2", target: "Y1" },
    ];

    const graph = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(graph);

    expect(scc.components).toEqual([
      ["X1", "X2"],
      ["Y1", "Y2"],
    ]);
  });
});
