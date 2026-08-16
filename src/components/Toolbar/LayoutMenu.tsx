import React, { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import {
  IconAdjustments,
  IconChevronDown,
  IconCirclesRelation,
  IconHierarchy,
  IconPin,
  IconPinnedOff,
  IconRotate,
  IconTopologyStar3,
  IconX,
} from "@tabler/icons-react";
import {
  clearAllPins,
  collapseAllClusters,
  computeClusteredLayout,
  expandAllClusters,
  pinAllNodes,
  pinNode,
  toggleClusterCollapse,
  unpinNode,
  type ClusterGroupingStrategy,
  type PinnedNodeMap,
} from "../../engine/layout/subtreeClustering";
import {
  useGraphStore,
  useLayoutConfig,
  useLayoutMode,
  type LayoutMode,
} from "../../state/useGraphStore";
import "./LayoutMenu.css";

export interface LayoutMenuProps {
  className?: string;
  defaultOpen?: boolean;
  onAlgorithmChange?: (mode: LayoutMode | string) => void;
  onSpacingChange?: (type: "nodeGap" | "rankGap", value: number) => void;
  onClusteringToggle?: (enabled: boolean) => void;
  onPinNode?: (nodeId: string, isPinned: boolean) => void;
  onReset?: () => void;
}

export const LayoutMenu: FC<LayoutMenuProps> = React.memo(function LayoutMenu({
  className = "",
  defaultOpen = false,
  onAlgorithmChange,
  onSpacingChange,
  onClusteringToggle,
  onPinNode,
  onReset,
}) {
  const layoutMode = useLayoutMode();
  const layoutConfig = useLayoutConfig();
  const dataset = useGraphStore((state) => state.dataset);
  const positionedNodes = useGraphStore((state) => state.positionedNodes);
  const positionedEdges = useGraphStore((state) => state.positionedEdges);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);

  const setLayoutMode = useGraphStore((state) => state.setLayoutMode);
  const setLayoutConfig = useGraphStore((state) => state.setLayoutConfig);
  const resetLayoutConfig = useGraphStore((state) => state.resetLayoutConfig);
  const setPositionedGraph = useGraphStore((state) => state.setPositionedGraph);

  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [clusteringEnabled, setClusteringEnabled] = useState(false);
  const [clusteringStrategy, setClusteringStrategy] = useState<ClusterGroupingStrategy>("subtree");
  const [collapsedClusterIds, setCollapsedClusterIds] = useState<Set<string>>(new Set());
  const [pinnedMap, setPinnedMap] = useState<PinnedNodeMap>({});

  const menuRef = useRef<HTMLDivElement | null>(null);

  // Click outside and Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    if (typeof window === "undefined" && typeof document === "undefined") return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("mousedown", handleClickOutside);
        window.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [isOpen]);

  // Compute active clusters
  const computedClusters = useMemo(() => {
    if (!clusteringEnabled || positionedNodes.length === 0) return [];
    const res = computeClusteredLayout(
      {
        nodes: positionedNodes,
        edges: positionedEdges,
        sections: dataset?.sections,
      },
      {
        strategy: clusteringStrategy,
        collapsedClusterIds,
        pinnedNodes: pinnedMap,
      },
    );
    return res.clusters;
  }, [
    clusteringEnabled,
    positionedNodes,
    positionedEdges,
    dataset?.sections,
    clusteringStrategy,
    collapsedClusterIds,
    pinnedMap,
  ]);

  // Algorithm Switching
  const handleSelectAlgorithm = useCallback(
    (mode: "layered" | "radial" | "force") => {
      setLayoutMode(mode);
      onAlgorithmChange?.(mode);
    },
    [setLayoutMode, onAlgorithmChange],
  );

  // Spacing Sliders with robust boundary clamping (10 - 500)
  const handleNodeGapChange = useCallback(
    (val: unknown) => {
      const num = typeof val === "number" ? val : Number(val);
      const clamped = !Number.isFinite(num) ? 60 : Math.max(10, Math.min(Math.round(num), 500));
      setLayoutConfig({ nodeGap: clamped });
      onSpacingChange?.("nodeGap", clamped);
    },
    [setLayoutConfig, onSpacingChange],
  );

  const handleRankGapChange = useCallback(
    (val: unknown) => {
      const num = typeof val === "number" ? val : Number(val);
      const clamped = !Number.isFinite(num) ? 60 : Math.max(10, Math.min(Math.round(num), 500));
      setLayoutConfig({ rankGap: clamped });
      onSpacingChange?.("rankGap", clamped);
    },
    [setLayoutConfig, onSpacingChange],
  );

  // Clustering Toggles
  const handleToggleClustering = useCallback(() => {
    setClusteringEnabled((prev) => {
      const next = !prev;
      onClusteringToggle?.(next);
      return next;
    });
  }, [onClusteringToggle]);

  const handleCollapseAllClusters = useCallback(() => {
    const allIds = computedClusters.map((c) => c.id);
    const nextCollapsed = collapseAllClusters(allIds);
    setCollapsedClusterIds(nextCollapsed);

    if (clusteringEnabled && positionedNodes.length > 0) {
      const res = computeClusteredLayout(
        { nodes: positionedNodes, edges: positionedEdges },
        {
          strategy: clusteringStrategy,
          collapsedClusterIds: nextCollapsed,
          pinnedNodes: pinnedMap,
        },
      );
      setPositionedGraph(res.nodes, res.edges);
    }
  }, [
    computedClusters,
    clusteringEnabled,
    positionedNodes,
    positionedEdges,
    clusteringStrategy,
    pinnedMap,
    setPositionedGraph,
  ]);

  const handleExpandAllClusters = useCallback(() => {
    const nextCollapsed = expandAllClusters();
    setCollapsedClusterIds(nextCollapsed);

    if (clusteringEnabled && positionedNodes.length > 0) {
      const res = computeClusteredLayout(
        { nodes: positionedNodes, edges: positionedEdges },
        {
          strategy: clusteringStrategy,
          collapsedClusterIds: nextCollapsed,
          pinnedNodes: pinnedMap,
        },
      );
      setPositionedGraph(res.nodes, res.edges);
    }
  }, [
    clusteringEnabled,
    positionedNodes,
    positionedEdges,
    clusteringStrategy,
    pinnedMap,
    setPositionedGraph,
  ]);

  const handleToggleCluster = useCallback(
    (clusterId: string) => {
      setCollapsedClusterIds((prev) => {
        const next = toggleClusterCollapse(clusterId, prev);
        if (clusteringEnabled && positionedNodes.length > 0) {
          const res = computeClusteredLayout(
            { nodes: positionedNodes, edges: positionedEdges },
            { strategy: clusteringStrategy, collapsedClusterIds: next, pinnedNodes: pinnedMap },
          );
          setPositionedGraph(res.nodes, res.edges);
        }
        return next;
      });
    },
    [
      clusteringEnabled,
      positionedNodes,
      positionedEdges,
      clusteringStrategy,
      pinnedMap,
      setPositionedGraph,
    ],
  );

  // Pinning Controls
  const selectedNode = useMemo(
    () => positionedNodes.find((n) => n.id === selectedNodeId),
    [positionedNodes, selectedNodeId],
  );
  const isSelectedPinned = Boolean(selectedNodeId && pinnedMap[selectedNodeId]);
  const pinnedCount = Object.keys(pinnedMap).length;

  const handlePinSelected = useCallback(() => {
    if (!selectedNodeId || !selectedNode) return;
    setPinnedMap((prev) => {
      const next = pinNode(prev, selectedNodeId, { x: selectedNode.x, y: selectedNode.y });
      onPinNode?.(selectedNodeId, true);
      return next;
    });
  }, [selectedNodeId, selectedNode, onPinNode]);

  const handleUnpinSelected = useCallback(() => {
    if (!selectedNodeId) return;
    setPinnedMap((prev) => {
      const next = unpinNode(prev, selectedNodeId);
      onPinNode?.(selectedNodeId, false);
      return next;
    });
  }, [selectedNodeId, onPinNode]);

  const handlePinAll = useCallback(() => {
    const next = pinAllNodes(positionedNodes);
    setPinnedMap(next);
  }, [positionedNodes]);

  const handleUnpinAll = useCallback(() => {
    const next = clearAllPins();
    setPinnedMap(next);
  }, []);

  // Reset Layout Button
  const handleResetLayout = useCallback(() => {
    resetLayoutConfig();
    setLayoutMode("layered");
    setPinnedMap({});
    setCollapsedClusterIds(new Set());
    onReset?.();
  }, [resetLayoutConfig, setLayoutMode, onReset]);

  return (
    <div className={`layout-menu-wrapper ${className}`.trim()} ref={menuRef}>
      <button
        type="button"
        className={`layout-menu-trigger-btn ${isOpen ? "is-active" : ""}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Layout menu"
        data-testid="layout-menu-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <IconAdjustments size={14} />
        <span>Layout</span>
        {pinnedCount > 0 && (
          <span className="layout-menu-badge" data-testid="pinned-count-badge">
            {pinnedCount} pinned
          </span>
        )}
        <IconChevronDown size={12} />
      </button>

      {isOpen && (
        <div
          className="layout-menu-popover"
          role="dialog"
          aria-label="Layout settings and controls"
          data-testid="layout-menu-popover"
        >
          <div className="layout-menu-header">
            <span className="layout-menu-title">
              <IconAdjustments size={15} />
              Layout & Clustering
            </span>
            <button
              type="button"
              className="layout-menu-close-btn"
              aria-label="Close layout menu"
              onClick={() => setIsOpen(false)}
            >
              <IconX size={14} />
            </button>
          </div>

          {/* Section 1: Algorithm Switching */}
          <div className="layout-menu-section">
            <span className="layout-section-label">Algorithm</span>
            <div className="layout-algorithm-grid" role="radiogroup" aria-label="Layout Algorithm">
              <button
                type="button"
                role="radio"
                aria-checked={(layoutMode as string) === "layered"}
                className={`layout-algorithm-btn ${(layoutMode as string) === "layered" ? "is-active" : ""}`}
                data-testid="algorithm-layered"
                onClick={() => handleSelectAlgorithm("layered")}
              >
                <IconHierarchy size={16} />
                <span>Layered</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={(layoutMode as string) === "radial"}
                className={`layout-algorithm-btn ${(layoutMode as string) === "radial" ? "is-active" : ""}`}
                data-testid="algorithm-radial"
                onClick={() => handleSelectAlgorithm("radial")}
              >
                <IconTopologyStar3 size={16} />
                <span>Radial</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={(layoutMode as string) === "force"}
                className={`layout-algorithm-btn ${(layoutMode as string) === "force" ? "is-active" : ""}`}
                data-testid="algorithm-force"
                onClick={() => handleSelectAlgorithm("force")}
              >
                <IconCirclesRelation size={16} />
                <span>Force</span>
              </button>
            </div>
          </div>

          {/* Section 2: Spacing Sliders */}
          <div className="layout-menu-section">
            <span className="layout-section-label">Spacing Controls</span>
            <div className="layout-slider-row">
              <div className="layout-slider-header">
                <span>Node Separation (H)</span>
                <span>{layoutConfig.nodeGap}px</span>
              </div>
              <div className="layout-slider-controls">
                <input
                  type="range"
                  className="layout-range-input"
                  data-testid="slider-node-gap"
                  aria-label="Node horizontal separation"
                  min={10}
                  max={300}
                  step={5}
                  value={layoutConfig.nodeGap}
                  onChange={(e) => handleNodeGapChange(Number(e.target.value))}
                />
                <input
                  type="number"
                  className="layout-number-input"
                  data-testid="input-node-gap"
                  aria-label="Node horizontal separation value"
                  min={10}
                  max={300}
                  step={5}
                  value={layoutConfig.nodeGap}
                  onChange={(e) => handleNodeGapChange(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="layout-slider-row">
              <div className="layout-slider-header">
                <span>Rank Separation (V)</span>
                <span>{layoutConfig.rankGap}px</span>
              </div>
              <div className="layout-slider-controls">
                <input
                  type="range"
                  className="layout-range-input"
                  data-testid="slider-rank-gap"
                  aria-label="Vertical rank separation"
                  min={10}
                  max={300}
                  step={5}
                  value={layoutConfig.rankGap}
                  onChange={(e) => handleRankGapChange(Number(e.target.value))}
                />
                <input
                  type="number"
                  className="layout-number-input"
                  data-testid="input-rank-gap"
                  aria-label="Vertical rank separation value"
                  min={10}
                  max={300}
                  step={5}
                  value={layoutConfig.rankGap}
                  onChange={(e) => handleRankGapChange(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Subtree Clustering & Collapse */}
          <div className="layout-menu-section">
            <span className="layout-section-label">Subtree Clustering</span>
            <div className="layout-clustering-toggle-row">
              <label className="layout-checkbox-label">
                <input
                  type="checkbox"
                  data-testid="toggle-clustering"
                  checked={clusteringEnabled}
                  onChange={handleToggleClustering}
                />
                <span>Enable Clustering</span>
              </label>
              {clusteringEnabled && (
                <span className="layout-menu-badge">{computedClusters.length} clusters</span>
              )}
            </div>

            {clusteringEnabled && (
              <>
                <select
                  className="layout-strategy-select"
                  data-testid="select-clustering-strategy"
                  aria-label="Clustering grouping strategy"
                  value={clusteringStrategy}
                  onChange={(e) => setClusteringStrategy(e.target.value as ClusterGroupingStrategy)}
                >
                  <option value="subtree">Group by Subtree Hierarchy</option>
                  <option value="agent">Group by Agent Role</option>
                  <option value="section">Group by Dataset Section</option>
                </select>

                <div className="layout-clustering-actions">
                  <button
                    type="button"
                    className="layout-btn-sm"
                    data-testid="btn-collapse-all"
                    onClick={handleCollapseAllClusters}
                  >
                    Collapse All
                  </button>
                  <button
                    type="button"
                    className="layout-btn-sm"
                    data-testid="btn-expand-all"
                    onClick={handleExpandAllClusters}
                  >
                    Expand All
                  </button>
                </div>

                {computedClusters.length > 0 && (
                  <div className="layout-cluster-list" data-testid="cluster-list">
                    {computedClusters.map((cluster) => (
                      <div key={cluster.id} className="layout-cluster-item">
                        <span className="layout-cluster-name" title={cluster.label}>
                          {cluster.label}
                          <span className="layout-cluster-tag">{cluster.nodeIds.length} nodes</span>
                        </span>
                        <button
                          type="button"
                          className="layout-btn-sm"
                          style={{ flex: "none", padding: "2px 6px", fontSize: "10px" }}
                          data-testid={`btn-toggle-cluster-${cluster.id}`}
                          onClick={() => handleToggleCluster(cluster.id)}
                        >
                          {collapsedClusterIds.has(cluster.id) ? "Expand" : "Collapse"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Section 4: Pin / Unpin Node Positioning */}
          <div className="layout-menu-section">
            <span className="layout-section-label">Node Pinning</span>
            <div className="layout-pin-status-row">
              <span>Selected:</span>
              <span style={{ color: selectedNode ? "#60a5fa" : "#64748b", fontWeight: 500 }}>
                {selectedNode ? selectedNode.name : "None"}
              </span>
            </div>

            <div className="layout-pin-grid">
              <button
                type="button"
                className="layout-btn-sm"
                data-testid="btn-pin-selected"
                disabled={!selectedNodeId || isSelectedPinned}
                onClick={handlePinSelected}
              >
                <IconPin size={12} style={{ display: "inline", marginRight: 4 }} />
                Pin Selected
              </button>
              <button
                type="button"
                className="layout-btn-sm"
                data-testid="btn-unpin-selected"
                disabled={!selectedNodeId || !isSelectedPinned}
                onClick={handleUnpinSelected}
              >
                <IconPinnedOff size={12} style={{ display: "inline", marginRight: 4 }} />
                Unpin Selected
              </button>
              <button
                type="button"
                className="layout-btn-sm"
                data-testid="btn-pin-all"
                disabled={positionedNodes.length === 0}
                onClick={handlePinAll}
              >
                Pin All Nodes
              </button>
              <button
                type="button"
                className="layout-btn-sm"
                data-testid="btn-unpin-all"
                disabled={pinnedCount === 0}
                onClick={handleUnpinAll}
              >
                Unpin All ({pinnedCount})
              </button>
            </div>
          </div>

          {/* Section 5: Reset Layout Button */}
          <button
            type="button"
            className="layout-reset-btn"
            data-testid="btn-reset-layout"
            onClick={handleResetLayout}
          >
            <IconRotate size={13} />
            Reset Layout to Defaults
          </button>
        </div>
      )}
    </div>
  );
});

LayoutMenu.displayName = "LayoutMenu";
export default LayoutMenu;
