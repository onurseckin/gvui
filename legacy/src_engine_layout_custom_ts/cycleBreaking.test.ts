import { describe, expect, it } from "bun:test";
import { classifyEdgeRoles } from "./cycleBreaking";
import { normalizeGraph } from "./normalizeGraph";
import { detectStronglyConnectedComponents } from "./stronglyConnectedComponents";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("cycleBreaking", () => {
  it("classifies self-loop as 'self'", () => {
    const nodes: NormalizedNode[] = [{ id: "A", width: 100, height: 50 }];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "A" }];

    const graph = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(graph);
    const result = classifyEdgeRoles(graph, scc);

    expect(result.classifiedEdges[0].role).toBe("self");
  });

  it("classifies explicit isCycle: true as 'feedback'", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "A", isCycle: true },
    ];

    const graph = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(graph);
    const result = classifyEdgeRoles(graph, scc);

    expect(result.edgeRoleMap.get("e1")).toBe("forward");
    expect(result.edgeRoleMap.get("e2")).toBe("feedback");
  });

  it("classifies reciprocal pair such that exactly one edge is feedback and no cycle remains", () => {
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
    const result = classifyEdgeRoles(graph, scc);

    const roles = [result.edgeRoleMap.get("e1"), result.edgeRoleMap.get("e2")].sort();
    expect(roles).toEqual(["feedback", "forward"]);
  });

  it("ensures removing feedback and self edges leaves a strict DAG (verified by Kahn)", () => {
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
    const result = classifyEdgeRoles(graph, scc);

    const feedbackCount = result.classifiedEdges.filter((e) => e.role === "feedback").length;
    const forwardCount = result.classifiedEdges.filter((e) => e.role === "forward").length;

    expect(feedbackCount).toBe(1);
    expect(forwardCount).toBe(2);
    expect(result.isDAG).toBe(true);
  });

  it("classifies explicit layoutRole: 'cross' as 'cross'", () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
      { id: "C", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "A", target: "C" },
      { id: "e3", source: "B", target: "C", layoutRole: "cross" },
    ];

    const graph = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(graph);
    const result = classifyEdgeRoles(graph, scc);

    expect(result.edgeRoleMap.get("e3")).toBe("cross");
  });

  it("auto-infers 'cross' edge when removing edge leaves endpoints at equal ranks sharing alt predecessor/successor", () => {
    const nodes: NormalizedNode[] = [
      { id: "SRC", width: 100, height: 50 },
      { id: "MID1", width: 100, height: 50 },
      { id: "MID2", width: 100, height: 50 },
      { id: "SINK", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "SRC", target: "MID1" },
      { id: "e2", source: "SRC", target: "MID2" },
      { id: "e3", source: "MID1", target: "MID2" }, // auto
      { id: "e4", source: "MID1", target: "SINK" },
      { id: "e5", source: "MID2", target: "SINK" },
    ];

    const graph = normalizeGraph(nodes, edges);
    const scc = detectStronglyConnectedComponents(graph);
    const result = classifyEdgeRoles(graph, scc);

    expect(result.edgeRoleMap.get("e3")).toBe("cross");
  });

  it("maintains classification determinism regardless of input shuffle", () => {
    const nodes: NormalizedNode[] = [
      { id: "SRC", width: 100, height: 50 },
      { id: "MID1", width: 100, height: 50 },
      { id: "MID2", width: 100, height: 50 },
      { id: "SINK", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [
      { id: "e1", source: "SRC", target: "MID1" },
      { id: "e2", source: "SRC", target: "MID2" },
      { id: "e3", source: "MID1", target: "MID2" },
      { id: "e4", source: "MID1", target: "SINK" },
      { id: "e5", source: "MID2", target: "SINK" },
    ];

    const graph1 = normalizeGraph(nodes, edges);
    const scc1 = detectStronglyConnectedComponents(graph1);
    const result1 = classifyEdgeRoles(graph1, scc1);

    const graph2 = normalizeGraph([...nodes].reverse(), [...edges].reverse());
    const scc2 = detectStronglyConnectedComponents(graph2);
    const result2 = classifyEdgeRoles(graph2, scc2);

    expect(Array.from(result1.edgeRoleMap.entries())).toEqual(
      Array.from(result2.edgeRoleMap.entries()),
    );
  });
});
