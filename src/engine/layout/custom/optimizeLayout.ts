import type { CustomLayoutConfig } from "./config";
import { resolveCustomLayoutConfig } from "./config";
import { searchBestLayoutState } from "./layoutOptimizerState";
import type {
  BadgePlacement,
  CustomLayoutResult,
  NormalizedEdge,
  NormalizedNode,
  Point,
  RoutedPath,
} from "./types";

export function hashLayoutState(
  nodes: (NormalizedNode & Point)[],
  edges: RoutedPath[],
  badges: BadgePlacement[],
): string {
  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const nodeStr = sortedNodes.map((n) => `${n.id}:${n.x.toFixed(2)},${n.y.toFixed(2)}`).join("|");

  const sortedEdges = [...edges].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
  const edgeStr = sortedEdges
    .map((e) => {
      const pts = e.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(",");
      const sp = e.sourcePort
        ? `${e.sourcePort.side}:${e.sourcePort.index}:${e.sourcePort.point.x.toFixed(2)},${e.sourcePort.point.y.toFixed(2)}`
        : "";
      const tp = e.targetPort
        ? `${e.targetPort.side}:${e.targetPort.index}:${e.targetPort.point.x.toFixed(2)},${e.targetPort.point.y.toFixed(2)}`
        : "";
      return `${e.edgeId}:${sp}:${tp}:${pts}`;
    })
    .join("|");

  const sortedBadges = [...badges].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
  const badgeStr = sortedBadges
    .map((b) => {
      const lpts = b.leaderPoints
        ? b.leaderPoints.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(",")
        : "";
      return `${b.edgeId}:${b.rect.x.toFixed(2)},${b.rect.y.toFixed(2)},${b.rect.width.toFixed(2)},${b.rect.height.toFixed(2)}:${b.anchorPoint.x.toFixed(2)},${b.anchorPoint.y.toFixed(2)}:${lpts}`;
    })
    .join("|");

  return `N[${nodeStr}]E[${edgeStr}]B[${badgeStr}]`;
}

export function optimizeLayout(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  configPartial?: Partial<CustomLayoutConfig>,
): CustomLayoutResult {
  const config = resolveCustomLayoutConfig(configPartial);

  const optResult = searchBestLayoutState(nodes, edges, config);
  const bestEval = optResult.bestEvaluation;

  return {
    nodes: bestEval.nodes,
    edges: bestEval.routes,
    badges: bestEval.badges,
    crossings: bestEval.validation.crossings ?? [],
    validation: bestEval.validation,
    status: !bestEval.validation.isValid
      ? "invalid_hard_failure"
      : (bestEval.validation.metrics.unresolvedBadgeCount ?? 0) > 0 ||
          hasAestheticDefect(bestEval.validation)
        ? "unresolved_soft_conflicts"
        : "success",
    optimizationStats: optResult.stats,
    nodePositions: bestEval.nodeLayout.nodePositions,
    rankBandMap: bestEval.nodeLayout.rankBandMap,
    boundingBox: bestEval.nodeLayout.boundingBox,
  };
}

export function hasAestheticDefect(result: CustomLayoutResult["validation"]): boolean {
  const metrics = result.metrics;
  return (
    metrics.badgeNodeOverlaps > 0 ||
    metrics.badgeBadgeOverlaps > 0 ||
    metrics.badgeUnrelatedEdgeOverlaps > 0 ||
    metrics.crossingCount > 0 ||
    metrics.sharedEdgeSegmentLength > 0 ||
    (metrics.ordinaryLeaderCount ?? 0) > 0 ||
    (metrics.avoidableHairpinCount ?? 0) > 0 ||
    (metrics.excessBendCount ?? 0) > 0
  );
}
