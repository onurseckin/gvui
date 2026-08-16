import type { FC } from "react";
import React, { useCallback } from "react";
import {
  IconArrowsExchange,
  IconEye,
  IconFilter,
  IconLayoutColumns,
  IconLayoutDashboard,
  IconLayoutGrid,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { useGraphDiffStore } from "../../store/useGraphDiffStore";

export interface GraphDiffToolbarProps {
  className?: string;
  onSwapRuns?: () => void;
  onClose?: () => void;
}

export const GraphDiffToolbar: FC<GraphDiffToolbarProps> = React.memo(function GraphDiffToolbar({
  className = "",
  onSwapRuns,
  onClose,
}) {
  const {
    baseRunId,
    comparisonRunId,
    baseDataset,
    comparisonDataset,
    filterMode,
    visualMode,
    overlayOpacity,
    searchQuery,
    isSummaryDrawerOpen,
    isLegendOpen,
    diffResult,
    setFilterMode,
    setVisualMode,
    setOverlayOpacity,
    setSearchQuery,
    toggleSummaryDrawer,
    toggleLegend,
    swapRuns,
  } = useGraphDiffStore();

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [setSearchQuery],
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
  }, [setSearchQuery]);

  const handleOpacityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number.parseFloat(e.target.value);
      if (Number.isFinite(val)) {
        setOverlayOpacity(val);
      }
    },
    [setOverlayOpacity],
  );

  const handleSwap = useCallback(() => {
    if (onSwapRuns) {
      onSwapRuns();
    } else {
      swapRuns();
    }
  }, [onSwapRuns, swapRuns]);

  const { nodes, edges } = diffResult.counts;
  const totalChanges =
    nodes.added + nodes.removed + nodes.modified + edges.added + edges.removed + edges.modified;

  const baseTitle = baseDataset?.title ?? baseRunId ?? "Baseline";
  const compTitle = comparisonDataset?.title ?? comparisonRunId ?? "Candidate";

  return (
    <div className={`graph-diff-toolbar ${className}`}>
      {/* Left Section: Title & Run Identifiers */}
      <div className="diff-toolbar-section">
        <div className="diff-title-badge">
          <IconLayoutDashboard size={16} />
          <span>Graph Diff</span>
        </div>

        <div className="diff-run-badge diff-run-badge--base" title={`Baseline: ${baseTitle}`}>
          <span>Base: {baseRunId ? baseRunId.slice(0, 16) : "None"}</span>
        </div>

        <button
          type="button"
          className="diff-toolbar-btn"
          onClick={handleSwap}
          title="Swap Baseline and Comparison runs"
          aria-label="Swap runs"
        >
          <IconArrowsExchange size={14} />
        </button>

        <div className="diff-run-badge diff-run-badge--comp" title={`Comparison: ${compTitle}`}>
          <span>Comp: {comparisonRunId ? comparisonRunId.slice(0, 16) : "None"}</span>
        </div>
      </div>

      {/* Visual Mode Selector */}
      <div className="diff-toolbar-section">
        <div className="diff-mode-btn-group" role="group" aria-label="Visual comparison mode">
          <button
            type="button"
            className={`diff-toolbar-btn ${visualMode === "unified-overlay" ? "active" : ""}`}
            onClick={() => setVisualMode("unified-overlay")}
            title="Unified Overlay Mode"
          >
            <IconLayoutGrid size={14} />
            <span>Overlay</span>
          </button>
          <button
            type="button"
            className={`diff-toolbar-btn ${visualMode === "side-by-side" ? "active" : ""}`}
            onClick={() => setVisualMode("side-by-side")}
            title="Side-by-Side Mode"
          >
            <IconLayoutColumns size={14} />
            <span>Side by Side</span>
          </button>
          <button
            type="button"
            className={`diff-toolbar-btn ${visualMode === "split-screen" ? "active" : ""}`}
            onClick={() => setVisualMode("split-screen")}
            title="Split Screen Mode"
          >
            <IconEye size={14} />
            <span>Split</span>
          </button>
        </div>

        {/* Opacity Control for Overlay/Split */}
        {visualMode !== "side-by-side" && (
          <div className="diff-opacity-control" title="Adjust comparison overlay opacity">
            <span>Opacity:</span>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={overlayOpacity}
              onChange={handleOpacityChange}
              className="diff-opacity-slider"
              aria-label="Overlay opacity"
            />
            <span>{Math.round(overlayOpacity * 100)}%</span>
          </div>
        )}
      </div>

      {/* Center/Right Section: Filter Pills */}
      <div className="diff-toolbar-section">
        <div className="diff-filter-pill-group">
          <button
            type="button"
            className={`diff-filter-pill ${filterMode === "all" ? "active" : ""}`}
            onClick={() => setFilterMode("all")}
          >
            <span>All</span>
            <span className="diff-pill-count">{nodes.total}</span>
          </button>
          <button
            type="button"
            className={`diff-filter-pill ${filterMode === "changes-only" ? "active" : ""}`}
            onClick={() => setFilterMode("changes-only")}
          >
            <span>Changes</span>
            <span className="diff-pill-count">{nodes.added + nodes.removed + nodes.modified}</span>
          </button>
          <button
            type="button"
            className={`diff-filter-pill ${filterMode === "added-only" ? "active" : ""}`}
            onClick={() => setFilterMode("added-only")}
          >
            <span>+ Added</span>
            <span className="diff-pill-count diff-pill-count--added">{nodes.added}</span>
          </button>
          <button
            type="button"
            className={`diff-filter-pill ${filterMode === "removed-only" ? "active" : ""}`}
            onClick={() => setFilterMode("removed-only")}
          >
            <span>- Removed</span>
            <span className="diff-pill-count diff-pill-count--removed">{nodes.removed}</span>
          </button>
          <button
            type="button"
            className={`diff-filter-pill ${filterMode === "modified-only" ? "active" : ""}`}
            onClick={() => setFilterMode("modified-only")}
          >
            <span>Δ Modified</span>
            <span className="diff-pill-count diff-pill-count--modified">{nodes.modified}</span>
          </button>
        </div>
      </div>

      {/* Right Section: Search & Actions */}
      <div className="diff-toolbar-section">
        <div className="diff-search-input-wrap">
          <IconSearch size={14} className="diff-search-icon" />
          <input
            type="text"
            placeholder="Search diffs..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="diff-search-input"
            aria-label="Search diff nodes and properties"
          />
          {searchQuery && (
            <button
              type="button"
              className="diff-search-clear"
              onClick={handleClearSearch}
              aria-label="Clear search"
            >
              <IconX size={12} />
            </button>
          )}
        </div>

        <button
          type="button"
          className={`diff-toolbar-btn ${isSummaryDrawerOpen ? "active" : ""}`}
          onClick={toggleSummaryDrawer}
          title="Toggle Detailed Diff Summary Drawer"
        >
          <IconFilter size={14} />
          <span>Inspector</span>
          {totalChanges > 0 && (
            <span className="diff-pill-count diff-pill-count--modified">{totalChanges}</span>
          )}
        </button>

        <button
          type="button"
          className={`diff-toolbar-btn ${isLegendOpen ? "active" : ""}`}
          onClick={toggleLegend}
          title="Toggle Legend"
        >
          <span>Legend</span>
        </button>

        {onClose && (
          <button
            type="button"
            className="diff-toolbar-btn"
            onClick={onClose}
            title="Close Comparison"
            aria-label="Close Comparison"
          >
            <IconX size={14} />
          </button>
        )}
      </div>
    </div>
  );
});
