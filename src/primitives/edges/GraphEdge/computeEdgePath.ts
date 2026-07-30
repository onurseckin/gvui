import {
  buildSvgPath,
  findTotalPathMidpoint,
  snapPolyline8Dir,
  type Point2D,
} from "../../../engine/layout/dagreLayout";

export type EdgePathType = "straight" | "smoothstep" | "bezier";

export interface ComputeEdgePathOptions {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  pathType?: EdgePathType;
  offset?: number;
}

export function computeEdgePath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  pathType = "straight",
  offset = 0,
}: ComputeEdgePathOptions): { path: string; labelX: number; labelY: number } {
  let midX = (sourceX + targetX) / 2;
  let midY = (sourceY + targetY) / 2;

  let points: Point2D[] = [
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
  ];

  if (offset !== 0) {
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const nx = -dy / len;
      const ny = dx / len;
      midX += offset * nx;
      midY += offset * ny;
      points = [
        { x: sourceX, y: sourceY },
        { x: midX, y: midY },
        { x: targetX, y: targetY },
      ];
    }
  }

  if (pathType === "straight" || pathType === "smoothstep") {
    const snappedPoints = snapPolyline8Dir(points);
    const path = buildSvgPath(snappedPoints);
    const midResult = findTotalPathMidpoint(snappedPoints);
    return {
      path,
      labelX: midResult.x,
      labelY: midResult.y,
    };
  }

  if (pathType === "bezier") {
    const deltaY = Math.abs(targetY - sourceY);
    const controlOffsetY = Math.max(deltaY * 0.5, 40);
    if (offset !== 0) {
      const path = `M ${sourceX} ${sourceY} C ${sourceX + midX - (sourceX + targetX) / 2} ${sourceY + controlOffsetY + midY - (sourceY + targetY) / 2}, ${targetX + midX - (sourceX + targetX) / 2} ${targetY - controlOffsetY + midY - (sourceY + targetY) / 2}, ${targetX} ${targetY}`;
      return { path, labelX: midX, labelY: midY };
    }
    const path = `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY + controlOffsetY}, ${targetX} ${targetY - controlOffsetY}, ${targetX} ${targetY}`;
    return { path, labelX: midX, labelY: midY };
  }

  const snappedPoints = snapPolyline8Dir(points);
  const path = buildSvgPath(snappedPoints);
  const midResult = findTotalPathMidpoint(snappedPoints);
  return { path, labelX: midResult.x, labelY: midResult.y };
}
