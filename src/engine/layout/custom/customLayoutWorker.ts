import type { CustomLayoutConfig } from "./config";
import { resolveCustomLayoutConfig } from "./config";
import { optimizeLayout } from "./optimizeLayout";
import type { CustomLayoutResult, NormalizedEdge, NormalizedNode } from "./types";

export interface CustomLayoutWorkerRequest {
  id: string;
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
  configPartial?: Partial<CustomLayoutConfig>;
}

export interface CustomLayoutWorkerProgressMessage {
  id: string;
  type: "progress";
  stageIndex: number;
  totalStages: number;
  percent: number;
  stageText: string;
  detail: string;
}

export interface CustomLayoutWorkerResponse {
  id: string;
  type: "success" | "error";
  result?: CustomLayoutResult;
  error?: string;
}

export type CustomLayoutWorkerMessage =
  | CustomLayoutWorkerResponse
  | CustomLayoutWorkerProgressMessage;

if (typeof self !== "undefined" && typeof self.postMessage === "function") {
  self.onmessage = async (event: MessageEvent<CustomLayoutWorkerRequest>) => {
    const { id, nodes, edges, configPartial } = event.data;
    try {
      const config = resolveCustomLayoutConfig(configPartial);
      const result = await optimizeLayout(nodes, edges, config, (progress) => {
        const progressMessage: CustomLayoutWorkerProgressMessage = {
          id,
          type: "progress",
          ...progress,
        };
        self.postMessage(progressMessage);
      });
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

