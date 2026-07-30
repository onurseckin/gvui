export type EdgePathType = "straight" | "smoothstep" | "bezier";

export interface ComputeEdgePathOptions {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  pathType?: EdgePathType;
}

export function computeEdgePath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  pathType = "bezier",
}: ComputeEdgePathOptions): { path: string; labelX: number; labelY: number } {
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  if (pathType === "straight") {
    return {
      path: `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`,
      labelX: midX,
      labelY: midY,
    };
  }

  if (pathType === "bezier") {
    const deltaY = Math.abs(targetY - sourceY);
    const controlOffsetY = Math.max(deltaY * 0.5, 40);
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
