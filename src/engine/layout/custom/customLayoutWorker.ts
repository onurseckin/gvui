import initWasm, { compute_custom_layout_wasm } from "./wasm_pkg/gvui";
import type { CustomLayoutConfig } from "./config";
import {
  validateWasmLayoutResult,
  type CustomLayoutResult,
  type NormalizedEdge,
  type NormalizedNode,
} from "./types";

export interface CustomLayoutWorkerRequest {
  id: string;
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
  configPartial?: Partial<CustomLayoutConfig>;
  mode?: string;
}

export interface CustomLayoutWorkerResponse {
  id: string;
  type: "success" | "error";
  result?: CustomLayoutResult;
  error?: string;
}

export type CustomLayoutWorkerMessage = CustomLayoutWorkerResponse;

let wasmInitPromise: Promise<unknown> | null = null;

async function ensureWasmInitialized(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = initWasm();
  }
  await wasmInitPromise;
}

if (typeof self !== "undefined" && typeof self.postMessage === "function") {
  self.onmessage = async (event: MessageEvent<CustomLayoutWorkerRequest>) => {
    const { id, nodes, edges, configPartial, mode } = event.data;
    try {
      await ensureWasmInitialized();
      const input = {
        nodes,
        edges,
        options: configPartial,
        mode,
      };
      const rawResult: unknown = compute_custom_layout_wasm(input as unknown as object);
      const result = validateWasmLayoutResult(rawResult);
      const response: CustomLayoutWorkerResponse = {
        id,
        type: "success",
        result,
      };
      self.postMessage(response);
    } catch (err) {
      const response: CustomLayoutWorkerResponse = {
        id,
        type: "error",
        error: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(response);
    }
  };
}
