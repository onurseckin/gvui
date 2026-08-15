import type { CSSProperties, FC } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoadingOverlay } from "../../components/Controls/LoadingOverlay";
import { EdgeBadgeOverlay, EdgeMarkerDefs, GraphEdge } from "../../primitives/edges/GraphEdge";
import { NodeCard } from "../../primitives/nodes/NodeCard";
import { useGraphStore } from "../../state/useGraphStore";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";
import { generateDatasetSignature, saveStoredViewport } from "../../utils/fileStorage";
import { calculateFitView } from "../../utils/fitView";
import { loadStoredLayout, saveStoredLayout } from "../../utils/layoutCacheStorage";
import { computeCustomEngineGraphLayoutAsync } from "../layout/customLayoutAdapter";
import type { CustomLayoutConfig } from "../layout/custom/config";
import { buildEdgePath } from "../layout/custom/edgePath";
import "./GraphCanvas.css";
import { GraphSectionsLayer } from "./GraphSectionsLayer";
import { usePanZoom } from "./usePanZoom";

const inFlightLayoutRequests = new Map<
  string,
  Promise<{ nodes: PositionedNode[]; edges: PositionedEdge[] }>
>();

/**
 * Config fields excluded from the layout cache signature. `cornerRadius`/`edgeStyle` are purely
 * client-side rendering decisions (see `custom/edgePath.ts`) and `zoomSensitivity` never reaches
 * the layout engine at all — none of the three can change a node position or a route, so folding
 * them into the cache key would invalidate a perfectly good cached layout on every tweak.
 */
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

export const GraphCanvas: FC = () => {
  const dataset = useGraphStore((state) => state.dataset);
  const currentFile = useGraphStore((state) => state.currentFile);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const layoutConfig = useGraphStore((state) => state.layoutConfig);
  const positionedNodes = useGraphStore((state) => state.positionedNodes);
  const positionedEdges = useGraphStore((state) => state.positionedEdges);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const activeFilter = useGraphStore((state) => state.activeFilter);
  const collapsedNodeIds = useGraphStore((state) => state.collapsedNodeIds);

  const setPositionedGraph = useGraphStore((state) => state.setPositionedGraph);
  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);
  const setZoomLevel = useGraphStore((state) => state.setZoomLevel);
  const setPanOffset = useGraphStore((state) => state.setPanOffset);
  const setShouldAutoFit = useGraphStore((state) => state.setShouldAutoFit);
  const toggleNodeCollapse = useGraphStore((state) => state.toggleNodeCollapse);

  const { containerRef, zoomLevel, panOffset, isDragging, handleMouseDown } = usePanZoom();

  const [isCalculating, setIsCalculating] = useState(false);

  const handleSelectNode = useCallback(
    (id: string): void => {
      setSelectedNodeId(id);
    },
    [setSelectedNodeId],
  );

  const handleDeselectNode = useCallback((): void => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  const handleToggleCollapseNode = useCallback(
    (id: string): void => {
      toggleNodeCollapse(id);
    },
    [toggleNodeCollapse],
  );

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

    // Deliberately do NOT clear the canvas here. v1 unmounted every element on a cache miss, which
    // was defensible when a layout took seconds — you did not want stale geometry on screen that
    // long. v2 computes in ~2 ms, so clearing produces a visible flash on every settings change and
    // leaves nothing on screen if the computation then fails. Keep the last good layout until a new
    // one is ready; `handleLayoutCompletion` swaps it atomically.
    setIsCalculating(true);

    let layoutPromise = inFlightLayoutRequests.get(cacheKey);
    if (!layoutPromise) {
      layoutPromise = computeCustomEngineGraphLayoutAsync(dataset, {
        configPartial: layoutConfig,
        mode: layoutMode,
        // v2 targets <25ms end-to-end (see docs/planning/layout-engine-v2/01-architecture.md
        // § 7), so 15s is already a wildly generous ceiling — a timeout here means a genuine bug,
        // not a slow-but-working computation waiting on a bigger budget.
        timeoutMs: 15000,
      }).finally(() => {
        inFlightLayoutRequests.delete(cacheKey);
      });
      inFlightLayoutRequests.set(cacheKey, layoutPromise);
    }

    // No synchronous main-thread fallback. v1 re-ran the identical computation on the main
    // thread after a worker failure/timeout, which froze the tab for minutes — the worst possible
    // response to a computation that was already too slow. On failure: surface it, leave whatever
    // layout is already on screen untouched, and stop the spinner.
    void layoutPromise
      .then(({ nodes, edges }) => {
        handleLayoutCompletion(nodes, edges);
      })
      .catch((error: unknown) => {
        if (!isSubscribed) return;
        console.error("Graph layout computation failed; keeping the previous layout.", error);
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

  useEffect(() => {
    if (!dataset || !currentFile) return;

    const signature = generateDatasetSignature(dataset);
    saveStoredViewport(currentFile, {
      signature,
      zoomLevel,
      panOffset,
      selectedNodeId,
      layoutMode,
      collapsedNodeIds: Array.from(collapsedNodeIds),
    });
  }, [dataset, currentFile, zoomLevel, panOffset, selectedNodeId, layoutMode, collapsedNodeIds]);

  // Edge-style pass: rebuilds `path` from each edge's stored `points` whenever `edgeStyle` or
  // `cornerRadius` changes, without touching the layout effect above — those two fields are
  // excluded from `computeLayoutConfigHash`, so a config change limited to them never re-triggers
  // a layout computation. Edges whose rebuilt path is unchanged keep their original object
  // reference, so `GraphEdge`'s `memo` comparator still skips re-rendering them.
  const styledEdges = useMemo(
    () =>
      positionedEdges.map((edge) => {
        if (!edge.points || edge.points.length === 0) return edge;
        const path = buildEdgePath(edge.points, layoutConfig.edgeStyle, layoutConfig.cornerRadius);
        return path === edge.path ? edge : { ...edge, path };
      }),
    [positionedEdges, layoutConfig.edgeStyle, layoutConfig.cornerRadius],
  );

  const hiddenNodeIds = useMemo(() => {
    if (collapsedNodeIds.size === 0) return new Set<string>();

    const childMap = new Map<string, string[]>();
    for (const edge of positionedEdges) {
      const existingSource = childMap.get(edge.source) || [];
      existingSource.push(edge.target);
      childMap.set(edge.source, existingSource);

      if (edge.directed === false) {
        const existingTarget = childMap.get(edge.target) || [];
        existingTarget.push(edge.source);
        childMap.set(edge.target, existingTarget);
      }
    }

    const hidden = new Set<string>();
    for (const collapsedId of collapsedNodeIds) {
      const queue = [...(childMap.get(collapsedId) || [])];
      while (queue.length > 0) {
        const nextId = queue.shift();
        if (nextId && nextId !== collapsedId && !hidden.has(nextId)) {
          hidden.add(nextId);
          const children = childMap.get(nextId) || [];
          queue.push(...children);
        }
      }
    }
    return hidden;
  }, [collapsedNodeIds, positionedEdges]);

  const isFilterActive = activeFilter !== "all" || searchQuery.trim() !== "";

  const isNodeMatching = useCallback(
    (node: PositionedNode): boolean => {
      if (!isFilterActive) return true;

      if (activeFilter === "success") {
        const statusBadge = node.badges?.find((b) => b.variant);
        const statusStr = String(node.metadata?.status ?? "").toLowerCase();
        const isSuccess =
          statusBadge?.variant === "success" ||
          statusStr.includes("complete") ||
          statusStr.includes("success");
        if (!isSuccess) return false;
      } else if (activeFilter === "error") {
        const statusBadge = node.badges?.find((b) => b.variant);
        const statusStr = String(node.metadata?.status ?? "").toLowerCase();
        const isError =
          statusBadge?.variant === "error" ||
          statusStr.includes("error") ||
          statusStr.includes("fail");
        if (!isError) return false;
      } else if (activeFilter === "tools") {
        if (!node.tools || node.tools.length === 0) return false;
      }

      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;

      const nameMatch = node.name.toLowerCase().includes(query);
      const idMatch = node.id.toLowerCase().includes(query);
      const typeMatch = Boolean(node.type?.toLowerCase().includes(query));
      const descMatch = Boolean(node.description?.toLowerCase().includes(query));
      const modelMatch = Boolean(node.model?.toLowerCase().includes(query));

      return nameMatch || idMatch || typeMatch || descMatch || modelMatch;
    },
    [isFilterActive, activeFilter, searchQuery],
  );

  const transformStyle: CSSProperties = useMemo(
    () => ({
      transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
      transformOrigin: "0 0",
    }),
    [panOffset.x, panOffset.y, zoomLevel],
  );

  return (
    <div
      ref={containerRef}
      className={`graph-canvas-viewport ${isDragging ? "is-dragging" : ""}`}
      onMouseDown={handleMouseDown}
      onClick={handleDeselectNode}
    >
      {isCalculating && <LoadingOverlay />}
      <div className="graph-transform-stage" style={transformStyle}>
        <GraphSectionsLayer
          sections={dataset?.sections}
          positionedNodes={positionedNodes}
          hiddenNodeIds={hiddenNodeIds}
        />
        <svg className="graph-svg-layer">
          <EdgeMarkerDefs />
          {styledEdges.map((edge) => {
            if (hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)) {
              return null;
            }
            const isEdgeSelected = selectedNodeId === edge.source || selectedNodeId === edge.target;
            return (
              <GraphEdge
                key={edge.id}
                edge={edge}
                isSelected={isEdgeSelected}
                renderBadge={false}
              />
            );
          })}
        </svg>

        <div className="graph-html-layer">
          {positionedNodes.map((node) => {
            if (hiddenNodeIds.has(node.id)) return null;

            const isSelected = selectedNodeId === node.id;
            const matchesFilter = isNodeMatching(node);
            const isFiltered = isFilterActive && !matchesFilter;
            const isCollapsed = collapsedNodeIds.has(node.id);

            return (
              <div
                key={node.id}
                className={`graph-node-wrapper ${isFiltered ? "is-dimmed" : ""}`}
                style={{
                  transform: `translate(${node.x}px, ${node.y}px)`,
                  width: `${node.width}px`,
                  height: `${node.height}px`,
                }}
              >
                <NodeCard
                  node={node}
                  isSelected={isSelected}
                  isFiltered={isFiltered}
                  isCollapsed={isCollapsed}
                  onSelect={handleSelectNode}
                  onToggleCollapse={handleToggleCollapseNode}
                />
              </div>
            );
          })}
        </div>

        <svg
          className="graph-svg-badge-layer"
          style={{
            position: "absolute",
            inset: 0,
            overflow: "visible",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {positionedEdges.map((edge) => {
            if (hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)) {
              return null;
            }
            const isEdgeSelected = selectedNodeId === edge.source || selectedNodeId === edge.target;
            const badgeX = edge.labelX ?? 0;
            const badgeY = edge.labelY ?? 0;

            return (
              <g key={`badge-${edge.id}`} style={{ pointerEvents: "auto" }}>
                <EdgeBadgeOverlay
                  x={badgeX}
                  y={badgeY}
                  label={edge.label}
                  isCycle={edge.isCycle}
                  isSelected={isEdgeSelected}
                  badgeRect={edge.badgeRect}
                  anchorPoint={edge.anchorPoint}
                  leaderPoints={edge.leaderPoints}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

export default GraphCanvas;
