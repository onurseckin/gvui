import type { GraphDataset, PositionedEdge, PositionedNode } from "../../src/types/graphData";

import { calculateNodeDimensions } from "../../src/engine/layout/nodeDimensions";

let isWasmInitialized = false;
let wasmModule: typeof import("./wasm_pkg/gvui") | null = null;

async function initWasmModule() {
  if (isWasmInitialized && wasmModule) return wasmModule;
  try {
    const mod = await import("./wasm_pkg/gvui");
    await mod.default();
    wasmModule = mod;
    isWasmInitialized = true;
    return wasmModule;
  } catch (err) {
    console.warn("Failed to load Rust WASM module, falling back to JS layout engine:", err);
    return null;
  }
}

export async function computeCustomEngineGraphLayoutWasm(
  dataset: GraphDataset,
): Promise<{ nodes: PositionedNode[]; edges: PositionedEdge[] } | null> {
  const mod = await initWasmModule();
  if (!mod) return null;

  try {
    const input = {
      nodes: dataset.nodes.map((n) => {
        const dims = calculateNodeDimensions(n);
        return {
          id: n.id,
          label: n.name,
          width: dims.width,
          height: dims.height,
        };
      }),
      edges: dataset.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label,
        isCycle: e.isCycle,
      })),
    };

    const res = mod.compute_custom_layout_wasm(input) as {
      nodes: Array<{
        id: string;
        label?: string;
        x: number;
        y: number;
        width: number;
        height: number;
        rank: number;
        order: number;
      }>;
      edges: Array<{
        edgeId: string;
        points: Array<{ x: number; y: number }>;
      }>;
      status: string;
      passes: number;
    };

    const nodePosMap = new Map(res.nodes.map((n) => [n.id, n]));

    const positionedNodes: PositionedNode[] = dataset.nodes.map((node) => {
      const pos = nodePosMap.get(node.id) ?? { x: 0, y: 0, width: 140, height: 70 };
      return {
        ...node,
        x: pos.x,
        y: pos.y,
        width: pos.width,
        height: pos.height,
      };
    });

    const routeMap = new Map(res.edges.map((e) => [e.edgeId, e.points]));

    const positionedEdges: PositionedEdge[] = dataset.edges.map((edge, idx) => {
      const edgeId = edge.id || `e-${edge.source}-${edge.target}-${idx}`;
      const points = routeMap.get(edgeId) ?? [];

      let dPath = "";
      let midX = 0;
      let midY = 0;

      if (points.length >= 2) {
        dPath = points
          .reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x} ${p.y}`, "")
          .trim();
        const midIdx = Math.floor(points.length / 2);
        midX = points[midIdx].x;
        midY = points[midIdx].y;
      } else {
        const src = nodePosMap.get(edge.source);
        const tgt = nodePosMap.get(edge.target);
        if (src && tgt) {
          dPath = `M ${src.x + src.width / 2} ${src.y + src.height} L ${tgt.x + tgt.width / 2} ${tgt.y}`;
          midX = (src.x + tgt.x) / 2;
          midY = (src.y + tgt.y) / 2;
        }
      }

      return {
        ...edge,
        path: dPath,
        labelX: midX,
        labelY: midY,
      };
    });

    return { nodes: positionedNodes, edges: positionedEdges };
  } catch (err) {
    console.error("Rust WASM execution failed:", err);
    return null;
  }
}
