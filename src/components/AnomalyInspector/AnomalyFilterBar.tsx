import type { FC, ChangeEvent } from "react";
import {
  IconSearch,
  IconWand,
  IconX,
  IconAlertOctagon,
  IconAlertTriangle,
  IconAlertCircle,
  IconInfoCircle,
} from "@tabler/icons-react";
import type { AnomalySeverity } from "../../engine/anomaly/types";
import type { AnomalyFilterBarProps } from "./types";

interface SeverityButtonMeta {
  key: AnomalySeverity;
  label: string;
  Icon: typeof IconAlertOctagon;
  colorClass: string;
}

const SEVERITIES: SeverityButtonMeta[] = [
  { key: "critical", label: "Critical", Icon: IconAlertOctagon, colorClass: "filter-critical" },
  { key: "error", label: "Error", Icon: IconAlertTriangle, colorClass: "filter-error" },
  { key: "warning", label: "Warning", Icon: IconAlertCircle, colorClass: "filter-warning" },
  { key: "info", label: "Info", Icon: IconInfoCircle, colorClass: "filter-info" },
];

export const AnomalyFilterBar: FC<AnomalyFilterBarProps> = ({
  filters,
  report,
  onSearchChange,
  onToggleSeverity,
  onToggleAutoFixable,
  onResetFilters,
}) => {
  const hasActiveFilters =
    filters.searchQuery.length > 0 ||
    filters.selectedSeverities.length > 0 ||
    filters.selectedCategories.length > 0 ||
    filters.autoFixableOnly ||
    filters.selectedNodeId !== null;

  return (
    <div className="gvui-anomaly-filter-bar" data-testid="anomaly-filter-bar">
      <div className="filter-search-wrapper">
        <IconSearch size={16} className="filter-search-icon" />
        <input
          type="text"
          className="filter-search-input"
          placeholder="Search by anomaly title, node ID, description, or remediation action..."
          value={filters.searchQuery}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
          data-testid="anomaly-search-input"
        />
        {filters.searchQuery && (
          <button
            type="button"
            className="filter-clear-search-btn"
            onClick={() => onSearchChange("")}
            title="Clear search"
          >
            <IconX size={14} />
          </button>
        )}
      </div>

      <div className="filter-controls-row">
        <div className="filter-severities-group">
          {SEVERITIES.map(({ key, label, Icon, colorClass }) => {
            const isSelected = filters.selectedSeverities.includes(key);
            const count = report.severityCounts[key] || 0;

            return (
              <button
                key={key}
                type="button"
                className={`severity-filter-btn ${colorClass} ${isSelected ? "selected" : ""}`}
                onClick={() => onToggleSeverity(key)}
                data-testid={`filter-severity-${key}`}
                title={`Toggle ${label} anomalies`}
              >
                <Icon size={14} />
                <span className="severity-label">{label}</span>
                <span className="severity-count">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="filter-actions-group">
          <button
            type="button"
            className={`autofix-toggle-btn ${filters.autoFixableOnly ? "active" : ""}`}
            onClick={onToggleAutoFixable}
            data-testid="filter-autofixable-btn"
            title="Filter to anomalies with automated quick-fix resolutions"
          >
            <IconWand size={14} />
            <span>Auto-Fixable Only</span>
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              className="reset-filters-btn"
              onClick={onResetFilters}
              data-testid="filter-reset-btn"
              title="Reset all filters"
            >
              <IconX size={14} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
