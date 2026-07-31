import type { NormalizedNode, Point, Side } from "./types";

export function projectRemoteToSideOffset(
  node: NormalizedNode & Point,
  side: Side,
  remoteCenter: Point,
  epsilon: number,
): number {
  const cx = node.x + node.width / 2;
  const cy = node.y + node.height / 2;
  const dx = remoteCenter.x - cx;
  const dy = remoteCenter.y - cy;

  if (side === "left" || side === "right") {
    const sideX = side === "left" ? node.x : node.x + node.width;
    const t = Math.abs(dx) <= epsilon ? 0 : (sideX - cx) / dx;
    return cy + dy * t - node.y;
  } else {
    const sideY = side === "top" ? node.y : node.y + node.height;
    const t = Math.abs(dy) <= epsilon ? 0 : (sideY - cy) / dy;
    return cx + dx * t - node.x;
  }
}
