import type { FC } from "react";
import "./LoadingOverlay.css";

export interface LoadingOverlayProps {
  percent: number;
  stageText: string;
  detail: string;
  nodeCount?: number;
  edgeCount?: number;
}

export const LoadingOverlay: FC<LoadingOverlayProps> = ({
  percent,
  stageText,
  detail,
  nodeCount,
  edgeCount,
}) => {
  const safePercent = Math.min(100, Math.max(0, percent));

  return (
    <div className="loading-overlay-backdrop">
      <div className="loading-overlay-card">
        <div className="loading-overlay-header">
          <span className="loading-overlay-title">{stageText}</span>
          <span className="loading-overlay-percent">{`${safePercent}%`}</span>
        </div>

        <div className="loading-progress-track">
          <div
            className="loading-progress-fill"
            style={{ width: `${safePercent}%` }}
          />
        </div>

        <div className="loading-overlay-detail">{detail}</div>

        {(nodeCount !== undefined || edgeCount !== undefined) && (
          <div className="loading-overlay-meta">
            {nodeCount !== undefined && <span>{`${nodeCount} Nodes`}</span>}
            {nodeCount !== undefined && edgeCount !== undefined && <span>•</span>}
            {edgeCount !== undefined && <span>{`${edgeCount} Edges`}</span>}
          </div>
        )}
      </div>
    </div>
  );
};
