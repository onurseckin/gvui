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
import { computeGraphLayout } from "../layout/layoutDispatcher";
import "./GraphCanvas.css";
import { usePanZoom } from "./usePanZoom";

export const GraphCanvas: FC = () => {
  const dataset = useGraphStore((state) => state.dataset);
  const currentFile = useGraphStore((state) => state.currentFile);
  const layoutMode = useGraphStore((state) => state.layoutMode);
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
    [setSelectedNodeId]
  );

  const handleDeselectNode = useCallback((): void => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  const handleToggleCollapseNode = useCallback(
    (id: string): void => {
      toggleNodeCollapse(id);
    },
    [toggleNodeCollapse]
  );

  useEffect(() => {
    if (!dataset) {
      setPositionedGraph([], []);
      setIsCalculating(false);
      return;
    }

    let isSubscribed = true;
    const signature = generateDatasetSignature(dataset);
    const stored = loadStoredLayout(layoutMode, signature);

    const applyLayoutResult = (nodes: PositionedNode[], edges: PositionedEdge[]) => {
      if (!isSubscribed) return;
      saveStoredLayout(layoutMode, signature, { nodes, edges });
      
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
      applyLayoutResult(stored.nodes, stored.edges);
      return;
    }

    // Immediate unmount of old canvas elements on cache miss
    setPositionedGraph([], []);
    setIsCalculating(true);

    const controller = new AbortController();

    if (layoutMode === "top-down") {
      computeCustomEngineGraphLayoutAsync(dataset, {
        signal: controller.signal,
      })
        .then(({ nodes, edges }) => {
          applyLayoutResult(nodes, edges);
        })
        .catch((err) => {
          if (err.name !== "AbortError" && err.name !== "LayoutCancelledError") {
            void computeGraphLayout(dataset, layoutMode).then(({ nodes, edges }) => {
              applyLayoutResult(nodes, edges);
            });
          }
        });
    } else {
      void computeGraphLayout(dataset, layoutMode).then(({ nodes, edges }) => {
        applyLayoutResult(nodes, edges);
      });
    }

    return () => {
      isSubscribed = false;
      controller.abort();
    };
  }, [
    dataset,
    layoutMode,
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
    [isFilterActive, activeFilter, searchQuery]
  );

  const transformStyle: CSSProperties = useMemo(
    () => ({
      transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
      transformOrigin: "0 0",
    }),
    [panOffset.x, panOffset.y, zoomLevel]
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
        <svg className="graph-svg-layer">
          <EdgeMarkerDefs />
          {positionedEdges.map((edge) => {
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
            let badgeX = edge.labelX ?? 0;
            let badgeY = edge.labelY ?? 0;
            if ((badgeX === 0 && badgeY === 0) && edge.path) {
              const matches = edge.path.match(/[-+]?\d*\.?\d+/g);
              if (matches && matches.length >= 4) {
                const midIdx = Math.floor(matches.length / 4) * 2;
                badgeX = parseFloat(matches[midIdx]) || 0;
                badgeY = parseFloat(matches[midIdx + 1]) || 0;
              }
            }

            return (
              <g key={`badge-${edge.id}`} style={{ pointerEvents: "auto" }}>
                <EdgeBadgeOverlay
                  x={badgeX}
                  y={badgeY}
                  label={edge.label}
                  isCycle={edge.isCycle}
                  isSelected={isEdgeSelected}
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
