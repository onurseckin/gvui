import type { Side } from "./types";

export interface NodePortEndpoint {
  edgeId: string;
  endpointKind: "src" | "tgt";
  nodeId: string;
  side: Side;
  otherNodeCenter: { x: number; y: number };
  role?: "forward" | "cross" | "feedback" | "self";
}

export function computeTargetAngle(
  nodeCenter: { x: number; y: number },
  side: Side,
  otherCenter: { x: number; y: number },
): number {
  const dx = otherCenter.x - nodeCenter.x;
  const dy = otherCenter.y - nodeCenter.y;

  switch (side) {
    case "top":
    case "bottom":
      // Sort primarily by X, secondarily by Y
      return dx;
    case "left":
    case "right":
      // Sort primarily by Y, secondarily by X
      return dy;
  }
}

export function sortNodeSideEndpoints(
  endpoints: NodePortEndpoint[],
  nodeCenter: { x: number; y: number },
  explicitOrder?: string[],
): NodePortEndpoint[] {
  if (explicitOrder && explicitOrder.length > 0) {
    const orderMap = new Map<string, number>();
    explicitOrder.forEach((key, idx) => orderMap.set(key, idx));

    return [...endpoints].sort((a, b) => {
      const keyA = `${a.edgeId}:${a.endpointKind}`;
      const keyB = `${b.edgeId}:${b.endpointKind}`;
      const idxA = orderMap.has(keyA) ? orderMap.get(keyA)! : 999999;
      const idxB = orderMap.has(keyB) ? orderMap.get(keyB)! : 999999;
      if (idxA !== idxB) return idxA - idxB;

      const angleA = computeTargetAngle(nodeCenter, a.side, a.otherNodeCenter);
      const angleB = computeTargetAngle(nodeCenter, b.side, b.otherNodeCenter);
      if (Math.abs(angleA - angleB) > 0.001) return angleA - angleB;

      return keyA.localeCompare(keyB);
    });
  }

  return [...endpoints].sort((a, b) => {
    const angleA = computeTargetAngle(nodeCenter, a.side, a.otherNodeCenter);
    const angleB = computeTargetAngle(nodeCenter, b.side, b.otherNodeCenter);
    if (Math.abs(angleA - angleB) > 0.001) return angleA - angleB;

    const keyA = `${a.edgeId}:${a.endpointKind}`;
    const keyB = `${b.edgeId}:${b.endpointKind}`;
    return keyA.localeCompare(keyB);
  });
}
