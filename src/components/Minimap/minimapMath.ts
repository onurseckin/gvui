import type { PositionedEdge, PositionedNode } from "../../types/graphData";
import type {
  ClusterGroup,
  DensityCell,
  DensityGrid,
  FrustumRect,
  MinimapBounds,
  MinimapTransform,
  Point2D,
} from "./types";

const CLUSTER_PALETTE: readonly string[] = [
  "#818cf8", // Indigo
  "#38bdf8", // Sky
  "#34d399", // Emerald
  "#fbbf24", // Amber
  "#f472b6", // Pink
  "#a78bfa", // Purple
  "#2dd4bf", // Teal
  "#fb7185", // Rose
];

/**
 * Calculates the bounding box containing all positioned nodes and edges with margin.
 */
export function calculateGraphBounds(
  nodes: PositionedNode[],
  edges?: PositionedEdge[],
  _padding = 40,
): MinimapBounds {
  if (!nodes || nodes.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 1000,
      maxY: 800,
      width: 1000,
      height: 800,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const nx = Number.isFinite(node.x) ? node.x : 0;
    const ny = Number.isFinite(node.y) ? node.y : 0;
    const nw = Number.isFinite(node.width) && node.width > 0 ? node.width : 120;
    const nh = Number.isFinite(node.height) && node.height > 0 ? node.height : 60;

    minX = Math.min(minX, nx);
    maxX = Math.max(maxX, nx + nw);
    minY = Math.min(minY, ny);
    maxY = Math.max(maxY, ny + nh);
  }

  if (edges && edges.length > 0) {
    for (const edge of edges) {
      if (typeof edge.labelX === "number" && typeof edge.labelY === "number") {
        if (Number.isFinite(edge.labelX) && Number.isFinite(edge.labelY)) {
          minX = Math.min(minX, edge.labelX - 40);
          maxX = Math.max(maxX, edge.labelX + 40);
          minY = Math.min(minY, edge.labelY - 20);
          maxY = Math.max(maxY, edge.labelY + 20);
        }
      }
      if (edge.points && edge.points.length > 0) {
        for (const pt of edge.points) {
          if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
            minX = Math.min(minX, pt.x);
            maxX = Math.max(maxX, pt.x);
            minY = Math.min(minY, pt.y);
            maxY = Math.max(maxY, pt.y);
          }
        }
      }
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return { minX: 0, minY: 0, maxX: 1000, maxY: 800, width: 1000, height: 800 };
  }

  if (maxX <= minX) maxX = minX + 100;
  if (maxY <= minY) maxY = minY + 100;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculates scaling and offset transformations to map world coordinates onto the minimap viewport.
 */
export function calculateMinimapTransform(
  graphBounds: MinimapBounds,
  minimapWidth: number,
  minimapHeight: number,
  padding = 40,
): MinimapTransform {
  const safeMw = Math.max(
    1,
    Number.isFinite(minimapWidth) && minimapWidth > 0 ? minimapWidth : 260,
  );
  const safeMh = Math.max(
    1,
    Number.isFinite(minimapHeight) && minimapHeight > 0 ? minimapHeight : 170,
  );

  const paddedMinX = graphBounds.minX - padding;
  const paddedMinY = graphBounds.minY - padding;
  const paddedMaxX = graphBounds.maxX + padding;
  const paddedMaxY = graphBounds.maxY + padding;
  const paddedWidth = Math.max(1, paddedMaxX - paddedMinX);
  const paddedHeight = Math.max(1, paddedMaxY - paddedMinY);

  const scaleX = safeMw / paddedWidth;
  const scaleY = safeMh / paddedHeight;
  let scale = Math.min(scaleX, scaleY);
  if (!Number.isFinite(scale) || scale <= 0) {
    scale = 1.0;
  }

  const renderedWidth = paddedWidth * scale;
  const renderedHeight = paddedHeight * scale;
  const offsetX = (safeMw - renderedWidth) / 2;
  const offsetY = (safeMh - renderedHeight) / 2;

  const paddedBounds: MinimapBounds = {
    minX: paddedMinX,
    minY: paddedMinY,
    maxX: paddedMaxX,
    maxY: paddedMaxY,
    width: paddedWidth,
    height: paddedHeight,
  };

  return {
    scale,
    scaleX,
    scaleY,
    offsetX: Number.isFinite(offsetX) ? offsetX : 0,
    offsetY: Number.isFinite(offsetY) ? offsetY : 0,
    paddedBounds,
    minimapWidth: safeMw,
    minimapHeight: safeMh,
  };
}

/**
 * Converts world coordinates to minimap coordinates.
 */
export function worldToMinimap(
  worldX: number,
  worldY: number,
  transform: MinimapTransform,
): Point2D {
  const wx = Number.isFinite(worldX) ? worldX : 0;
  const wy = Number.isFinite(worldY) ? worldY : 0;
  return {
    x: (wx - transform.paddedBounds.minX) * transform.scale + transform.offsetX,
    y: (wy - transform.paddedBounds.minY) * transform.scale + transform.offsetY,
  };
}

/**
 * Converts minimap coordinates to world coordinates.
 */
export function minimapToWorld(
  minimapX: number,
  minimapY: number,
  transform: MinimapTransform,
): Point2D {
  const mx = Number.isFinite(minimapX) ? minimapX : 0;
  const my = Number.isFinite(minimapY) ? minimapY : 0;
  if (transform.scale <= 0 || !Number.isFinite(transform.scale)) {
    return { x: transform.paddedBounds.minX, y: transform.paddedBounds.minY };
  }
  return {
    x: (mx - transform.offsetX) / transform.scale + transform.paddedBounds.minX,
    y: (my - transform.offsetY) / transform.scale + transform.paddedBounds.minY,
  };
}

/**
 * Computes the frustum rectangle (visible canvas viewport) in minimap coordinates.
 */
export function calculateFrustumRect(
  viewportWidth: number,
  viewportHeight: number,
  panOffset: Point2D,
  zoomLevel: number,
  transform: MinimapTransform,
): FrustumRect {
  const safeZoom = Math.min(
    100,
    Math.max(0.0001, Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1.0),
  );
  const safeVw = Math.max(
    1,
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1000,
  );
  const safeVh = Math.max(
    1,
    Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 800,
  );

  const safePanX = Number.isFinite(panOffset?.x) ? panOffset.x : 0;
  const safePanY = Number.isFinite(panOffset?.y) ? panOffset.y : 0;

  const worldLeft = -safePanX / safeZoom;
  const worldTop = -safePanY / safeZoom;
  const worldWidth = safeVw / safeZoom;
  const worldHeight = safeVh / safeZoom;

  const minimapPt = worldToMinimap(worldLeft, worldTop, transform);
  const minimapWidth = Math.max(1, worldWidth * transform.scale);
  const minimapHeight = Math.max(1, worldHeight * transform.scale);

  return {
    x: minimapPt.x,
    y: minimapPt.y,
    width: minimapWidth,
    height: minimapHeight,
    worldLeft,
    worldTop,
    worldWidth,
    worldHeight,
  };
}

/**
 * Clamps pan offset so the canvas viewport does not wander infinitely beyond the graph bounds.
 */
export function clampPanOffset(
  panOffset: Point2D,
  bounds: MinimapBounds,
  viewportWidth: number,
  viewportHeight: number,
  zoomLevel: number,
  maxOverscroll = 800,
): Point2D {
  const safeZoom = Math.min(
    100,
    Math.max(0.0001, Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1.0),
  );
  const safeVw = Math.max(
    1,
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1000,
  );
  const safeVh = Math.max(
    1,
    Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 800,
  );

  const safePanX = Number.isFinite(panOffset?.x) ? panOffset.x : 0;
  const safePanY = Number.isFinite(panOffset?.y) ? panOffset.y : 0;

  const worldCenterX = (safeVw / 2 - safePanX) / safeZoom;
  const worldCenterY = (safeVh / 2 - safePanY) / safeZoom;

  const minAllowedX = bounds.minX - maxOverscroll;
  const maxAllowedX = bounds.maxX + maxOverscroll;
  const minAllowedY = bounds.minY - maxOverscroll;
  const maxAllowedY = bounds.maxY + maxOverscroll;

  const clampedX = Math.max(minAllowedX, Math.min(maxAllowedX, worldCenterX));
  const clampedY = Math.max(minAllowedY, Math.min(maxAllowedY, worldCenterY));

  return {
    x: safeVw / 2 - clampedX * safeZoom,
    y: safeVh / 2 - clampedY * safeZoom,
  };
}

/**
 * Calculates pan offset to center the viewport on a given world point.
 */
export function calculatePanFromWorldCenter(
  worldCenterX: number,
  worldCenterY: number,
  viewportWidth: number,
  viewportHeight: number,
  zoomLevel: number,
  bounds?: MinimapBounds,
): Point2D {
  const safeZoom = Math.min(
    100,
    Math.max(0.0001, Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1.0),
  );
  const safeVw = Math.max(
    1,
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1000,
  );
  const safeVh = Math.max(
    1,
    Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 800,
  );

  const safeWx = Number.isFinite(worldCenterX) ? worldCenterX : 0;
  const safeWy = Number.isFinite(worldCenterY) ? worldCenterY : 0;

  const pan: Point2D = {
    x: safeVw / 2 - safeWx * safeZoom,
    y: safeVh / 2 - safeWy * safeZoom,
  };
  if (bounds) {
    return clampPanOffset(pan, bounds, safeVw, safeVh, safeZoom);
  }
  return pan;
}

/**
 * Calculates new pan offset from dragging the frustum rectangle on the minimap.
 */
export function calculatePanFromFrustumDrag(
  initialPan: Point2D,
  deltaMinimapX: number,
  deltaMinimapY: number,
  scale: number,
  zoomLevel: number,
  bounds?: MinimapBounds,
  viewportWidth?: number,
  viewportHeight?: number,
): Point2D {
  if (scale <= 0 || !Number.isFinite(scale)) return initialPan;

  const safeZoom = Math.min(
    100,
    Math.max(0.0001, Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1.0),
  );
  const safeDx = Number.isFinite(deltaMinimapX) ? deltaMinimapX : 0;
  const safeDy = Number.isFinite(deltaMinimapY) ? deltaMinimapY : 0;

  const deltaWorldX = safeDx / scale;
  const deltaWorldY = safeDy / scale;

  const newPan: Point2D = {
    x: (initialPan.x || 0) - deltaWorldX * safeZoom,
    y: (initialPan.y || 0) - deltaWorldY * safeZoom,
  };

  if (bounds && typeof viewportWidth === "number" && typeof viewportHeight === "number") {
    return clampPanOffset(newPan, bounds, viewportWidth, viewportHeight, safeZoom);
  }

  return newPan;
}

/**
 * Helper to get density heatmap color for a normalized density (0.0 to 1.0).
 */
export function getDensityColor(density: number): string {
  if (!Number.isFinite(density) || density <= 0) return "rgba(0, 0, 0, 0)";
  if (density <= 0.25) {
    const alpha = 0.15 + density * 0.6;
    return `rgba(56, 189, 248, ${alpha.toFixed(2)})`; // Sky Blue
  }
  if (density <= 0.5) {
    const alpha = 0.25 + (density - 0.25) * 0.8;
    return `rgba(16, 185, 129, ${alpha.toFixed(2)})`; // Emerald Green
  }
  if (density <= 0.75) {
    const alpha = 0.35 + (density - 0.5) * 0.9;
    return `rgba(245, 158, 11, ${alpha.toFixed(2)})`; // Amber Orange
  }
  const alpha = 0.45 + (density - 0.75) * 1.2;
  return `rgba(239, 68, 68, ${Math.min(0.95, alpha).toFixed(2)})`; // Crimson Red
}

/**
 * Calculates a 2D spatial density grid over the graph area.
 * Accurately normalizes density for congested / collocated nodes.
 */
export function calculateDensityGrid(
  nodes: PositionedNode[],
  bounds: MinimapBounds,
  cols = 8,
  rows = 6,
): DensityGrid {
  const safeCols = Math.max(1, cols);
  const safeRows = Math.max(1, rows);
  const cellWidth = Math.max(1, bounds.width / safeCols);
  const cellHeight = Math.max(1, bounds.height / safeRows);

  const gridCounts: number[][] = Array.from({ length: safeRows }, () =>
    Array.from({ length: safeCols }, () => 0),
  );

  if (nodes && nodes.length > 0) {
    for (const node of nodes) {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;
      const nw = Number.isFinite(node.width) && node.width > 0 ? node.width : 120;
      const nh = Number.isFinite(node.height) && node.height > 0 ? node.height : 60;
      const cx = node.x + nw / 2;
      const cy = node.y + nh / 2;

      const col = Math.max(0, Math.min(safeCols - 1, Math.floor((cx - bounds.minX) / cellWidth)));
      const row = Math.max(0, Math.min(safeRows - 1, Math.floor((cy - bounds.minY) / cellHeight)));

      gridCounts[row][col] += 1;
    }
  }

  let maxCount = 0;
  for (let r = 0; r < safeRows; r++) {
    for (let c = 0; c < safeCols; c++) {
      if (gridCounts[r][c] > maxCount) {
        maxCount = gridCounts[r][c];
      }
    }
  }

  const cells: DensityCell[] = [];
  for (let r = 0; r < safeRows; r++) {
    for (let c = 0; c < safeCols; c++) {
      const count = gridCounts[r][c];
      const density = maxCount > 0 ? count / maxCount : 0;
      cells.push({
        col: c,
        row: r,
        x: bounds.minX + c * cellWidth,
        y: bounds.minY + r * cellHeight,
        width: cellWidth,
        height: cellHeight,
        count,
        density,
        color: getDensityColor(density),
      });
    }
  }

  return {
    cols: safeCols,
    rows: safeRows,
    cellWidth,
    cellHeight,
    maxCount,
    cells,
  };
}

/**
 * 2D cross product of OA and OB vectors (returns r > 0 if counterclockwise turn, < 0 if clockwise, 0 if collinear).
 */
function crossProduct(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Computes the 2D convex hull of a set of points using Andrew's Monotone Chain algorithm.
 */
export function calculateConvexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 2) return [...points];

  // Sort by x, then by y
  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  // Deduplicate points
  const uniquePoints: Point2D[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (
      i === 0 ||
      Math.abs(sorted[i].x - sorted[i - 1].x) > 1e-6 ||
      Math.abs(sorted[i].y - sorted[i - 1].y) > 1e-6
    ) {
      uniquePoints.push(sorted[i]);
    }
  }

  if (uniquePoints.length <= 2) return uniquePoints;

  // Build lower hull
  const lower: Point2D[] = [];
  for (const p of uniquePoints) {
    while (
      lower.length >= 2 &&
      crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build upper hull
  const upper: Point2D[] = [];
  for (let i = uniquePoints.length - 1; i >= 0; i--) {
    const p = uniquePoints[i];
    while (
      upper.length >= 2 &&
      crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }

  // Remove the last point of each half because it's repeated at the beginning of the other half
  lower.pop();
  upper.pop();

  return lower.concat(upper);
}

/**
 * Expands a polygon outward from its centroid by a given margin.
 */
export function expandPolygon(hullPoints: Point2D[], padding = 20): Point2D[] {
  if (hullPoints.length === 0) return [];
  if (hullPoints.length === 1) {
    const p = hullPoints[0];
    return [
      { x: p.x - padding, y: p.y - padding },
      { x: p.x + padding, y: p.y - padding },
      { x: p.x + padding, y: p.y + padding },
      { x: p.x - padding, y: p.y + padding },
    ];
  }
  if (hullPoints.length === 2) {
    const [p1, p2] = hullPoints;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * padding;
    const ny = (dx / len) * padding;
    return [
      { x: p1.x + nx, y: p1.y + ny },
      { x: p2.x + nx, y: p2.y + ny },
      { x: p2.x - nx, y: p2.y - ny },
      { x: p1.x - nx, y: p1.y - ny },
    ];
  }

  // Calculate centroid
  let cx = 0;
  let cy = 0;
  for (const p of hullPoints) {
    cx += p.x;
    cy += p.y;
  }
  cx /= hullPoints.length;
  cy /= hullPoints.length;

  return hullPoints.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const factor = (dist + padding) / dist;
    return {
      x: cx + dx * factor,
      y: cy + dy * factor,
    };
  });
}

/**
 * Converts a polygon vertex list into an SVG path `d` attribute string.
 */
export function polygonToSvgPath(points: Point2D[]): string {
  if (points.length === 0) return "";
  const parts = points.map(
    (p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
  );
  return `${parts.join(" ")} Z`;
}

/**
 * Clusters nodes based on graph connectivity (connected components) or explicit groups.
 */
export function calculateConnectedClusters(
  nodes: PositionedNode[],
  edges?: PositionedEdge[],
): ClusterGroup[] {
  if (!nodes || nodes.length === 0) return [];

  // 1. Group by explicit sectionId / group if present
  const sectionMap = new Map<string, PositionedNode[]>();
  const unsectionedNodes: PositionedNode[] = [];

  for (const node of nodes) {
    const secId = node.sectionId || node.group;
    if (secId) {
      const list = sectionMap.get(secId) || [];
      list.push(node);
      sectionMap.set(secId, list);
    } else {
      unsectionedNodes.push(node);
    }
  }

  const clusters: ClusterGroup[] = [];
  let colorIndex = 0;

  // Add explicit section clusters
  for (const [secId, secNodes] of sectionMap.entries()) {
    if (secNodes.length > 0) {
      clusters.push(
        createClusterGroup(
          secId,
          `Group: ${secId}`,
          secNodes,
          CLUSTER_PALETTE[colorIndex % CLUSTER_PALETTE.length],
        ),
      );
      colorIndex++;
    }
  }

  // 2. For unsectioned nodes, find connected components via BFS
  if (unsectionedNodes.length > 0) {
    const nodeMap = new Map<string, PositionedNode>();
    for (const node of unsectionedNodes) {
      nodeMap.set(node.id, node);
    }

    const adjacency = new Map<string, Set<string>>();
    for (const node of unsectionedNodes) {
      adjacency.set(node.id, new Set());
    }

    if (edges) {
      for (const edge of edges) {
        if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
          adjacency.get(edge.source)?.add(edge.target);
          adjacency.get(edge.target)?.add(edge.source);
        }
      }
    }

    const visited = new Set<string>();
    let componentIndex = 1;

    for (const node of unsectionedNodes) {
      if (visited.has(node.id)) continue;

      const compNodes: PositionedNode[] = [];
      const queue: string[] = [node.id];
      visited.add(node.id);

      while (queue.length > 0) {
        const currId = queue.shift();
        if (!currId) continue;
        const currNode = nodeMap.get(currId);
        if (currNode) compNodes.push(currNode);

        const neighbors = adjacency.get(currId) || new Set();
        for (const nbr of neighbors) {
          if (!visited.has(nbr)) {
            visited.add(nbr);
            queue.push(nbr);
          }
        }
      }

      if (compNodes.length >= 2 || unsectionedNodes.length === 1) {
        const clusterId = `cluster-${componentIndex}`;
        clusters.push(
          createClusterGroup(
            clusterId,
            `Cluster ${componentIndex}`,
            compNodes,
            CLUSTER_PALETTE[colorIndex % CLUSTER_PALETTE.length],
          ),
        );
        colorIndex++;
        componentIndex++;
      }
    }
  }

  return clusters;
}

/**
 * Creates a ClusterGroup with bounding box, corner points, convex hull, and expanded boundary.
 */
function createClusterGroup(
  id: string,
  label: string,
  nodes: PositionedNode[],
  color: string,
): ClusterGroup {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const cornerPoints: Point2D[] = [];

  for (const node of nodes) {
    const nw = Number.isFinite(node.width) && node.width > 0 ? node.width : 120;
    const nh = Number.isFinite(node.height) && node.height > 0 ? node.height : 60;
    const nx = Number.isFinite(node.x) ? node.x : 0;
    const ny = Number.isFinite(node.y) ? node.y : 0;

    minX = Math.min(minX, nx);
    maxX = Math.max(maxX, nx + nw);
    minY = Math.min(minY, ny);
    maxY = Math.max(maxY, ny + nh);

    cornerPoints.push(
      { x: nx, y: ny },
      { x: nx + nw, y: ny },
      { x: nx + nw, y: ny + nh },
      { x: nx, y: ny + nh },
    );
  }

  const rawHull = calculateConvexHull(cornerPoints);
  const hullPoints = expandPolygon(rawHull, 24);

  return {
    id,
    label,
    nodeIds: nodes.map((n) => n.id),
    bounds: {
      minX: Number.isFinite(minX) ? minX : 0,
      minY: Number.isFinite(minY) ? minY : 0,
      maxX: Number.isFinite(maxX) ? maxX : 100,
      maxY: Number.isFinite(maxY) ? maxY : 100,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    },
    hullPoints,
    color,
  };
}
