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

interface LabelRouteMetadata {
  placement: BadgePlacement;
  route: RoutedPath;
  axis: RouteAxis | null;
  endpointRanks: number[];
  endpointRankSet: Set<number>;
  rankBoundaries: number[];
  rankBoundarySet: Set<number>;
}

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
  left: LabelRouteMetadata,
  right: LabelRouteMetadata,
  context: LabelLanePlannerContext,
): number | undefined {
  return left.endpointRanks.find(
    (rank): rank is number =>
      right.endpointRankSet.has(rank) && (context.layerNodeIds[rank]?.length ?? 0) >= 2,
  );
}

function sharedRankBoundary(
  left: LabelRouteMetadata,
  right: LabelRouteMetadata,
  context: LabelLanePlannerContext,
): number | undefined {
  return left.rankBoundaries.find(
    (rank) =>
      right.rankBoundarySet.has(rank) &&
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
  const routeMetadata = placements.map((placement): LabelRouteMetadata | null => {
    const route = routesByEdgeId.get(placement.edgeId);
    if (!route) return null;
    const sourceRank = context.rankByNodeId.get(route.sourcePort.nodeId);
    const targetRank = context.rankByNodeId.get(route.targetPort.nodeId);
    const endpointRanks = [sourceRank, targetRank].filter(
      (rank): rank is number => rank !== undefined,
    );
    const rankBoundaries =
      sourceRank === undefined || targetRank === undefined || sourceRank === targetRank
        ? []
        : Array.from(
            { length: Math.abs(targetRank - sourceRank) },
            (_, offset) => Math.min(sourceRank, targetRank) + offset,
          );
    return {
      placement,
      route,
      axis: routeAxisAtBadge(route, placement, config.epsilon),
      endpointRanks,
      endpointRankSet: new Set(endpointRanks),
      rankBoundaries,
      rankBoundarySet: new Set(rankBoundaries),
    };
  });
  const demands: ExactSpacingDemand[] = [];

  for (let i = 0; i < routeMetadata.length; i++) {
    const left = routeMetadata[i];
    if (!left || !left.axis) continue;

    for (let j = i + 1; j < routeMetadata.length; j++) {
      const right = routeMetadata[j];
      if (
        !right ||
        left.axis !== right.axis ||
        !rectsOverlapStrict(left.placement.rect, right.placement.rect, config.epsilon)
      )
        continue;

      const affectedEdgeIds = [left.placement.edgeId, right.placement.edgeId].sort();
      if (left.axis === "vertical") {
        const rank = sharedMovableRank(left, right, context);
        const minimum =
          left.placement.rect.width + right.placement.rect.width + 2 * config.badgeClearance;
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
        const rank = sharedRankBoundary(left, right, context);
        const minimum =
          left.placement.rect.height + right.placement.rect.height + 2 * config.badgeClearance;
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
