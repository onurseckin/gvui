import React, { useCallback, useEffect, useState, type FC } from "react";
import { useGraphStore, useLayoutConfig, type LayoutMode } from "../../state/useGraphStore";
import { Button, LayoutSelectDropdown } from "../../ui";
import { calculateFitView } from "../../utils/fitView";
import { exportGraphAsHTML } from "../../utils/htmlExporter";
import {
  DEFAULT_CUSTOM_LAYOUT_CONFIG,
  type CustomLayoutConfig,
} from "../../engine/layout/custom/config";
import "./Controls.css";

export const CanvasToolbar: FC = React.memo(function CanvasToolbar() {
  const dataset = useGraphStore((state) => state.dataset);
  const zoomLevel = useGraphStore((state) => state.zoomLevel);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const layoutConfig = useLayoutConfig();

  const setZoomLevel = useGraphStore((state) => state.setZoomLevel);
  const setPanOffset = useGraphStore((state) => state.setPanOffset);
  const setLayoutMode = useGraphStore((state) => state.setLayoutMode);
  const setLayoutConfig = useGraphStore((state) => state.setLayoutConfig);
  const resetLayoutConfig = useGraphStore((state) => state.resetLayoutConfig);
  const resetViewport = useGraphStore((state) => state.resetViewport);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [stagedConfig, setStagedConfig] = useState<CustomLayoutConfig>(layoutConfig);
  const configWrapperRef = React.useRef<HTMLDivElement | null>(null);

  const isDirty = React.useMemo(() => {
    return (Object.keys(stagedConfig) as (keyof CustomLayoutConfig)[]).some(
      (key) => stagedConfig[key] !== layoutConfig[key],
    );
  }, [stagedConfig, layoutConfig]);

  useEffect(() => {
    if (!isConfigOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        configWrapperRef.current &&
        !configWrapperRef.current.contains(event.target as Node)
      ) {
        setIsConfigOpen(false);
        setStagedConfig(layoutConfig);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsConfigOpen(false);
        setStagedConfig(layoutConfig);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isConfigOpen, layoutConfig]);

  const handleZoomIn = useCallback(
    () => setZoomLevel((prev) => Math.min(prev + 0.2, 3.0)),
    [setZoomLevel],
  );
  const handleZoomOut = useCallback(
    () => setZoomLevel((prev) => Math.max(prev - 0.2, 0.25)),
    [setZoomLevel],
  );

  const handleFitView = useCallback(() => {
    const { positionedNodes, positionedEdges } = useGraphStore.getState();
    if (positionedNodes.length === 0) {
      resetViewport();
      return;
    }
    const fitResult = calculateFitView(positionedNodes, positionedEdges);
    setZoomLevel(fitResult.zoomLevel);
    setPanOffset(fitResult.panOffset);
    useGraphStore.setState({ collapsedNodeIds: new Set<string>() });
  }, [resetViewport, setPanOffset, setZoomLevel]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      const isModalOpen = Boolean(document.querySelector('[role="dialog"]'));

      if (isInput || isModalOpen || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        handleFitView();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        resetViewport();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleFitView, resetViewport]);

  const handleExportHtml = useCallback(() => {
    const dataset = useGraphStore.getState().dataset;
    if (dataset) {
      exportGraphAsHTML(dataset);
    }
  }, []);

  const handleLayoutChange = useCallback(
    (mode: LayoutMode) => {
      setLayoutMode(mode);
    },
    [setLayoutMode],
  );

  return (
    <div className="canvas-toolbar">
      <div className="toolbar-group">
        <Button
          variant="icon"
          size="sm"
          onClick={handleZoomIn}
          title="Zoom In"
          className="toolbar-icon-btn"
        >
          +
        </Button>
        <span className="zoom-indicator">{Math.round(zoomLevel * 100)}%</span>
        <Button
          variant="icon"
          size="sm"
          onClick={handleZoomOut}
          title="Zoom Out"
          className="toolbar-icon-btn"
        >
          -
        </Button>
      </div>

      <div className="toolbar-divider" />

      <Button
        variant="outline"
        size="sm"
        onClick={handleFitView}
        title="Fit View (F)"
        className="toolbar-btn"
      >
        Fit <kbd className="toolbar-kbd">F</kbd>
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={resetViewport}
        title="Reset View (R)"
        className="toolbar-btn"
      >
        Reset <kbd className="toolbar-kbd">R</kbd>
      </Button>

      <div className="toolbar-divider" />

      <div className="layout-select-wrapper">
        <label htmlFor="layout-select" className="layout-label">
          Layout:
        </label>
        <LayoutSelectDropdown value={layoutMode} onLayoutChange={handleLayoutChange} size="sm" />
      </div>

      <div className="layout-config-wrapper" ref={configWrapperRef}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setIsConfigOpen((prev) => {
              if (prev) {
                setStagedConfig(layoutConfig);
              } else {
                setStagedConfig(layoutConfig);
              }
              return !prev;
            });
          }}
          title="WASM Layout Engine Options"
          className={`toolbar-btn ${isDirty ? "has-unapplied" : ""}`}
        >
          ⚙ Engine Options {isDirty && <span className="toolbar-unapplied-dot">●</span>}
        </Button>

        {isConfigOpen && (
          <div className="layout-config-popover">
            <div className="layout-config-header">
              <div className="layout-config-header-left">
                <span className="layout-config-title">⚙ WASM Engine Options</span>
                {isDirty && <span className="unapplied-badge">Unapplied Changes</span>}
              </div>
              <div className="layout-config-actions">
                <Button
                  variant="outline"
                  size="sm"
                  className={`apply-config-btn ${isDirty ? "dirty" : "applied"}`}
                  disabled={!isDirty}
                  onClick={() => {
                    setLayoutConfig(stagedConfig);
                  }}
                  title="Apply new engine options to graph layout"
                >
                  {isDirty ? "🚀 Apply Options" : "✓ Applied"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="layout-config-reset-btn"
                  onClick={() => {
                    resetLayoutConfig();
                    setStagedConfig(DEFAULT_CUSTOM_LAYOUT_CONFIG);
                  }}
                  title="Reset to default options"
                >
                  Reset
                </Button>
              </div>
            </div>

            <div className="layout-config-body">
              <div className="layout-config-section">
                <span className="layout-config-section-title">📐 Spacing & Clearances</span>
                <div className="layout-config-item">
                  <div className="layout-config-label-row">
                    <span>Node Gap</span>
                    <span className="layout-config-value">{stagedConfig.nodeGap}px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="200"
                    step="2"
                    value={stagedConfig.nodeGap}
                    onChange={(e) =>
                      setStagedConfig((prev) => ({ ...prev, nodeGap: Number(e.target.value) }))
                    }
                    className="layout-config-slider"
                  />
                </div>

                <div className="layout-config-item">
                  <div className="layout-config-label-row">
                    <span>Rank Gap</span>
                    <span className="layout-config-value">{stagedConfig.rankGap}px</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="300"
                    step="5"
                    value={stagedConfig.rankGap}
                    onChange={(e) =>
                      setStagedConfig((prev) => ({ ...prev, rankGap: Number(e.target.value) }))
                    }
                    className="layout-config-slider"
                  />
                </div>

                <div className="layout-config-item">
                  <div className="layout-config-label-row">
                    <span>Obstacle Clearance</span>
                    <span className="layout-config-value">{stagedConfig.obstacleClearance}px</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="50"
                    step="2"
                    value={stagedConfig.obstacleClearance}
                    onChange={(e) =>
                      setStagedConfig((prev) => ({
                        ...prev,
                        obstacleClearance: Number(e.target.value),
                      }))
                    }
                    className="layout-config-slider"
                  />
                </div>

                <div className="layout-config-item">
                  <div className="layout-config-label-row">
                    <span>Lane Spacing</span>
                    <span className="layout-config-value">{stagedConfig.laneSpacing}px</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="40"
                    step="2"
                    value={stagedConfig.laneSpacing}
                    onChange={(e) =>
                      setStagedConfig((prev) => ({ ...prev, laneSpacing: Number(e.target.value) }))
                    }
                    className="layout-config-slider"
                  />
                </div>
              </div>

              <div className="layout-config-section">
                <span className="layout-config-section-title">⚖️ Cost Penalties</span>
                <div className="layout-config-item">
                  <div className="layout-config-label-row">
                    <span>Bend Penalty</span>
                    <span className="layout-config-value">{stagedConfig.bendPenalty}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    step="5"
                    value={stagedConfig.bendPenalty}
                    onChange={(e) =>
                      setStagedConfig((prev) => ({ ...prev, bendPenalty: Number(e.target.value) }))
                    }
                    className="layout-config-slider"
                  />
                </div>

                <div className="layout-config-item">
                  <div className="layout-config-label-row">
                    <span>Crossing Penalty</span>
                    <span className="layout-config-value">{stagedConfig.crossingPenalty}</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="2000"
                    step="50"
                    value={stagedConfig.crossingPenalty}
                    onChange={(e) =>
                      setStagedConfig((prev) => ({
                        ...prev,
                        crossingPenalty: Number(e.target.value),
                      }))
                    }
                    className="layout-config-slider"
                  />
                </div>

                <div className="layout-config-item">
                  <div className="layout-config-label-row">
                    <span>Direction Penalty</span>
                    <span className="layout-config-value">{stagedConfig.directionPenalty}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="500"
                    step="10"
                    value={stagedConfig.directionPenalty}
                    onChange={(e) =>
                      setStagedConfig((prev) => ({
                        ...prev,
                        directionPenalty: Number(e.target.value),
                      }))
                    }
                    className="layout-config-slider"
                  />
                </div>

                <div className="layout-config-item">
                  <div className="layout-config-label-row">
                    <span>Side Reuse Penalty</span>
                    <span className="layout-config-value">{stagedConfig.sideReusePenalty}</span>
                  </div>
                  <input
                    type="range"
                    min="8"
                    max="100"
                    step="4"
                    value={stagedConfig.sideReusePenalty}
                    onChange={(e) =>
                      setStagedConfig((prev) => ({
                        ...prev,
                        sideReusePenalty: Number(e.target.value),
                      }))
                    }
                    className="layout-config-slider"
                  />
                </div>
              </div>

              <div className="layout-config-section">
                <span className="layout-config-section-title">🔄 Search Bounds</span>
                <div className="layout-config-item">
                  <div className="layout-config-label-row">
                    <span>Route Order Variants</span>
                    <span className="layout-config-value">{stagedConfig.maxRouteOrderVariants}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="6"
                    step="1"
                    value={stagedConfig.maxRouteOrderVariants}
                    onChange={(e) =>
                      setStagedConfig((prev) => ({
                        ...prev,
                        maxRouteOrderVariants: Number(e.target.value),
                      }))
                    }
                    className="layout-config-slider"
                  />
                </div>

                <div className="layout-config-item">
                  <div className="layout-config-label-row">
                    <span>Rip-Up Reroute Passes</span>
                    <span className="layout-config-value">{stagedConfig.maxRipUpPasses}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="16"
                    step="1"
                    value={stagedConfig.maxRipUpPasses}
                    onChange={(e) =>
                      setStagedConfig((prev) => ({
                        ...prev,
                        maxRipUpPasses: Number(e.target.value),
                      }))
                    }
                    className="layout-config-slider"
                  />
                </div>

                <div className="layout-config-item">
                  <div className="layout-config-label-row">
                    <span>Crossing Sweeps</span>
                    <span className="layout-config-value">{stagedConfig.maxCrossingSweeps}</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="32"
                    step="2"
                    value={stagedConfig.maxCrossingSweeps}
                    onChange={(e) =>
                      setStagedConfig((prev) => ({
                        ...prev,
                        maxCrossingSweeps: Number(e.target.value),
                      }))
                    }
                    className="layout-config-slider"
                  />
                </div>

                <div className="layout-config-item">
                  <div className="layout-config-label-row">
                    <span>Global Passes</span>
                    <span className="layout-config-value">{stagedConfig.maxGlobalPasses}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    step="1"
                    value={stagedConfig.maxGlobalPasses}
                    onChange={(e) =>
                      setStagedConfig((prev) => ({
                        ...prev,
                        maxGlobalPasses: Number(e.target.value),
                      }))
                    }
                    className="layout-config-slider"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="toolbar-divider" />

      <Button
        variant="outline"
        size="sm"
        onClick={handleExportHtml}
        disabled={!dataset}
        title="Export HTML"
        className="toolbar-btn"
      >
        Export HTML
      </Button>
    </div>
  );
});

export default CanvasToolbar;
