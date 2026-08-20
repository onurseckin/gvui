import type { FC } from "react";
import React, { useCallback, useMemo } from "react";
import {
  canonicalFilterCategory,
  matchesFilterCategory,
  type FilterCategory,
} from "../../state/graphFilters";
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

/** The preset chips. A chip that matches nothing in this dataset is not offered, so the filter bar
 * describes the graph in front of the reader rather than the vocabulary the renderer ships with. */
const FILTER_DEFINITIONS: readonly { id: FilterCategory; label: string }[] = [
  { id: "coordination", label: "Coordination" },
  { id: "implementers", label: "Implementers" },
  { id: "validators", label: "Validators" },
  { id: "repairers", label: "Repairers" },
  { id: "critics", label: "Critics" },
  { id: "sub-agents", label: "Sub-agents" },
  { id: "errors", label: "Errors" },
  { id: "success", label: "Success" },
  { id: "tools", label: "Tools" },
];

export const SidebarFilterControls: FC<SidebarFilterControlsProps> = React.memo(
  function SidebarFilterControls({ dataset, activeFilter, onFilterChange }) {
    const filters = useMemo<readonly FilterOption[]>(() => {
      const nodes = dataset?.nodes ?? [];
      const options: FilterOption[] = [{ id: "all", label: "All", count: nodes.length }];
      for (const definition of FILTER_DEFINITIONS) {
        const count = nodes.filter((node) => matchesFilterCategory(node, definition.id)).length;
        const isActive =
          canonicalFilterCategory(activeFilter) === canonicalFilterCategory(definition.id);
        // The active chip stays offered whatever it matches, so a filter can always be turned off.
        if (count === 0 && !isActive) continue;
        options.push({ ...definition, count });
      }
      return options;
    }, [dataset, activeFilter]);

    const isFilterActive = useCallback(
      (filterId: FilterCategory): boolean =>
        canonicalFilterCategory(activeFilter) === canonicalFilterCategory(filterId),
      [activeFilter],
    );

    const handleFilterClick = useCallback(
      (filterId: FilterCategory) => {
        if (isFilterActive(filterId) && filterId !== "all") onFilterChange("all");
        else onFilterChange(filterId);
      },
      [isFilterActive, onFilterChange],
    );

    return (
      <div className="sidebar-section sidebar-quick-filters" data-testid="sidebar-filters">
        <h4 className="sidebar-section-title">Quick Filters</h4>
        <div className="sidebar-filter-list">
          {filters.map((filter) => {
            const isActive = isFilterActive(filter.id);
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
