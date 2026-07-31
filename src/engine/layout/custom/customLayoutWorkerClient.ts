import type { CustomLayoutConfig } from "./config";
import { resolveCustomLayoutConfig } from "./config";
import type { CustomLayoutWorkerRequest, CustomLayoutWorkerResponse } from "./customLayoutWorker";
import { optimizeLayout } from "./optimizeLayout";
import type { CustomLayoutResult, NormalizedEdge, NormalizedNode } from "./types";

export interface ComputeLayoutWorkerOptions {
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
  configPartial?: Partial<CustomLayoutConfig>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

let requestIdCounter = 0;

export async function computeCustomLayoutAsync(
  options: ComputeLayoutWorkerOptions,
): Promise<CustomLayoutResult> {
  const { nodes, edges, configPartial, timeoutMs = 5000, signal } = options;
  const config = resolveCustomLayoutConfig(configPartial);

  if (signal?.aborted) {
    throw new Error("Layout computation cancelled");
  }

  // Check Web Worker availability
  const hasWorker =
    typeof window !== "undefined" && typeof window.Worker !== "undefined";

  if (!hasWorker) {
    // Synchronous main-thread fallback
    return optimizeLayout(nodes, edges, config);
  }

  const reqId = `req_${++requestIdCounter}_${Date.now()}`;

  return new Promise<CustomLayoutResult>((resolve, reject) => {
    let worker: Worker | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (worker) {
        worker.terminate();
        worker = null;
      }
    };

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          cleanup();
          reject(new Error("Layout computation cancelled"));
        },
        { once: true },
      );
    }

    timer = setTimeout(() => {
      cleanup();
      // On watchdog timeout, fallback synchronously to best attempt
      try {
        const fallbackResult = optimizeLayout(nodes, edges, {
          ...config,
          maxLayoutStates: 20,
        });
        resolve({
          ...fallbackResult,
          optimizationStats: {
            globalPasses: fallbackResult.optimizationStats?.globalPasses ?? 1,
            evaluatedPortStates: fallbackResult.optimizationStats?.evaluatedPortStates ?? 0,
            spacingExpansions: fallbackResult.optimizationStats?.spacingExpansions ?? 0,
            repeatedStateStop: fallbackResult.optimizationStats?.repeatedStateStop ?? false,
            ...fallbackResult.optimizationStats,
            stopReason: "deadline-exceeded",
          },
        });
      } catch (err) {
        reject(err);
      }
    }, timeoutMs);

    try {
      worker = new Worker(new URL("./customLayoutWorker.ts", import.meta.url), {
        type: "module",
      });

      worker.onmessage = (event: MessageEvent<CustomLayoutWorkerResponse>) => {
        if (event.data.id !== reqId) return;

        cleanup();
        if (event.data.type === "success" && event.data.result) {
          resolve(event.data.result);
        } else {
          reject(new Error(event.data.error ?? "Unknown worker layout error"));
        }
      };

      worker.onerror = (err) => {
        cleanup();
        reject(err);
      };

      const request: CustomLayoutWorkerRequest = {
        id: reqId,
        nodes,
        edges,
        configPartial: config,
      };

      worker.postMessage(request);
    } catch (err) {
      cleanup();
      // Fallback if Worker instantiation fails
      try {
        resolve(optimizeLayout(nodes, edges, config));
      } catch (e) {
        reject(e);
      }
    }
  });
}
