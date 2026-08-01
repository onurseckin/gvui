import { describe, expect, it } from "bun:test";
import type { GraphDataset } from "../../src/types/graphData";
import {
  computeCustomEngineGraphLayout,
  computeCustomEngineGraphLayoutAsync,
} from "../../src/engine/layout/customLayoutAdapter";
import { computeCustomLayout } from "./computeCustomLayout";
import type { NormalizedEdge, NormalizedNode } from "./types";
import { computeCustomLayoutWasm } from "./wasmLayoutAdapter";

describe("WASM Layout Integration & Acceptance Specs", () => {
  describe("computeCustomLayout (WASM direct)", () => {
    it("returns valid node coordinates, routed edges, metrics, and stats for a directed graph", async () => {
      const nodes: NormalizedNode[] = [
        { id: "node-1", label: "Start", width: 140, height: 70 },
        { id: "node-2", label: "Process A", width: 160, height: 80 },
        { id: "node-3", label: "Process B", width: 160, height: 80 },
        { id: "node-4", label: "End", width: 140, height: 70 },
      ];

      const edges: NormalizedEdge[] = [
        { id: "e1", source: "node-1", target: "node-2", label: "flow-1" },
        { id: "e2", source: "node-1", target: "node-3", label: "flow-2" },
        { id: "e3", source: "node-2", target: "node-4", label: "flow-3" },
        { id: "e4", source: "node-3", target: "node-4", label: "flow-4" },
      ];

      const result = await computeCustomLayout(nodes, edges);

      expect(result).toBeDefined();
      expect(result.nodes).toHaveLength(4);
      expect(result.edges.length).toBeGreaterThan(0);

      for (const node of result.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.x).toBe("number");
        expect(typeof node.y).toBe("number");
        expect(Number.isNaN(node.x)).toBe(false);
        expect(Number.isNaN(node.y)).toBe(false);
        expect(node.width).toBeGreaterThan(0);
        expect(node.height).toBeGreaterThan(0);
      }

      for (const edge of result.edges) {
        expect(typeof edge.edgeId).toBe("string");
        expect(Array.isArray(edge.points)).toBe(true);
        expect(edge.points.length).toBeGreaterThan(0);
        for (const pt of edge.points) {
          expect(typeof pt.x).toBe("number");
          expect(typeof pt.y).toBe("number");
          expect(Number.isNaN(pt.x)).toBe(false);
          expect(Number.isNaN(pt.y)).toBe(false);
        }
      }

      expect(result.validation).toBeDefined();
      expect(typeof result.validation.isValid).toBe("boolean");
      expect(result.validation.metrics).toBeDefined();
      expect(typeof result.validation.metrics.crossingCount).toBe("number");

      expect(typeof result.status).toBe("string");
      expect(result.optimizationStats).toBeDefined();
      expect(typeof result.optimizationStats?.globalPasses).toBe("number");
      expect(typeof result.optimizationStats?.durationMs).toBe("number");
    });

    it("handles graphs with cycle edges correctly in WASM cycle-breaking step", async () => {
      const nodes: NormalizedNode[] = [
        { id: "A", label: "Node A", width: 120, height: 60 },
        { id: "B", label: "Node B", width: 120, height: 60 },
        { id: "C", label: "Node C", width: 120, height: 60 },
      ];

      const edges: NormalizedEdge[] = [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "B", target: "C" },
        { id: "e3", source: "C", target: "A", isCycle: true },
      ];

      const result = await computeCustomLayoutWasm(nodes, edges);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges.length).toBeGreaterThan(0);

      const nodeIds = result.nodes.map((n) => n.id);
      expect(nodeIds).toContain("A");
      expect(nodeIds).toContain("B");
      expect(nodeIds).toContain("C");
    });
  });

  describe("computeCustomEngineGraphLayout (Adapter integration)", () => {
    it("converts dataset into positioned nodes and routed edges with SVG path strings", async () => {
      const dataset: GraphDataset = {
        id: "acceptance-ds-1",
        title: "Acceptance Test Pipeline",
        nodes: [
          { id: "src", name: "Data Ingestion", description: "Reads incoming data stream" },
          { id: "proc", name: "Transformer", description: "Applies graph transformations" },
          { id: "sink", name: "Analytics Dashboard", description: "Renders layout metrics" },
        ],
        edges: [
          { id: "e-ingest", source: "src", target: "proc", label: "records" },
          { id: "e-transform", source: "proc", target: "sink", label: "metrics" },
        ],
      };

      const result = await computeCustomEngineGraphLayout(dataset);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);

      const srcPos = result.nodes.find((n) => n.id === "src");
      const sinkPos = result.nodes.find((n) => n.id === "sink");
      expect(srcPos).toBeDefined();
      expect(sinkPos).toBeDefined();
      if (srcPos && sinkPos) {
        expect(srcPos.y).toBeLessThan(sinkPos.y);
      }

      for (const edge of result.edges) {
        expect(edge.path.startsWith("M")).toBe(true);
        expect(edge.path).toContain("L");
        expect(typeof edge.labelX).toBe("number");
        expect(typeof edge.labelY).toBe("number");
        expect(Number.isNaN(edge.labelX)).toBe(false);
        expect(Number.isNaN(edge.labelY)).toBe(false);
      }
    });

    it("handles empty graph dataset cleanly without errors", async () => {
      const emptyDataset: GraphDataset = {
        id: "empty",
        title: "Empty Graph",
        nodes: [],
        edges: [],
      };

      const result = await computeCustomEngineGraphLayout(emptyDataset);
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it("supports async background layout calculation", async () => {
      const dataset: GraphDataset = {
        id: "async-ds",
        title: "Async Test",
        nodes: [
          { id: "n1", name: "Node 1" },
          { id: "n2", name: "Node 2" },
        ],
        edges: [{ id: "edge-1", source: "n1", target: "n2" }],
      };

      const result = await computeCustomEngineGraphLayoutAsync(dataset);
      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].path).toContain("M");
    });
  });
});
