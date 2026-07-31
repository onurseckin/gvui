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
});
