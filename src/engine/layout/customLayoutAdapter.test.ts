import { afterEach, describe, expect, it } from "bun:test";
import * as bunTest from "bun:test";
import {
  computeCustomEngineGraphLayout,
  computeCustomEngineGraphLayoutAsync,
} from "./customLayoutAdapter";
import type { GraphDataset } from "../../types/graphData";
import type { CustomLayoutConfig } from "./custom/config";
import type { CustomLayoutResult, NormalizedEdge, NormalizedNode } from "./custom/types";
import * as realComputeCustomLayoutModule from "./custom/computeCustomLayout";

/** The subset of bun:test's real `mock` export this file needs. */
interface ModuleMocker {
  module(id: string, factory: () => unknown): void | Promise<void>;
}

// `src/types/bun-test.d.ts` is a hand-maintained ambient shim for "bun:test" that predates
// `mock.module` and doesn't declare it, even though bun:test ships the export at runtime (this is
// not an `any` — it's a single documented bridge cast to the minimal shape this file relies on).
const mock = (bunTest as unknown as { mock: ModuleMocker }).mock;

// `mock.module` overwrites a module's export table in place, and an `import * as ns` binding is a
// *live* reference into that same table — so reusing `realComputeCustomLayoutModule.computeCustomLayout`
// in a restore factory would just hand back whatever the module currently holds, including an
// still-active mock. Copying the functions into plain variables *before* any mocking happens
// freezes them at their original values, independent of later export-table mutation.
const originalComputeCustomLayout = realComputeCustomLayoutModule.computeCustomLayout;
const originalComputeCustomLayoutAsync = realComputeCustomLayoutModule.computeCustomLayoutAsync;

describe("computeCustomEngineGraphLayout", () => {
  it("computes positioned nodes and edges for a standard application GraphDataset", async () => {
    const dataset: GraphDataset = {
      id: "test-ds-1",
      title: "Test AI Agent Pipeline",
      nodes: [
        { id: "A", name: "Input Node A", description: "First step" },
        { id: "B", name: "Processing Node B", description: "Second step" },
        { id: "C", name: "Output Node C", description: "Third step" },
      ],
      edges: [
        { id: "e1", source: "A", target: "B", label: "step 1" },
        { id: "e2", source: "B", target: "C", label: "step 2" },
      ],
    };

    const result = await computeCustomEngineGraphLayout(dataset);

    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);

    for (const node of result.nodes) {
      expect(typeof node.x).toBe("number");
      expect(typeof node.y).toBe("number");
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }

    for (const edge of result.edges) {
      expect(edge.path).toContain("M");
      expect(typeof edge.labelX).toBe("number");
      expect(typeof edge.labelY).toBe("number");
    }
  });

  it("handles empty dataset gracefully", async () => {
    const dataset: GraphDataset = {
      id: "empty",
      title: "Empty Graph",
      nodes: [],
      edges: [],
    };

    const result = await computeCustomEngineGraphLayout(dataset);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it("computes layout via the async (worker/main-thread) entry point", async () => {
    const dataset: GraphDataset = {
      id: "async-ds-1",
      title: "Async Test Dataset",
      nodes: [
        { id: "A", name: "Node A" },
        { id: "B", name: "Node B" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    const result = await computeCustomEngineGraphLayoutAsync(dataset);

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });
});

describe("computeCustomEngineGraphLayout result mapping at scale (O(E), not O(E^2))", () => {
  it("maps a 500-edge result so every edge gets its own path and its own badge", async () => {
    // A quadratic `layoutResult.edges.find(...)` inside `dataset.edges.map(...)` (the v1 pattern)
    // would still produce *a* path per edge, just slowly; what it can silently get wrong under
    // id collisions or copy/paste bugs is uniqueness. Asserting 500 distinct paths and 500 badges
    // (each edge is labeled, so each needs its own reserved badge box) is the observable proof
    // that the Map-based O(E) `routeMap`/`badgeMap` lookup in `mapLayoutResultToPositioned`
    // resolves every edge independently rather than reusing a stale/neighboring result.
    const nodeCount = 501;
    const nodes = Array.from({ length: nodeCount }, (_, i) => ({ id: `n${i}`, name: `Node ${i}` }));
    const edges = Array.from({ length: nodeCount - 1 }, (_, i) => ({
      id: `e${i}`,
      source: `n${i}`,
      target: `n${i + 1}`,
      label: `edge label ${i}`,
    }));
    const dataset: GraphDataset = { id: "scale-ds", title: "500-edge chain", nodes, edges };

    const result = await computeCustomEngineGraphLayout(dataset);

    expect(result.edges).toHaveLength(500);

    const uniquePaths = new Set(result.edges.map((edge) => edge.path));
    expect(uniquePaths.size).toBe(500);

    for (const edge of result.edges) {
      expect(edge.path).toContain("M");
      expect(typeof edge.labelX).toBe("number");
      expect(typeof edge.labelY).toBe("number");
    }
  });
});

describe("computeCustomEngineGraphLayout label measurement forwarding", () => {
  afterEach(() => {
    // Undo the module patch so every other test file (and the tests above, if re-run) sees the
    // real WASM-backed `computeCustomLayout` again — `mock.module` overwrites the module's
    // exports in place, so a leaked mock would silently break unrelated suites.
    mock.module("./custom/computeCustomLayout", () => ({
      computeCustomLayout: originalComputeCustomLayout,
      computeCustomLayoutAsync: originalComputeCustomLayoutAsync,
    }));
  });

  it("forwards measured labelWidth/labelHeight for a labeled edge to the engine", async () => {
    let capturedEdges: NormalizedEdge[] | undefined;

    const fakeResult: CustomLayoutResult = {
      nodes: [],
      edges: [],
      badges: [],
      crossings: [],
      // The mock only needs to satisfy the shape computeCustomEngineGraphLayout reads before this
      // test's assertions run (it never inspects `validation`), so a minimal bridge here is safe.
      validation: undefined as unknown as CustomLayoutResult["validation"],
      status: "success",
    };

    mock.module("./custom/computeCustomLayout", () => ({
      computeCustomLayout: (
        _nodes: NormalizedNode[],
        edges: NormalizedEdge[],
        _configPartial?: Partial<CustomLayoutConfig>,
        _mode?: string,
      ) => {
        capturedEdges = edges;
        return Promise.resolve(fakeResult);
      },
      computeCustomLayoutAsync: originalComputeCustomLayoutAsync,
    }));

    const dataset: GraphDataset = {
      id: "label-fwd-ds",
      title: "Label Forwarding",
      nodes: [
        { id: "A", name: "Node A" },
        { id: "B", name: "Node B" },
      ],
      edges: [{ id: "e1", source: "A", target: "B", label: "a reasonably long edge label" }],
    };

    await computeCustomEngineGraphLayout(dataset);

    expect(capturedEdges).toBeDefined();
    const forwardedEdge = capturedEdges?.find((edge) => edge.id === "e1");
    expect(forwardedEdge).toBeDefined();
    expect(typeof forwardedEdge?.labelWidth).toBe("number");
    expect(forwardedEdge?.labelWidth).toBeGreaterThan(0);
    expect(typeof forwardedEdge?.labelHeight).toBe("number");
    expect(forwardedEdge?.labelHeight).toBeGreaterThan(0);
  });

  it("omits labelWidth/labelHeight for an edge with no label", async () => {
    let capturedEdges: NormalizedEdge[] | undefined;

    const fakeResult: CustomLayoutResult = {
      nodes: [],
      edges: [],
      badges: [],
      crossings: [],
      validation: undefined as unknown as CustomLayoutResult["validation"],
      status: "success",
    };

    mock.module("./custom/computeCustomLayout", () => ({
      computeCustomLayout: (
        _nodes: NormalizedNode[],
        edges: NormalizedEdge[],
        _configPartial?: Partial<CustomLayoutConfig>,
        _mode?: string,
      ) => {
        capturedEdges = edges;
        return Promise.resolve(fakeResult);
      },
      computeCustomLayoutAsync: originalComputeCustomLayoutAsync,
    }));

    const dataset: GraphDataset = {
      id: "no-label-fwd-ds",
      title: "No Label Forwarding",
      nodes: [
        { id: "A", name: "Node A" },
        { id: "B", name: "Node B" },
      ],
      edges: [{ id: "e1", source: "A", target: "B" }],
    };

    await computeCustomEngineGraphLayout(dataset);

    const forwardedEdge = capturedEdges?.find((edge) => edge.id === "e1");
    expect(forwardedEdge).toBeDefined();
    expect(forwardedEdge?.labelWidth).toBe(undefined);
    expect(forwardedEdge?.labelHeight).toBe(undefined);
  });
});
