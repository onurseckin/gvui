import type { CSSProperties, FC } from "react";
import { useCallback, useEffect, useMemo } from "react";
import { LoadingOverlay } from "../../components/Controls/LoadingOverlay";
import { describeNodeKind } from "../../primitives/nodes/NodeCard/nodeKinds";
import { useGraphStore } from "../../state/useGraphStore";
import { generateDatasetSignature, saveStoredViewport } from "../../utils/fileStorage";
import { buildEdgePath } from "../layout/custom/edgePath";
import { GraphBadgeLayer } from "./GraphBadgeLayer";
import "./GraphCanvas.css";
import { GraphHtmlLayer } from "./GraphHtmlLayer";
import { GraphSvgLayer } from "./GraphSvgLayer";
import { useLayoutComputation } from "./useLayoutComputation";
import { usePanZoom } from "./usePanZoom";

export const GraphCanvas: FC = () => {
  const dataset = useGraphStore((state) => state.dataset);
  const currentFile = useGraphStore((state) => state.currentFile);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const layoutConfig = useGraphStore((state) => state.layoutConfig);
  const positionedNodes = useGraphStore((state) => state.positionedNodes);
  const positionedEdges = useGraphStore((state) => state.positionedEdges);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const selectedStep = useGraphStore((state) => state.selectedStep);
  const selectedSteps = useGraphStore((state) => state.selectedSteps);
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const activeFilter = useGraphStore((state) => state.activeFilter);
  const collapsedNodeIds = useGraphStore((state) => state.collapsedNodeIds);

  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);
  const toggleNodeCollapse = useGraphStore((state) => state.toggleNodeCollapse);

  const { containerRef, zoomLevel, panOffset, isDragging, handleMouseDown } = usePanZoom();
  const { isCalculating } = useLayoutComputation(containerRef);

  const handleSelectNode = useCallback(
    (id: string): void => setSelectedNodeId(id),
    [setSelectedNodeId],
  );
  const handleDeselectNode = useCallback((): void => setSelectedNodeId(null), [setSelectedNodeId]);
  const handleToggleCollapse = useCallback(
    (id: string): void => toggleNodeCollapse(id),
    [toggleNodeCollapse],
  );

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
      const src = childMap.get(edge.source) || [];
      src.push(edge.target);
      childMap.set(edge.source, src);
      if (edge.directed === false) {
        const tgt = childMap.get(edge.target) || [];
        tgt.push(edge.source);
        childMap.set(edge.target, tgt);
      }
    }
    const hidden = new Set<string>();
    for (const collapsedId of collapsedNodeIds) {
      const queue = [...(childMap.get(collapsedId) || [])];
      while (queue.length > 0) {
        const nextId = queue.shift();
        if (nextId && nextId !== collapsedId && !hidden.has(nextId)) {
          hidden.add(nextId);
          queue.push(...(childMap.get(nextId) || []));
        }
      }
    }
    return hidden;
  }, [collapsedNodeIds, positionedEdges]);

  const { connectedNodeIds, selectedNodeAccent } = useMemo(() => {
    if (!selectedNodeId) return { connectedNodeIds: undefined, selectedNodeAccent: undefined };
    const connected = new Set<string>();
    for (const edge of positionedEdges) {
      if (edge.source === selectedNodeId) connected.add(edge.target);
      if (edge.target === selectedNodeId) connected.add(edge.source);
    }
    const selNode = positionedNodes.find((n) => n.id === selectedNodeId);
    const accent = selNode ? describeNodeKind(selNode).accent : undefined;
    return { connectedNodeIds: connected, selectedNodeAccent: accent };
  }, [selectedNodeId, positionedEdges, positionedNodes]);

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
        <GraphSvgLayer
          styledEdges={styledEdges}
          hiddenNodeIds={hiddenNodeIds}
          selectedNodeId={selectedNodeId}
          selectedNodeAccent={selectedNodeAccent}
        />
        <GraphHtmlLayer
          positionedNodes={positionedNodes}
          hiddenNodeIds={hiddenNodeIds}
          collapsedNodeIds={collapsedNodeIds}
          selectedNodeId={selectedNodeId}
          connectedNodeIds={connectedNodeIds}
          selectedStep={selectedStep}
          selectedSteps={selectedSteps}
          searchQuery={searchQuery}
          activeFilter={activeFilter}
          onSelectNode={handleSelectNode}
          onToggleCollapse={handleToggleCollapse}
        />
        <GraphBadgeLayer
          positionedEdges={positionedEdges}
          positionedNodes={positionedNodes}
          hiddenNodeIds={hiddenNodeIds}
          selectedNodeId={selectedNodeId}
        />
      </div>
    </div>
  );
};

export default GraphCanvas;
