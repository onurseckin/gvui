import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  computeCustomLayoutAsync,
  getActiveWorkerForTesting,
  LayoutCancelledError,
  LayoutTimeoutError,
  LayoutWorkerError,
  resetLayoutWorkerSingleton,
  type LayoutWorkerRuntime,
  type WorkerLike,
} from "./customLayoutWorkerClient";
import type { CustomLayoutResult, NormalizedEdge, NormalizedNode } from "./types";
import type { CustomLayoutWorkerMessage } from "./customLayoutWorker";

describe("customLayoutWorkerClient", () => {
  beforeEach(() => {
    resetLayoutWorkerSingleton();
  });

  afterEach(() => {
    resetLayoutWorkerSingleton();
  });

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
    const expected = {
      nodes: [],
      edges: [],
      badges: [],
      crossings: [],
      validation: { isValid: true },
    } as unknown as CustomLayoutResult;
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

  it("resolves only a matching successful worker response and preserves the persistent worker singleton", async () => {
    let requestId: string | undefined;
    let clearTimerCalls = 0;
    const expected = {
      nodes: [],
      edges: [],
      badges: [],
      crossings: [],
      validation: { isValid: true },
    } as unknown as CustomLayoutResult;
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
    } as MessageEvent<{ id: string; type: "success"; result: CustomLayoutResult }>);
    await Promise.resolve();
    expect(settled).toBe(false);

    worker.onmessage?.({
      data: { id: requestId!, type: "success", result: expected },
    } as MessageEvent<{ id: string; type: "success"; result: CustomLayoutResult }>);
    expect(await promise).toBe(expected);
    expect(clearTimerCalls).toBe(1);
    expect(worker.terminateCalls).toBe(0);
  });

  it("reuses persistent worker singleton across multiple sequential requests", async () => {
    let createWorkerCalls = 0;
    const expectedA = {
      nodes: [{ id: "A", width: 100, height: 50, x: 10, y: 10 }],
      edges: [],
      badges: [],
      crossings: [],
      validation: { isValid: true },
    } as unknown as CustomLayoutResult;
    const expectedB = {
      nodes: [{ id: "B", width: 120, height: 60, x: 20, y: 20 }],
      edges: [],
      badges: [],
      crossings: [],
      validation: { isValid: true },
    } as unknown as CustomLayoutResult;

    let activeRequestId: string | undefined;
    const worker: WorkerLike & { terminateCalls: number } = {
      terminateCalls: 0,
      postMessage: (request) => {
        activeRequestId = request.id;
      },
      terminate() {
        this.terminateCalls += 1;
      },
    };

    const runtime: LayoutWorkerRuntime = {
      createWorker: () => {
        createWorkerCalls += 1;
        return worker;
      },
      setTimer: () => "timer-id",
      clearTimer: () => {},
    };

    const promiseA = computeCustomLayoutAsync(
      { nodes: [{ id: "A", width: 100, height: 50 }], edges: [] },
      { runtime },
    );
    expect(createWorkerCalls).toBe(1);
    worker.onmessage?.({
      data: { id: activeRequestId!, type: "success", result: expectedA },
    } as MessageEvent<{ id: string; type: "success"; result: CustomLayoutResult }>);
    const resultA = await promiseA;
    expect(resultA).toBe(expectedA);
    expect(worker.terminateCalls).toBe(0);

    const promiseB = computeCustomLayoutAsync(
      { nodes: [{ id: "B", width: 120, height: 60 }], edges: [] },
      { runtime },
    );
    expect(createWorkerCalls).toBe(1);
    worker.onmessage?.({
      data: { id: activeRequestId!, type: "success", result: expectedB },
    } as MessageEvent<{ id: string; type: "success"; result: CustomLayoutResult }>);
    const resultB = await promiseB;
    expect(resultB).toBe(expectedB);
    expect(worker.terminateCalls).toBe(0);
  });

  it("multiplexes concurrent worker requests with distinct correlation IDs", async () => {
    let createWorkerCalls = 0;
    const receivedRequestIds: string[] = [];
    const expected1 = {
      nodes: [{ id: "1", width: 10, height: 10, x: 1, y: 1 }],
      edges: [],
      badges: [],
      crossings: [],
      validation: { isValid: true },
    } as unknown as CustomLayoutResult;
    const expected2 = {
      nodes: [{ id: "2", width: 20, height: 20, x: 2, y: 2 }],
      edges: [],
      badges: [],
      crossings: [],
      validation: { isValid: true },
    } as unknown as CustomLayoutResult;

    const worker: WorkerLike & { terminateCalls: number } = {
      terminateCalls: 0,
      postMessage: (request) => {
        receivedRequestIds.push(request.id);
      },
      terminate() {
        this.terminateCalls += 1;
      },
    };

    const runtime: LayoutWorkerRuntime = {
      createWorker: () => {
        createWorkerCalls += 1;
        return worker;
      },
      setTimer: () => "timer-id",
      clearTimer: () => {},
    };

    const promise1 = computeCustomLayoutAsync(
      { nodes: [{ id: "1", width: 10, height: 10 }], edges: [] },
      { runtime },
    );
    const promise2 = computeCustomLayoutAsync(
      { nodes: [{ id: "2", width: 20, height: 20 }], edges: [] },
      { runtime },
    );

    expect(createWorkerCalls).toBe(1);
    expect(receivedRequestIds).toHaveLength(2);
    expect(receivedRequestIds[0]).not.toBe(receivedRequestIds[1]);

    // Respond out of order: response 2 first, then response 1
    worker.onmessage?.({
      data: { id: receivedRequestIds[1]!, type: "success", result: expected2 },
    } as MessageEvent<{ id: string; type: "success"; result: CustomLayoutResult }>);

    const result2 = await promise2;
    expect(result2).toBe(expected2);

    worker.onmessage?.({
      data: { id: receivedRequestIds[0]!, type: "success", result: expected1 },
    } as MessageEvent<{ id: string; type: "success"; result: CustomLayoutResult }>);

    const result1 = await promise1;
    expect(result1).toBe(expected1);
    expect(worker.terminateCalls).toBe(0);
  });

  it("handles concurrent requests where one is aborted and the other succeeds without orphan state", async () => {
    const receivedRequestIds: string[] = [];
    const expected2 = {
      nodes: [{ id: "2", width: 20, height: 20, x: 2, y: 2 }],
      edges: [],
      badges: [],
      crossings: [],
      validation: { isValid: true },
    } as unknown as CustomLayoutResult;

    const worker: WorkerLike & { terminateCalls: number } = {
      terminateCalls: 0,
      postMessage: (request) => {
        receivedRequestIds.push(request.id);
      },
      terminate() {
        this.terminateCalls += 1;
      },
    };

    const runtime: LayoutWorkerRuntime = {
      createWorker: () => worker,
      setTimer: () => "timer-id",
      clearTimer: () => {},
    };

    const controller1 = new AbortController();
    const promise1 = computeCustomLayoutAsync(
      { nodes: [{ id: "1", width: 10, height: 10 }], edges: [], signal: controller1.signal },
      { runtime },
    );
    const promise2 = computeCustomLayoutAsync(
      { nodes: [{ id: "2", width: 20, height: 20 }], edges: [] },
      { runtime },
    );

    expect(receivedRequestIds).toHaveLength(2);

    // Abort Request 1 while Request 2 is still running
    controller1.abort();

    let err1: unknown;
    try {
      await promise1;
    } catch (err) {
      err1 = err;
    }
    expect(err1 instanceof LayoutCancelledError).toBe(true);

    // Request 2 completes successfully on the same worker
    worker.onmessage?.({
      data: { id: receivedRequestIds[1]!, type: "success", result: expected2 },
    } as MessageEvent<CustomLayoutWorkerMessage>);

    const result2 = await promise2;
    expect(result2).toBe(expected2);
    // Worker was not terminated because request 2 was still active when request 1 was aborted
    expect(worker.terminateCalls).toBe(0);

    // Late message for request 1 arrives and is safely ignored
    worker.onmessage?.({
      data: { id: receivedRequestIds[0]!, type: "success", result: {} as CustomLayoutResult },
    } as MessageEvent<CustomLayoutWorkerMessage>);

    // Subsequent request works seamlessly on the same singleton
    const expected3 = {
      nodes: [{ id: "3", width: 30, height: 30 }],
      edges: [],
      badges: [],
      crossings: [],
      validation: { isValid: true },
    } as unknown as CustomLayoutResult;

    const promise3 = computeCustomLayoutAsync(
      { nodes: [{ id: "3", width: 30, height: 30 }], edges: [] },
      { runtime },
    );
    expect(receivedRequestIds).toHaveLength(3);

    worker.onmessage?.({
      data: { id: receivedRequestIds[2]!, type: "success", result: expected3 },
    } as MessageEvent<CustomLayoutWorkerMessage>);

    const result3 = await promise3;
    expect(result3).toBe(expected3);
  });

  it("handles already-aborted signal without sending message or leaving orphan state", async () => {
    let messageCount = 0;
    const worker: WorkerLike = {
      postMessage: () => {
        messageCount += 1;
      },
      terminate: () => {},
    };
    const runtime: LayoutWorkerRuntime = {
      createWorker: () => worker,
      setTimer: () => "t",
      clearTimer: () => {},
    };

    const controller = new AbortController();
    controller.abort();

    let error: unknown;
    try {
      await computeCustomLayoutAsync(
        { nodes: [{ id: "A", width: 100, height: 50 }], edges: [], signal: controller.signal },
        { runtime },
      );
    } catch (err) {
      error = err;
    }

    expect(error instanceof LayoutCancelledError).toBe(true);
    expect(messageCount).toBe(0);
  });

  it("cleans up active request listeners and timers on timeout and abort without memory leaks", async () => {
    let clearTimerCalls = 0;
    let timeoutCallback: (() => void) | undefined;
    const worker: WorkerLike & { terminateCalls: number } = {
      terminateCalls: 0,
      postMessage: () => {},
      terminate() {
        this.terminateCalls += 1;
      },
    };

    const runtime: LayoutWorkerRuntime = {
      createWorker: () => worker,
      setTimer: (cb) => {
        timeoutCallback = cb;
        return "timer-1";
      },
      clearTimer: () => {
        clearTimerCalls += 1;
      },
    };

    const controller = new AbortController();
    let listenerRemoved = false;
    const originalRemove = controller.signal.removeEventListener.bind(controller.signal);
    controller.signal.removeEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      if (type === "abort") {
        listenerRemoved = true;
      }
      originalRemove(type, listener, options);
    };

    const promise = computeCustomLayoutAsync(
      { nodes: [{ id: "A", width: 10, height: 10 }], edges: [], signal: controller.signal },
      { runtime },
    );

    timeoutCallback?.();

    let timeoutError: unknown;
    try {
      await promise;
    } catch (err) {
      timeoutError = err;
    }

    expect(timeoutError instanceof LayoutTimeoutError).toBe(true);
    expect(clearTimerCalls).toBe(1);
    expect(listenerRemoved).toBe(true);
    expect(worker.terminateCalls).toBe(1);
  });

  it("proves multiple subsequent requests succeed in sequence after a watchdog timeout", async () => {
    let timeoutCallback: (() => void) | undefined;
    let createWorkerCalls = 0;
    let currentWorker: (WorkerLike & { terminateCalls: number }) | null = null;
    let lastRequestId: string | undefined;

    const runtime: LayoutWorkerRuntime = {
      createWorker: () => {
        createWorkerCalls += 1;
        const mock = {
          terminateCalls: 0,
          postMessage: (req: { id: string }) => {
            lastRequestId = req.id;
          },
          terminate() {
            this.terminateCalls += 1;
          },
        };
        currentWorker = mock;
        return mock;
      },
      setTimer: (cb) => {
        timeoutCallback = cb;
        return "timer";
      },
      clearTimer: () => {},
    };

    // 1. Initial request times out
    const promise1 = computeCustomLayoutAsync(
      { nodes: [{ id: "1", width: 10, height: 10 }], edges: [] },
      { runtime },
    );
    expect(createWorkerCalls).toBe(1);
    const worker1 = currentWorker!;
    timeoutCallback?.();

    let err1: unknown;
    try {
      await promise1;
    } catch (e) {
      err1 = e;
    }
    expect(err1 instanceof LayoutTimeoutError).toBe(true);
    expect(worker1.terminateCalls).toBe(1);

    // 2. Subsequent request 2 re-spawns a fresh worker and succeeds
    const expected2 = {
      nodes: [{ id: "2", width: 20, height: 20 }],
      edges: [],
      badges: [],
      crossings: [],
      validation: { isValid: true },
    } as unknown as CustomLayoutResult;

    const promise2 = computeCustomLayoutAsync(
      { nodes: [{ id: "2", width: 20, height: 20 }], edges: [] },
      { runtime },
    );
    expect(createWorkerCalls).toBe(2);
    const worker2 = currentWorker!;

    worker2.onmessage?.({
      data: { id: lastRequestId!, type: "success", result: expected2 },
    } as MessageEvent<CustomLayoutWorkerMessage>);

    const result2 = await promise2;
    expect(result2).toBe(expected2);
    expect(worker2.terminateCalls).toBe(0);

    // 3. Subsequent request 3 reuses the new worker singleton
    const expected3 = {
      nodes: [{ id: "3", width: 30, height: 30 }],
      edges: [],
      badges: [],
      crossings: [],
      validation: { isValid: true },
    } as unknown as CustomLayoutResult;

    const promise3 = computeCustomLayoutAsync(
      { nodes: [{ id: "3", width: 30, height: 30 }], edges: [] },
      { runtime },
    );
    expect(createWorkerCalls).toBe(2); // no new worker created, reused singleton!

    worker2.onmessage?.({
      data: { id: lastRequestId!, type: "success", result: expected3 },
    } as MessageEvent<CustomLayoutWorkerMessage>);

    const result3 = await promise3;
    expect(result3).toBe(expected3);
    expect(worker2.terminateCalls).toBe(0);
  });

  it("proves multiple subsequent requests succeed in sequence after a worker error crash", async () => {
    let createWorkerCalls = 0;
    let currentWorker: (WorkerLike & { terminateCalls: number; onerror?: () => void }) | null =
      null;
    let lastRequestId: string | undefined;

    const runtime: LayoutWorkerRuntime = {
      createWorker: () => {
        createWorkerCalls += 1;
        const mock = {
          terminateCalls: 0,
          postMessage: (req: { id: string }) => {
            lastRequestId = req.id;
          },
          terminate() {
            this.terminateCalls += 1;
          },
        };
        currentWorker = mock;
        return mock;
      },
      setTimer: () => "timer",
      clearTimer: () => {},
    };

    // 1. Initial request fails on worker error
    const promise1 = computeCustomLayoutAsync(
      { nodes: [{ id: "1", width: 10, height: 10 }], edges: [] },
      { runtime },
    );
    expect(createWorkerCalls).toBe(1);
    const worker1 = currentWorker!;
    worker1.onerror?.();

    let err1: unknown;
    try {
      await promise1;
    } catch (e) {
      err1 = e;
    }
    expect(err1 instanceof LayoutWorkerError).toBe(true);
    expect(worker1.terminateCalls).toBe(1);

    // 2. Subsequent request 2 re-spawns worker and succeeds
    const expected2 = {
      nodes: [{ id: "2", width: 20, height: 20 }],
      edges: [],
      badges: [],
      crossings: [],
      validation: { isValid: true },
    } as unknown as CustomLayoutResult;

    const promise2 = computeCustomLayoutAsync(
      { nodes: [{ id: "2", width: 20, height: 20 }], edges: [] },
      { runtime },
    );
    expect(createWorkerCalls).toBe(2);
    const worker2 = currentWorker!;

    worker2.onmessage?.({
      data: { id: lastRequestId!, type: "success", result: expected2 },
    } as MessageEvent<CustomLayoutWorkerMessage>);

    const result2 = await promise2;
    expect(result2).toBe(expected2);

    // 3. Subsequent request 3 reuses worker2
    const expected3 = {
      nodes: [{ id: "3", width: 30, height: 30 }],
      edges: [],
      badges: [],
      crossings: [],
      validation: { isValid: true },
    } as unknown as CustomLayoutResult;

    const promise3 = computeCustomLayoutAsync(
      { nodes: [{ id: "3", width: 30, height: 30 }], edges: [] },
      { runtime },
    );
    expect(createWorkerCalls).toBe(2);

    worker2.onmessage?.({
      data: { id: lastRequestId!, type: "success", result: expected3 },
    } as MessageEvent<CustomLayoutWorkerMessage>);

    const result3 = await promise3;
    expect(result3).toBe(expected3);
    expect(worker2.terminateCalls).toBe(0);
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

  it("handles worker crash recovery when multiple requests are in-flight", async () => {
    let createCount = 0;
    let currentWorker: (WorkerLike & { onerror?: () => void; terminateCalls: number }) | null =
      null;
    let lastRequestId: string | undefined;

    const runtime: LayoutWorkerRuntime = {
      createWorker: () => {
        createCount += 1;
        const mock = {
          terminateCalls: 0,
          postMessage: (req: { id: string }) => {
            lastRequestId = req.id;
          },
          terminate() {
            this.terminateCalls += 1;
          },
        };
        currentWorker = mock;
        return mock;
      },
      setTimer: () => "timer",
      clearTimer: () => {},
    };

    const promise1 = computeCustomLayoutAsync(
      { nodes: [{ id: "A", width: 10, height: 10 }], edges: [] },
      { runtime },
    );
    const promise2 = computeCustomLayoutAsync(
      { nodes: [{ id: "B", width: 20, height: 20 }], edges: [] },
      { runtime },
    );

    expect(createCount).toBe(1);
    const crashedWorker = currentWorker!;

    // Crash the active worker
    crashedWorker.onerror?.();

    let err1: unknown;
    let err2: unknown;
    try {
      await promise1;
    } catch (e) {
      err1 = e;
    }
    try {
      await promise2;
    } catch (e) {
      err2 = e;
    }

    expect(err1 instanceof LayoutWorkerError).toBe(true);
    expect(err2 instanceof LayoutWorkerError).toBe(true);
    expect(crashedWorker.terminateCalls).toBe(1);

    // Next request creates a new healthy worker and succeeds
    const expected = {
      nodes: [{ id: "C", width: 30, height: 30 }],
      edges: [],
      badges: [],
      crossings: [],
      validation: { isValid: true },
    } as unknown as CustomLayoutResult;

    const promise3 = computeCustomLayoutAsync(
      { nodes: [{ id: "C", width: 30, height: 30 }], edges: [] },
      { runtime },
    );
    expect(createCount).toBe(2);

    const healthyWorker = currentWorker as
      | (WorkerLike & {
          onmessage?: (event: MessageEvent<CustomLayoutWorkerMessage>) => void;
        })
      | null;
    healthyWorker?.onmessage?.({
      data: { id: lastRequestId!, type: "success", result: expected },
    } as MessageEvent<CustomLayoutWorkerMessage>);

    const result3 = await promise3;
    expect(result3).toBe(expected);
  });

  it("resets worker singleton and aborts pending requests when resetLayoutWorkerSingleton is invoked", async () => {
    let terminated = false;
    const worker: WorkerLike = {
      postMessage: () => {},
      terminate: () => {
        terminated = true;
      },
    };
    const runtime: LayoutWorkerRuntime = {
      createWorker: () => worker,
      setTimer: () => "t",
      clearTimer: () => {},
    };

    const promise = computeCustomLayoutAsync(
      { nodes: [{ id: "A", width: 100, height: 50 }], edges: [] },
      { runtime },
    );
    expect(getActiveWorkerForTesting()).toBe(worker);

    resetLayoutWorkerSingleton();
    expect(getActiveWorkerForTesting()).toBeNull();
    expect(terminated).toBe(true);

    let cancelError: unknown;
    try {
      await promise;
    } catch (err) {
      cancelError = err;
    }
    expect(cancelError instanceof LayoutCancelledError).toBe(true);
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

  it("resolves layout successfully when worker posts success message", async () => {
    let requestId: string | undefined;
    const expectedResult = {
      nodes: [],
      edges: [],
      badges: [],
      crossings: [],
      validation: { isValid: true },
    } as unknown as CustomLayoutResult;

    const worker: WorkerLike & { terminateCalls: number } = {
      terminateCalls: 0,
      postMessage: (msg) => {
        requestId = msg.id;
      },
      terminate: () => {},
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

    worker.onmessage?.({
      data: { id: requestId!, type: "success", result: expectedResult },
    } as MessageEvent<{ id: string; type: "success"; result: CustomLayoutResult }>);

    const result = await promise;
    expect(result).toBe(expectedResult);
  });

  it("streams layout optimization synchronously without worker seam", async () => {
    const nodes: NormalizedNode[] = [
      { id: "A", width: 100, height: 50 },
      { id: "B", width: 100, height: 50 },
    ];
    const edges: NormalizedEdge[] = [{ id: "e1", source: "A", target: "B" }];

    const result = await computeCustomLayoutAsync(
      { nodes, edges },
      { environment: { isBrowser: false, runtime: null } },
    );

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });
});
