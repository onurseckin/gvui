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
        return {
          all: 0,
          orchestrators: 0,
          implementers: 0,
          validators: 0,
          critics: 0,
          errors: 0,
          error: 0,
          success: 0,
          tools: 0,
        };
      }

      let orchestrators = 0;
      let implementers = 0;
      let validators = 0;
      let critics = 0;
      let errors = 0;
      let success = 0;
      let tools = 0;

      for (const node of dataset.nodes) {
        const isOrch =
          node.kind === "orchestrator" ||
          node.type === "orchestrator" ||
          node.metadata?.role === "orchestrator";
        if (isOrch) orchestrators++;

        const isImpl =
          node.kind === "agent" ||
          node.type === "agent" ||
          node.type === "worker" ||
          node.metadata?.role === "implementer" ||
          node.metadata?.role === "worker";
        if (isImpl) implementers++;

        const isVal =
          node.kind === "gate" ||
          node.type === "gate" ||
          node.type === "validator" ||
          node.metadata?.role === "validator";
        if (isVal) validators++;

        const isCrit =
          node.kind === "critic" || node.type === "critic" || node.metadata?.role === "critic";
        if (isCrit) critics++;

        const statusBadge = node.badges?.find((b) => b.variant);
        const statusStr = String(node.metadata?.status ?? "").toLowerCase();
        const isErr =
          statusBadge?.variant === "error" ||
          statusStr.includes("error") ||
          statusStr.includes("fail") ||
          node.status === "error";
        if (isErr) errors++;

        const statusSuccess =
          statusBadge?.variant === "success" ||
          statusStr.includes("complete") ||
          statusStr.includes("success") ||
          node.status === "success";
        if (statusSuccess) success++;

        const isTool = node.kind === "tool" || (Boolean(node.tools) && node.tools!.length > 0);
        if (isTool) tools++;
      }

      return {
        all: dataset.nodes.length,
        orchestrators,
        implementers,
        validators,
        critics,
        errors,
        error: errors,
        success,
        tools,
      };
    }, [dataset]);

    const filters: readonly FilterOption[] = useMemo(
      () => [
        { id: "all", label: "All", count: filterCounts.all },
        { id: "orchestrators", label: "Orchestrators", count: filterCounts.orchestrators },
        { id: "implementers", label: "Implementers", count: filterCounts.implementers },
        { id: "validators", label: "Validators", count: filterCounts.validators },
        { id: "critics", label: "Critics", count: filterCounts.critics },
        { id: "errors", label: "Errors", count: filterCounts.errors },
        { id: "success", label: "Success", count: filterCounts.success },
        { id: "tools", label: "Tools", count: filterCounts.tools },
      ],
      [filterCounts],
    );

    const isFilterActive = useCallback(
      (filterId: FilterCategory): boolean => {
        if (activeFilter === filterId) return true;
        if (filterId === "errors" && activeFilter === "error") return true;
        if (filterId === "error" && activeFilter === "errors") return true;
        return false;
      },
      [activeFilter],
    );

    const handleFilterClick = useCallback(
      (filterId: FilterCategory) => {
        const active = isFilterActive(filterId);
        if (active && filterId !== "all") {
          onFilterChange("all");
        } else {
          onFilterChange(filterId);
        }
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
