import { segmentsCross } from "./geometry";
import type { ClassifiedEdge, EdgeCrossing, EdgeRole, Point, RoutedPath, Segment } from "./types";

const ROLE_PRIORITY: Record<EdgeRole, number> = {
  forward: 4,
  cross: 3,
  feedback: 2,
  self: 1,
};

export function getBridgeOwnerEdgeId(
  edgeA: { id: string; role?: EdgeRole },
  edgeB: { id: string; role?: EdgeRole }
): string {
  const roleA = edgeA.role ? ROLE_PRIORITY[edgeA.role] ?? 0 : 0;
  const roleB = edgeB.role ? ROLE_PRIORITY[edgeB.role] ?? 0 : 0;

  if (roleA !== roleB) {
    return roleA > roleB ? edgeB.id : edgeA.id;
  }

  return edgeA.id < edgeB.id ? edgeB.id : edgeA.id;
}

export function detectEdgeCrossings(
  edges: RoutedPath[],
  edgeRoleInput?: Map<string, EdgeRole> | Record<string, EdgeRole> | ClassifiedEdge[],
  epsilon = 0.001
): EdgeCrossing[] {
  const crossings: EdgeCrossing[] = [];

  const roleMap = new Map<string, EdgeRole>();
  if (edgeRoleInput) {
    if (edgeRoleInput instanceof Map) {
      for (const [id, role] of edgeRoleInput) {
        roleMap.set(id, role);
      }
    } else if (Array.isArray(edgeRoleInput)) {
      for (const ce of edgeRoleInput) {
        roleMap.set(ce.id, ce.role);
      }
    } else {
      for (const [id, role] of Object.entries(edgeRoleInput)) {
        roleMap.set(id, role);
      }
    }
  }

  for (let i = 0; i < edges.length; i++) {
    const edgeA = edges[i];
    if (!edgeA.points || edgeA.points.length < 2) continue;

    for (let j = i + 1; j < edges.length; j++) {
      const edgeB = edges[j];
      if (!edgeB.points || edgeB.points.length < 2) continue;

      for (let k = 0; k < edgeA.points.length - 1; k++) {
        const segA: Segment = { a: edgeA.points[k], b: edgeA.points[k + 1] };
        for (let l = 0; l < edgeB.points.length - 1; l++) {
          const segB: Segment = { a: edgeB.points[l], b: edgeB.points[l + 1] };

          if (segmentsCross(segA, segB, epsilon)) {
            const s1Horiz = Math.abs(segA.a.y - segA.b.y) <= epsilon;
            const pt: Point = s1Horiz
              ? { x: segB.a.x, y: segA.a.y }
              : { x: segA.a.x, y: segB.a.y };

            const roleA = roleMap.get(edgeA.edgeId);
            const roleB = roleMap.get(edgeB.edgeId);

            const bridgeOwnerEdgeId = getBridgeOwnerEdgeId(
              { id: edgeA.edgeId, role: roleA },
              { id: edgeB.edgeId, role: roleB }
            );

            crossings.push({
              edgeIdA: edgeA.edgeId,
              edgeIdB: edgeB.edgeId,
              point: pt,
              bridgeOwnerEdgeId,
            });
          }
        }
      }
    }
  }

  return crossings;
}
