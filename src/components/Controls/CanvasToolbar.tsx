import React, { useCallback, useEffect, useRef, useState, type FC } from "react";
import { IconMinus, IconPlus, IconSettings } from "@tabler/icons-react";
import { EngineOptionsPanel } from "../../features/GraphTesting/components/EngineOptionsPanel";
import { useGraphStore, useLayoutConfig, type LayoutMode } from "../../state/useGraphStore";
import { Button, DirectionSelectDropdown, LayoutSelectDropdown } from "../../ui";
import { calculateFitView } from "../../utils/fitView";
import type { CustomLayoutConfig, Direction } from "../../engine/layout/custom/config";
import { ExportMenu } from "./ExportMenu";
import { StepsDropdown } from "./StepsDropdown";
import { createPanelDismissHandler } from "./panelDismiss";
import "./Controls.css";

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
    const handleClickOutside = (e: MouseEvent) => dismiss(e);
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsConfigOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isConfigOpen]);

  const handleZoomIn = useCallback(
    () => setZoomLevel((p) => Math.min(p + 0.2, 3.0)),
    [setZoomLevel],
  );
  const handleZoomOut = useCallback(
    () => setZoomLevel((p) => Math.max(p - 0.2, 0.25)),
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
      if (
        isInput ||
        Boolean(document.querySelector('[role="dialog"]')) ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        handleFitView();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        resetViewport();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFitView, resetViewport]);

  const handleLayoutChange = useCallback(
    (mode: LayoutMode) => setLayoutMode(mode),
    [setLayoutMode],
  );
  const updateConfig = useCallback(
    <K extends keyof CustomLayoutConfig>(key: K, value: CustomLayoutConfig[K]) => {
      setLayoutConfig({ [key]: value } as Partial<CustomLayoutConfig>);
    },
    [setLayoutConfig],
  );
  const handleDirectionChange = useCallback(
    (direction: Direction) => updateConfig("direction", direction),
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
          <IconPlus size={13} />
        </Button>
        <span className="zoom-indicator">{Math.round(zoomLevel * 100)}%</span>
        <Button
          variant="icon"
          size="sm"
          onClick={handleZoomOut}
          title="Zoom Out"
          className="toolbar-icon-btn"
        >
          <IconMinus size={13} />
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

      <StepsDropdown />

      <div className="toolbar-divider" />

      <div className="layout-select-wrapper">
        <span className="layout-label">Layout:</span>
        <LayoutSelectDropdown value={layoutMode} onLayoutChange={handleLayoutChange} size="sm" />
      </div>

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
          <IconSettings size={13} style={{ marginRight: 4 }} />
          Settings
        </Button>
        {isConfigOpen && (
          <div className="layout-config-popover">
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
