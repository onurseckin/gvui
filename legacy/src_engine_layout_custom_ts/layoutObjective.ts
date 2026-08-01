import { pathManhattanLength, simplifyOrthogonalPath } from "./geometry";
import type {
  BadgePlacement,
  ClassifiedEdge,
  CustomLayoutResult,
  EdgeRole,
  LayoutScore,
  LayoutValidationResult,
  Point,
  SegmentDirection,
  Side,
} from "./types";

export const ORDER: (keyof LayoutScore)[] = [
  "hardErrorCount",
  "unresolvedRouteCount",
  "nodeNodeOverlaps",
  "edgeNodePenetrations",
  "sharedEdgeSegmentLength",
  "unresolvedBadgeCount",
  "badgeNodeOverlaps",
  "badgeBadgeOverlaps",
  "badgeUnrelatedEdgeOverlaps",
  "crossingCount",
  "ordinaryLeaderCount",
  "avoidableHairpinCount",
  "excessBendCount",
  "hairpinCount",
  "bendCount",
  "directionDeviationPenalty",
  "totalLength",
  "portSideImbalance",
  "feedbackLeaderCount",
  "totalLeaderLength",
  "totalArea",
];

export function compareLayoutScore(a: LayoutScore, b: LayoutScore): number {
  for (const key of ORDER) {
    const diff = ((a[key] as number | undefined) ?? 0) - ((b[key] as number | undefined) ?? 0);
    if (diff !== 0) return diff;
  }
  return a.stateHash.localeCompare(b.stateHash);
}

export function countPathHairpins(points: Point[], epsilon = 0.001): number {
  if (points.length < 4) return 0;
  const simplified = simplifyOrthogonalPath(points, epsilon);
  if (simplified.length < 4) return 0;

  const directions: SegmentDirection[] = [];
  for (let i = 0; i < simplified.length - 1; i++) {
    const p1 = simplified[i];
    const p2 = simplified[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      directions.push(dx > 0 ? "right" : "left");
    } else if (Math.abs(dy) > 0) {
      directions.push(dy > 0 ? "down" : "up");
    }
  }

  let count = 0;
  for (let i = 0; i < directions.length - 2; i++) {
    const d1 = directions[i];
    const d2 = directions[i + 2];
    if (
      (d1 === "up" && d2 === "down") ||
      (d1 === "down" && d2 === "up") ||
      (d1 === "left" && d2 === "right") ||
      (d1 === "right" && d2 === "left")
    ) {
      count++;
    }
  }
  return count;
}

export function getEdgeRole(
  edgeId: string,
  edgeRoles?: Map<string, EdgeRole> | Record<string, EdgeRole> | ClassifiedEdge[],
): EdgeRole | undefined {
  if (!edgeRoles) return undefined;
  if (edgeRoles instanceof Map) {
    return edgeRoles.get(edgeId);
  }
  if (Array.isArray(edgeRoles)) {
    const found = edgeRoles.find((e) => e.id === edgeId);
    return found?.role;
  }
  return (edgeRoles as Record<string, EdgeRole>)[edgeId];
}

export interface LeaderMetrics {
  ordinaryLeaderCount: number;
  feedbackLeaderCount: number;
  totalLeaderLength: number;
}

export function calculateLeaderMetrics(
  badges: Pick<BadgePlacement, "edgeId" | "leaderPoints">[],
  edgeRoles?: Map<string, EdgeRole> | Record<string, EdgeRole> | ClassifiedEdge[],
): LeaderMetrics {
  let ordinaryLeaderCount = 0;
  let feedbackLeaderCount = 0;
  let totalLeaderLength = 0;

  for (const badge of badges) {
    if (badge.leaderPoints && badge.leaderPoints.length >= 2) {
      totalLeaderLength += pathManhattanLength(badge.leaderPoints);
      const role = getEdgeRole(badge.edgeId, edgeRoles);
      if (role === "feedback" || role === "self") {
        feedbackLeaderCount++;
      } else {
        ordinaryLeaderCount++;
      }
    }
  }

  return {
    ordinaryLeaderCount,
    feedbackLeaderCount,
    totalLeaderLength,
  };
}

export function calculateHairpinCount(
  edges: { id?: string; edgeId?: string; points?: Point[] }[],
  edgeRoles?: Map<string, EdgeRole> | Record<string, EdgeRole> | ClassifiedEdge[],
  epsilon = 0.001,
): { totalHairpins: number; avoidableHairpins: number } {
  let totalHairpins = 0;
  let avoidableHairpins = 0;
  for (const edge of edges) {
    if (edge.points && edge.points.length >= 2) {
      const count = countPathHairpins(edge.points, epsilon);
      totalHairpins += count;
      const edgeId = edge.id ?? edge.edgeId;
      const role = edgeId ? getEdgeRole(edgeId, edgeRoles) : undefined;
      const isStructurallyNecessary = role === "feedback" || role === "self";
      if (!isStructurallyNecessary) {
        avoidableHairpins += count;
      } else if (count > 1) {
        avoidableHairpins += count - 1;
      }
    }
  }
  return { totalHairpins, avoidableHairpins };
}

export function calculateExcessBends(
  edges: { id?: string; edgeId?: string; points?: Point[] }[],
  edgeRoles?: Map<string, EdgeRole> | Record<string, EdgeRole> | ClassifiedEdge[],
): number {
  let excess = 0;
  for (const edge of edges) {
    if (edge.points && edge.points.length >= 2) {
      const simplified = simplifyOrthogonalPath(edge.points);
      const bendCount = Math.max(0, simplified.length - 2);
      const edgeId = edge.id ?? edge.edgeId;
      const role = edgeId ? getEdgeRole(edgeId, edgeRoles) : undefined;
      const maxAllowed = role === "feedback" || role === "self" ? 4 : 3;
      if (bendCount > maxAllowed) {
        excess += bendCount - maxAllowed;
      }
    }
  }
  return excess;
}

export function calculatePortSideImbalance(
  nodes: { id: string }[],
  edges: {
    sourcePort?: { nodeId: string; side: Side };
    targetPort?: { nodeId: string; side: Side };
  }[],
): number {
  const nodeSideCounts = new Map<string, Record<Side, number>>();

  const getSideCounts = (nodeId: string): Record<Side, number> => {
    let counts = nodeSideCounts.get(nodeId);
    if (!counts) {
      counts = { top: 0, right: 0, bottom: 0, left: 0 };
      nodeSideCounts.set(nodeId, counts);
    }
    return counts;
  };

  for (const node of nodes) {
    getSideCounts(node.id);
  }

  for (const edge of edges) {
    if (edge.sourcePort) {
      const counts = getSideCounts(edge.sourcePort.nodeId);
      counts[edge.sourcePort.side]++;
    }
    if (edge.targetPort) {
      const counts = getSideCounts(edge.targetPort.nodeId);
      counts[edge.targetPort.side]++;
    }
  }

  let totalImbalance = 0;
  for (const counts of nodeSideCounts.values()) {
    const minCount = Math.min(counts.top, counts.right, counts.bottom, counts.left);
    const imbalance =
      (counts.top - minCount) ** 2 +
      (counts.right - minCount) ** 2 +
      (counts.bottom - minCount) ** 2 +
      (counts.left - minCount) ** 2;
    totalImbalance += imbalance;
  }

  return totalImbalance;
}

export function buildLayoutScore(
  result: Pick<CustomLayoutResult, "nodes" | "edges" | "badges"> & {
    classifiedEdges?: ClassifiedEdge[];
    edgeRoles?: Map<string, EdgeRole> | Record<string, EdgeRole>;
  },
  validation: LayoutValidationResult,
  edgeRoles?: Map<string, EdgeRole> | Record<string, EdgeRole> | ClassifiedEdge[],
  stateHash: string = "",
): LayoutScore {
  const hardErrorCount = validation.diagnostics.filter((d) => d.severity === "error").length;

  const roles = edgeRoles ?? result.edgeRoles ?? result.classifiedEdges;
  const leaderMetrics = calculateLeaderMetrics(result.badges ?? [], roles);
  const hairpinMetrics = calculateHairpinCount(result.edges ?? [], roles);
  const hairpinCount = validation.metrics.hairpinCount ?? hairpinMetrics.totalHairpins;
  const avoidableHairpinCount =
    validation.metrics.avoidableHairpinCount ?? hairpinMetrics.avoidableHairpins;
  const excessBendCount =
    validation.metrics.excessBendCount ?? calculateExcessBends(result.edges ?? [], roles);
  const portSideImbalance =
    validation.metrics.portSideImbalance ??
    calculatePortSideImbalance(result.nodes ?? [], result.edges ?? []);

  return {
    hardErrorCount,
    unresolvedRouteCount: validation.metrics.unresolvedRouteCount ?? 0,
    nodeNodeOverlaps: validation.metrics.nodeNodeOverlaps,
    edgeNodePenetrations: validation.metrics.edgeNodePenetrations,
    sharedEdgeSegmentLength: validation.metrics.sharedEdgeSegmentLength,
    unresolvedBadgeCount: validation.metrics.unresolvedBadgeCount ?? 0,
    badgeNodeOverlaps: validation.metrics.badgeNodeOverlaps,
    badgeBadgeOverlaps: validation.metrics.badgeBadgeOverlaps,
    badgeUnrelatedEdgeOverlaps: validation.metrics.badgeUnrelatedEdgeOverlaps,
    crossingCount: validation.metrics.crossingCount,
    ordinaryLeaderCount:
      validation.metrics.ordinaryLeaderCount ?? leaderMetrics.ordinaryLeaderCount,
    avoidableHairpinCount,
    excessBendCount,
    hairpinCount,
    bendCount: validation.metrics.bendCount,
    directionDeviationPenalty: validation.metrics.directionDeviationPenalty,
    totalLength: validation.metrics.totalLength,
    portSideImbalance,
    feedbackLeaderCount:
      validation.metrics.feedbackLeaderCount ?? leaderMetrics.feedbackLeaderCount,
    totalLeaderLength: validation.metrics.totalLeaderLength ?? leaderMetrics.totalLeaderLength,
    totalArea: validation.metrics.totalArea,
    stateHash,
  };
}
