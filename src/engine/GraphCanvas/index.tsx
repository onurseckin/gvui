import type { CSSProperties, FC } from "react";
import { useEffect, useMemo } from "react";
import { EdgeMarkerDefs, GraphEdge } from "../../primitives/edges/GraphEdge";
import { NodeCard } from "../../primitives/nodes/NodeCard";
import { useGraphStore } from "../../state/useGraphStore";
import type { PositionedNode } from "../../types/graphData";
import { computeGraphLayout } from "../layout/layoutDispatcher";
import "./GraphCanvas.css";
import { usePanZoom } from "./usePanZoom";

export const GraphCanvas: FC = () => {
  const dataset = useGraphStore((state) => state.dataset);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const positionedNodes = useGraphStore((state) => state.positionedNodes);
  const positionedEdges = useGraphStore((state) => state.positionedEdges);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const activeFilter = useGraphStore((state) => state.activeFilter);
  const collapsedNodeIds = useGraphStore((state) => state.collapsedNodeIds);

  const setPositionedGraph = useGraphStore((state) => state.setPositionedGraph);
  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);
  const toggleNodeCollapse = useGraphStore((state) => state.toggleNodeCollapse);

  const { containerRef, zoomLevel, panOffset, isDragging, handleMouseDown } = usePanZoom();

  useEffect(() => {
    if (!dataset) {
      setPositionedGraph([], []);
      return;
    }
    const { nodes, edges } = computeGraphLayout(dataset, layoutMode);
    setPositionedGraph(nodes, edges);
  }, [dataset, layoutMode, setPositionedGraph]);

  const hiddenNodeIds = useMemo(() => {
    if (collapsedNodeIds.size === 0) return new Set<string>();

    const childMap = new Map<string, string[]>();
    for (const edge of positionedEdges) {
      const existing = childMap.get(edge.source) || [];
      existing.push(edge.target);
      childMap.set(edge.source, existing);
    }

    const hidden = new Set<string>();
    for (const collapsedId of collapsedNodeIds) {
      const queue = [...(childMap.get(collapsedId) || [])];
      while (queue.length > 0) {
        const nextId = queue.shift();
        if (nextId && !hidden.has(nextId)) {
          hidden.add(nextId);
          const children = childMap.get(nextId) || [];
          queue.push(...children);
        }
      }
    }
    return hidden;
  }, [collapsedNodeIds, positionedEdges]);

  const isFilterActive = activeFilter !== "all" || searchQuery.trim() !== "";

  const isNodeMatching = (node: PositionedNode): boolean => {
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
  };

  const roundedX = Math.round(panOffset.x);
  const roundedY = Math.round(panOffset.y);
  const transformStyle: CSSProperties = {
    transform: `translate(${roundedX}px, ${roundedY}px)`,
    zoom: zoomLevel,
  };

  return (
    <div
      ref={containerRef}
      className={`graph-canvas-viewport ${isDragging ? "is-dragging" : ""}`}
      onMouseDown={handleMouseDown}
      onClick={() => setSelectedNodeId(null)}
    >
      <div className="graph-transform-stage" style={transformStyle}>
        <svg className="graph-svg-layer">
          <EdgeMarkerDefs />
          {positionedEdges.map((edge) => {
            if (hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)) {
              return null;
            }
            const isEdgeSelected = selectedNodeId === edge.source || selectedNodeId === edge.target;
            return <GraphEdge key={edge.id} edge={edge} isSelected={isEdgeSelected} />;
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
                  transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                }}
              >
                <NodeCard
                  node={node}
                  isSelected={isSelected}
                  isFiltered={isFiltered}
                  isCollapsed={isCollapsed}
                  onSelect={(id) => setSelectedNodeId(id)}
                  onToggleCollapse={(id) => toggleNodeCollapse(id)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GraphCanvas;
