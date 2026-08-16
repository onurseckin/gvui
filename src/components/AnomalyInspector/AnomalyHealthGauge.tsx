import type { FC } from "react";
import {
  IconShieldCheck,
  IconAlertTriangle,
  IconAlertOctagon,
  IconActivity,
} from "@tabler/icons-react";
import type { AnomalyHealthGaugeProps } from "./types";

export const AnomalyHealthGauge: FC<AnomalyHealthGaugeProps> = ({
  score,
  report,
  className = "",
}) => {
  let statusText = "Optimal";
  let statusClass = "health-optimal";
  let IconComponent = IconShieldCheck;

  if (score < 50) {
    statusText = "Critical";
    statusClass = "health-critical";
    IconComponent = IconAlertOctagon;
  } else if (score < 75) {
    statusText = "Degraded";
    statusClass = "health-degraded";
    IconComponent = IconAlertTriangle;
  } else if (score < 90) {
    statusText = "Elevated Risk";
    statusClass = "health-warning";
    IconComponent = IconActivity;
  }

  // Circular gauge parameters
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div
      className={`gvui-anomaly-health-gauge ${statusClass} ${className}`}
      data-testid="anomaly-health-gauge"
    >
      <div className="gauge-svg-container">
        <svg className="gauge-svg" width="96" height="96" viewBox="0 0 96 96">
          <circle className="gauge-bg-circle" cx="48" cy="48" r={radius} strokeWidth="8" />
          <circle
            className="gauge-progress-circle"
            cx="48"
            cy="48"
            r={radius}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform="rotate(-90 48 48)"
          />
        </svg>
        <div className="gauge-score-overlay">
          <span className="gauge-score-number">{score}</span>
          <span className="gauge-score-label">/ 100</span>
        </div>
      </div>

      <div className="gauge-details">
        <div className="gauge-status-row">
          <IconComponent size={20} className="gauge-status-icon" />
          <span className="gauge-status-title">Health Index: {statusText}</span>
        </div>
        <p className="gauge-subtitle">
          {report.totalAnomalies === 0
            ? "Zero graph defects or execution anomalies detected."
            : `${report.totalAnomalies} active anomal${report.totalAnomalies === 1 ? "y" : "ies"} requiring review.`}
        </p>

        <div className="gauge-quick-stats">
          <span className="stat-pill stat-critical">{report.severityCounts.critical} Critical</span>
          <span className="stat-pill stat-error">{report.severityCounts.error} Errors</span>
          <span className="stat-pill stat-warning">{report.severityCounts.warning} Warnings</span>
        </div>
      </div>
    </div>
  );
};
