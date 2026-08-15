import type { FC } from "react";
import { memo, useCallback } from "react";
import { NodeCard } from "../../primitives/nodes/NodeCard";
import type { PositionedNode } from "../../types/graphData";

export interface GraphHtmlLayerProps {
  positionedNodes: PositionedNode[];
  hiddenNodeIds: Set<string>;
  collapsedNodeIds: Set<string>;
  selectedNodeId: string | null;
  selectedStep: number | null;
  searchQuery: string;
  activeFilter: string;
  onSelectNode: (id: string) => void;
  onToggleCollapse: (id: string) => void;
}

export const GraphHtmlLayer: FC<GraphHtmlLayerProps> = memo(function GraphHtmlLayer({
  positionedNodes,
  hiddenNodeIds,
  collapsedNodeIds,
  selectedNodeId,
  selectedStep,
  searchQuery,
  activeFilter,
  onSelectNode,
  onToggleCollapse,
}) {
  const isFilterActive =
    activeFilter !== "all" || searchQuery.trim() !== "" || selectedStep !== null;

  const isNodeMatching = useCallback(
    (node: PositionedNode): boolean => {
      if (selectedStep !== null && node.step !== selectedStep) {
        return false;
      }

      if (activeFilter === "success") {
        const statusBadge = node.badges?.find((b) => b.variant);
        const statusStr = String(node.metadata?.status ?? "").toLowerCase();
        const isSuccess =
          statusBadge?.variant === "success" ||
          statusStr.includes("complete") ||
          statusStr.includes("success") ||
          node.status === "success";
        if (!isSuccess) return false;
      } else if (activeFilter === "error") {
        const statusBadge = node.badges?.find((b) => b.variant);
        const statusStr = String(node.metadata?.status ?? "").toLowerCase();
        const isError =
          statusBadge?.variant === "error" ||
          statusStr.includes("error") ||
          statusStr.includes("fail") ||
          node.status === "error";
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
    [activeFilter, searchQuery, selectedStep],
  );

  return (
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
              onSelect={onSelectNode}
              onToggleCollapse={onToggleCollapse}
            />
          </div>
        );
      })}
    </div>
  );
});

GraphHtmlLayer.displayName = "GraphHtmlLayer";
