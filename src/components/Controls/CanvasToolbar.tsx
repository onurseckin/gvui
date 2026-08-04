import React, { useCallback, useEffect, useRef, useState, type FC } from "react";
import { ExportMenu } from "./ExportMenu";
import { createPanelDismissHandler } from "./panelDismiss";
import { useGraphStore, useLayoutConfig, type LayoutMode } from "../../state/useGraphStore";
import {
  Button,
  DirectionSelectDropdown,
  LayoutSelectDropdown,
  Select,
  type SelectOption,
} from "../../ui";
import { calculateFitView } from "../../utils/fitView";
import {
  type CustomLayoutConfig,
  type Direction,
  type EdgeStyle,
  type LabelPlacement,
  type Compaction,
} from "../../engine/layout/custom/config";
import "./Controls.css";

// The most-reached-for knobs only. Everything else — and every knob in full — lives in the
// Settings panel (`EngineOptionsPanel`); this is the quick-access bar, not the full disclosure.

const EDGE_STYLE_OPTIONS: SelectOption<EdgeStyle>[] = [
  { value: "orthogonal", label: "Orthogonal" },
  { value: "rounded", label: "Rounded" },
  { value: "spline", label: "Spline" },
  { value: "octilinear", label: "Octilinear" },
  { value: "straight", label: "Straight" },
];

const LABEL_PLACEMENT_OPTIONS: SelectOption<LabelPlacement>[] = [
  { value: "on-edge", label: "On Edge" },
  { value: "beside-edge", label: "Beside Edge" },
  { value: "above-edge", label: "Above Edge" },
];

const COMPACTION_OPTIONS: SelectOption<Compaction>[] = [
  { value: "tight", label: "Tight" },
  { value: "balanced", label: "Balanced" },
  { value: "airy", label: "Airy" },
];

export const CanvasToolbar: FC = React.memo(function CanvasToolbar() {
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
  const configWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isConfigOpen) return;

    const dismiss = createPanelDismissHandler(
      () => configWrapperRef.current,
      () => setIsConfigOpen(false),
    );
    const handleClickOutside = (event: MouseEvent) => {
      dismiss(event);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsConfigOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isConfigOpen]);

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

  const handleLayoutChange = useCallback(
    (mode: LayoutMode) => {
      setLayoutMode(mode);
    },
    [setLayoutMode],
  );

  // Toolbar controls apply immediately — unlike the Settings panel disclosure, this bar has no
  // stage/apply workflow; it is meant for fast, low-ceremony tweaks.
  const updateConfig = useCallback(
    <K extends keyof CustomLayoutConfig>(key: K, value: CustomLayoutConfig[K]) => {
      setLayoutConfig({ [key]: value } as Partial<CustomLayoutConfig>);
    },
    [setLayoutConfig],
  );

  const handleDirectionChange = useCallback(
    (direction: Direction) => {
      updateConfig("direction", direction);
    },
    [updateConfig],
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
        <span className="layout-label">Layout:</span>
        <LayoutSelectDropdown value={layoutMode} onLayoutChange={handleLayoutChange} size="sm" />
      </div>

      {/* Direction is its own control, not a mode: `layoutConfig.direction` is the single source
          of truth for which way ranks flow, and the engine reads nothing else. */}
      <div className="layout-select-wrapper">
        <span className="layout-label">Direction:</span>
        <DirectionSelectDropdown
          value={layoutConfig.direction}
          onDirectionChange={handleDirectionChange}
          size="sm"
        />
      </div>

      <div className="layout-config-wrapper" ref={configWrapperRef}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsConfigOpen((prev) => !prev)}
          title="Layout settings"
          className="toolbar-btn"
        >
          ⚙ Settings
        </Button>

        {isConfigOpen && (
          <div className="layout-config-popover">
            <div className="layout-config-header">
              <div className="layout-config-header-left">
                <span className="layout-config-title">⚙ Settings</span>
              </div>
              <div className="layout-config-actions">
                <Button
                  variant="outline"
                  size="sm"
                  className="layout-config-reset-btn"
                  onClick={() => resetLayoutConfig()}
                  title="Reset to default options"
                >
                  Reset
                </Button>
              </div>
            </div>

            <div className="layout-config-body">
              <div className="layout-config-section">
                <span className="layout-config-section-title">📐 Layout & Spacing</span>

                <div className="layout-config-item">
                  <span className="layout-config-item-label">Node Gap (px)</span>
                  <div className="layout-config-controls-row">
                    <input
                      type="range"
                      min="10"
                      max="200"
                      value={layoutConfig.nodeGap}
                      onChange={(e) => updateConfig("nodeGap", Number(e.target.value))}
                      className="layout-config-slider"
                    />
                    <input
                      type="number"
                      value={layoutConfig.nodeGap}
                      onChange={(e) => updateConfig("nodeGap", Number(e.target.value))}
                      className="layout-config-number-input"
                    />
                  </div>
                </div>

                <div className="layout-config-item">
                  <span className="layout-config-item-label">Rank Gap (px)</span>
                  <div className="layout-config-controls-row">
                    <input
                      type="range"
                      min="20"
                      max="300"
                      value={layoutConfig.rankGap}
                      onChange={(e) => updateConfig("rankGap", Number(e.target.value))}
                      className="layout-config-slider"
                    />
                    <input
                      type="number"
                      value={layoutConfig.rankGap}
                      onChange={(e) => updateConfig("rankGap", Number(e.target.value))}
                      className="layout-config-number-input"
                    />
                  </div>
                </div>

                <div className="layout-config-item">
                  <span className="layout-config-item-label">Compaction</span>
                  <Select<Compaction>
                    size="sm"
                    options={COMPACTION_OPTIONS}
                    value={layoutConfig.compaction}
                    onValueChange={(value) => updateConfig("compaction", value)}
                    aria-label="Compaction preset"
                  />
                </div>
              </div>

              <div className="layout-config-section">
                <span className="layout-config-section-title">🎨 Edges & Labels</span>

                <div className="layout-config-item">
                  <span className="layout-config-item-label">Edge Style</span>
                  <Select<EdgeStyle>
                    size="sm"
                    options={EDGE_STYLE_OPTIONS}
                    value={layoutConfig.edgeStyle}
                    onValueChange={(value) => updateConfig("edgeStyle", value)}
                    aria-label="Edge style"
                  />
                </div>

                <div className="layout-config-item">
                  <span className="layout-config-item-label">Corner Radius (px)</span>
                  <div className="layout-config-controls-row">
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={layoutConfig.cornerRadius}
                      onChange={(e) => updateConfig("cornerRadius", Number(e.target.value))}
                      className="layout-config-slider"
                    />
                    <input
                      type="number"
                      value={layoutConfig.cornerRadius}
                      onChange={(e) => updateConfig("cornerRadius", Number(e.target.value))}
                      className="layout-config-number-input"
                    />
                  </div>
                </div>

                <div className="layout-config-item">
                  <span className="layout-config-item-label">Label Placement</span>
                  <Select<LabelPlacement>
                    size="sm"
                    options={LABEL_PLACEMENT_OPTIONS}
                    value={layoutConfig.labelPlacement}
                    onValueChange={(value) => updateConfig("labelPlacement", value)}
                    aria-label="Label placement"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="toolbar-divider" />

      <ExportMenu />
    </div>
  );
});

export default CanvasToolbar;
