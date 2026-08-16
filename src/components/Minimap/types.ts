import type { CSSProperties } from "react";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";

export type MinimapDockPosition = "top-right" | "bottom-right" | "bottom-left" | "top-left";

export interface MinimapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface MinimapTransform {
  scale: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  paddedBounds: MinimapBounds;
  minimapWidth: number;
  minimapHeight: number;
}

export interface FrustumRect {
  x: number;
  y: number;
  width: number;
  height: number;
  worldLeft: number;
  worldTop: number;
  worldWidth: number;
  worldHeight: number;
}

export interface DensityCell {
  col: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  count: number;
  density: number; // 0.0 to 1.0
  color: string;
}

export interface DensityGrid {
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  maxCount: number;
  cells: DensityCell[];
}

export interface Point2D {
  x: number;
  y: number;
}

export interface ClusterGroup {
  id: string;
  label: string;
  nodeIds: string[];
  bounds: MinimapBounds;
  hullPoints: Point2D[];
  color: string;
}

export interface MinimapFrustumOverlayProps {
  frustumRect: FrustumRect;
  transform: MinimapTransform;
  zoomLevel: number;
  panOffset: Point2D;
  viewportWidth: number;
  viewportHeight: number;
  bounds: MinimapBounds;
  onPanChange?: (newPan: Point2D) => void;
  interactive?: boolean;
  className?: string;
}

export interface MinimapDensityHeatmapProps {
  densityGrid: DensityGrid;
  transform: MinimapTransform;
  opacity?: number;
  visible?: boolean;
  className?: string;
}

export interface MinimapClusterOutlinesProps {
  clusters: ClusterGroup[];
  transform: MinimapTransform;
  visible?: boolean;
  className?: string;
}

export interface MinimapHudControlsProps {
  dockPosition: MinimapDockPosition;
  onDockChange: (position: MinimapDockPosition) => void;
  opacity: number;
  onOpacityChange: (opacity: number) => void;
  showHeatmap: boolean;
  onToggleHeatmap: () => void;
  showClusters: boolean;
  onToggleClusters: () => void;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
}

export interface MinimapProps {
  width?: number;
  height?: number;
  dockPosition?: MinimapDockPosition;
  defaultDockPosition?: MinimapDockPosition;
  opacity?: number;
  defaultOpacity?: number;
  showHeatmap?: boolean;
  defaultShowHeatmap?: boolean;
  showClusters?: boolean;
  defaultShowClusters?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
  onNavigate?: (worldX: number, worldY: number) => void;
  className?: string;
  style?: CSSProperties;
  nodes?: PositionedNode[];
  edges?: PositionedEdge[];
  zoomLevel?: number;
  panOffset?: Point2D;
  onPanChange?: (newPan: Point2D) => void;
  onZoomChange?: (newZoom: number) => void;
}
