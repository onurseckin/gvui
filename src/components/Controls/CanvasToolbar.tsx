import React, { useCallback, useEffect, useState, type FC } from "react";
import { useGraphStore, useLayoutConfig, type LayoutMode } from "../../state/useGraphStore";
import { Button, LayoutSelectDropdown } from "../../ui";
import { calculateFitView } from "../../utils/fitView";
import { exportGraphAsHTML } from "../../utils/htmlExporter";
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

      <div className="layout-config-wrapper">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsConfigOpen((prev) => !prev)}
          title="WASM Layout Engine Options"
          className="toolbar-btn"
        >
          ⚙ Engine Options
        </Button>

        {isConfigOpen && (
          <div className="layout-config-popover">
            <div className="layout-config-header">
              <span className="layout-config-title">⚙ WASM Layout Engine Options</span>
              <Button
                variant="outline"
                size="sm"
                className="layout-config-reset-btn"
                onClick={resetLayoutConfig}
                title="Reset to defaults"
              >
                Reset
              </Button>
            </div>

            <div className="layout-config-item">
              <div className="layout-config-label-row">
                <span>Node Gap</span>
                <span className="layout-config-value">{layoutConfig.nodeGap}px</span>
              </div>
              <input
                type="range"
                min="10"
                max="200"
                step="2"
                value={layoutConfig.nodeGap}
                onChange={(e) => setLayoutConfig({ nodeGap: Number(e.target.value) })}
                className="layout-config-slider"
              />
            </div>

            <div className="layout-config-item">
              <div className="layout-config-label-row">
                <span>Rank Gap</span>
                <span className="layout-config-value">{layoutConfig.rankGap}px</span>
              </div>
              <input
                type="range"
                min="20"
                max="300"
                step="5"
                value={layoutConfig.rankGap}
                onChange={(e) => setLayoutConfig({ rankGap: Number(e.target.value) })}
                className="layout-config-slider"
              />
            </div>

            <div className="layout-config-item">
              <div className="layout-config-label-row">
                <span>Bend Penalty</span>
                <span className="layout-config-value">{layoutConfig.bendPenalty}</span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                step="5"
                value={layoutConfig.bendPenalty}
                onChange={(e) => setLayoutConfig({ bendPenalty: Number(e.target.value) })}
                className="layout-config-slider"
              />
            </div>

            <div className="layout-config-item">
              <div className="layout-config-label-row">
                <span>Direction Penalty</span>
                <span className="layout-config-value">{layoutConfig.directionPenalty}</span>
              </div>
              <input
                type="range"
                min="0"
                max="500"
                step="10"
                value={layoutConfig.directionPenalty}
                onChange={(e) => setLayoutConfig({ directionPenalty: Number(e.target.value) })}
                className="layout-config-slider"
              />
            </div>

            <div className="layout-config-item">
              <div className="layout-config-label-row">
                <span>Max Passes</span>
                <span className="layout-config-value">{layoutConfig.maxGlobalPasses}</span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={layoutConfig.maxGlobalPasses}
                onChange={(e) => setLayoutConfig({ maxGlobalPasses: Number(e.target.value) })}
                className="layout-config-slider"
              />
            </div>

            <div className="layout-config-item">
              <div className="layout-config-label-row">
                <span>Obstacle Clearance</span>
                <span className="layout-config-value">{layoutConfig.obstacleClearance}px</span>
              </div>
              <input
                type="range"
                min="4"
                max="50"
                step="2"
                value={layoutConfig.obstacleClearance}
                onChange={(e) => setLayoutConfig({ obstacleClearance: Number(e.target.value) })}
                className="layout-config-slider"
              />
            </div>

            <div className="layout-config-item">
              <div className="layout-config-label-row">
                <span>Lane Spacing</span>
                <span className="layout-config-value">{layoutConfig.laneSpacing}px</span>
              </div>
              <input
                type="range"
                min="4"
                max="40"
                step="2"
                value={layoutConfig.laneSpacing}
                onChange={(e) => setLayoutConfig({ laneSpacing: Number(e.target.value) })}
                className="layout-config-slider"
              />
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
