import type { FC } from "react";
import { IconListCheck, IconFlame, IconArrowRight } from "@tabler/icons-react";
import type { AnomalyRemediationPanelProps } from "./types";

export const AnomalyRemediationPanel: FC<AnomalyRemediationPanelProps> = ({
  report,
  onSelectNode,
}) => {
  const autoFixableAnomalies = report.anomalies.filter((a) => a.remediation.autoFixable);

  return (
    <div className="gvui-anomaly-remediation-panel" data-testid="anomaly-remediation-panel">
      <div className="remediation-summary-header">
        <div className="header-left">
          <IconListCheck size={18} className="header-icon" />
          <h4 className="panel-title">Prioritized Action Plan</h4>
        </div>
        {autoFixableAnomalies.length > 0 && (
          <span className="autofix-badge">
            {autoFixableAnomalies.length} Quick-Fixable Defect
            {autoFixableAnomalies.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {report.criticalPathBottlenecks.length > 0 && (
        <div className="critical-path-drag-bar">
          <div className="drag-header">
            <IconFlame size={15} className="drag-icon" />
            <span className="drag-label">Critical Path Chain:</span>
          </div>
          <div className="critical-path-nodes">
            {report.criticalPathBottlenecks.map((nodeId, idx) => (
              <span key={nodeId} className="critical-path-step">
                <button
                  type="button"
                  className="critical-node-btn"
                  onClick={() => onSelectNode?.(nodeId)}
                  title={`Focus critical path task ${nodeId}`}
                >
                  {nodeId}
                </button>
                {idx < report.criticalPathBottlenecks.length - 1 && (
                  <IconArrowRight size={12} className="drag-arrow" />
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="action-items-list">
        {report.recommendedActions.length === 0 ? (
          <p className="no-actions-text">
            No remediation actions pending. Graph execution is optimal.
          </p>
        ) : (
          report.recommendedActions.map((action, idx) => (
            <div key={idx} className="action-item-row">
              <span className="action-step-num">{idx + 1}</span>
              <span className="action-text">{action}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
