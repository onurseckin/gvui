import initWasm, { compute_custom_layout_wasm } from "./wasm_pkg/gvui";
import type { CustomLayoutConfig } from "./config";
import type { CustomLayoutResult, NormalizedEdge, NormalizedNode } from "./types";

export interface CustomLayoutWorkerRequest {
  id: string;
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
  configPartial?: Partial<CustomLayoutConfig>;
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
    const { id, nodes, edges, configPartial } = event.data;
    try {
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
      const result = compute_custom_layout_wasm(input) as CustomLayoutResult;
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
