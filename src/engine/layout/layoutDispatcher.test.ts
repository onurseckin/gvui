import { describe, expect, it } from "bun:test";
import { computeGraphLayout } from "./layoutDispatcher";
import type { GraphDataset } from "../../types/graphData";
import type { LayoutMode } from "../../state/useGraphStore";

const ALL_LAYOUT_MODES: LayoutMode[] = ["layered", "radial"];

/**
 * Mode strings older clients persisted. Each must still produce a drawing rather than throwing;
 * the direction-bearing ones additionally prove that a mode which no longer exists as an engine is
 * not mistaken for an unknown value and silently dropped.
 */
const LEGACY_MODE_STRINGS: string[] = [
  "top-down",
  "top-down-dagre",
  "bottom-up",
  "left-right",
  "right-left",
  "layered-spline",
  "force",
  "stress",
  "organic",
  "grid",
];

describe("layoutDispatcher all modes", () => {
  const sampleDataset: GraphDataset = {
    id: "sample-test-graph",
    title: "Sample Test Graph",
    nodes: [
      { id: "A", name: "Node A" },
      { id: "B", name: "Node B" },
      { id: "C", name: "Node C" },
    ],
    edges: [
      { id: "e1", source: "A", target: "B" },
      { id: "e2", source: "B", target: "C" },
    ],
  };

  for (const mode of ALL_LAYOUT_MODES) {
    it(`dispatches "${mode}" and returns positioned nodes and edges`, async () => {
      const res = await computeGraphLayout(sampleDataset, mode);
      expect(res.nodes).toHaveLength(3);
      expect(res.edges).toHaveLength(2);
      for (const node of res.nodes) {
        expect(typeof node.x).toBe("number");
        expect(typeof node.y).toBe("number");
      }
      for (const edge of res.edges) {
        expect(edge.path).toContain("M");
      }
    });
  }

  for (const legacy of LEGACY_MODE_STRINGS) {
    it(`normalizes the legacy mode string "${legacy}" instead of throwing`, async () => {
      const res = await computeGraphLayout(sampleDataset, legacy);
      expect(res.nodes).toHaveLength(3);
      expect(res.edges).toHaveLength(2);
    });
  }

  it("falls back to the default mode for an unrecognized mode string", async () => {
    const res = await computeGraphLayout(sampleDataset, "not-a-real-mode");
    expect(res.nodes).toHaveLength(3);
    expect(res.edges).toHaveLength(2);
  });

  it("handles zero-node dataset safely without crashing", async () => {
    const emptyDataset: GraphDataset = { id: "empty", title: "Empty", nodes: [], edges: [] };
    const res = await computeGraphLayout(emptyDataset, "layered");
    expect(res.nodes).toHaveLength(0);
    expect(res.edges).toHaveLength(0);
  });

  it("handles single-node dataset safely", async () => {
    const singleDataset: GraphDataset = {
      id: "single",
      title: "Single",
      nodes: [{ id: "n1", name: "Single" }],
      edges: [],
    };
    const res = await computeGraphLayout(singleDataset, "layered");
    expect(res.nodes).toHaveLength(1);
    expect(res.edges).toHaveLength(0);
  });

  it("defaults to layered mode when no mode is supplied", async () => {
    const res = await computeGraphLayout(sampleDataset);
    expect(res.nodes).toHaveLength(3);
    expect(res.edges).toHaveLength(2);
  });
});
