import type { PositionedNode } from "../types/graphData";

export interface FitViewResult {
  zoomLevel: number;
  panOffset: { x: number; y: number };
}

/**
 * Calculates zoom level and pan offset to fit all positioned nodes within the viewport container.
 */
export function calculateFitView(
  positionedNodes: PositionedNode[],
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

  const padding = 60;
  const graphWidth = maxX - minX + padding * 2;
  const graphHeight = maxY - minY + padding * 2;

  const wrapper = containerElement || document.querySelector(".canvas-wrapper");
  const viewWidth = wrapper?.clientWidth || window.innerWidth * 0.7;
  const viewHeight = wrapper?.clientHeight || window.innerHeight * 0.7;

  const scaleX = viewWidth / graphWidth;
  const scaleY = viewHeight / graphHeight;
  const fitScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.2), 1.5);

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const panX = viewWidth / 2 - centerX * fitScale;
  const panY = viewHeight / 2 - centerY * fitScale;

  return { zoomLevel: fitScale, panOffset: { x: panX, y: panY } };
}
