import type { FC } from "react";
import type { CustomLayoutResult } from "../../../engine/layout/custom/types";

export interface DebugOptions {
  showPorts: boolean;
  showBadges: boolean;
  showCrossings: boolean;
  showDiagnostics: boolean;
}

interface CustomLayoutDebugOverlayProps {
  layoutResult: CustomLayoutResult;
  options: DebugOptions;
  onOptionsChange: (options: DebugOptions) => void;
}

export const CustomLayoutDebugOverlay: FC<CustomLayoutDebugOverlayProps> = ({
  options,
  onOptionsChange,
}) => {
  return (
    <div className="custom-layout-debug-controls">
      <span className="controls-label">🛠️ Stage Controls:</span>
      <label className="toggle-option">
        <input
          type="checkbox"
          checked={options.showPorts}
          onChange={(e) => onOptionsChange({ ...options, showPorts: e.target.checked })}
        />
        Ports & Stubs
      </label>
      <label className="toggle-option">
        <input
          type="checkbox"
          checked={options.showBadges}
          onChange={(e) => onOptionsChange({ ...options, showBadges: e.target.checked })}
        />
        Edge Badges
      </label>
      <label className="toggle-option">
        <input
          type="checkbox"
          checked={options.showCrossings}
          onChange={(e) => onOptionsChange({ ...options, showCrossings: e.target.checked })}
        />
        Crossings
      </label>
      <label className="toggle-option">
        <input
          type="checkbox"
          checked={options.showDiagnostics}
          onChange={(e) => onOptionsChange({ ...options, showDiagnostics: e.target.checked })}
        />
        Diagnostics
      </label>
    </div>
  );
};
