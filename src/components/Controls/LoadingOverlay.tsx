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

export const LoadingOverlay: FC<LoadingOverlayProps> = ({
  percent,
  stageText,
  detail,
  nodeCount,
  edgeCount,
}) => {
  const textMessage = detail || stageText;
  const percentText = percent !== undefined ? `${Math.round(percent)}%` : null;
  const countsText =
    nodeCount !== undefined || edgeCount !== undefined
      ? `(${nodeCount ?? 0} nodes, ${edgeCount ?? 0} edges)`
      : null;

  const displayMessage = [textMessage, percentText, countsText].filter(Boolean).join(" • ");

  return (
    <div className="loading-overlay-backdrop" role="status" aria-busy="true">
      <div className="loading-overlay-content">
        <Spinner size="lg" />
        {displayMessage ? <span className="loading-overlay-message">{displayMessage}</span> : null}
      </div>
    </div>
  );
};
