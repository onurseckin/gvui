import { describe, expect, it } from "bun:test";
import { executeSlqQuery, getSlqQuerySuggestions, highlightMatchedText } from "./slqQuery";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";

describe("SearchOverlay slqQuery helper tests", () => {
  const sampleNodes: PositionedNode[] = [
    {
      id: "worker-1",
      type: "agent",
      name: "Worker One",
      status: "running",
      data: {
        agentState: {
          metrics: {
            duration_ms: 1500,
            tokens_in: 5000,
            tokens_out: 2000,
          },
        },
      },
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      depth: 1,
    } as unknown as PositionedNode,
  ];

  const sampleEdges: PositionedEdge[] = [
    {
      id: "edge-1",
      source: "orchestrator",
      target: "worker-1",
      kind: "spawn",
      label: "Spawns worker",
      from: { x: 0, y: 0 },
      to: { x: 100, y: 100 },
      route: [],
    } as unknown as PositionedEdge,
  ];

  it("executes query against nodes and edges", () => {
    const res = executeSlqQuery(sampleNodes, sampleEdges, "status:running");
    expect(res.matchedNodeIds.has("worker-1")).toBe(true);
    expect(res.totalMatches).toBe(1);
  });

  it("handles empty query", () => {
    const res = executeSlqQuery(sampleNodes, sampleEdges, "");
    expect(res.totalMatches).toBe(2);
    expect(res.isQueryValid).toBe(true);
  });

  it("highlights matched text correctly", () => {
    const segs = highlightMatchedText("Worker One", "One");
    expect(segs).toHaveLength(2);
    expect(segs[0].text).toBe("Worker ");
    expect(segs[0].isMatch).toBe(false);
    expect(segs[1].text).toBe("One");
    expect(segs[1].isMatch).toBe(true);
  });

  it("gets query suggestions", () => {
    const suggestions = getSlqQuerySuggestions("stat", 4, {
      nodes: sampleNodes,
      edges: sampleEdges,
    });
    expect(suggestions.length).toBeGreaterThan(0);
  });
});
