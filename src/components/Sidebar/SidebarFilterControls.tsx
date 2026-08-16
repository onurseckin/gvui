import type { FC } from "react";
import React, { useCallback, useMemo } from "react";
import type { FilterCategory } from "../../state/useGraphStore";
import type { GraphDataset } from "../../types/graphData";

export interface SidebarFilterControlsProps {
  dataset: GraphDataset | null;
  activeFilter: FilterCategory;
  onFilterChange: (filter: FilterCategory) => void;
}

interface FilterOption {
  id: FilterCategory;
  label: string;
  count: number;
}

export const SidebarFilterControls: FC<SidebarFilterControlsProps> = React.memo(
  function SidebarFilterControls({ dataset, activeFilter, onFilterChange }) {
    const filterCounts = useMemo(() => {
      if (!dataset || !dataset.nodes || dataset.nodes.length === 0) {
        return { all: 0, success: 0, error: 0, tools: 0 };
      }

      let success = 0;
      let error = 0;
      let tools = 0;

      for (const node of dataset.nodes) {
        if (node.status === "success") success++;
        if (node.status === "error") error++;
        if (node.kind === "tool" || (node.tools && node.tools.length > 0)) tools++;
      }

      return {
        all: dataset.nodes.length,
        success,
        error,
        tools,
      };
    }, [dataset]);

    const filters: readonly FilterOption[] = useMemo(
      () => [
        { id: "all", label: "All Nodes", count: filterCounts.all },
        { id: "success", label: "Success", count: filterCounts.success },
        { id: "error", label: "Errors", count: filterCounts.error },
        { id: "tools", label: "Tools", count: filterCounts.tools },
      ],
      [filterCounts],
    );

    const handleFilterClick = useCallback(
      (filterId: FilterCategory) => {
        if (activeFilter === filterId && filterId !== "all") {
          onFilterChange("all");
        } else {
          onFilterChange(filterId);
        }
      },
      [activeFilter, onFilterChange],
    );

    return (
      <div className="sidebar-section" data-testid="sidebar-filters">
        <h4 className="sidebar-section-title">Quick Filters</h4>
        <div className="sidebar-filter-list">
          {filters.map((filter) => {
            const isActive = activeFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                className={`sidebar-filter-btn filter-${filter.id} ${isActive ? "active" : ""}`}
                onClick={() => handleFilterClick(filter.id)}
                aria-pressed={isActive}
                data-testid={`filter-btn-${filter.id}`}
              >
                <span className="filter-label">{filter.label}</span>
                <span className="filter-count-badge" data-testid={`filter-count-${filter.id}`}>
                  {filter.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  },
);

SidebarFilterControls.displayName = "SidebarFilterControls";
