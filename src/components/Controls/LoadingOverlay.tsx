import type { FC } from "react";
import { Spinner } from "../../ui";
import "./LoadingOverlay.css";

export interface LoadingOverlayProps {
  percent?: number;
  stageText?: string;
  detail?: string;
  steps?: unknown;
  nodeCount?: number;
  edgeCount?: number;
}

export const LoadingOverlay: FC<LoadingOverlayProps> = () => {
  return (
    <div className="loading-overlay-backdrop" role="status" aria-busy="true">
      <div className="loading-overlay-content">
        <Spinner size="lg" />
      </div>
    </div>
  );
};
