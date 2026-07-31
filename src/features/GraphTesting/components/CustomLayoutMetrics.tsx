import type { FC } from "react";
import type { CustomLayoutResult } from "../../../engine/layout/custom/types";

interface CustomLayoutMetricsProps {
  layoutResult: CustomLayoutResult;
}

export const CustomLayoutMetrics: FC<CustomLayoutMetricsProps> = ({ layoutResult }) => {
  const { metrics, isValid } = layoutResult.validation;
  const status = layoutResult.status;

  const getStatusBadge = () => {
    if (status === "success" && isValid) {
      return <span className="status-badge status-valid">✅ Valid</span>;
    }
    if (status === "unresolved_soft_conflicts") {
      return <span className="status-badge status-warning">⚠️ Soft Conflicts</span>;
    }
    return <span className="status-badge status-invalid">❌ Invalid</span>;
  };

  return (
    <div className="custom-layout-metrics-panel">
      <div className="metrics-header">
        <span className="metrics-title">📊 Engine Metrics & Status</span>
        {getStatusBadge()}
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-label">Nodes</span>
          <span className="metric-value">{layoutResult.nodes.length}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Edges</span>
          <span className="metric-value">{layoutResult.edges.length}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Crossings</span>
          <span className={`metric-value ${metrics.crossingCount > 0 ? "has-conflicts" : ""}`}>
            {metrics.crossingCount}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Bends</span>
          <span className="metric-value">{metrics.bendCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Total Edge Length</span>
          <span className="metric-value">{Math.round(metrics.totalLength)}px</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Total Bounding Area</span>
          <span className="metric-value">{Math.round(metrics.totalArea).toLocaleString()} px²</span>
        </div>
      </div>

      {layoutResult.validation.diagnostics.length > 0 && (
        <div className="metrics-diagnostics">
          <div className="diagnostics-title">
            ⚠️ Diagnostics ({layoutResult.validation.diagnostics.length})
          </div>
          <ul className="diagnostics-list">
            {layoutResult.validation.diagnostics.slice(0, 5).map((diag, idx) => (
              <li key={`${diag.code}-${idx}`} className={`diag-item diag-${diag.severity}`}>
                <span className="diag-code">[{diag.code}]</span> {diag.message}
              </li>
            ))}
            {layoutResult.validation.diagnostics.length > 5 && (
              <li className="diag-more">
                ...and {layoutResult.validation.diagnostics.length - 5} more issues
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
