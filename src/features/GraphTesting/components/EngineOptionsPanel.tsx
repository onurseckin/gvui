import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CUSTOM_LAYOUT_CONFIG,
  type CustomLayoutConfig,
} from "../../../engine/layout/custom/config";

interface EngineOptionsPanelProps {
  appliedConfig: CustomLayoutConfig;
  onApplyConfig: (config: CustomLayoutConfig) => void;
  onResetConfig: () => void;
}

export const EngineOptionsPanel: FC<EngineOptionsPanelProps> = ({
  appliedConfig,
  onApplyConfig,
  onResetConfig,
}) => {
  const [stagedConfig, setStagedConfig] = useState<CustomLayoutConfig>(appliedConfig);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isDirty = useMemo(() => {
    return (Object.keys(stagedConfig) as (keyof CustomLayoutConfig)[]).some(
      (key) => stagedConfig[key] !== appliedConfig[key],
    );
  }, [stagedConfig, appliedConfig]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setStagedConfig(appliedConfig);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setStagedConfig(appliedConfig);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, appliedConfig]);

  const handleChange = <K extends keyof CustomLayoutConfig>(key: K, value: number) => {
    setStagedConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApply = () => {
    onApplyConfig(stagedConfig);
  };

  const handleReset = () => {
    setStagedConfig(DEFAULT_CUSTOM_LAYOUT_CONFIG);
    onResetConfig();
  };

  return (
    <div className="engine-options-panel-container" ref={containerRef}>
      <div className="engine-options-bar">
        <button
          type="button"
          className="engine-options-toggle-btn"
          onClick={() =>
            setIsOpen((prev) => {
              if (prev) {
                setStagedConfig(appliedConfig);
              }
              return !prev;
            })
          }
        >
          ⚙️ WASM Engine Options {isOpen ? "▲" : "▼"}
          {isDirty && <span className="unapplied-badge">Unapplied Changes</span>}
        </button>

        <div className="engine-options-action-group">
          <button
            type="button"
            className={`apply-options-btn ${isDirty ? "dirty" : "applied"}`}
            disabled={!isDirty}
            onClick={handleApply}
          >
            {isDirty ? "🚀 Apply Engine Options" : "✓ Applied"}
          </button>
          <button type="button" className="reset-options-btn" onClick={handleReset}>
            ↺ Reset Defaults
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="engine-options-dropdown-content">
          <div className="engine-options-grid">
            {/* Group 1: Spacing & Clearance */}
            <div className="options-group">
              <h4 className="options-group-title">📐 Spacing & Clearances</h4>
              <div className="option-field">
                <label htmlFor="cfg-nodeGap">Node Gap (px)</label>
                <div className="option-controls-row">
                  <input
                    id="cfg-nodeGap"
                    type="range"
                    min={20}
                    max={160}
                    value={stagedConfig.nodeGap}
                    onChange={(e) => handleChange("nodeGap", Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="option-custom-input"
                    value={stagedConfig.nodeGap}
                    onChange={(e) => handleChange("nodeGap", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="option-field">
                <label htmlFor="cfg-rankGap">Rank Gap (px)</label>
                <div className="option-controls-row">
                  <input
                    id="cfg-rankGap"
                    type="range"
                    min={40}
                    max={240}
                    value={stagedConfig.rankGap}
                    onChange={(e) => handleChange("rankGap", Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="option-custom-input"
                    value={stagedConfig.rankGap}
                    onChange={(e) => handleChange("rankGap", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="option-field">
                <label htmlFor="cfg-obstacleClearance">Obstacle Clearance (px)</label>
                <div className="option-controls-row">
                  <input
                    id="cfg-obstacleClearance"
                    type="range"
                    min={8}
                    max={48}
                    value={stagedConfig.obstacleClearance}
                    onChange={(e) => handleChange("obstacleClearance", Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="option-custom-input"
                    value={stagedConfig.obstacleClearance}
                    onChange={(e) => handleChange("obstacleClearance", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="option-field">
                <label htmlFor="cfg-laneSpacing">Lane Spacing (px)</label>
                <div className="option-controls-row">
                  <input
                    id="cfg-laneSpacing"
                    type="range"
                    min={4}
                    max={32}
                    value={stagedConfig.laneSpacing}
                    onChange={(e) => handleChange("laneSpacing", Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="option-custom-input"
                    value={stagedConfig.laneSpacing}
                    onChange={(e) => handleChange("laneSpacing", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="option-field">
                <label htmlFor="cfg-zoomSensitivity">Zoom Sensitivity</label>
                <div className="option-controls-row">
                  <input
                    id="cfg-zoomSensitivity"
                    type="range"
                    min={0.1}
                    max={2.0}
                    step={0.05}
                    value={stagedConfig.zoomSensitivity}
                    onChange={(e) => handleChange("zoomSensitivity", Number(e.target.value))}
                  />
                  <input
                    type="number"
                    step={0.05}
                    className="option-custom-input"
                    value={stagedConfig.zoomSensitivity}
                    onChange={(e) => handleChange("zoomSensitivity", Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* Group 2: Objective Cost Penalties */}
            <div className="options-group">
              <h4 className="options-group-title">⚖️ Cost Penalties</h4>
              <div className="option-field">
                <label htmlFor="cfg-bendPenalty">Bend Penalty</label>
                <div className="option-controls-row">
                  <input
                    id="cfg-bendPenalty"
                    type="range"
                    min={10}
                    max={2000}
                    value={stagedConfig.bendPenalty}
                    onChange={(e) => handleChange("bendPenalty", Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="option-custom-input"
                    value={stagedConfig.bendPenalty}
                    onChange={(e) => handleChange("bendPenalty", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="option-field">
                <label htmlFor="cfg-crossingPenalty">Crossing Penalty</label>
                <div className="option-controls-row">
                  <input
                    id="cfg-crossingPenalty"
                    type="range"
                    min={10}
                    max={100000}
                    value={stagedConfig.crossingPenalty}
                    onChange={(e) => handleChange("crossingPenalty", Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="option-custom-input"
                    value={stagedConfig.crossingPenalty}
                    onChange={(e) => handleChange("crossingPenalty", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="option-field">
                <label htmlFor="cfg-directionPenalty">Direction Penalty</label>
                <div className="option-controls-row">
                  <input
                    id="cfg-directionPenalty"
                    type="range"
                    min={0}
                    max={5000}
                    value={stagedConfig.directionPenalty}
                    onChange={(e) => handleChange("directionPenalty", Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="option-custom-input"
                    value={stagedConfig.directionPenalty}
                    onChange={(e) => handleChange("directionPenalty", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="option-field">
                <label htmlFor="cfg-sideReusePenalty">Side Reuse Penalty</label>
                <div className="option-controls-row">
                  <input
                    id="cfg-sideReusePenalty"
                    type="range"
                    min={0}
                    max={1000}
                    value={stagedConfig.sideReusePenalty}
                    onChange={(e) => handleChange("sideReusePenalty", Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="option-custom-input"
                    value={stagedConfig.sideReusePenalty}
                    onChange={(e) => handleChange("sideReusePenalty", Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {/* Group 3: Search Iteration Bounds */}
            <div className="options-group">
              <h4 className="options-group-title">🔄 Search Bounds</h4>
              <div className="option-field">
                <label htmlFor="cfg-maxRouteOrderVariants">Route Order Variants</label>
                <div className="option-controls-row">
                  <input
                    id="cfg-maxRouteOrderVariants"
                    type="range"
                    min={1}
                    max={12}
                    value={stagedConfig.maxRouteOrderVariants}
                    onChange={(e) => handleChange("maxRouteOrderVariants", Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="option-custom-input"
                    value={stagedConfig.maxRouteOrderVariants}
                    onChange={(e) => handleChange("maxRouteOrderVariants", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="option-field">
                <label htmlFor="cfg-maxRipUpPasses">Rip-Up Reroute Passes</label>
                <div className="option-controls-row">
                  <input
                    id="cfg-maxRipUpPasses"
                    type="range"
                    min={1}
                    max={32}
                    value={stagedConfig.maxRipUpPasses}
                    onChange={(e) => handleChange("maxRipUpPasses", Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="option-custom-input"
                    value={stagedConfig.maxRipUpPasses}
                    onChange={(e) => handleChange("maxRipUpPasses", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="option-field">
                <label htmlFor="cfg-maxCrossingSweeps">Crossing Sweeps</label>
                <div className="option-controls-row">
                  <input
                    id="cfg-maxCrossingSweeps"
                    type="range"
                    min={1}
                    max={64}
                    value={stagedConfig.maxCrossingSweeps}
                    onChange={(e) => handleChange("maxCrossingSweeps", Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="option-custom-input"
                    value={stagedConfig.maxCrossingSweeps}
                    onChange={(e) => handleChange("maxCrossingSweeps", Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="option-field">
                <label htmlFor="cfg-maxGlobalPasses">Global Passes</label>
                <div className="option-controls-row">
                  <input
                    id="cfg-maxGlobalPasses"
                    type="range"
                    min={1}
                    max={24}
                    value={stagedConfig.maxGlobalPasses}
                    onChange={(e) => handleChange("maxGlobalPasses", Number(e.target.value))}
                  />
                  <input
                    type="number"
                    className="option-custom-input"
                    value={stagedConfig.maxGlobalPasses}
                    onChange={(e) => handleChange("maxGlobalPasses", Number(e.target.value))}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
