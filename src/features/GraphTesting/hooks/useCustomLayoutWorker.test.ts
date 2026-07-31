import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { ComputeLayoutWorkerOptions } from "../../../engine/layout/custom/customLayoutWorkerClient";
import type { CustomLayoutResult } from "../../../engine/layout/custom/types";
import {
  getCurrentLayoutError,
  getCurrentLayoutResult,
  type LayoutErrorSnapshot,
  type LayoutResultSnapshot,
  type UseCustomLayoutWorkerOptions,
  type UseCustomLayoutWorkerState,
  useCustomLayoutWorker,
} from "./useCustomLayoutWorker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createLayoutResult(label: string): CustomLayoutResult {
  return {
    nodes: [{ id: label, label, x: 0, y: 0, width: 100, height: 50 }],
    edges: [],
    badges: [],
    crossings: [],
    validation: {},
  } as never;
}

function createOptions(inputKey: string, enabled = true): UseCustomLayoutWorkerOptions {
  return {
    inputKey,
    enabled,
    nodes: [{ id: inputKey, width: 100, height: 50 }],
    edges: [],
  };
}

function createControlledCompute() {
  const calls: Array<{
    options: ComputeLayoutWorkerOptions;
    deferred: Deferred<CustomLayoutResult>;
  }> = [];
  const computeLayout = (options: ComputeLayoutWorkerOptions) => {
    const deferred = createDeferred<CustomLayoutResult>();
    calls.push({ options, deferred });
    return deferred.promise;
  };
  return { calls, computeLayout };
}

function HookHarness({
  options,
  computeLayout,
  onRender,
}: {
  options: UseCustomLayoutWorkerOptions;
  computeLayout: (options: ComputeLayoutWorkerOptions) => Promise<CustomLayoutResult>;
  onRender: (state: UseCustomLayoutWorkerState) => void;
}) {
  const state = useCustomLayoutWorker(options, { computeLayout });
  onRender(state);
  return null;
}

function createHookRenderer(
  options: UseCustomLayoutWorkerOptions,
  computeLayout: (options: ComputeLayoutWorkerOptions) => Promise<CustomLayoutResult>,
  onRender: (state: UseCustomLayoutWorkerState) => void,
): ReactTestRenderer {
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
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(createElement(HookHarness, { options, computeLayout, onRender }));
    });
    return renderer;
  } finally {
    console.error = originalConsoleError;
  }
}

describe("useCustomLayoutWorker snapshot pairing", () => {
  it("does not expose a preserved result for a different scenario input", () => {
    const snapshot: LayoutResultSnapshot = {
      inputKey: "scenario-20",
      result: { nodes: [], edges: [], badges: [], crossings: [], validation: {} } as never,
      generation: "scenario-20:0",
    };

    expect(getCurrentLayoutResult(snapshot, "scenario-19")).toBe(null);
  });

  it("keeps a preserved result available for a same-input retry", () => {
    const result = { nodes: [], edges: [], badges: [], crossings: [], validation: {} } as never;
    const snapshot: LayoutResultSnapshot = {
      inputKey: "scenario-20",
      result,
      generation: "scenario-20:0",
    };

    expect(getCurrentLayoutResult(snapshot, "scenario-20")).toBe(result);
  });

  it("does not surface a prior scenario's failure for the newly selected scenario", () => {
    const snapshot: LayoutErrorSnapshot = {
      inputKey: "scenario-20",
      error: new Error("worker failed"),
    };

    expect(getCurrentLayoutError(snapshot, "scenario-19")).toBe(null);
  });
});

describe("useCustomLayoutWorker rendered lifecycle", () => {
  it("aborts a changed input and suppresses its stale completion", async () => {
    const controlled = createControlledCompute();
    let latest!: UseCustomLayoutWorkerState;
    const renderer = createHookRenderer(
      createOptions("scenario-a"),
      controlled.computeLayout,
      (state) => {
        latest = state;
      },
    );

    expect(controlled.calls).toHaveLength(1);
    expect(latest.isCalculating).toBe(true);

    act(() => {
      renderer.update(
        createElement(HookHarness, {
          options: createOptions("scenario-b"),
          computeLayout: controlled.computeLayout,
          onRender: (state) => {
            latest = state;
          },
        }),
      );
    });

    expect(controlled.calls[0].options.signal?.aborted).toBe(true);
    expect(controlled.calls).toHaveLength(2);
    expect(latest.result).toBe(null);

    await act(async () => {
      controlled.calls[0].deferred.resolve(createLayoutResult("stale-a"));
      await controlled.calls[0].deferred.promise;
    });
    expect(latest.result).toBe(null);

    const resultB = createLayoutResult("current-b");
    await act(async () => {
      controlled.calls[1].deferred.resolve(resultB);
      await controlled.calls[1].deferred.promise;
    });
    expect(latest.result).toBe(resultB);
    expect(latest.resultGeneration).toBe("scenario-b:0");

    act(() => renderer.unmount());
  });

  it("preserves a same-input result and generation while retry is busy", async () => {
    const controlled = createControlledCompute();
    let latest!: UseCustomLayoutWorkerState;
    const renderer = createHookRenderer(
      createOptions("scenario-a"),
      controlled.computeLayout,
      (state) => {
        latest = state;
      },
    );

    const firstResult = createLayoutResult("first");
    await act(async () => {
      controlled.calls[0].deferred.resolve(firstResult);
      await controlled.calls[0].deferred.promise;
    });
    expect(latest.resultGeneration).toBe("scenario-a:0");

    act(() => latest.recalculate());

    expect(controlled.calls).toHaveLength(2);
    expect(latest.result).toBe(firstResult);
    expect(latest.isCalculating).toBe(true);
    expect(latest.resultGeneration).toBe("scenario-a:0");

    const retryResult = createLayoutResult("retry");
    await act(async () => {
      controlled.calls[1].deferred.resolve(retryResult);
      await controlled.calls[1].deferred.promise;
    });
    expect(latest.result).toBe(retryResult);
    expect(latest.isCalculating).toBe(false);
    expect(latest.resultGeneration).toBe("scenario-a:1");

    act(() => renderer.unmount());
  });

  it("aborts the active request when disabled and ignores its completion", async () => {
    const controlled = createControlledCompute();
    let latest!: UseCustomLayoutWorkerState;
    const renderer = createHookRenderer(
      createOptions("scenario-a"),
      controlled.computeLayout,
      (state) => {
        latest = state;
      },
    );

    act(() => {
      renderer.update(
        createElement(HookHarness, {
          options: createOptions("scenario-a", false),
          computeLayout: controlled.computeLayout,
          onRender: (state) => {
            latest = state;
          },
        }),
      );
    });

    expect(controlled.calls[0].options.signal?.aborted).toBe(true);
    expect(latest.isCalculating).toBe(false);
    expect(latest.result).toBe(null);

    await act(async () => {
      controlled.calls[0].deferred.resolve(createLayoutResult("late"));
      await controlled.calls[0].deferred.promise;
    });
    expect(latest.result).toBe(null);

    act(() => renderer.unmount());
  });
});
