import type { FC } from "react";
import { CircularProgressLoader } from "./CircularProgressLoader";
import { useSmoothProgress } from "./useSmoothProgress";
import "./LoadingOverlay.css";

export interface LoadingOverlayProps {
  percent: number;
  stageText?: string;
  detail?: string;
  nodeCount?: number;
  edgeCount?: number;
}

export const LoadingOverlay: FC<LoadingOverlayProps> = ({
  percent,
  stageText = "",
  detail = "",
}) => {
  const smoothPercent = useSmoothProgress(percent, true);
  const safePercent = Math.min(100, Math.max(0, smoothPercent));
  const displayText = detail || stageText;

  return (
    <div className="loading-overlay-backdrop">
      <div className="loading-overlay-content">
        <CircularProgressLoader percent={safePercent} size={72} strokeWidth={3.5} />
        {displayText && <div className="loading-overlay-text">{displayText}</div>}
      </div>
    </div>
  );
};


