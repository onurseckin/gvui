import { describe, expect, it } from "bun:test";
import { computeCustomLayoutAsync, type LayoutWorkerRuntime } from "./customLayoutWorkerClient";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("customLayoutWorkerClient", () => {
  it("terminates a nonresponsive browser worker once without running synchronously", async () => {
    let timeoutCallback: (() => void) | undefined;
    let syncOptimizeCalls = 0;
    const worker = {
      terminateCalls: 0,
      postMessage: () => {},
      terminate() {
        this.terminateCalls += 1;
      },
    };
    const runtime: LayoutWorkerRuntime = {
      createWorker: () => worker,
      setTimer: (callback) => {
        timeoutCallback = callback;
        return "watchdog";
      },
      clearTimer: () => {},
    };

    const promise = computeCustomLayoutAsync(
      {
        nodes: [{ id: "A", width: 100, height: 50 }],
        edges: [],
        timeoutMs: 1,
      },
      {
        runtime,
        computeSynchronously: () => {
          syncOptimizeCalls += 1;
          throw new Error("must not run");
        },
      },
    );

    timeoutCallback?.();

    let timeoutError: unknown;
    try {
      await promise;
    } catch (error) {
      timeoutError = error;
    }
    expect((timeoutError as Error).name).toBe("LayoutTimeoutError");
    expect(worker.terminateCalls).toBe(1);
    expect(syncOptimizeCalls).toBe(0);
  });

  it("settles a browser worker request once when abort races a later response", async () => {
    let timeoutCallback: (() => void) | undefined;
    const worker: {
      terminateCalls: number;
      onmessage?: (event: { data: unknown }) => void;
      postMessage: () => void;
      terminate: () => void;
    } = {
      terminateCalls: 0,
      postMessage: () => {},
      terminate() {
        this.terminateCalls += 1;
      },
    };
    const runtime: LayoutWorkerRuntime = {
      createWorker: () => worker,
      setTimer: (callback) => {
        timeoutCallback = callback;
        return "watchdog";
      },
      clearTimer: () => {},
    };
    const controller = new AbortController();
    const promise = computeCustomLayoutAsync(
      { nodes: [{ id: "A", width: 100, height: 50 }], edges: [], signal: controller.signal },
      { runtime },
    );

    controller.abort();
    worker.onmessage?.({ data: { id: "late", type: "success", result: {} } });
    timeoutCallback?.();

    let cancelError: unknown;
    try {
      await promise;
    } catch (error) {
      cancelError = error;
    }
    expect((cancelError as Error).message).toContain("cancelled");
    expect(worker.terminateCalls).toBe(1);
  });

  it("rejects browser worker error events without falling back to synchronous layout", async () => {
    let syncOptimizeCalls = 0;
    const worker: {
      terminateCalls: number;
      onerror?: () => void;
      postMessage: () => void;
      terminate: () => void;
    } = {
      terminateCalls: 0,
      postMessage: () => {},
      terminate() {
        this.terminateCalls += 1;
      },
    };
    const runtime: LayoutWorkerRuntime = {
      createWorker: () => worker,
      setTimer: () => "watchdog",
      clearTimer: () => {},
    };
    const promise = computeCustomLayoutAsync(
      { nodes: [{ id: "A", width: 100, height: 50 }], edges: [] },
      {
        runtime,
        computeSynchronously: () => {
          syncOptimizeCalls += 1;
          throw new Error("must not run");
        },
      },
    );

    worker.onerror?.();

    let workerError: unknown;
    try {
      await promise;
    } catch (error) {
      workerError = error;
    }
    expect((workerError as Error).name).toBe("LayoutWorkerError");
    expect(worker.terminateCalls).toBe(1);
    expect(syncOptimizeCalls).toBe(0);
  });

  it("rejects unreadable worker messages once and terminates the worker", async () => {
    const worker: {
      terminateCalls: number;
      onmessageerror?: () => void;
      postMessage: () => void;
      terminate: () => void;
    } = {
      terminateCalls: 0,
      postMessage: () => {},
      terminate() {
        this.terminateCalls += 1;
      },
    };
    const promise = computeCustomLayoutAsync(
      { nodes: [{ id: "A", width: 100, height: 50 }], edges: [] },
      {
        runtime: {
          createWorker: () => worker,
          setTimer: () => "watchdog",
          clearTimer: () => {},
        },
      },
    );

    worker.onmessageerror?.();
    worker.onmessageerror?.();

    let workerError: unknown;
    try {
      await promise;
    } catch (error) {
      workerError = error;
    }
    expect((workerError as Error).name).toBe("LayoutWorkerError");
    expect(worker.terminateCalls).toBe(1);
  });

  it("rejects worker construction failure instead of using the main thread", async () => {
    let syncOptimizeCalls = 0;
    const promise = computeCustomLayoutAsync(
      { nodes: [{ id: "A", width: 100, height: 50 }], edges: [] },
      {
        runtime: {
          createWorker: () => {
            throw new Error("worker blocked");
          },
          setTimer: () => "watchdog",
          clearTimer: () => {},
        },
        computeSynchronously: () => {
          syncOptimizeCalls += 1;
          throw new Error("must not run");
        },
      },
    );

    let workerError: unknown;
    try {
      await promise;
    } catch (error) {
      workerError = error;
    }
    expect((workerError as Error).name).toBe("LayoutWorkerError");
    expect(syncOptimizeCalls).toBe(0);
  });

  it("resolves layout asynchronously via computeCustomLayoutAsync fallback or worker", async () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B" }];

    const result = await computeCustomLayoutAsync({ nodes, edges, timeoutMs: 3000 });

    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(1);
    expect(result.validation.isValid).toBe(true);
  });

  it("handles cancellation via AbortSignal", async () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B" }];

    const controller = new AbortController();
    controller.abort();

    let errorEmitted = false;
    try {
      await computeCustomLayoutAsync({ nodes, edges, signal: controller.signal });
    } catch (err) {
      errorEmitted = true;
      expect((err as Error).message).toContain("cancelled");
    }
    expect(errorEmitted).toBe(true);
  });
});
