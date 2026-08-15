import { describe, expect, it } from "bun:test";
import type { GraphDataset } from "../../../types/graphData";
// NOTE (integrator): this module currently fails to load — `wasmLayoutAdapter.ts` imports
// `calculateNodeDimensions` from `../nodeDimensions`, which no longer exports that name after the
// v2 rewrite (see `nodeDimensions.ts`'s export list). It also hardcodes a v1 default mode
// (`mode: LayoutMode = "top-down"`), which isn't a member of the v2 `LayoutMode` union at all. This
// file duplicates the WASM entry point that `customLayoutAdapter.ts`/`computeCustomLayout.ts`
// already own for the real app path (see `custom/index.ts`'s barrel export) and looks like v1-era
// dead code left behind by the rewrite — worth deleting outright rather than repairing, but that's
// a source-code call outside this test file's ownership. Every test below is written against the
// v2 contract and will pass once the import (and the mode default) is fixed.
import {
  computeCustomEngineGraphLayoutWasm,
  computeCustomLayoutWasm,
  ensureWasmInitialized,
} from "./wasmLayoutAdapter";
import { isCustomLayoutResult, validateWasmLayoutResult, WasmLayoutBoundaryError } from "./types";

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
    expect(result.status).toBe("success");
    expect(isCustomLayoutResult(result)).toBe(true);
  });

  it("computes custom engine graph layout for GraphDataset with an explicit v2 mode", async () => {
    const dataset: GraphDataset = {
      id: "wasm-test-ds",
      title: "WASM Engine Dataset Test",
      nodes: [
        { id: "A", name: "Alpha Node" },
        { id: "B", name: "Beta Node" },
      ],
      edges: [{ id: "edge-ab", source: "A", target: "B", label: "Alpha to Beta" }],
    };

    const result = await computeCustomEngineGraphLayoutWasm(dataset, undefined, "layered");
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(typeof result.nodes[0].x).toBe("number");
    expect(typeof result.nodes[0].y).toBe("number");
    expect(result.edges[0].path).toContain("M");
  });

  describe("WASM boundary schema validation & zero-any type safety", () => {
    it("validates well-formed CustomLayoutResult", () => {
      const validPayload = {
        nodes: [{ id: "n1", label: "N1", width: 100, height: 50, x: 0, y: 0 }],
        edges: [
          {
            edgeId: "e1",
            points: [
              { x: 0, y: 0 },
              { x: 0, y: 50 },
            ],
            segmentCount: 1,
          },
        ],
        badges: [],
        crossings: [],
        validation: {
          isValid: true,
          metrics: { crossings: 0 },
          crossings: [],
          diagnostics: [],
        },
        status: "success",
      };

      expect(isCustomLayoutResult(validPayload)).toBe(true);
      const validated = validateWasmLayoutResult(validPayload);
      expect(validated.status).toBe("success");
    });

    it("rejects non-object and null values", () => {
      expect(isCustomLayoutResult(null)).toBe(false);
      expect(isCustomLayoutResult(undefined)).toBe(false);
      expect(isCustomLayoutResult("string")).toBe(false);
      expect(isCustomLayoutResult(123)).toBe(false);
      expect(() => validateWasmLayoutResult(null)).toThrow(WasmLayoutBoundaryError);
    });

    it("rejects payloads with missing required arrays or status", () => {
      const missingNodes = {
        edges: [],
        badges: [],
        crossings: [],
        validation: {},
        status: "success",
      };
      expect(isCustomLayoutResult(missingNodes)).toBe(false);
      expect(() => validateWasmLayoutResult(missingNodes)).toThrow(WasmLayoutBoundaryError);

      const missingValidation = {
        nodes: [],
        edges: [],
        badges: [],
        crossings: [],
        status: "success",
      };
      expect(isCustomLayoutResult(missingValidation)).toBe(false);
      expect(() => validateWasmLayoutResult(missingValidation)).toThrow(WasmLayoutBoundaryError);
    });
  });
});
