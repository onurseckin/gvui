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
  pathType = "bezier",
  offset = 0,
}: ComputeEdgePathOptions): { path: string; labelX: number; labelY: number } {
  let midX = (sourceX + targetX) / 2;
  let midY = (sourceY + targetY) / 2;

  if (offset !== 0) {
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const nx = -dy / len;
      const ny = dx / len;
      midX += offset * nx;
      midY += offset * ny;
    }
  }

  if (pathType === "straight") {
    if (offset !== 0) {
      return {
        path: `M ${sourceX} ${sourceY} Q ${midX} ${midY} ${targetX} ${targetY}`,
        labelX: midX,
        labelY: midY,
      };
    }
    return {
      path: `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`,
      labelX: midX,
      labelY: midY,
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

  const borderRadius = 8;
  const dirY = targetY > sourceY ? 1 : -1;
  const dirX = targetX > sourceX ? 1 : -1;
  const r = Math.min(
    borderRadius,
    Math.abs(targetX - sourceX) / 2,
    Math.abs(targetY - sourceY) / 2,
  );

  if (Math.abs(sourceX - targetX) < 1) {
    return {
      path: `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`,
      labelX: midX,
      labelY: midY,
    };
  }

  const path = `M ${sourceX} ${sourceY} L ${sourceX} ${midY - dirY * r} Q ${sourceX} ${midY} ${sourceX + dirX * r} ${midY} L ${targetX - dirX * r} ${midY} Q ${targetX} ${midY} ${targetX} ${midY + dirY * r} L ${targetX} ${targetY}`;

  return { path, labelX: midX, labelY: midY };
}
