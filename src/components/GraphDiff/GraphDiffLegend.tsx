import type { FC } from "react";
import React, { useCallback } from "react";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useGraphDiffStore } from "../../store/useGraphDiffStore";
import type { DiffFilterMode } from "./types";

export interface GraphDiffLegendProps {
  className?: string;
}

export const GraphDiffLegend: FC<GraphDiffLegendProps> = React.memo(function GraphDiffLegend({
  className = "",
}) {
  const { isLegendOpen, toggleLegend, filterMode, setFilterMode, diffResult } = useGraphDiffStore();

  const handleFilterClick = useCallback(
    (targetFilter: DiffFilterMode) => {
      if (filterMode === targetFilter) {
        setFilterMode("all");
      } else {
        setFilterMode(targetFilter);
      }
    },
    [filterMode, setFilterMode],
  );

  if (!isLegendOpen) {
    return (
      <button
        type="button"
        className="graph-diff-legend graph-diff-legend--minimized diff-toolbar-btn"
        onClick={toggleLegend}
        style={{ bottom: "16px", left: "16px", position: "absolute", zIndex: 15 }}
        title="Show Graph Diff Legend"
      >
        <span>Legend</span>
        <IconChevronUp size={14} />
      </button>
    );
  }

  const { nodes } = diffResult.counts;

  return (
    <div className={`graph-diff-legend ${className}`} role="region" aria-label="Graph Diff Legend">
      <div className="diff-legend-header">
        <span>Topology Diff Legend</span>
        <button
          type="button"
          className="diff-legend-toggle"
          onClick={toggleLegend}
          aria-label="Minimize legend"
        >
          <IconChevronDown size={14} />
        </button>
      </div>

      <div className="diff-legend-items">
        <div
          className={`diff-legend-item ${filterMode === "added-only" ? "active" : ""}`}
          onClick={() => handleFilterClick("added-only")}
          title="Filter to added nodes (+)"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && handleFilterClick("added-only")}
        >
          <div className="diff-legend-color-box diff-color-added" />
          <span>+ Added Node / Edge</span>
          <span className="diff-pill-count diff-pill-count--added">{nodes.added}</span>
        </div>

        <div
          className={`diff-legend-item ${filterMode === "removed-only" ? "active" : ""}`}
          onClick={() => handleFilterClick("removed-only")}
          title="Filter to removed nodes (-)"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && handleFilterClick("removed-only")}
        >
          <div className="diff-legend-color-box diff-color-removed" />
          <span>- Removed Node / Edge</span>
          <span className="diff-pill-count diff-pill-count--removed">{nodes.removed}</span>
        </div>

        <div
          className={`diff-legend-item ${filterMode === "modified-only" ? "active" : ""}`}
          onClick={() => handleFilterClick("modified-only")}
          title="Filter to modified nodes (Δ)"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && handleFilterClick("modified-only")}
        >
          <div className="diff-legend-color-box diff-color-modified" />
          <span>Δ Modified Node / Edge</span>
          <span className="diff-pill-count diff-pill-count--modified">{nodes.modified}</span>
        </div>

        <div
          className={`diff-legend-item ${filterMode === "unchanged-only" ? "active" : ""}`}
          onClick={() => handleFilterClick("unchanged-only")}
          title="Filter to unchanged nodes (=)"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && handleFilterClick("unchanged-only")}
        >
          <div className="diff-legend-color-box diff-color-unchanged" />
          <span>= Unchanged Baseline</span>
          <span className="diff-pill-count">{nodes.unchanged}</span>
        </div>
      </div>
    </div>
  );
});
