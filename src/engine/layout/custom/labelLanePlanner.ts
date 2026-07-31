import { rectsOverlapStrict } from "./geometry";
import type { CustomLayoutConfig } from "./config";
import type { ExactSpacingDemand, BadgePlacement, RoutedPath } from "./types";

export interface LabelLanePlannerContext {
  rankByNodeId: Map<string, number>;
  layerNodeIds: string[][];
  nodeGapByRank?: Map<number, number>;
  rankGapAfterRank?: Map<number, number>;
}

type RouteAxis = "horizontal" | "vertical";

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return Math.min(aEnd, bEnd) > Math.max(aStart, bStart);
}

function routeAxisAtBadge(
  route: RoutedPath,
  badge: BadgePlacement,
  epsilon: number,
): RouteAxis | null {
  let verticalCoverage = 0;
  let horizontalCoverage = 0;

  for (let index = 0; index < route.points.length - 1; index++) {
    const a = route.points[index];
    const b = route.points[index + 1];
    if (Math.abs(a.x - b.x) <= epsilon) {
      if (
        a.x > badge.rect.x + epsilon &&
        a.x < badge.rect.x + badge.rect.width - epsilon &&
        rangesOverlap(a.y, b.y, badge.rect.y, badge.rect.y + badge.rect.height)
      ) {
        verticalCoverage += Math.abs(b.y - a.y);
      }
    } else if (
      a.y > badge.rect.y + epsilon &&
      a.y < badge.rect.y + badge.rect.height - epsilon &&
      rangesOverlap(a.x, b.x, badge.rect.x, badge.rect.x + badge.rect.width)
    ) {
      horizontalCoverage += Math.abs(b.x - a.x);
    }
  }

  if (verticalCoverage === 0 && horizontalCoverage === 0) return null;
  return verticalCoverage >= horizontalCoverage ? "vertical" : "horizontal";
}

function sharedMovableRank(
  left: RoutedPath,
  right: RoutedPath,
  context: LabelLanePlannerContext,
): number | undefined {
  const leftRanks = [
    context.rankByNodeId.get(left.sourcePort.nodeId),
    context.rankByNodeId.get(left.targetPort.nodeId),
  ];
  const rightRanks = new Set([
    context.rankByNodeId.get(right.sourcePort.nodeId),
    context.rankByNodeId.get(right.targetPort.nodeId),
  ]);

  return leftRanks.find(
    (rank): rank is number =>
      rank !== undefined && rightRanks.has(rank) && (context.layerNodeIds[rank]?.length ?? 0) >= 2,
  );
}

function sharedRankBoundary(
  left: RoutedPath,
  right: RoutedPath,
  context: LabelLanePlannerContext,
): number | undefined {
  const boundaries = (route: RoutedPath) => {
    const sourceRank = context.rankByNodeId.get(route.sourcePort.nodeId);
    const targetRank = context.rankByNodeId.get(route.targetPort.nodeId);
    if (sourceRank === undefined || targetRank === undefined || sourceRank === targetRank)
      return [];
    const start = Math.min(sourceRank, targetRank);
    const end = Math.max(sourceRank, targetRank);
    return Array.from({ length: end - start }, (_, offset) => start + offset);
  };
  const rightBoundaries = new Set(boundaries(right));

  return boundaries(left).find(
    (rank) =>
      rightBoundaries.has(rank) &&
      context.layerNodeIds[rank] !== undefined &&
      context.layerNodeIds[rank + 1] !== undefined,
  );
}

export function planLabelLaneDemands(
  placements: BadgePlacement[],
  routes: RoutedPath[],
  config: CustomLayoutConfig,
  context: LabelLanePlannerContext,
): ExactSpacingDemand[] {
  const routesByEdgeId = new Map(routes.map((route) => [route.edgeId, route]));
  const demands: ExactSpacingDemand[] = [];

  for (let i = 0; i < placements.length; i++) {
    const left = placements[i];
    const leftRoute = routesByEdgeId.get(left.edgeId);
    if (!leftRoute) continue;
    const leftAxis = routeAxisAtBadge(leftRoute, left, config.epsilon);
    if (!leftAxis) continue;

    for (let j = i + 1; j < placements.length; j++) {
      const right = placements[j];
      const rightRoute = routesByEdgeId.get(right.edgeId);
      if (!rightRoute || !rectsOverlapStrict(left.rect, right.rect, config.epsilon)) continue;
      const rightAxis = routeAxisAtBadge(rightRoute, right, config.epsilon);
      if (leftAxis !== rightAxis) continue;

      const affectedEdgeIds = [left.edgeId, right.edgeId].sort();
      if (leftAxis === "vertical") {
        const rank = sharedMovableRank(leftRoute, rightRoute, context);
        const minimum = left.rect.width + right.rect.width + 2 * config.badgeClearance;
        const current = context.nodeGapByRank?.get(rank ?? -1) ?? config.nodeGap;
        if (rank !== undefined && minimum > current + config.epsilon) {
          demands.push({
            kind: "lane-x",
            rank,
            affectedEdgeIds,
            minimum,
            reason: "parallel-labels",
          });
        }
      } else {
        const rank = sharedRankBoundary(leftRoute, rightRoute, context);
        const minimum = left.rect.height + right.rect.height + 2 * config.badgeClearance;
        const current = context.rankGapAfterRank?.get(rank ?? -1) ?? config.rankGap;
        if (rank !== undefined && minimum > current + config.epsilon) {
          demands.push({
            kind: "lane-y",
            rank,
            affectedEdgeIds,
            minimum,
            reason: "parallel-labels",
          });
        }
      }
    }
  }

  return demands;
}
