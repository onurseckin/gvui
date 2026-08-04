import React, { useCallback, useEffect, useRef, useState, type FC } from "react";
import { ExportMenu } from "./ExportMenu";
import { EngineOptionsPanel } from "../../features/GraphTesting/components/EngineOptionsPanel";
import { createPanelDismissHandler } from "./panelDismiss";
import { useGraphStore, useLayoutConfig, type LayoutMode } from "../../state/useGraphStore";
import { Button, DirectionSelectDropdown, LayoutSelectDropdown } from "../../ui";
import { calculateFitView } from "../../utils/fitView";
import { type CustomLayoutConfig, type Direction } from "../../engine/layout/custom/config";
import "./Controls.css";

// The bar itself carries only mode and direction. Every other knob lives behind the Settings
// button, which renders the same `EngineOptionsPanel` the testing playground uses — one definition
// of the settings UI rather than a reduced duplicate that silently disagreed with it.

export const CanvasToolbar: FC = React.memo(function CanvasToolbar() {
  const zoomLevel = useGraphStore((state) => state.zoomLevel);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const layoutConfig = useLayoutConfig();

  const setZoomLevel = useGraphStore((state) => state.setZoomLevel);
  const setPanOffset = useGraphStore((state) => state.setPanOffset);
  const setLayoutMode = useGraphStore((state) => state.setLayoutMode);
  const setLayoutConfig = useGraphStore((state) => state.setLayoutConfig);
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
            {/* The full settings surface, not a reduced copy of it. This popover used to hand-roll
                six of the ~40 config fields with no Apply step, so the toolbar and the testing
                playground disagreed about what "Settings" meant and most knobs were unreachable
                from the main canvas. Rendering the same component gives one definition of the
                settings UI — including its staged-edit/Apply behaviour — in both places. */}
            <EngineOptionsPanel className="layout-config-embedded" />
          </div>
        )}
      </div>

      <div className="toolbar-divider" />

      <ExportMenu />
    </div>
  );
});

export default CanvasToolbar;
