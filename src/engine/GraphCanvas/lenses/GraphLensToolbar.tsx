import type { FC } from "react";
import { memo, useCallback } from "react";
import {
  IconAdjustments,
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconCoins,
  IconEyeOff,
  IconFlame,
  IconPalette,
  IconReload,
  IconRoute,
  IconSparkles,
} from "@tabler/icons-react";
import { useCanvasLensStore } from "../../../store/useCanvasLensStore";
import type {
  ColorRampPreset,
  CriticalPathMetric,
  FilterMode,
  HeatmapMetric,
  LensMode,
  RiskMetric,
  ScaleType,
  TokenMetric,
} from "./types";
import "./GraphLensStyles.css";

export interface GraphLensToolbarProps {
  className?: string;
}

export const GraphLensToolbar: FC<GraphLensToolbarProps> = memo(function GraphLensToolbar({
  className = "",
}) {
  const activeLens = useCanvasLensStore((s) => s.activeLens);
  const isExpanded = useCanvasLensStore((s) => s.isToolbarExpanded);
  const configs = useCanvasLensStore((s) => s.configs);

  const setActiveLens = useCanvasLensStore((s) => s.setActiveLens);
  const toggleToolbarExpanded = useCanvasLensStore((s) => s.toggleToolbarExpanded);
  const setHeatmapMetric = useCanvasLensStore((s) => s.setHeatmapMetric);
  const setCriticalPathMetric = useCanvasLensStore((s) => s.setCriticalPathMetric);
  const setRiskMetric = useCanvasLensStore((s) => s.setRiskMetric);
  const setTokenMetric = useCanvasLensStore((s) => s.setTokenMetric);
  const setColorRamp = useCanvasLensStore((s) => s.setColorRamp);
  const setScaleType = useCanvasLensStore((s) => s.setScaleType);
  const setThresholds = useCanvasLensStore((s) => s.setThresholds);
  const setFilterMode = useCanvasLensStore((s) => s.setFilterMode);
  const setShowGlow = useCanvasLensStore((s) => s.setShowGlow);
  const setShowBadges = useCanvasLensStore((s) => s.setShowBadges);
  const setTraceSubCriticalPaths = useCanvasLensStore((s) => s.setTraceSubCriticalPaths);
  const resetLensConfig = useCanvasLensStore((s) => s.resetLensConfig);

  const currentConfig = configs[activeLens] ?? configs.none;

  const handleModeClick = useCallback(
    (mode: LensMode) => {
      setActiveLens(mode);
    },
    [setActiveLens],
  );

  return (
    <div
      className={`graph-lens-toolbar ${className}`}
      data-testid="graph-lens-toolbar"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="graph-lens-toolbar-header">
        <div className="graph-lens-toolbar-title">
          <IconSparkles size={14} />
          <span>Canvas Lenses</span>
        </div>
        <button
          type="button"
          className="graph-lens-toolbar-toggle-btn"
          onClick={toggleToolbarExpanded}
          aria-label={isExpanded ? "Collapse lens toolbar" : "Expand lens toolbar"}
        >
          {isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </button>
      </div>

      {/* Lens Mode Selector Grid */}
      <div className="graph-lens-modes-grid">
        <button
          type="button"
          className={`graph-lens-mode-btn ${activeLens === "none" ? "is-active" : ""}`}
          onClick={() => handleModeClick("none")}
        >
          <IconEyeOff size={16} />
          <span>Off</span>
        </button>

        <button
          type="button"
          className={`graph-lens-mode-btn ${activeLens === "heatmap" ? "is-active mode-heatmap" : ""}`}
          onClick={() => handleModeClick("heatmap")}
        >
          <IconFlame size={16} />
          <span>Heat</span>
        </button>

        <button
          type="button"
          className={`graph-lens-mode-btn ${activeLens === "critical-path" ? "is-active mode-critical-path" : ""}`}
          onClick={() => handleModeClick("critical-path")}
        >
          <IconRoute size={16} />
          <span>Crit Path</span>
        </button>

        <button
          type="button"
          className={`graph-lens-mode-btn ${activeLens === "risk" ? "is-active mode-risk" : ""}`}
          onClick={() => handleModeClick("risk")}
        >
          <IconAlertTriangle size={16} />
          <span>Risk</span>
        </button>

        <button
          type="button"
          className={`graph-lens-mode-btn ${activeLens === "token" ? "is-active mode-token" : ""}`}
          onClick={() => handleModeClick("token")}
        >
          <IconCoins size={16} />
          <span>Tokens</span>
        </button>
      </div>

      {/* Expanded Controls Section */}
      {isExpanded && activeLens !== "none" && (
        <div className="graph-lens-controls-section">
          {/* Sub-Metric Selector */}
          <div className="graph-lens-control-row">
            <span className="graph-lens-control-label">
              <IconAdjustments size={13} /> Metric
            </span>
            {activeLens === "heatmap" && (
              <select
                className="graph-lens-select"
                value={currentConfig.heatmapMetric}
                onChange={(e) => setHeatmapMetric(e.target.value as HeatmapMetric)}
              >
                <option value="duration">Wall Duration</option>
                <option value="frequency">Execution Count</option>
                <option value="cognitiveLatency">Cognitive / Think Time</option>
                <option value="toolDuration">Tool Execution Time</option>
                <option value="queueWait">Queue Overhead</option>
              </select>
            )}

            {activeLens === "critical-path" && (
              <select
                className="graph-lens-select"
                value={currentConfig.criticalPathMetric}
                onChange={(e) => setCriticalPathMetric(e.target.value as CriticalPathMetric)}
              >
                <option value="duration">Step Duration</option>
                <option value="slack">Slack / Float</option>
                <option value="bottleneckScore">Bottleneck Score</option>
              </select>
            )}

            {activeLens === "risk" && (
              <select
                className="graph-lens-select"
                value={currentConfig.riskMetric}
                onChange={(e) => setRiskMetric(e.target.value as RiskMetric)}
              >
                <option value="composite">Composite Risk</option>
                <option value="errorRate">Error / Failure</option>
                <option value="retryCount">Retry Count</option>
                <option value="findingSeverity">Findings Severity</option>
                <option value="blastRadius">Blast Radius</option>
              </select>
            )}

            {activeLens === "token" && (
              <select
                className="graph-lens-select"
                value={currentConfig.tokenMetric}
                onChange={(e) => setTokenMetric(e.target.value as TokenMetric)}
              >
                <option value="totalTokens">Total Tokens</option>
                <option value="promptTokens">Prompt (Input)</option>
                <option value="completionTokens">Completion (Output)</option>
                <option value="reasoningTokens">Reasoning (Think)</option>
                <option value="costUsd">Cost (USD)</option>
                <option value="costIntensity">Cost Velocity</option>
              </select>
            )}
          </div>

          {/* Color Ramp Preset */}
          <div className="graph-lens-control-row">
            <span className="graph-lens-control-label">
              <IconPalette size={13} /> Palette
            </span>
            <select
              className="graph-lens-select"
              value={currentConfig.colorRamp}
              onChange={(e) => setColorRamp(e.target.value as ColorRampPreset)}
            >
              <option value="viridis">Viridis (Standard)</option>
              <option value="plasma">Plasma (High Contrast)</option>
              <option value="inferno">Inferno (Fiery)</option>
              <option value="magma">Magma (Neon Peach)</option>
              <option value="turbo">Turbo (Rainbow)</option>
              <option value="cividis">Cividis (Colorblind Safe)</option>
              <option value="risk-alert">Risk Alert (Traffic Light)</option>
              <option value="cyber-heat">Cyber Heat (Neon Glow)</option>
              <option value="coolwarm">Cool Warm (Diverging)</option>
              <option value="spectral">Spectral</option>
              <option value="amber">Amber</option>
              <option value="emerald">Emerald</option>
              <option value="reds">Reds</option>
            </select>
          </div>

          {/* Scale Type */}
          <div className="graph-lens-control-row">
            <span className="graph-lens-control-label">Scale Mode</span>
            <select
              className="graph-lens-select"
              value={currentConfig.scaleType}
              onChange={(e) => setScaleType(e.target.value as ScaleType)}
            >
              <option value="linear">Linear</option>
              <option value="log">Logarithmic</option>
              <option value="sqrt">Square Root</option>
              <option value="quantile">Quantile (Equal Bins)</option>
            </select>
          </div>

          {/* Threshold Range */}
          <div className="graph-lens-slider-row">
            <div className="graph-lens-slider-header">
              <span>Threshold Filter</span>
              <span>
                {Math.round(currentConfig.minThreshold * 100)}% -{" "}
                {Math.round(currentConfig.maxThreshold * 100)}%
              </span>
            </div>
            <input
              type="range"
              className="graph-lens-slider"
              min="0"
              max="1"
              step="0.05"
              value={currentConfig.minThreshold}
              onChange={(e) =>
                setThresholds(parseFloat(e.target.value), currentConfig.maxThreshold)
              }
            />
          </div>

          {/* Filter Mode */}
          <div className="graph-lens-control-row">
            <span className="graph-lens-control-label">Filtered Style</span>
            <select
              className="graph-lens-select"
              value={currentConfig.filterMode}
              onChange={(e) => setFilterMode(e.target.value as FilterMode)}
            >
              <option value="dim">Dim Inactive</option>
              <option value="hide">Hide Inactive</option>
              <option value="highlight">Highlight Only</option>
            </select>
          </div>

          {/* Feature Toggles */}
          <div className="graph-lens-toggle-group">
            <button
              type="button"
              className={`graph-lens-toggle-pill ${currentConfig.showGlow ? "is-active" : ""}`}
              onClick={() => setShowGlow(!currentConfig.showGlow)}
            >
              <span>Glow Halo</span>
            </button>

            <button
              type="button"
              className={`graph-lens-toggle-pill ${currentConfig.showBadges ? "is-active" : ""}`}
              onClick={() => setShowBadges(!currentConfig.showBadges)}
            >
              <span>Metric Badges</span>
            </button>

            {activeLens === "critical-path" && (
              <button
                type="button"
                className={`graph-lens-toggle-pill ${
                  currentConfig.traceSubCriticalPaths ? "is-active" : ""
                }`}
                onClick={() => setTraceSubCriticalPaths(!currentConfig.traceSubCriticalPaths)}
              >
                <span>Sub-Critical Paths</span>
              </button>
            )}

            <button
              type="button"
              className="graph-lens-toggle-pill"
              onClick={() => resetLensConfig(activeLens)}
              title="Reset lens settings"
            >
              <IconReload size={12} />
              <span>Reset</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
