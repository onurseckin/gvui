import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomLayoutConfig } from "../../../engine/layout/custom/config";
import { computeCustomLayoutAsync } from "../../../engine/layout/custom/customLayoutWorkerClient";
import type {
  CustomLayoutResult,
  NormalizedEdge,
  NormalizedNode,
} from "../../../engine/layout/custom/types";

export interface UseCustomLayoutWorkerOptions {
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
  /** Identifies the exact scenario/configuration that produced a layout result. */
  inputKey: string;
  configPartial?: Partial<CustomLayoutConfig>;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface UseCustomLayoutWorkerState {
  result: CustomLayoutResult | null;
  snapshot: LayoutResultSnapshot | null;
  isCalculating: boolean;
  error: Error | null;
  recalculate: () => void;
  resultGeneration: string | null;
}

export interface UseCustomLayoutWorkerDependencies {
  computeLayout?: typeof computeCustomLayoutAsync;
}

export interface LayoutResultSnapshot {
  inputKey: string;
  result: CustomLayoutResult;
  generation: string;
}

export interface LayoutErrorSnapshot {
  inputKey: string;
  error: Error;
}

/** Prevents a retained layout from being rendered with a newly selected scenario's metadata. */
export function getCurrentLayoutResult(
  snapshot: LayoutResultSnapshot | null,
  inputKey: string,
): CustomLayoutResult | null {
  return snapshot?.inputKey === inputKey ? snapshot.result : null;
}

export function getCurrentLayoutError(
  snapshot: LayoutErrorSnapshot | null,
  inputKey: string,
): Error | null {
  return snapshot?.inputKey === inputKey ? snapshot.error : null;
}

interface WorkerState {
  snapshot: LayoutResultSnapshot | null;
  errorSnapshot: LayoutErrorSnapshot | null;
  isCalculating: boolean;
}

export function useCustomLayoutWorker(
  {
    nodes,
    edges,
    inputKey,
    configPartial,
    timeoutMs = 30_000,
    enabled = true,
  }: UseCustomLayoutWorkerOptions,
  dependencies: UseCustomLayoutWorkerDependencies = {},
): UseCustomLayoutWorkerState {
  const [workerState, setWorkerState] = useState<WorkerState>({
    snapshot: null,
    errorSnapshot: null,
    isCalculating: false,
  });
  const [retryGeneration, setRetryGeneration] = useState<number>(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const recalculate = useCallback(() => {
    setRetryGeneration((generation) => generation + 1);
  }, []);

  const requestGeneration = `${inputKey}:${retryGeneration}`;
  const computeLayout = dependencies.computeLayout ?? computeCustomLayoutAsync;

  useEffect(() => {
    if (!enabled || nodes.length === 0) {
      setWorkerState({ snapshot: null, errorSnapshot: null, isCalculating: false });
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setWorkerState((prev) => ({
      snapshot: prev.snapshot,
      errorSnapshot: null,
      isCalculating: true,
    }));

    computeLayout({
      nodes,
      edges,
      configPartial,
      timeoutMs,
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) {
          setWorkerState({
            snapshot: { inputKey, result: res, generation: requestGeneration },
            errorSnapshot: null,
            isCalculating: false,
          });
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setWorkerState((prev) => ({
            snapshot: prev.snapshot,
            errorSnapshot: {
              inputKey,
              error: err instanceof Error ? err : new Error(String(err)),
            },
            isCalculating: false,
          }));
        }
      });

    return () => {
      controller.abort();
    };
  }, [nodes, edges, configPartial, timeoutMs, enabled, inputKey, requestGeneration, computeLayout]);

  return {
    result: getCurrentLayoutResult(workerState.snapshot, inputKey),
    snapshot: workerState.snapshot,
    isCalculating: workerState.isCalculating,
    error: getCurrentLayoutError(workerState.errorSnapshot, inputKey),
    recalculate,
    resultGeneration: workerState.snapshot?.generation ?? null,
  };
}
