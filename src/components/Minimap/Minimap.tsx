import { useCallback, useMemo, useRef, useState, type FC, type MouseEvent } from "react";
import { MinimapFrustumOverlay } from "../../engine/GraphCanvas/MinimapFrustumOverlay";
import { useGraphStore } from "../../state/useGraphStore";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";
import { MinimapClusterOutlines } from "./MinimapClusterOutlines";
import { MinimapDensityHeatmap } from "./MinimapDensityHeatmap";
import { MinimapHudControls } from "./MinimapHudControls";
import {
  calculateConnectedClusters,
  calculateDensityGrid,
  calculateFrustumRect,
  calculateGraphBounds,
  calculateMinimapTransform,
  calculatePanFromWorldCenter,
  minimapToWorld,
  worldToMinimap,
} from "./minimapMath";
import type { MinimapDockPosition, MinimapProps, Point2D } from "./types";
import "./Minimap.css";

const STATUS_COLOR_MAP: Readonly<Record<string, string>> = {
  success: "#10b981",
  error: "#ef4444",
  warning: "#f59e0b",
  running: "#38bdf8",
  pending: "#a1a1aa",
  skipped: "#6b7280",
  cached: "#06b6d4",
};

export const Minimap: FC<MinimapProps> = ({
  width = 260,
  height = 170,
  dockPosition: controlledDock,
  defaultDockPosition = "bottom-right",
  opacity: controlledOpacity,
  defaultOpacity = 0.9,
  showHeatmap: controlledShowHeatmap,
  defaultShowHeatmap = false,
  showClusters: controlledShowClusters,
  defaultShowClusters = true,
  collapsible = true,
  defaultCollapsed = false,
  viewportWidth: controlledVw,
  viewportHeight: controlledVh,
  onNavigate,
  className = "",
  style,
  nodes: propNodes,
  edges: propEdges,
  zoomLevel: propZoom,
  panOffset: propPan,
  onPanChange: propOnPanChange,
  onZoomChange: propOnZoomChange,
}) => {
  // Store integration with fallback to props
  const storeNodes = useGraphStore((state) => state.positionedNodes);
  const storeEdges = useGraphStore((state) => state.positionedEdges);
  const storeZoom = useGraphStore((state) => state.zoomLevel);
  const storePan = useGraphStore((state) => state.panOffset);
  const storeSelectedId = useGraphStore((state) => state.selectedNodeId);

  const storeSetPanOffset = useGraphStore((state) => state.setPanOffset);
  const storeSetZoomLevel = useGraphStore((state) => state.setZoomLevel);
  const storeResetViewport = useGraphStore((state) => state.resetViewport);

  const nodes: PositionedNode[] = propNodes ?? storeNodes;
  const edges: PositionedEdge[] = propEdges ?? storeEdges;
  const zoomLevel: number = propZoom ?? storeZoom;
  const panOffset: Point2D = propPan ?? storePan;

  // Local state for HUD controls
  const [internalDock, setInternalDock] = useState<MinimapDockPosition>(defaultDockPosition);
  const [internalOpacity, setInternalOpacity] = useState<number>(defaultOpacity);
  const [internalShowHeatmap, setInternalShowHeatmap] = useState<boolean>(defaultShowHeatmap);
  const [internalShowClusters, setInternalShowClusters] = useState<boolean>(defaultShowClusters);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(defaultCollapsed);

  const dockPosition = controlledDock ?? internalDock;
  const opacity = controlledOpacity ?? internalOpacity;
  const showHeatmap = controlledShowHeatmap ?? internalShowHeatmap;
  const showClusters = controlledShowClusters ?? internalShowClusters;

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Compute Viewport Size
  const viewportWidth = useMemo(() => {
    if (typeof controlledVw === "number" && controlledVw > 0) return controlledVw;
    if (typeof document !== "undefined") {
      const container =
        document.querySelector(".graph-canvas-viewport") ||
        document.querySelector(".canvas-wrapper");
      if (container && container.clientWidth > 0) return container.clientWidth;
    }
    if (typeof window !== "undefined" && window.innerWidth > 0) return window.innerWidth * 0.75;
    return 1000;
  }, [controlledVw]);

  const viewportHeight = useMemo(() => {
    if (typeof controlledVh === "number" && controlledVh > 0) return controlledVh;
    if (typeof document !== "undefined") {
      const container =
        document.querySelector(".graph-canvas-viewport") ||
        document.querySelector(".canvas-wrapper");
      if (container && container.clientHeight > 0) return container.clientHeight;
    }
    if (typeof window !== "undefined" && window.innerHeight > 0) return window.innerHeight * 0.75;
    return 800;
  }, [controlledVh]);

  // Compute graph bounds & transform
  const graphBounds = useMemo(() => calculateGraphBounds(nodes, edges, 40), [nodes, edges]);

  const transform = useMemo(
    () => calculateMinimapTransform(graphBounds, width, height, 40),
    [graphBounds, width, height],
  );

  // Compute frustum overlay rect
  const frustumRect = useMemo(
    () => calculateFrustumRect(viewportWidth, viewportHeight, panOffset, zoomLevel, transform),
    [viewportWidth, viewportHeight, panOffset, zoomLevel, transform],
  );

  // Compute density heatmap grid
  const densityGrid = useMemo(
    () => calculateDensityGrid(nodes, graphBounds, 10, 8),
    [nodes, graphBounds],
  );

  // Compute clusters
  const clusters = useMemo(() => calculateConnectedClusters(nodes, edges), [nodes, edges]);

  // Node Map for fast edge target lookups
  const nodeMap = useMemo(() => {
    const map = new Map<string, PositionedNode>();
    for (const node of nodes) {
      map.set(node.id, node);
    }
    return map;
  }, [nodes]);

  // Handlers
  const handlePanChange = useCallback(
    (newPan: Point2D) => {
      if (propOnPanChange) {
        propOnPanChange(newPan);
      } else {
        storeSetPanOffset(newPan);
      }
    },
    [propOnPanChange, storeSetPanOffset],
  );

  const handleZoomIn = useCallback(() => {
    const nextZoom = Math.min(zoomLevel + 0.2, 5.0);
    if (propOnZoomChange) {
      propOnZoomChange(nextZoom);
    } else {
      storeSetZoomLevel(nextZoom);
    }
  }, [zoomLevel, propOnZoomChange, storeSetZoomLevel]);

  const handleZoomOut = useCallback(() => {
    const nextZoom = Math.max(zoomLevel - 0.2, 0.1);
    if (propOnZoomChange) {
      propOnZoomChange(nextZoom);
    } else {
      storeSetZoomLevel(nextZoom);
    }
  }, [zoomLevel, propOnZoomChange, storeSetZoomLevel]);

  const handleResetView = useCallback(() => {
    storeResetViewport();
  }, [storeResetViewport]);

  // Click-to-Center Navigation Handler
  const handleCanvasClick = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      const target = e.target as { closest?: (sel: string) => unknown } | null;
      // If user clicked directly on the frustum overlay rect or drag handles, skip click-to-center
      if (target?.closest && target.closest(".minimap-frustum-overlay")) return;

      const svg = svgRef.current;
      const rect =
        svg && typeof svg.getBoundingClientRect === "function"
          ? svg.getBoundingClientRect()
          : { left: 0, top: 0, width, height };

      const clickMinimapX =
        typeof e.clientX === "number" ? e.clientX - (rect.left || 0) : width / 2;
      const clickMinimapY =
        typeof e.clientY === "number" ? e.clientY - (rect.top || 0) : height / 2;

      const worldTarget = minimapToWorld(clickMinimapX, clickMinimapY, transform);

      const newPan = calculatePanFromWorldCenter(
        worldTarget.x,
        worldTarget.y,
        viewportWidth,
        viewportHeight,
        zoomLevel,
        graphBounds,
      );

      handlePanChange(newPan);
      onNavigate?.(worldTarget.x, worldTarget.y);
    },
    [
      width,
      height,
      transform,
      viewportWidth,
      viewportHeight,
      zoomLevel,
      graphBounds,
      handlePanChange,
      onNavigate,
    ],
  );

  const dockClass = `dock-${dockPosition}`;
  const collapsedClass = isCollapsed ? "is-collapsed" : "";

  return (
    <aside
      className={`minimap-container ${dockClass} ${collapsedClass} ${className}`.trim()}
      style={{
        width: isCollapsed ? "auto" : width,
        opacity,
        ...style,
      }}
      data-testid="minimap-container"
      aria-label="Minimap Navigation"
    >
      <MinimapHudControls
        dockPosition={dockPosition}
        onDockChange={(pos) => setInternalDock(pos)}
        opacity={opacity}
        onOpacityChange={(op) => setInternalOpacity(op)}
        showHeatmap={showHeatmap}
        onToggleHeatmap={() => setInternalShowHeatmap((p) => !p)}
        showClusters={showClusters}
        onToggleClusters={() => setInternalShowClusters((p) => !p)}
        isCollapsed={isCollapsed}
        onToggleCollapsed={() => {
          if (collapsible) {
            setIsCollapsed((p) => !p);
          }
        }}
        zoomLevel={zoomLevel}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
      />

      {!isCollapsed && (
        <div
          className="minimap-viewport-wrapper"
          style={{ width, height }}
          data-testid="minimap-viewport-wrapper"
        >
          <svg
            ref={svgRef}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="minimap-svg"
            onClick={handleCanvasClick}
            data-testid="minimap-svg"
          >
            {/* Background */}
            <rect width={width} height={height} className="minimap-bg-rect" />

            {/* Density Heatmap Layer */}
            <MinimapDensityHeatmap
              densityGrid={densityGrid}
              transform={transform}
              visible={showHeatmap}
            />

            {/* Cluster Outlines Layer */}
            <MinimapClusterOutlines
              clusters={clusters}
              transform={transform}
              visible={showClusters}
            />

            {/* Render Graph Edges */}
            <g className="minimap-edges-layer">
              {edges.map((edge) => {
                if (edge.points && edge.points.length >= 2) {
                  const pts = edge.points.map((p) => worldToMinimap(p.x, p.y, transform));
                  const d = `M ${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")}`;
                  return <path key={edge.id} d={d} className="minimap-edge-line" strokeWidth={1} />;
                }

                const srcNode = nodeMap.get(edge.source);
                const tgtNode = nodeMap.get(edge.target);
                if (srcNode && tgtNode) {
                  const srcPt = worldToMinimap(
                    srcNode.x + (srcNode.width || 120) / 2,
                    srcNode.y + (srcNode.height || 60) / 2,
                    transform,
                  );
                  const tgtPt = worldToMinimap(
                    tgtNode.x + (tgtNode.width || 120) / 2,
                    tgtNode.y + (tgtNode.height || 60) / 2,
                    transform,
                  );
                  return (
                    <line
                      key={edge.id}
                      x1={srcPt.x}
                      y1={srcPt.y}
                      x2={tgtPt.x}
                      y2={tgtPt.y}
                      className="minimap-edge-line"
                    />
                  );
                }
                return null;
              })}
            </g>

            {/* Render Graph Nodes */}
            <g className="minimap-nodes-layer">
              {nodes.map((node) => {
                const pos = worldToMinimap(node.x, node.y, transform);
                const nw = Math.max(3, (node.width || 120) * transform.scale);
                const nh = Math.max(2, (node.height || 60) * transform.scale);
                const statusColor =
                  STATUS_COLOR_MAP[node.status || ""] ||
                  (node.kind === "tool" ? "#a855f7" : "#6366f1");
                const isSelected = node.id === storeSelectedId;

                return (
                  <rect
                    key={node.id}
                    x={pos.x}
                    y={pos.y}
                    width={nw}
                    height={nh}
                    fill={statusColor}
                    className={`minimap-node-rect ${isSelected ? "is-selected" : ""}`}
                    data-testid={`minimap-node-${node.id}`}
                  >
                    <title>{node.name || node.id}</title>
                  </rect>
                );
              })}
            </g>

            {/* Viewport Frustum Overlay Layer */}
            <MinimapFrustumOverlay
              frustumRect={frustumRect}
              transform={transform}
              zoomLevel={zoomLevel}
              panOffset={panOffset}
              viewportWidth={viewportWidth}
              viewportHeight={viewportHeight}
              bounds={graphBounds}
              onPanChange={handlePanChange}
              interactive={true}
            />
          </svg>
        </div>
      )}
    </aside>
  );
};

export default Minimap;
