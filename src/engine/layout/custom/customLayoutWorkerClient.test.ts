import { describe, expect, it } from "bun:test";
import {
  computeCustomLayoutAsync,
  LayoutWorkerError,
  type LayoutWorkerRuntime,
  type WorkerLike,
} from "./customLayoutWorkerClient";
import type { NormalizedEdge, NormalizedNode } from "./types";

describe("customLayoutWorkerClient", () => {
  it("rejects a browser without Worker support instead of using the main thread", async () => {
    let syncOptimizeCalls = 0;

    let receivedError: unknown;
    try {
      await computeCustomLayoutAsync(
        { nodes: [{ id: "A", width: 100, height: 50 }], edges: [] },
        {
          environment: { isBrowser: true, runtime: null },
          computeSynchronously: () => {
            syncOptimizeCalls += 1;
            throw new Error("must not run");
          },
        },
      );
    } catch (error) {
      receivedError = error;
    }

    expect(receivedError instanceof LayoutWorkerError).toBe(true);
    expect(syncOptimizeCalls).toBe(0);
  });

  it("uses the synchronous engine only for an explicit server environment", async () => {
    const expected = { nodes: [], edges: [], badges: [], crossings: [], validation: {} } as never;
    let syncOptimizeCalls = 0;

    const result = await computeCustomLayoutAsync(
      { nodes: [{ id: "A", width: 100, height: 50 }], edges: [] },
      {
        environment: { isBrowser: false, runtime: null },
        computeSynchronously: () => {
          syncOptimizeCalls += 1;
          return expected;
        },
      },
    );

    expect(result).toBe(expected);
    expect(syncOptimizeCalls).toBe(1);
  });

  it("resolves only a matching successful worker response", async () => {
    let requestId: string | undefined;
    let clearTimerCalls = 0;
    const expected = { nodes: [], edges: [], badges: [], crossings: [], validation: {} } as never;
    const worker: WorkerLike & {
      terminateCalls: number;
    } = {
      terminateCalls: 0,
      postMessage: (request) => {
        requestId = request.id;
      },
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
          clearTimer: () => {
            clearTimerCalls += 1;
          },
        },
      },
    );
    let settled = false;
    void promise.then(() => {
      settled = true;
    });

    worker.onmessage?.({
      data: { id: "other-request", type: "success", result: expected },
    } as never);
    await Promise.resolve();
    expect(settled).toBe(false);

    worker.onmessage?.({ data: { id: requestId!, type: "success", result: expected } } as never);
    expect(await promise).toBe(expected);
    expect(clearTimerCalls).toBe(1);
    expect(worker.terminateCalls).toBe(1);
  });

  it("turns a postMessage failure into a typed worker error and cleans up once", async () => {
    let clearTimerCalls = 0;
    const worker = {
      terminateCalls: 0,
      postMessage: () => {
        throw new Error("clone failed");
      },
      terminate() {
        this.terminateCalls += 1;
      },
    };

    let receivedError: unknown;
    try {
      await computeCustomLayoutAsync(
        { nodes: [{ id: "A", width: 100, height: 50 }], edges: [] },
        {
          runtime: {
            createWorker: () => worker,
            setTimer: () => "watchdog",
            clearTimer: () => {
              clearTimerCalls += 1;
            },
          },
        },
      );
    } catch (error) {
      receivedError = error;
    }

    expect(receivedError instanceof LayoutWorkerError).toBe(true);
    expect(clearTimerCalls).toBe(1);
    expect(worker.terminateCalls).toBe(1);
  });

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
    let clearTimerCalls = 0;
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
      clearTimer: () => {
        clearTimerCalls += 1;
      },
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
    expect(clearTimerCalls).toBe(1);
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

  it("invokes onProgress callback when worker streams progress messages", async () => {
    let requestId: string | undefined;
    const expectedResult = { nodes: [], edges: [], badges: [], crossings: [], validation: {} } as never;
    const progressEvents: Array<{
      stageIndex: number;
      totalStages: number;
      percent: number;
      stageText: string;
      detail: string;
    }> = [];

    const worker: WorkerLike & { terminateCalls: number } = {
      terminateCalls: 0,
      postMessage: (request) => {
        requestId = request.id;
      },
      terminate() {
        this.terminateCalls += 1;
      },
    };

    const promise = computeCustomLayoutAsync(
      {
        nodes: [{ id: "A", width: 100, height: 50 }],
        edges: [],
        onProgress: (progress) => {
          progressEvents.push(progress);
        },
      },
      {
        runtime: {
          createWorker: () => worker,
          setTimer: () => "watchdog",
          clearTimer: () => {},
        },
      },
    );

    worker.onmessage?.({
      data: {
        id: requestId!,
        type: "progress",
        stageIndex: 1,
        totalStages: 5,
        percent: 20,
        stageText: "Stage 1 of 5",
        detail: "Normalizing topology...",
      },
    } as never);

    worker.onmessage?.({
      data: {
        id: requestId!,
        type: "progress",
        stageIndex: 2,
        totalStages: 5,
        percent: 40,
        stageText: "Stage 2 of 5",
        detail: "Building hierarchy tree...",
      },
    } as never);

    expect(progressEvents.length).toBe(2);
    expect(progressEvents[0].detail).toBe("Normalizing topology...");
    expect(progressEvents[1].detail).toBe("Building hierarchy tree...");

    worker.onmessage?.({
      data: { id: requestId!, type: "success", result: expectedResult },
    } as never);

    const result = await promise;
    expect(result).toBe(expectedResult);
  });

  it("streams 20+ granular micro-stage progress events during layout optimization", async () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B" }];
    const progressEvents: Array<{
      stageIndex: number;
      totalStages: number;
      percent: number;
      stageText: string;
      detail: string;
    }> = [];

    await computeCustomLayoutAsync(
      {
        nodes,
        edges,
        onProgress: (progress) => {
          progressEvents.push(progress);
        },
      },
      { environment: { isBrowser: false, runtime: null } },
    );

    expect(progressEvents.length).toBeGreaterThanOrEqual(20);
    expect(progressEvents.length).toBe(32);
    expect(progressEvents[0].stageIndex).toBe(1);
    expect(progressEvents[0].stageText).toBe("Step 1/32");
    expect(progressEvents[31].stageIndex).toBe(32);
    expect(progressEvents[31].percent).toBe(100);
    expect(progressEvents.some((p) => p.detail.includes("A* pathfinder"))).toBe(true);
  });
});

