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

export interface WorkerLike {
  postMessage(message: CustomLayoutWorkerRequest): void;
  terminate(): void;
  onmessage?: ((event: MessageEvent<CustomLayoutWorkerResponse>) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent<unknown>) => void) | null;
}

/** Narrow browser seam used to make watchdog behaviour deterministic in tests. */
export interface LayoutWorkerRuntime {
  createWorker(): WorkerLike;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
}

export interface ComputeLayoutWorkerDependencies {
  runtime?: LayoutWorkerRuntime;
  /** Test-only seam for proving a browser worker failure never falls back to the main thread. */
  computeSynchronously?: (
    nodes: NormalizedNode[],
    edges: NormalizedEdge[],
    config: CustomLayoutConfig,
  ) => CustomLayoutResult;
}

export class LayoutTimeoutError extends Error {
  public constructor(timeoutMs: number) {
    super(`Layout computation timed out after ${timeoutMs}ms`);
    this.name = "LayoutTimeoutError";
  }
}

export class LayoutWorkerError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LayoutWorkerError";
  }
}

export class LayoutCancelledError extends Error {
  public constructor() {
    super("Layout computation cancelled");
    this.name = "LayoutCancelledError";
  }
}

let requestIdCounter = 0;

function getBrowserWorkerRuntime(): LayoutWorkerRuntime | null {
  if (typeof window === "undefined" || typeof window.Worker === "undefined") {
    return null;
  }

  return {
    createWorker: () =>
      new Worker(new URL("./customLayoutWorker.ts", import.meta.url), { type: "module" }),
    setTimer: (callback, ms) => setTimeout(callback, ms),
    clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  };
}

/**
 * Computes in a real browser Worker whenever one is available.  Browser failures are terminal:
 * returning to optimizeLayout on the main thread would turn a timeout into a frozen tab.
 */
export async function computeCustomLayoutAsync(
  options: ComputeLayoutWorkerOptions,
  dependencies: ComputeLayoutWorkerDependencies = {},
): Promise<CustomLayoutResult> {
  const { nodes, edges, configPartial, timeoutMs = 5000, signal } = options;
  const config = resolveCustomLayoutConfig(configPartial);

  if (signal?.aborted) {
    throw new LayoutCancelledError();
  }

  const runtime = dependencies.runtime ?? getBrowserWorkerRuntime();
  const computeSynchronously = dependencies.computeSynchronously ?? optimizeLayout;

  // Server-side/tests without Worker support retain the direct engine path. This branch is never
  // reached after a browser worker has been selected.
  if (!runtime) {
    return computeSynchronously(nodes, edges, config);
  }

  const reqId = `req_${++requestIdCounter}_${Date.now()}`;

  return new Promise<CustomLayoutResult>((resolve, reject) => {
    let worker: WorkerLike | null = null;
    let timer: unknown;
    let settled = false;
    let terminated = false;

    const cleanup = () => {
      if (timer !== undefined) {
        runtime.clearTimer(timer);
        timer = undefined;
      }
      signal?.removeEventListener("abort", onAbort);
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        if (!terminated) {
          terminated = true;
          worker.terminate();
        }
      }
    };

    const settle = (outcome: { result: CustomLayoutResult } | { error: Error }) => {
      if (settled) return;
      settled = true;
      cleanup();
      if ("result" in outcome) resolve(outcome.result);
      else reject(outcome.error);
    };

    const onAbort = () => settle({ error: new LayoutCancelledError() });

    try {
      worker = runtime.createWorker();
      worker.onmessage = (event) => {
        if (event.data.id !== reqId) return;
        if (event.data.type === "success" && event.data.result) {
          settle({ result: event.data.result });
        } else {
          settle({
            error: new LayoutWorkerError(event.data.error ?? "Unknown worker layout error"),
          });
        }
      };
      worker.onerror = () => settle({ error: new LayoutWorkerError("Layout worker failed") });
      worker.onmessageerror = () =>
        settle({ error: new LayoutWorkerError("Layout worker returned an unreadable message") });

      signal?.addEventListener("abort", onAbort, { once: true });
      timer = runtime.setTimer(
        () => settle({ error: new LayoutTimeoutError(timeoutMs) }),
        timeoutMs,
      );
      worker.postMessage({ id: reqId, nodes, edges, configPartial: config });
    } catch (error) {
      settle({
        error: new LayoutWorkerError("Unable to start layout worker", {
          cause: error instanceof Error ? error : undefined,
        }),
      });
    }
  });
}
