import initWasm, { compute_custom_layout_wasm } from "./wasm_pkg/gvui";
import type { CustomLayoutConfig } from "./config";
import { computeCustomLayoutAsync } from "./customLayoutWorkerClient";
import type { CustomLayoutResult, NormalizedEdge, NormalizedNode } from "./types";

let wasmInitPromise: Promise<unknown> | null = null;

async function ensureWasmInitialized(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = initWasm();
  }
  await wasmInitPromise;
}

export async function computeCustomLayout(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  configPartial?: Partial<CustomLayoutConfig>,
): Promise<CustomLayoutResult> {
  await ensureWasmInitialized();
  const input = {
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label,
      width: n.width,
      height: n.height,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: e.isCycle,
    })),
    options: configPartial,
  };

  return compute_custom_layout_wasm(input) as CustomLayoutResult;
}

export { computeCustomLayoutAsync };
