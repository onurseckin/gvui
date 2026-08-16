import { describe, expect, it } from "bun:test";
import {
  clearDynamicLayoutCache,
  computeDatasetHash,
  computeDynamicLayout,
  createDynamicLayoutSimulation,
  normalizeAlgorithm,
  type LayoutAlgorithm,
} from "./dynamicLayoutEngine";
import type { GraphDataset } from "../../types/graphData";

const sampleDataset: GraphDataset = {
  id: "test-workflow",
  title: "Test Workflow Graph",
  nodes: [
    { id: "A", name: "Node A", rank: 0 },
    { id: "B", name: "Node B", rank: 1 },
    { id: "C", name: "Node C", rank: 2 },
  ],
  edges: [
    { id: "e1", source: "A", target: "B" },
    { id: "e2", source: "B", target: "C" },
    { id: "e3", source: "A", target: "C" },
  ],
};

const ALL_ALGORITHMS: LayoutAlgorithm[] = [
  "force",
  "dag-sugiyama",
  "hybrid-force-dag",
  "radial",
  "grid",
  "layered",
];

describe("Dynamic Layout Engine Universal Orchestrator", () => {
  it("normalizes algorithm names correctly", () => {
    expect(normalizeAlgorithm("force")).toBe("force");
    expect(normalizeAlgorithm("force-directed")).toBe("force");
    expect(normalizeAlgorithm("dag")).toBe("dag-sugiyama");
    expect(normalizeAlgorithm("sugiyama")).toBe("dag-sugiyama");
    expect(normalizeAlgorithm("hybrid")).toBe("hybrid-force-dag");
    expect(normalizeAlgorithm("radial")).toBe("radial");
    expect(normalizeAlgorithm("grid")).toBe("grid");
    expect(normalizeAlgorithm("top-down")).toBe("layered");
    expect(normalizeAlgorithm("unknown")).toBe("hybrid-force-dag");
  });

  for (const alg of ALL_ALGORITHMS) {
    it(`computes layout successfully for algorithm "${alg}"`, async () => {
      const res = await computeDynamicLayout(sampleDataset, { algorithm: alg, randomSeed: 42 });
      expect(res.nodes).toHaveLength(3);
      expect(res.edges).toHaveLength(3);
      expect(res.algorithm).toBe(normalizeAlgorithm(alg));

      for (const node of res.nodes) {
        expect(typeof node.x).toBe("number");
        expect(typeof node.y).toBe("number");
        expect(node.width).toBeGreaterThan(0);
        expect(node.height).toBeGreaterThan(0);
      }

      for (const edge of res.edges) {
        expect(edge.path).toContain("M");
        expect(typeof edge.labelX).toBe("number");
        expect(typeof edge.labelY).toBe("number");
      }
    });
  }

  it("handles empty and single node datasets safely", async () => {
    const emptyRes = await computeDynamicLayout({
      id: "empty",
      title: "Empty",
      nodes: [],
      edges: [],
    });
    expect(emptyRes.nodes).toHaveLength(0);
    expect(emptyRes.edges).toHaveLength(0);

    const singleRes = await computeDynamicLayout({
      id: "single",
      title: "Single",
      nodes: [{ id: "n1", name: "Solo" }],
      edges: [],
    });
    expect(singleRes.nodes).toHaveLength(1);
    expect(singleRes.edges).toHaveLength(0);
  });

  it("serves repeated layout queries from cache and clears cache when requested", async () => {
    clearDynamicLayoutCache();
    const hash = computeDatasetHash(sampleDataset, { algorithm: "hybrid-force-dag" });
    expect(typeof hash).toBe("string");

    const res1 = await computeDynamicLayout(sampleDataset, {
      algorithm: "hybrid-force-dag",
      useCache: true,
    });
    const res2 = await computeDynamicLayout(sampleDataset, {
      algorithm: "hybrid-force-dag",
      useCache: true,
    });

    expect(res1.nodes).toEqual(res2.nodes);
    clearDynamicLayoutCache();
  });

  it("creates interactive ForceSimulation for continuous stepping", () => {
    const sim = createDynamicLayoutSimulation(sampleDataset, { charge: -200 });
    expect(sim).toBeDefined();

    sim.step(10);
    expect(sim.iteration()).toBe(10);

    const nodes = sim.nodes() as Array<{ id: string; x: number; y: number }>;
    expect(nodes).toHaveLength(3);
  });
});
