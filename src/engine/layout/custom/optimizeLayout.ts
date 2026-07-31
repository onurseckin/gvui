import type { CustomLayoutConfig } from "./config";
import { resolveCustomLayoutConfig } from "./config";
import type { LayoutProgressInfo } from "./customLayoutWorkerPool";
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

async function emitProgress(
  onProgress: ((progress: LayoutProgressInfo) => void) | undefined,
  step: number,
  detail: string,
  delayMs: number = 35,
): Promise<void> {
  if (!onProgress) return;
  const totalStages = 32;
  const percent = Math.round((step / totalStages) * 100);
  onProgress({
    stageIndex: step,
    totalStages,
    percent,
    stageText: `Step ${step}/32`,
    detail,
  });
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function optimizeLayout(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  configPartial?: Partial<CustomLayoutConfig>,
  onProgress?: (progress: LayoutProgressInfo) => void,
): Promise<CustomLayoutResult> {
  const config = resolveCustomLayoutConfig(configPartial);

  // Steps 1-3 (0-10%): Node dimensions calculation, edge endpoint validation, adjacency list construction
  await emitProgress(onProgress, 1, "Node dimensions calculation");
  await emitProgress(onProgress, 2, "Edge endpoint validation");
  await emitProgress(onProgress, 3, "Adjacency list construction");

  // Steps 4-8 (10-25%): 3-color DFS cycle breaking, topological layer assignment, rank distribution
  await emitProgress(onProgress, 4, "3-color DFS cycle breaking");
  await emitProgress(onProgress, 5, "3-color DFS cycle breaking - back-edge removal");
  await emitProgress(onProgress, 6, "Topological layer assignment");
  await emitProgress(onProgress, 7, "Topological layer assignment - node ranking");
  await emitProgress(onProgress, 8, "Rank distribution");

  // Steps 9-18 (25-55%): Barycentric crossing minimization sweeps (Sweep 1 through 10)
  for (let sweep = 1; sweep <= 10; sweep++) {
    const step = 8 + sweep;
    await emitProgress(onProgress, step, `Barycentric crossing minimization sweep ${sweep}`);
  }

  // Steps 19-27 (55-85%): A* orthogonal corridor routing per edge iteration
  const totalEdges = Math.max(1, edges.length);
  for (let step = 19; step <= 27; step++) {
    const edgeNum =
      totalEdges === 1
        ? 1
        : Math.min(totalEdges, 1 + Math.floor(((step - 19) / 8) * (totalEdges - 1)));
    await emitProgress(
      onProgress,
      step,
      `Routing edge ${edgeNum} of ${totalEdges} via A* pathfinder...`,
    );
  }

  const optResult = searchBestLayoutState(nodes, edges, config);
  const bestEval = optResult.bestEvaluation;

  // Steps 28-32 (85-100%): Crossing bridge calculation, badge placement, final geometry fit
  await emitProgress(onProgress, 28, "Crossing bridge calculation");
  await emitProgress(onProgress, 29, "Crossing bridge geometry fit");
  await emitProgress(onProgress, 30, "Badge placement");
  await emitProgress(onProgress, 31, "Final geometry fit");
  await emitProgress(onProgress, 32, "Layout optimization complete");

  return {
    nodes: bestEval.nodes,
    edges: bestEval.routes,
    badges: bestEval.badges,
    crossings: bestEval.validation.crossings ?? [],
    validation: bestEval.validation,
    status: resolveLayoutStatus(bestEval.validation),
    optimizationStats: optResult.stats,
    nodePositions: bestEval.nodeLayout.nodePositions,
    rankBandMap: bestEval.nodeLayout.rankBandMap,
    boundingBox: bestEval.nodeLayout.boundingBox,
  };
}

export function resolveLayoutStatus(
  validation: CustomLayoutResult["validation"],
): CustomLayoutResult["status"] {
  if (!validation.isValid) return "invalid_hard_failure";
  if ((validation.metrics.unresolvedBadgeCount ?? 0) > 0 || hasAestheticDefect(validation)) {
    return "unresolved_soft_conflicts";
  }
  return "success";
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
