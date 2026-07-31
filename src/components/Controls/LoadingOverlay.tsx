import type { FC } from "react";
import { CircularProgressLoader } from "./CircularProgressLoader";
import { useSmoothProgress } from "./useSmoothProgress";
import "./LoadingOverlay.css";

export interface LoadingOverlayProps {
  percent: number;
  stageText: string;
  detail: string;
  nodeCount?: number;
  edgeCount?: number;
}

const STAGES = [
  { id: 1, label: "Topology", range: [0, 20] },
  { id: 2, label: "Ranking", range: [20, 40] },
  { id: 3, label: "A* Routing", range: [40, 70] },
  { id: 4, label: "Crossings", range: [70, 90] },
  { id: 5, label: "Render", range: [90, 100] },
];

export const LoadingOverlay: FC<LoadingOverlayProps> = ({
  percent,
  stageText,
  detail,
  nodeCount,
  edgeCount,
}) => {
  const smoothPercent = useSmoothProgress(percent, true);
  const safePercent = Math.min(100, Math.max(0, smoothPercent));

  return (
    <div className="loading-overlay-backdrop">
      <div className="loading-overlay-card">
        <div className="loading-overlay-top-ring" style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
          <CircularProgressLoader percent={safePercent} size={110} strokeWidth={8} />
        </div>

        <div className="loading-overlay-header">
          <span className="loading-overlay-title">{stageText}</span>
        </div>

        <div className="loading-stepper-container">
          {STAGES.map((s) => {
            const isDone = safePercent >= s.range[1];
            const isActive = safePercent >= s.range[0] && safePercent < s.range[1];

            let badgeClass = "loading-step-chip";
            if (isDone) badgeClass += " is-done";
            else if (isActive) badgeClass += " is-active";

            return (
              <div key={s.id} className={badgeClass}>
                {isDone ? <span className="step-icon">✓</span> : <span className="step-icon">{s.id}</span>}
                <span className="step-label">{s.label}</span>
              </div>
            );
          })}
        </div>

        <div className="loading-overlay-detail">{detail}</div>

        {(nodeCount !== undefined || edgeCount !== undefined) && (
          <div className="loading-overlay-meta">
            {nodeCount !== undefined && <span>{nodeCount} Nodes</span>}
            {nodeCount !== undefined && edgeCount !== undefined && <span>•</span>}
            {edgeCount !== undefined && <span>{edgeCount} Edges</span>}
          </div>
        )}
      </div>
    </div>
  );
};

