import type { FC } from "react";
import {
  IconChevronDown,
  IconChevronUp,
  IconAlertOctagon,
  IconAlertTriangle,
  IconAlertCircle,
  IconInfoCircle,
  IconWand,
  IconArrowRight,
  IconTerminal2,
} from "@tabler/icons-react";
import type { AnomalyCardProps } from "./types";

export const AnomalyCard: FC<AnomalyCardProps> = ({
  anomaly,
  isExpanded,
  onToggleExpand,
  onSelectNode,
  onSelectEdge,
  onApplyQuickFix,
}) => {
  const {
    id,
    type,
    category,
    severity,
    title,
    description,
    nodeIds,
    edgeIds,
    impactScore,
    metricValue,
    thresholdValue,
    unit,
    remediation,
    evidence,
  } = anomaly;

  let SeverityIcon = IconAlertCircle;
  let severityClass = "card-severity-warning";

  if (severity === "critical") {
    SeverityIcon = IconAlertOctagon;
    severityClass = "card-severity-critical";
  } else if (severity === "error") {
    SeverityIcon = IconAlertTriangle;
    severityClass = "card-severity-error";
  } else if (severity === "info") {
    SeverityIcon = IconInfoCircle;
    severityClass = "card-severity-info";
  }

  return (
    <div
      className={`gvui-anomaly-card ${severityClass} ${isExpanded ? "expanded" : ""}`}
      data-testid={`anomaly-card-${id}`}
    >
      <div
        className="anomaly-card-header"
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
      >
        <div className="card-header-main">
          <div className="card-badges-row">
            <span className={`severity-badge ${severityClass}`}>
              <SeverityIcon size={14} />
              <span>{severity.toUpperCase()}</span>
            </span>
            <span className="category-badge">{category}</span>
            <span className="type-badge">{type.replace(/_/g, " ")}</span>
          </div>

          <h3 className="anomaly-card-title">{title}</h3>

          <div className="card-targets-row">
            {nodeIds.length > 0 && (
              <div className="target-nodes-list">
                <span className="target-label">Nodes:</span>
                {nodeIds.map((nid) => (
                  <button
                    key={nid}
                    type="button"
                    className="target-node-chip"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectNode?.(nid);
                    }}
                    title={`Focus node ${nid} in canvas`}
                  >
                    {nid}
                  </button>
                ))}
              </div>
            )}

            {edgeIds && edgeIds.length > 0 && (
              <div className="target-edges-list">
                <span className="target-label">Edges:</span>
                {edgeIds.map((eid) => (
                  <button
                    key={eid}
                    type="button"
                    className="target-edge-chip"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEdge?.(eid);
                    }}
                    title={`Focus edge ${eid} in canvas`}
                  >
                    {eid}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card-header-metrics">
          <div className="impact-meter">
            <span className="impact-label">Impact</span>
            <div className="impact-bar-track">
              <div
                className={`impact-bar-fill ${severityClass}`}
                style={{ width: `${Math.min(100, Math.max(5, impactScore))}%` }}
              />
            </div>
            <span className="impact-score">{impactScore}/100</span>
          </div>

          {typeof metricValue === "number" && typeof thresholdValue === "number" && (
            <div className="metric-compare-chip">
              <span className="metric-val">
                {metricValue.toLocaleString()} {unit || ""}
              </span>
              <span className="metric-separator">/</span>
              <span className="threshold-val">limit {thresholdValue.toLocaleString()}</span>
            </div>
          )}

          <div className="expand-chevron-icon">
            {isExpanded ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="anomaly-card-body" data-testid="anomaly-card-body">
          <p className="anomaly-description">{description}</p>

          {/* Evidence Details */}
          <div className="anomaly-evidence-section">
            <h4 className="section-heading">Defect Evidence & Diagnostics</h4>

            {evidence.cyclePath && evidence.cyclePath.length > 0 && (
              <div className="cycle-path-visualizer">
                <span className="cycle-path-label">Dependency Cycle:</span>
                <div className="cycle-chips-chain">
                  {evidence.cyclePath.map((nodeId, idx) => (
                    <span key={`${nodeId}-${idx}`} className="cycle-chip-step">
                      <button
                        type="button"
                        className="cycle-node-btn"
                        onClick={() => onSelectNode?.(nodeId)}
                      >
                        {nodeId}
                      </button>
                      {idx < (evidence.cyclePath?.length || 0) - 1 && (
                        <IconArrowRight size={12} className="cycle-arrow" />
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {evidence.metrics && Object.keys(evidence.metrics).length > 0 && (
              <div className="evidence-metrics-grid">
                {Object.entries(evidence.metrics).map(([key, val]) => (
                  <div key={key} className="evidence-metric-item">
                    <span className="evidence-key">{key}:</span>
                    <span className="evidence-val">
                      {typeof val === "boolean" ? (val ? "true" : "false") : String(val)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {evidence.logs && evidence.logs.length > 0 && (
              <div className="evidence-logs-block">
                <div className="logs-header">
                  <IconTerminal2 size={14} />
                  <span>Execution Log Snippet</span>
                </div>
                <pre className="logs-content">{evidence.logs.join("\n")}</pre>
              </div>
            )}
          </div>

          {/* Remediation Plan */}
          <div className="anomaly-remediation-section">
            <div className="remediation-header">
              <span className="remediation-tag">Recommended Remediation</span>
              <span className="remediation-action">{remediation.action}</span>
            </div>
            <p className="remediation-suggestion">{remediation.suggestion}</p>

            {remediation.autoFixable && (
              <div className="remediation-actions-bar">
                <button
                  type="button"
                  className="quick-fix-btn"
                  onClick={() => onApplyQuickFix?.(id)}
                  data-testid={`quick-fix-btn-${id}`}
                >
                  <IconWand size={16} />
                  <span>Apply Automated Quick Fix</span>
                </button>
                <span className="quick-fix-hint">
                  Applies safe resolution patch: {remediation.quickFix?.type || "remediation"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
