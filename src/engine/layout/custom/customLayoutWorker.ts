import type { CustomLayoutConfig } from "./config";
import { resolveCustomLayoutConfig } from "./config";
import { optimizeLayout } from "./optimizeLayout";
import type { NormalizedEdge, NormalizedNode } from "./types";

export interface CustomLayoutWorkerRequest {
  id: string;
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
  configPartial?: Partial<CustomLayoutConfig>;
}

export interface CustomLayoutWorkerResponse {
  id: string;
  type: "success" | "error";
  result?: ReturnType<typeof optimizeLayout>;
  error?: string;
}

if (typeof self !== "undefined" && typeof self.postMessage === "function") {
  self.onmessage = (event: MessageEvent<CustomLayoutWorkerRequest>) => {
    const { id, nodes, edges, configPartial } = event.data;
    try {
      const config = resolveCustomLayoutConfig(configPartial);
      const result = optimizeLayout(nodes, edges, config);
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
