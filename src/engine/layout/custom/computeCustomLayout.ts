import initWasm, { compute_custom_layout_wasm } from "./wasm_pkg/gvui";
import type { CustomLayoutConfig } from "./config";
import { computeCustomLayoutAsync } from "./customLayoutWorkerClient";
import {
  validateWasmLayoutResult,
  type CustomLayoutResult,
  type NormalizedEdge,
  type NormalizedNode,
} from "./types";

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
  mode?: string,
): Promise<CustomLayoutResult> {
  await ensureWasmInitialized();
  const input = {
    nodes,
    edges,
    options: configPartial,
    mode,
  };

  const rawResult: unknown = compute_custom_layout_wasm(input as unknown as object);
  return validateWasmLayoutResult(rawResult);
}

export { computeCustomLayoutAsync };
