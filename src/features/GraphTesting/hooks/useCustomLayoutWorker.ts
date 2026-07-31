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

export function useCustomLayoutWorker({
  nodes,
  edges,
  inputKey,
  configPartial,
  timeoutMs = 30_000,
  enabled = true,
}: UseCustomLayoutWorkerOptions): UseCustomLayoutWorkerState {
  const [snapshot, setSnapshot] = useState<LayoutResultSnapshot | null>(null);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [errorSnapshot, setErrorSnapshot] = useState<LayoutErrorSnapshot | null>(null);
  const [retryGeneration, setRetryGeneration] = useState<number>(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const recalculate = useCallback(() => {
    setRetryGeneration((generation) => generation + 1);
  }, []);

  const requestGeneration = `${inputKey}:${retryGeneration}`;

  useEffect(() => {
    if (!enabled || nodes.length === 0) {
      setSnapshot(null);
      setIsCalculating(false);
      setErrorSnapshot(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsCalculating(true);
    setErrorSnapshot(null);

    computeCustomLayoutAsync({
      nodes,
      edges,
      configPartial,
      timeoutMs,
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) {
          setSnapshot({ inputKey, result: res, generation: requestGeneration });
          setIsCalculating(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setErrorSnapshot({
            inputKey,
            error: err instanceof Error ? err : new Error(String(err)),
          });
          setIsCalculating(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [nodes, edges, configPartial, timeoutMs, enabled, inputKey, requestGeneration]);

  return {
    result: getCurrentLayoutResult(snapshot, inputKey),
    snapshot,
    isCalculating,
    error: getCurrentLayoutError(errorSnapshot, inputKey),
    recalculate,
    resultGeneration: snapshot?.generation ?? null,
  };
}
