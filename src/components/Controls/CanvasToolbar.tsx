import { useCallback, useEffect, type FC } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { exportGraphAsHTML } from "../../utils/htmlExporter";
import { Button, LayoutSelectDropdown } from "../../ui";
import "./Controls.css";

export const CanvasToolbar: FC = () => {
  const dataset = useGraphStore((state) => state.dataset);
  const zoomLevel = useGraphStore((state) => state.zoomLevel);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const positionedNodes = useGraphStore((state) => state.positionedNodes);

  const setZoomLevel = useGraphStore((state) => state.setZoomLevel);
  const setPanOffset = useGraphStore((state) => state.setPanOffset);
  const setLayoutMode = useGraphStore((state) => state.setLayoutMode);
  const resetViewport = useGraphStore((state) => state.resetViewport);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.2, 3.0));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.2, 0.25));

  const handleFitView = useCallback(() => {
    if (positionedNodes.length === 0) {
      resetViewport();
      return;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const node of positionedNodes) {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x + node.width);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y + node.height);
    }

    const padding = 60;
    const graphWidth = maxX - minX + padding * 2;
    const graphHeight = maxY - minY + padding * 2;
    const viewWidth = window.innerWidth * 0.7;
    const viewHeight = window.innerHeight * 0.7;

    const scaleX = viewWidth / graphWidth;
    const scaleY = viewHeight / graphHeight;
    const fitScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.2), 1.5);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const panX = viewWidth / 2 - centerX * fitScale;
    const panY = viewHeight / 2 - centerY * fitScale;

    setZoomLevel(fitScale);
    setPanOffset({ x: panX, y: panY });
  }, [positionedNodes, resetViewport, setPanOffset, setZoomLevel]);

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

  const handleExportHtml = () => {
    if (dataset) {
      exportGraphAsHTML(dataset);
    }
  };

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
        <LayoutSelectDropdown
          value={layoutMode}
          onLayoutChange={(mode) => setLayoutMode(mode)}
          size="sm"
        />
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
};

export default CanvasToolbar;
