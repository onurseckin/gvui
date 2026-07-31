import type { PositionedEdge, PositionedNode } from "../types/graphData";

export interface FitViewResult {
  zoomLevel: number;
  panOffset: { x: number; y: number };
}

/**
 * Calculates zoom level and pan offset to fit all positioned nodes, edge badges,
 * and edge route paths cleanly within the viewport container with surrounding padding.
 */
export function calculateFitView(
  positionedNodes: PositionedNode[],
  positionedEdges?: PositionedEdge[],
  containerElement?: HTMLElement | null,
): FitViewResult {
  if (positionedNodes.length === 0) {
    return { zoomLevel: 1, panOffset: { x: 0, y: 0 } };
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

  if (positionedEdges && positionedEdges.length > 0) {
    const badgeHalfWidth = 60;
    const badgeHalfHeight = 20;

    for (const edge of positionedEdges) {
      if (typeof edge.labelX === "number" && typeof edge.labelY === "number") {
        minX = Math.min(minX, edge.labelX - badgeHalfWidth);
        maxX = Math.max(maxX, edge.labelX + badgeHalfWidth);
        minY = Math.min(minY, edge.labelY - badgeHalfHeight);
        maxY = Math.max(maxY, edge.labelY + badgeHalfHeight);
      }

      if (edge.path) {
        const matches = edge.path.match(/[-+]?\d*\.?\d+/g);
        if (matches) {
          for (let i = 0; i < matches.length - 1; i += 2) {
            const px = parseFloat(matches[i]);
            const py = parseFloat(matches[i + 1]);
            if (!isNaN(px) && !isNaN(py)) {
              minX = Math.min(minX, px);
              maxX = Math.max(maxX, px);
              minY = Math.min(minY, py);
              maxY = Math.max(maxY, py);
            }
          }
        }
      }
    }
  }

  const padding = 80;
  const graphWidth = maxX - minX + padding * 2;
  const graphHeight = maxY - minY + padding * 2;

  const wrapper = containerElement || (typeof document !== "undefined" ? document.querySelector(".canvas-wrapper") : null);
  const viewWidth = wrapper?.clientWidth || (typeof window !== "undefined" ? window.innerWidth * 0.7 : 1000);
  const viewHeight = wrapper?.clientHeight || (typeof window !== "undefined" ? window.innerHeight * 0.7 : 700);

  const scaleX = viewWidth / graphWidth;
  const scaleY = viewHeight / graphHeight;
  const fitScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.2), 1.5);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const panX = viewWidth / 2 - centerX * fitScale;
  const panY = viewHeight / 2 - centerY * fitScale;

  return { zoomLevel: fitScale, panOffset: { x: panX, y: panY } };
}
