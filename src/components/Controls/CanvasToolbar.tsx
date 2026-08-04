import React, { useCallback, useEffect, useRef, useState, type FC } from "react";
import {
  useGraphStore,
  useLayoutConfig,
  useLayoutPreset,
  type LayoutMode,
} from "../../state/useGraphStore";
import { Button, LayoutSelectDropdown, Select, type SelectOption } from "../../ui";
import { calculateFitView } from "../../utils/fitView";
import { exportGraphAsHTML } from "../../utils/htmlExporter";
import {
  LAYOUT_PRESETS,
  type CustomLayoutConfig,
  type Direction,
  type EdgeStyle,
  type LabelPlacement,
  type Compaction,
  type LayoutPresetName,
} from "../../engine/layout/custom/config";
import "./Controls.css";

// Tier-1 aesthetics only — see docs/planning/layout-engine-v2/04-config-and-quality.md §2. Every
// other knob (Tier 2 algorithm selection, Tier 3 budgets) lives in EngineOptionsPanel; this is the
// quick-access bar, not the full disclosure.

const DIRECTION_OPTIONS: SelectOption<Direction>[] = [
  { value: "top-down", label: "Top → Down" },
  { value: "bottom-up", label: "Bottom → Up" },
  { value: "left-right", label: "Left → Right" },
  { value: "right-left", label: "Right → Left" },
];

const EDGE_STYLE_OPTIONS: SelectOption<EdgeStyle>[] = [
  { value: "orthogonal", label: "Orthogonal" },
  { value: "rounded", label: "Rounded" },
  { value: "spline", label: "Spline" },
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

const PRESET_OPTIONS: SelectOption<LayoutPresetName>[] = (
  Object.keys(LAYOUT_PRESETS) as LayoutPresetName[]
).map((name) => ({ value: name, label: name.charAt(0).toUpperCase() + name.slice(1) }));

export const CanvasToolbar: FC = React.memo(function CanvasToolbar() {
  const dataset = useGraphStore((state) => state.dataset);
  const zoomLevel = useGraphStore((state) => state.zoomLevel);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const layoutConfig = useLayoutConfig();
  const layoutPreset = useLayoutPreset();

  const setZoomLevel = useGraphStore((state) => state.setZoomLevel);
  const setPanOffset = useGraphStore((state) => state.setPanOffset);
  const setLayoutMode = useGraphStore((state) => state.setLayoutMode);
  const setLayoutConfig = useGraphStore((state) => state.setLayoutConfig);
  const resetLayoutConfig = useGraphStore((state) => state.resetLayoutConfig);
  const applyPreset = useGraphStore((state) => state.applyPreset);
  const resetViewport = useGraphStore((state) => state.resetViewport);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const configWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isConfigOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        configWrapperRef.current &&
        !configWrapperRef.current.contains(event.target as Node)
      ) {
        setIsConfigOpen(false);
      }
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

  // Quick controls apply immediately — unlike the full EngineOptionsPanel disclosure, this bar has
  // no stage/apply workflow; it is meant for fast, low-ceremony tweaks.
  const updateConfig = useCallback(
    <K extends keyof CustomLayoutConfig>(key: K, value: CustomLayoutConfig[K]) => {
      setLayoutConfig({ [key]: value } as Partial<CustomLayoutConfig>);
    },
    [setLayoutConfig],
  );

  const handlePresetChange = useCallback(
    (name: LayoutPresetName) => {
      applyPreset(name);
    },
    [applyPreset],
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

      <div className="layout-select-wrapper">
        <label htmlFor="preset-select" className="layout-label">
          Preset:
        </label>
        <Select<LayoutPresetName>
          id="preset-select"
          size="sm"
          options={PRESET_OPTIONS}
          value={layoutPreset}
          onValueChange={handlePresetChange}
          aria-label="Layout preset"
        />
      </div>

      <div className="layout-config-wrapper" ref={configWrapperRef}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsConfigOpen((prev) => !prev)}
          title="Quick Layout Settings"
          className="toolbar-btn"
        >
          ⚙ Quick Settings
        </Button>

        {isConfigOpen && (
          <div className="layout-config-popover">
            <div className="layout-config-header">
              <div className="layout-config-header-left">
                <span className="layout-config-title">⚙ Quick Layout Settings</span>
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
                  <span className="layout-config-item-label">Direction</span>
                  <Select<Direction>
                    size="sm"
                    options={DIRECTION_OPTIONS}
                    value={layoutConfig.direction}
                    onValueChange={(value) => updateConfig("direction", value)}
                    aria-label="Layout direction"
                  />
                </div>

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
