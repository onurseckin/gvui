import type { FC } from "react";
import { useState } from "react";
import { IconBug } from "@tabler/icons-react";
import type { ErrorTaxonomyMetrics } from "../../store/useAnalyticsStore";

export interface ErrorTaxonomyCardProps {
  errorTaxonomy: ErrorTaxonomyMetrics;
  totalNodes?: number;
}

export const ErrorTaxonomyCard: FC<ErrorTaxonomyCardProps> = ({ errorTaxonomy }) => {
  const { totalErrors, unresolvedCount, resolvedCount, errorRate, items } = errorTaxonomy;

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  return (
    <div className="analytics-card" data-testid="error-taxonomy-card">
      <div className="analytics-card-header">
        <h3 className="analytics-card-title">
          <IconBug size={18} color="#ef4444" />
          Error Taxonomy & Failure Modes
        </h3>
        <span
          className="analytics-card-badge"
          style={{
            backgroundColor: totalErrors === 0 ? "#064e3b" : "#7f1d1d",
            color: totalErrors === 0 ? "#a7f3d0" : "#fca5a5",
          }}
        >
          {totalErrors === 0
            ? "0 Failures"
            : `${totalErrors} Issues (${errorRate.toFixed(1)}% of nodes)`}
        </span>
      </div>

      <div className="analytics-card-content">
        {/* Error KPI Summary */}
        <div className="velocity-stat-row">
          <div className="velocity-stat-cell">
            <span className="velocity-stat-label">Total Errors</span>
            <span
              className="velocity-stat-val"
              style={{ color: totalErrors > 0 ? "#ef4444" : "#10b981" }}
            >
              {totalErrors}
            </span>
          </div>
          <div className="velocity-stat-cell">
            <span className="velocity-stat-label">Unresolved</span>
            <span
              className="velocity-stat-val"
              style={{ color: unresolvedCount > 0 ? "#f59e0b" : "#ffffff" }}
            >
              {unresolvedCount}
            </span>
          </div>
          <div className="velocity-stat-cell">
            <span className="velocity-stat-label">Remediated</span>
            <span className="velocity-stat-val" style={{ color: "#10b981" }}>
              {resolvedCount}
            </span>
          </div>
        </div>

        {/* Taxonomy Categories List */}
        {items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: "#10b981", fontSize: 13 }}>
            ✓ No error taxonomies or validation rejections encountered across this run!
          </div>
        ) : (
          <div className="error-taxonomy-list">
            {items.map((item) => {
              const isExpanded = expandedCategory === item.category;
              return (
                <div
                  key={`error-cat-${item.category}`}
                  className="error-category-item"
                  data-testid={`error-cat-${item.category}`}
                >
                  <div
                    className="error-category-header"
                    style={{ cursor: "pointer" }}
                    onClick={() => setExpandedCategory(isExpanded ? null : item.category)}
                  >
                    <span className="error-category-title">
                      <span>{item.label}</span>
                      <span className={`error-severity-badge ${item.severity}`}>
                        {item.severity}
                      </span>
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#ffffff" }}>
                      {item.count} ({item.percentage.toFixed(0)}%)
                    </span>
                  </div>

                  {/* Percentage mini-bar */}
                  <div className="repair-bar-track" style={{ height: 4 }}>
                    <div
                      className="repair-bar-fill error"
                      style={{ width: `${Math.max(item.percentage, 4)}%` }}
                    />
                  </div>

                  {/* Sample Messages on Expand */}
                  {isExpanded && item.sampleMessages.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: "#a1a1aa", textTransform: "uppercase" }}>
                        Sample Observations / Logs:
                      </span>
                      {item.sampleMessages.map((msg, idx) => (
                        <div key={`sample-msg-${idx}`} className="error-sample-msg">
                          {msg}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
