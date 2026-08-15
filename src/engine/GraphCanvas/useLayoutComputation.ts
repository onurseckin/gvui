import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";
import { generateDatasetSignature } from "../../utils/fileStorage";
import { calculateFitView } from "../../utils/fitView";
import { loadStoredLayout, saveStoredLayout } from "../../utils/layoutCacheStorage";
import { computeCustomEngineGraphLayoutAsync } from "../layout/customLayoutAdapter";
import type { CustomLayoutConfig } from "../layout/custom/config";

const inFlightLayoutRequests = new Map<
  string,
  Promise<{ nodes: PositionedNode[]; edges: PositionedEdge[] }>
>();

const CONFIG_HASH_EXCLUDED_KEYS: ReadonlySet<keyof CustomLayoutConfig> = new Set([
  "cornerRadius",
  "edgeStyle",
  "zoomSensitivity",
]);

function computeLayoutConfigHash(config: CustomLayoutConfig): string {
  return (Object.keys(config) as (keyof CustomLayoutConfig)[])
    .filter((key) => !CONFIG_HASH_EXCLUDED_KEYS.has(key))
    .sort()
    .map((key) => `${key}:${String(config[key])}`)
    .join("|");
}

export function useLayoutComputation(containerRef: RefObject<HTMLDivElement | null>) {
  const dataset = useGraphStore((state) => state.dataset);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const layoutConfig = useGraphStore((state) => state.layoutConfig);
  const setPositionedGraph = useGraphStore((state) => state.setPositionedGraph);
  const setZoomLevel = useGraphStore((state) => state.setZoomLevel);
  const setPanOffset = useGraphStore((state) => state.setPanOffset);
  const setShouldAutoFit = useGraphStore((state) => state.setShouldAutoFit);

  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    if (!dataset) {
      setPositionedGraph([], []);
      setIsCalculating(false);
      return;
    }

    let isSubscribed = true;
    const configHash = computeLayoutConfigHash(layoutConfig);
    const signature = `${generateDatasetSignature(dataset)}_${configHash}`;
    const cacheKey = `${layoutMode}_${signature}`;
    const stored = loadStoredLayout(layoutMode, signature);

    const handleLayoutCompletion = (nodes: PositionedNode[], edges: PositionedEdge[]) => {
      saveStoredLayout(layoutMode, signature, { nodes, edges });
      if (!isSubscribed) return;

      const storeState = useGraphStore.getState();
      let newZoom = storeState.zoomLevel;
      let newPan = storeState.panOffset;
      let newAutoFit = storeState.shouldAutoFit;

      if (storeState.shouldAutoFit) {
        const fitResult = calculateFitView(nodes, edges, containerRef.current?.parentElement);
        newZoom = fitResult.zoomLevel;
        newPan = fitResult.panOffset;
        newAutoFit = false;
      }

      useGraphStore.setState({
        positionedNodes: nodes,
        positionedEdges: edges,
        zoomLevel: newZoom,
        panOffset: newPan,
        shouldAutoFit: newAutoFit,
      });

      setIsCalculating(false);
    };

    if (stored) {
      handleLayoutCompletion(stored.nodes, stored.edges);
      return;
    }

    setIsCalculating(true);
    let layoutPromise = inFlightLayoutRequests.get(cacheKey);
    if (!layoutPromise) {
      layoutPromise = computeCustomEngineGraphLayoutAsync(dataset, {
        configPartial: layoutConfig,
        mode: layoutMode,
        timeoutMs: 15000,
      }).finally(() => {
        inFlightLayoutRequests.delete(cacheKey);
      });
      inFlightLayoutRequests.set(cacheKey, layoutPromise);
    }

    void layoutPromise
      .then(({ nodes, edges }) => {
        handleLayoutCompletion(nodes, edges);
      })
      .catch((error: unknown) => {
        if (!isSubscribed) return;
        console.error("Graph layout computation failed; keeping previous layout.", error);
        setIsCalculating(false);
      });

    return () => {
      isSubscribed = false;
    };
  }, [
    dataset,
    layoutMode,
    layoutConfig,
    containerRef,
    setPositionedGraph,
    setZoomLevel,
    setPanOffset,
    setShouldAutoFit,
  ]);

  return { isCalculating };
}
