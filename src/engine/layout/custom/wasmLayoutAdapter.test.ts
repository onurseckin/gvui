import { describe, expect, it } from "bun:test";
import type { GraphDataset } from "../../../types/graphData";
import {
  computeCustomEngineGraphLayoutWasm,
  computeCustomLayoutWasm,
  ensureWasmInitialized,
} from "./wasmLayoutAdapter";

describe("wasmLayoutAdapter", () => {
  it("initializes WASM module", async () => {
    await ensureWasmInitialized();
    expect(true).toBe(true);
  });

  it("computes custom layout via WASM with normalized nodes and edges", async () => {
    const nodes = [
      { id: "n1", label: "Node 1", width: 120, height: 60 },
      { id: "n2", label: "Node 2", width: 120, height: 60 },
    ];
    const edges = [{ id: "e1", source: "n1", target: "n2", label: "Connects" }];

    const result = await computeCustomLayoutWasm(nodes, edges);
    expect(result).toBeDefined();
    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(1);
    expect(result.status).toBe("OPTIMAL_WASM_V2");
  });

  it("computes custom engine graph layout for GraphDataset", async () => {
    const dataset: GraphDataset = {
      id: "wasm-test-ds",
      title: "WASM Engine Dataset Test",
      nodes: [
        { id: "A", name: "Alpha Node" },
        { id: "B", name: "Beta Node" },
      ],
      edges: [{ id: "edge-ab", source: "A", target: "B", label: "Alpha to Beta" }],
    };

    const result = await computeCustomEngineGraphLayoutWasm(dataset);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(typeof result.nodes[0].x).toBe("number");
    expect(typeof result.nodes[0].y).toBe("number");
    expect(result.edges[0].path).toContain("M");
  });
});
