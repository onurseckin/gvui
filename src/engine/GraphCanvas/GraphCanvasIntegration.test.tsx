import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as bunTest from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { GraphDataset } from "../../types/graphData";
import { generateDatasetSignature } from "../../utils/fileStorage";
import { loadStoredLayout, saveStoredLayout } from "../../utils/layoutCacheStorage";
import { localDb } from "../../utils/localDb";
import { useGraphStore } from "../../state/useGraphStore";
import { DEFAULT_CUSTOM_LAYOUT_CONFIG } from "../layout/custom/config";
import type { CustomLayoutConfig } from "../layout/custom/config";
import type { LayoutMode } from "../../state/useGraphStore";
import * as realCustomLayoutAdapterModule from "../layout/customLayoutAdapter";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
  const store = new Map<string, string>();
  const mockLocalStorage = {
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
  (globalThis as unknown as { localStorage: unknown }).localStorage = mockLocalStorage;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The subset of bun:test's real `mock` export this file needs. */
interface ModuleMocker {
  module(id: string, factory: () => unknown): void | Promise<void>;
}

// `src/types/bun-test.d.ts` is a hand-maintained ambient shim for "bun:test" that predates
// `mock.module` and doesn't declare it, even though bun:test ships the export at runtime (this is
// not an `any` — it's a single documented bridge cast to the minimal shape this file relies on).
const mock = (bunTest as unknown as { mock: ModuleMocker }).mock;

// Copied into plain variables *before* any `mock.module` call — `mock.module` overwrites a
// module's export table in place, and an `import * as ns` binding is a live reference into that
// same table, so restoring from the namespace object later would just hand back whatever the
// module currently holds (including a still-active mock). See customLayoutAdapter.test.ts for the
// same pattern.
const originalComputeCustomEngineGraphLayoutAsync =
  realCustomLayoutAdapterModule.computeCustomEngineGraphLayoutAsync;
const originalComputeCustomEngineGraphLayout =
  realCustomLayoutAdapterModule.computeCustomEngineGraphLayout;

function restoreCustomLayoutAdapterModule(): void {
  mock.module("../layout/customLayoutAdapter", () => ({
    computeCustomEngineGraphLayoutAsync: originalComputeCustomEngineGraphLayoutAsync,
    computeCustomEngineGraphLayout: originalComputeCustomEngineGraphLayout,
  }));
}

function silenceReactTestRendererDeprecationWarning<T>(fn: () => T): T {
  const originalConsoleError = console.error;
  console.error = (message?: unknown, ...args: unknown[]) => {
    if (
      message ===
      "react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer"
    ) {
      return;
    }
    originalConsoleError(message, ...args);
  };
  try {
    return fn();
  } finally {
    console.error = originalConsoleError;
  }
}

const initialStoreState = useGraphStore.getState();

/** Flushes the microtask queue enough hops for a mocked promise's `.then`/`.catch` chain (plus the
 * state update it triggers) to settle and commit inside `act`. */
async function flushEffects(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("GraphCanvas Storage Integration", () => {
  it("loads layout from storage instantly on mode and signature hit", () => {
    const dataset: GraphDataset = {
      id: "test-ds",
      title: "Test Dataset",
      nodes: [{ id: "n1", name: "Node 1" }],
      edges: [],
    };
    const sig = generateDatasetSignature(dataset);

    const layout = {
      nodes: [{ id: "n1", name: "Node 1", x: 50, y: 50, width: 100, height: 50 }],
      edges: [],
    };

    saveStoredLayout("layered", sig, layout);
    const cachedHit = loadStoredLayout("layered", sig);
    const cachedMiss = loadStoredLayout("layered", "other-sig");

    expect(cachedHit).not.toBeNull();
    expect(cachedHit?.nodes[0].x).toBe(50);
    expect(cachedMiss).toBeNull();
  });
});

describe("GraphCanvas rendered lifecycle (worker failure and cache-key sensitivity)", () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    localDb.clearDatabase();
    useGraphStore.setState(initialStoreState, true);
  });

  afterEach(() => {
    if (renderer) {
      silenceReactTestRendererDeprecationWarning(() => {
        act(() => {
          renderer?.unmount();
        });
      });
      renderer = undefined;
    }
    restoreCustomLayoutAdapterModule();
    localDb.clearDatabase();
    useGraphStore.setState(initialStoreState, true);
  });

  const dataset: GraphDataset = {
    id: "canvas-integration-ds",
    title: "Canvas Integration Dataset",
    nodes: [
      { id: "n1", name: "Node 1" },
      { id: "n2", name: "Node 2" },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
  };

  function layoutResult(marker: number) {
    return {
      nodes: [
        { id: "n1", name: "Node 1", x: marker, y: marker, width: 100, height: 50 },
        { id: "n2", name: "Node 2", x: marker + 200, y: marker, width: 100, height: 50 },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2", path: `M ${marker} ${marker} L 1 1` }],
    };
  }

  it("recomputes when a layout-affecting config field changes, but not for cornerRadius/edgeStyle/zoomSensitivity", async () => {
    const calls: { configPartial?: Partial<CustomLayoutConfig>; mode?: LayoutMode }[] = [];

    mock.module("../layout/customLayoutAdapter", () => ({
      computeCustomEngineGraphLayoutAsync: (
        _dataset: GraphDataset,
        options?: { configPartial?: Partial<CustomLayoutConfig>; mode?: LayoutMode },
      ) => {
        calls.push({ configPartial: options?.configPartial, mode: options?.mode });
        return Promise.resolve(layoutResult(calls.length));
      },
      computeCustomEngineGraphLayout: originalComputeCustomEngineGraphLayout,
    }));

    const { GraphCanvas } = await import("./index");

    useGraphStore.setState({
      dataset,
      currentFile: "integration.json",
      layoutMode: "layered",
      layoutConfig: { ...DEFAULT_CUSTOM_LAYOUT_CONFIG },
    });

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(createElement(GraphCanvas));
      });
    });
    await flushEffects();

    expect(calls).toHaveLength(1);
    expect(useGraphStore.getState().positionedNodes[0]?.x).toBe(1);

    // Render-only fields: excluded from the cache signature in `GraphCanvas/index.tsx`'s
    // `computeLayoutConfigHash` (`cornerRadius`/`edgeStyle` are applied client-side by
    // `buildEdgePath`; `zoomSensitivity` never reaches the layout engine at all). None of the
    // three should ever trigger a recompute.
    await act(async () => {
      useGraphStore.setState((state) => ({
        layoutConfig: { ...state.layoutConfig, cornerRadius: 40 },
      }));
    });
    await flushEffects();
    expect(calls).toHaveLength(1);

    await act(async () => {
      useGraphStore.setState((state) => ({
        layoutConfig: { ...state.layoutConfig, edgeStyle: "spline" },
      }));
    });
    await flushEffects();
    expect(calls).toHaveLength(1);

    await act(async () => {
      useGraphStore.setState((state) => ({
        layoutConfig: { ...state.layoutConfig, zoomSensitivity: 3 },
      }));
    });
    await flushEffects();
    expect(calls).toHaveLength(1);

    // A Tier-1 aesthetic knob that genuinely changes node/edge geometry must invalidate the cache.
    await act(async () => {
      useGraphStore.setState((state) => ({
        layoutConfig: { ...state.layoutConfig, nodeGap: 999 },
      }));
    });
    await flushEffects();
    expect(calls).toHaveLength(2);
    expect(useGraphStore.getState().positionedNodes[0]?.x).toBe(2);
  });

  it("surfaces a worker timeout as an error without ever invoking a synchronous fallback", async () => {
    let rejectSecondCall!: (error: Error) => void;
    const calls: number[] = [];

    mock.module("../layout/customLayoutAdapter", () => ({
      computeCustomEngineGraphLayoutAsync: () => {
        calls.push(calls.length + 1);
        if (calls.length === 1) {
          return Promise.resolve(layoutResult(11));
        }
        // Second call (triggered by the config change below) never resolves on its own — it is
        // rejected explicitly by the test to simulate the watchdog timeout from
        // `customLayoutWorkerClient.ts`'s `LayoutTimeoutError`.
        return new Promise((_resolve, reject) => {
          rejectSecondCall = reject;
        });
      },
      // v2's contract (see `GraphCanvas/index.tsx`'s block comment above the layout effect): no
      // synchronous main-thread fallback exists. If the component ever called this, that alone
      // would be the v1 tab-freeze failure mode reappearing — so this stands in for "the
      // synchronous path" and fails the test immediately if it's ever invoked.
      computeCustomEngineGraphLayout: () => {
        throw new Error("synchronous fallback must never run after a worker timeout");
      },
    }));

    const { GraphCanvas } = await import("./index");

    useGraphStore.setState({
      dataset,
      currentFile: "integration.json",
      layoutMode: "layered",
      layoutConfig: { ...DEFAULT_CUSTOM_LAYOUT_CONFIG },
    });

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(createElement(GraphCanvas));
      });
    });
    await flushEffects();

    expect(calls).toHaveLength(1);
    const layoutBeforeFailure = useGraphStore.getState().positionedNodes;
    expect(layoutBeforeFailure[0]?.x).toBe(11);

    // Trigger a second, failing recompute via a layout-affecting config change (cache miss).
    await act(async () => {
      useGraphStore.setState((state) => ({
        layoutConfig: { ...state.layoutConfig, nodeGap: 999 },
      }));
    });
    expect(calls).toHaveLength(2);

    const timeoutError = new Error("Layout computation timed out after 15000ms");
    timeoutError.name = "LayoutTimeoutError";
    await act(async () => {
      rejectSecondCall(timeoutError);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The v2 guarantee under test: a failed recompute must leave the last good layout on screen,
    // not a blank canvas. `computeCustomEngineGraphLayout` (the synchronous path) above throws if
    // it's ever called, which already proves half of the guarantee; this assertion proves the
    // other half.
    expect(useGraphStore.getState().positionedNodes).toEqual(layoutBeforeFailure);
    expect(calls).toHaveLength(2);
  });
});
