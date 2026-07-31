import { useEffect, useRef, useState } from "react";
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
  configPartial?: Partial<CustomLayoutConfig>;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface UseCustomLayoutWorkerState {
  result: CustomLayoutResult | null;
  isCalculating: boolean;
  error: Error | null;
  recalculate: () => void;
}

export function useCustomLayoutWorker({
  nodes,
  edges,
  configPartial,
  timeoutMs = 5000,
  enabled = true,
}: UseCustomLayoutWorkerOptions): UseCustomLayoutWorkerState {
  const [result, setResult] = useState<CustomLayoutResult | null>(null);
  const [isCalculating, setIsCalculating] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [triggerCount, setTriggerCount] = useState<number>(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const recalculate = () => {
    setTriggerCount((c) => c + 1);
  };

  useEffect(() => {
    if (!enabled || nodes.length === 0) {
      setResult(null);
      setIsCalculating(false);
      setError(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsCalculating(true);
    setError(null);

    computeCustomLayoutAsync({
      nodes,
      edges,
      configPartial,
      timeoutMs,
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) {
          setResult(res);
          setIsCalculating(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsCalculating(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [nodes, edges, configPartial, timeoutMs, enabled, triggerCount]);

  return {
    result,
    isCalculating,
    error,
    recalculate,
  };
}
