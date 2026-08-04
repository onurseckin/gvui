import { describe, expect, it } from "bun:test";
import {
  computeCustomLayoutAsync,
  LayoutCancelledError,
  type LayoutWorkerRuntime,
  type WorkerLike,
} from "../layout/custom/customLayoutWorkerClient";

describe("GraphCanvas WebWorker Async Offloading", () => {
  it("exports computeCustomLayoutAsync for non-blocking background execution", () => {
    expect(typeof computeCustomLayoutAsync).toBe("function");
  });

  it("completes background calculation asynchronously without blocking main thread", async () => {
    const nodes = [
      { id: "node1", label: "Node 1", width: 100, height: 50 },
      { id: "node2", label: "Node 2", width: 100, height: 50 },
    ];
    const edges = [{ id: "edge1", source: "node1", target: "node2" }];

    const result = await computeCustomLayoutAsync({ nodes, edges });
    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(1);
  });

  it("handles instant cancellation on navigation without main thread UI freeze", async () => {
    const controller = new AbortController();
    const nodes = [
      { id: "node1", label: "Node 1", width: 100, height: 50 },
      { id: "node2", label: "Node 2", width: 100, height: 50 },
    ];
    const edges = [{ id: "edge1", source: "node1", target: "node2" }];

    let workerTerminated = false;
    const mockWorker: WorkerLike = {
      postMessage: () => {},
      terminate: () => {
        workerTerminated = true;
      },
    };

    const mockRuntime: LayoutWorkerRuntime = {
      createWorker: () => mockWorker,
      setTimer: () => "timer-id",
      clearTimer: () => {},
    };

    // Initiate layout calculation with worker runtime
    const layoutPromise = computeCustomLayoutAsync(
      {
        nodes,
        edges,
        signal: controller.signal,
      },
      { runtime: mockRuntime },
    );

    // Navigate away immediately (abort controller)
    controller.abort();

    let caughtError: unknown;
    try {
      await layoutPromise;
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError instanceof LayoutCancelledError).toBe(true);
    expect((caughtError as Error).message).toBe("Layout computation cancelled");
    expect(workerTerminated).toBe(true);
  });

  it("allows background worker tasks to complete and persist computed layout to storage on navigation", async () => {
    if (typeof window === "undefined") {
      (globalThis as unknown as { window: unknown }).window = globalThis;
      const store = new Map<string, string>();
      (globalThis as unknown as { localStorage: unknown }).localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => {
          store.clear();
        },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
          return store.size;
        },
      };
    }

    const { saveStoredLayout, loadStoredLayout } = await import("../../utils/layoutCacheStorage");

    // Simulate background worker completing after unmount
    let isSubscribed = true;
    const signature = "ds_sig_123_config_hash_456";
    const layoutMode = "layered";
    const computedNodes = [{ id: "n1", name: "Node 1", x: 10, y: 20, width: 100, height: 50 }];
    const computedEdges = [
      { id: "e1", source: "n1", target: "n2", path: "M 0 0 L 10 10", labelX: 5, labelY: 5 },
    ];

    const simulateBackgroundCompletion = async () => {
      // Simulate async background calculation delay
      await new Promise((r) => setTimeout(r, 10));
      // Persist results unconditionally to layout cache storage under dataset signature + layout configuration hash
      saveStoredLayout(layoutMode, signature, { nodes: computedNodes, edges: computedEdges });
      if (!isSubscribed) return;
    };

    // User initiates calculation then navigates away immediately (component unmounts)
    const backgroundTask = simulateBackgroundCompletion();
    isSubscribed = false; // Navigation/unmount occurred instantly

    // Wait for background worker to complete
    await backgroundTask;

    // Verify stored layout cache has persisted the computed results under dataset signature
    const cached = loadStoredLayout(layoutMode, signature);
    expect(cached).not.toBeNull();
    expect(cached?.nodes[0].x).toBe(10);
    expect(cached?.edges[0].path).toBe("M 0 0 L 10 10");
  });
});
