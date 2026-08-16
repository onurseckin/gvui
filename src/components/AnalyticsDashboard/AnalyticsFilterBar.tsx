import type { FC } from "react";
import { IconRefresh } from "@tabler/icons-react";
import type { AnalyticsFilterOptions } from "../../store/useAnalyticsStore";
import type { NodeStatus } from "../../types/graphData";

export interface AnalyticsFilterBarProps {
  filters: AnalyticsFilterOptions;
  onSearchChange: (query: string) => void;
  onStatusChange: (status: "all" | NodeStatus) => void;
  onTierChange: (tier: "all" | "xs" | "s" | "m" | "l" | "unspecified") => void;
  onResetFilters: () => void;
}

export const AnalyticsFilterBar: FC<AnalyticsFilterBarProps> = ({
  filters,
  onSearchChange,
  onStatusChange,
  onTierChange,
  onResetFilters,
}) => {
  const statusOptions: Array<"all" | NodeStatus> = [
    "all",
    "success",
    "error",
    "running",
    "pending",
    "skipped",
  ];

  const hasActiveFilters =
    filters.searchQuery.trim().length > 0 ||
    filters.nodeStatus !== "all" ||
    filters.modelTier !== "all" ||
    filters.stepRange !== null;

  return (
    <div className="analytics-filter-bar" data-testid="analytics-filter-bar">
      <div className="analytics-filter-left">
        <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
          <input
            type="text"
            className="analytics-search-input"
            placeholder="Search nodes, models, tools..."
            value={filters.searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            data-testid="analytics-search-input"
          />
        </div>

        {/* Status Pills */}
        <div className="analytics-filter-group" data-testid="analytics-status-filters">
          {statusOptions.map((st) => (
            <button
              key={`filter-st-${st}`}
              type="button"
              className={`analytics-filter-pill ${filters.nodeStatus === st ? "active" : ""}`}
              onClick={() => onStatusChange(st)}
              data-testid={`filter-status-${st}`}
            >
              {st.charAt(0).toUpperCase() + st.slice(1)}
            </button>
          ))}
        </div>

        {/* Tier Select */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#a1a1aa" }}>Tier:</span>
          <select
            className="analytics-select-control"
            value={filters.modelTier}
            onChange={(e) =>
              onTierChange(e.target.value as "all" | "xs" | "s" | "m" | "l" | "unspecified")
            }
            data-testid="analytics-tier-select"
          >
            <option value="all">All Tiers</option>
            <option value="xs">Tier XS (Light)</option>
            <option value="s">Tier S (Fast)</option>
            <option value="m">Tier M (Standard)</option>
            <option value="l">Tier L (Frontier)</option>
          </select>
        </div>
      </div>

      <div className="analytics-filter-right">
        {hasActiveFilters && (
          <button
            type="button"
            className="analytics-filter-reset-btn"
            onClick={onResetFilters}
            data-testid="analytics-reset-filters-btn"
          >
            <IconRefresh size={12} style={{ display: "inline-block", marginRight: 4 }} />
            Reset Filters
          </button>
        )}
      </div>
    </div>
  );
};
