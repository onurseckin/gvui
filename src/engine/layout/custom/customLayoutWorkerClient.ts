import { computeCustomLayout } from "./computeCustomLayout";
import type { CustomLayoutConfig } from "./config";
import { resolveCustomLayoutConfig } from "./config";
import type { CustomLayoutWorkerMessage, CustomLayoutWorkerRequest } from "./customLayoutWorker";
import type { CustomLayoutResult, NormalizedEdge, NormalizedNode } from "./types";

export interface ComputeLayoutWorkerOptions {
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
  configPartial?: Partial<CustomLayoutConfig>;
  mode?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type ComputeLayoutAsyncOptions = ComputeLayoutWorkerOptions;

export interface WorkerLike {
  postMessage(message: CustomLayoutWorkerRequest): void;
  terminate(): void;
  onmessage?: ((event: MessageEvent<CustomLayoutWorkerMessage>) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent<unknown>) => void) | null;
}

/** Narrow browser seam used to make watchdog behaviour deterministic in tests. */
export interface LayoutWorkerRuntime {
  createWorker(): WorkerLike;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
}

/**
 * Separates a server-side fallback from a browser that is unable to create Workers.
 * Tests inject this seam instead of mutating browser globals.
 */
export interface LayoutWorkerEnvironment {
  isBrowser: boolean;
  runtime: LayoutWorkerRuntime | null;
}

export interface ComputeLayoutWorkerDependencies {
  runtime?: LayoutWorkerRuntime;
  environment?: LayoutWorkerEnvironment;
  /** Test-only seam for proving a browser worker failure never falls back to the main thread. */
  computeSynchronously?: (
    nodes: NormalizedNode[],
    edges: NormalizedEdge[],
    configPartial?: Partial<CustomLayoutConfig>,
    mode?: string,
  ) => Promise<CustomLayoutResult> | CustomLayoutResult;
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

interface PendingRequest {
  id: string;
  resolve: (result: CustomLayoutResult) => void;
  reject: (error: Error) => void;
  timer: unknown;
  runtime: LayoutWorkerRuntime;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface WorkerState {
  worker: WorkerLike;
  runtime: LayoutWorkerRuntime;
  pendingRequests: Map<string, PendingRequest>;
}

let activeWorkerState: WorkerState | null = null;
let requestIdCounter = 0;

function getLayoutWorkerEnvironment(): LayoutWorkerEnvironment {
  if (typeof window === "undefined") {
    return { isBrowser: false, runtime: null };
  }

  if (typeof window.Worker === "undefined") {
    return { isBrowser: true, runtime: null };
  }

  return {
    isBrowser: true,
    runtime: {
      createWorker: () =>
        new Worker(new URL("./customLayoutWorker.ts", import.meta.url), { type: "module" }),
      setTimer: (callback, ms) => setTimeout(callback, ms),
      clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    },
  };
}

function terminateAndResetWorker(state: WorkerState, errorFactory: () => Error): void {
  if (activeWorkerState === state) {
    activeWorkerState = null;
  }
  const { worker, pendingRequests, runtime } = state;
  const pendingList = Array.from(pendingRequests.values());
  pendingRequests.clear();

  for (const pending of pendingList) {
    runtime.clearTimer(pending.timer);
    if (pending.signal && pending.onAbort) {
      pending.signal.removeEventListener("abort", pending.onAbort);
    }
    pending.reject(errorFactory());
  }

  try {
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
  } catch {
    // Ignore errors during termination
  }
}

/**
 * Resets and terminates the active Web Worker singleton instance.
 * Used for testing and catastrophic recovery.
 */
export function resetLayoutWorkerSingleton(): void {
  if (activeWorkerState) {
    terminateAndResetWorker(activeWorkerState, () => new LayoutCancelledError());
  }
}

/**
 * Test seam to introspect whether a worker singleton is currently active.
 */
export function getActiveWorkerForTesting(): WorkerLike | null {
  return activeWorkerState?.worker ?? null;
}

function getOrCreateWorkerState(runtime: LayoutWorkerRuntime): WorkerState {
  if (activeWorkerState && activeWorkerState.runtime === runtime) {
    return activeWorkerState;
  }

  if (activeWorkerState) {
    resetLayoutWorkerSingleton();
  }

  let worker: WorkerLike;
  try {
    worker = runtime.createWorker();
  } catch (error) {
    throw new LayoutWorkerError("Unable to start layout worker", {
      cause: error instanceof Error ? error : undefined,
    });
  }

  const pendingRequests = new Map<string, PendingRequest>();
  const state: WorkerState = {
    worker,
    runtime,
    pendingRequests,
  };
  activeWorkerState = state;

  worker.onmessage = (event: MessageEvent<CustomLayoutWorkerMessage>) => {
    const data = event.data;
    if (
      !data ||
      typeof data !== "object" ||
      typeof (data as unknown as { id?: unknown }).id !== "string"
    ) {
      terminateAndResetWorker(
        state,
        () => new LayoutWorkerError("Layout worker returned an unreadable message"),
      );
      return;
    }

    const pending = state.pendingRequests.get(data.id);
    if (!pending) {
      return;
    }

    state.pendingRequests.delete(data.id);
    state.runtime.clearTimer(pending.timer);
    if (pending.signal && pending.onAbort) {
      pending.signal.removeEventListener("abort", pending.onAbort);
    }

    if (data.type === "success" && data.result) {
      pending.resolve(data.result);
    } else {
      pending.reject(new LayoutWorkerError(data.error ?? "Unknown worker layout error"));
    }
  };

  worker.onerror = () => {
    terminateAndResetWorker(state, () => new LayoutWorkerError("Layout worker failed"));
  };

  worker.onmessageerror = () => {
    terminateAndResetWorker(
      state,
      () => new LayoutWorkerError("Layout worker returned an unreadable message"),
    );
  };

  return state;
}

/**
 * Computes layout asynchronously using a persistent Worker singleton whenever available.
 * Multiple requests are multiplexed with correlation IDs. Browser failures are terminal.
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

  const environment = dependencies.environment ?? getLayoutWorkerEnvironment();
  const runtime = dependencies.runtime ?? environment.runtime;
  const computeSynchronously = dependencies.computeSynchronously ?? computeCustomLayout;

  if (!runtime) {
    if (environment.isBrowser) {
      throw new LayoutWorkerError("Web Workers are unavailable in this browser");
    }

    // A true SSR/Node environment has no interactive main thread to freeze.
    return await computeSynchronously(nodes, edges, config, options.mode);
  }

  const state = getOrCreateWorkerState(runtime);
  const reqId = `req_${++requestIdCounter}_${Date.now()}`;

  return new Promise<CustomLayoutResult>((resolve, reject) => {
    const onAbort = () => {
      const pending = state.pendingRequests.get(reqId);
      if (!pending) return;
      state.pendingRequests.delete(reqId);
      state.runtime.clearTimer(pending.timer);
      if (pending.signal && pending.onAbort) {
        pending.signal.removeEventListener("abort", pending.onAbort);
      }
      if (state.pendingRequests.size === 0) {
        terminateAndResetWorker(state, () => new LayoutCancelledError());
      }
      reject(new LayoutCancelledError());
    };

    const onTimeout = () => {
      const pending = state.pendingRequests.get(reqId);
      if (!pending) return;
      terminateAndResetWorker(state, () => new LayoutTimeoutError(timeoutMs));
    };

    const timer = runtime.setTimer(onTimeout, timeoutMs);

    const pendingRecord: PendingRequest = {
      id: reqId,
      resolve,
      reject,
      timer,
      runtime,
      signal,
      onAbort,
    };

    state.pendingRequests.set(reqId, pendingRecord);

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      state.worker.postMessage({
        id: reqId,
        nodes,
        edges,
        configPartial: config,
        mode: options.mode,
      });
    } catch (error) {
      state.pendingRequests.delete(reqId);
      runtime.clearTimer(timer);
      if (signal && onAbort) {
        signal.removeEventListener("abort", onAbort);
      }
      terminateAndResetWorker(
        state,
        () =>
          new LayoutWorkerError("Failed to post message to layout worker", {
            cause: error instanceof Error ? error : undefined,
          }),
      );
      reject(
        new LayoutWorkerError("Failed to post message to layout worker", {
          cause: error instanceof Error ? error : undefined,
        }),
      );
    }
  });
}
