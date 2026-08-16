import { useCallback, useState, type ChangeEvent, type FC } from "react";
import {
  IconChevronDown,
  IconChevronUp,
  IconFlame,
  IconLayersLinked,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconSettings,
} from "@tabler/icons-react";
import type { MinimapDockPosition, MinimapHudControlsProps } from "./types";

const DOCK_POSITIONS: readonly { id: MinimapDockPosition; label: string }[] = [
  { id: "top-left", label: "Top Left" },
  { id: "top-right", label: "Top Right" },
  { id: "bottom-left", label: "Bottom Left" },
  { id: "bottom-right", label: "Bottom Right" },
];

export const MinimapHudControls: FC<MinimapHudControlsProps> = ({
  dockPosition,
  onDockChange,
  opacity,
  onOpacityChange,
  showHeatmap,
  onToggleHeatmap,
  showClusters,
  onToggleClusters,
  isCollapsed,
  onToggleCollapsed,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetView,
}) => {
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const handleOpacitySliderChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        onOpacityChange(Math.max(0.2, Math.min(1.0, val)));
      }
    },
    [onOpacityChange],
  );

  const formattedZoom = `${Math.round(zoomLevel * 100)}%`;

  return (
    <div className="minimap-hud-controls" data-testid="minimap-hud-controls">
      {/* Top Header Bar */}
      <div className="minimap-hud-header">
        <div className="minimap-hud-title-group">
          <span className="minimap-hud-title">Minimap</span>
          <span className="minimap-zoom-badge" title="Canvas Zoom Level">
            {formattedZoom}
          </span>
        </div>

        <div className="minimap-hud-actions">
          {/* Heatmap Toggle */}
          <button
            type="button"
            className={`minimap-btn-icon ${showHeatmap ? "is-active" : ""}`}
            onClick={onToggleHeatmap}
            title={showHeatmap ? "Hide density heatmap" : "Show density heatmap"}
            aria-label={showHeatmap ? "Hide density heatmap" : "Show density heatmap"}
            aria-pressed={showHeatmap}
          >
            <IconFlame size={13} />
          </button>

          {/* Cluster Outlines Toggle */}
          <button
            type="button"
            className={`minimap-btn-icon ${showClusters ? "is-active" : ""}`}
            onClick={onToggleClusters}
            title={showClusters ? "Hide cluster boundaries" : "Show cluster boundaries"}
            aria-label={showClusters ? "Hide cluster boundaries" : "Show cluster boundaries"}
            aria-pressed={showClusters}
          >
            <IconLayersLinked size={13} />
          </button>

          {/* Settings Toggle */}
          <button
            type="button"
            className={`minimap-btn-icon ${showSettings ? "is-active" : ""}`}
            onClick={() => setShowSettings((prev) => !prev)}
            title="Minimap Settings (Dock & Opacity)"
            aria-label="Minimap Settings"
            aria-expanded={showSettings}
          >
            <IconSettings size={13} />
          </button>

          {/* Collapse / Expand Toggle */}
          <button
            type="button"
            className="minimap-btn-icon"
            onClick={onToggleCollapsed}
            title={isCollapsed ? "Expand Minimap" : "Collapse Minimap"}
            aria-label={isCollapsed ? "Expand Minimap" : "Collapse Minimap"}
          >
            {isCollapsed ? <IconChevronUp size={13} /> : <IconChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Settings Popdown Tray */}
      {showSettings && !isCollapsed && (
        <div className="minimap-hud-settings-tray" data-testid="minimap-settings-tray">
          {/* Dock Position Selector */}
          <div className="minimap-setting-row">
            <span className="minimap-setting-label">Dock:</span>
            <div className="minimap-dock-buttons">
              {DOCK_POSITIONS.map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  className={`minimap-dock-btn ${dockPosition === pos.id ? "is-selected" : ""}`}
                  onClick={() => onDockChange(pos.id)}
                  title={pos.label}
                >
                  {pos.id === "top-left"
                    ? "TL"
                    : pos.id === "top-right"
                      ? "TR"
                      : pos.id === "bottom-left"
                        ? "BL"
                        : "BR"}
                </button>
              ))}
            </div>
          </div>

          {/* Opacity Slider */}
          <div className="minimap-setting-row">
            <span className="minimap-setting-label">Opacity: {Math.round(opacity * 100)}%</span>
            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={opacity}
              onChange={handleOpacitySliderChange}
              className="minimap-opacity-slider"
              aria-label="Minimap Opacity"
            />
          </div>
        </div>
      )}

      {/* Floating Bottom Quick Zoom Bar */}
      {!isCollapsed && (
        <div className="minimap-hud-zoom-bar">
          <button
            type="button"
            className="minimap-zoom-btn"
            onClick={onZoomIn}
            title="Zoom In (+20%)"
            aria-label="Zoom In"
          >
            <IconPlus size={12} />
          </button>

          <button
            type="button"
            className="minimap-zoom-btn"
            onClick={onZoomOut}
            title="Zoom Out (-20%)"
            aria-label="Zoom Out"
          >
            <IconMinus size={12} />
          </button>

          <button
            type="button"
            className="minimap-zoom-btn"
            onClick={onResetView}
            title="Reset View"
            aria-label="Reset View"
          >
            <IconRefresh size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

export default MinimapHudControls;
