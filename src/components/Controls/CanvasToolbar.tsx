import type { FC } from "react";
import type { LayoutMode } from "../../state/useGraphStore";
import { useGraphStore } from "../../state/useGraphStore";
import "./Controls.css";

const LAYOUT_OPTIONS: { id: LayoutMode; label: string }[] = [
  { id: "top-down", label: "Top-Down" },
  { id: "left-right", label: "Left-Right" },
  { id: "force", label: "Force" },
  { id: "radial", label: "Radial" },
];

export const CanvasToolbar: FC = () => {
  const zoomLevel = useGraphStore((state) => state.zoomLevel);
  const layoutMode = useGraphStore((state) => state.layoutMode);
  const positionedNodes = useGraphStore((state) => state.positionedNodes);

  const setZoomLevel = useGraphStore((state) => state.setZoomLevel);
  const setPanOffset = useGraphStore((state) => state.setPanOffset);
  const setLayoutMode = useGraphStore((state) => state.setLayoutMode);
  const resetViewport = useGraphStore((state) => state.resetViewport);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.2, 3.0));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.2, 0.25));

  const handleFitView = () => {
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
  };

  return (
    <div className="canvas-toolbar">
      <div className="toolbar-group">
        <button type="button" onClick={handleZoomIn} title="Zoom In">
          ➕
        </button>
        <span className="zoom-indicator">{Math.round(zoomLevel * 100)}%</span>
        <button type="button" onClick={handleZoomOut} title="Zoom Out">
          ➖
        </button>
      </div>

      <div className="toolbar-divider" />

      <button type="button" onClick={handleFitView} title="Fit View" className="toolbar-btn">
        🎯 Fit
      </button>

      <button type="button" onClick={resetViewport} title="Reset View" className="toolbar-btn">
        ↺ Reset
      </button>

      <div className="toolbar-divider" />

      <div className="layout-select-wrapper">
        <label htmlFor="layout-select" className="layout-label">
          Layout:
        </label>
        <select
          id="layout-select"
          value={layoutMode}
          onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
          className="layout-select"
        >
          {LAYOUT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default CanvasToolbar;
