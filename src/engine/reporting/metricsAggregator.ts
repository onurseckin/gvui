import type { GraphDataset, GraphNodeData, FindingDetail } from "../../types/graphData";
import type {
  AuditFindingSummary,
  CategoryTokenBreakdown,
  ExecutiveReportConfig,
  ExecutiveReportData,
  KpiScorecard,
  NodeTokenDetail,
  TokenAttribution,
} from "./types";
import { computeBlastRadiusMatrix } from "./blastRadiusEngine";
import { UNKNOWN_LABEL } from "../../state/graphSchema";

/** Folds a possibly-absent recorded cost into a running total that stays absent until one lands. */
function addRecordedCost(total: number | undefined, cost: number | undefined): number | undefined {
  return cost === undefined ? total : (total ?? 0) + cost;
}

/**
 * Extracts all audit findings from nodes and their metadata.
 */
export function extractAuditFindings(
  dataset: GraphDataset | null | undefined,
): AuditFindingSummary[] {
  if (!dataset || !Array.isArray(dataset.nodes)) {
    return [];
  }

  const findings: AuditFindingSummary[] = [];

  for (const node of dataset.nodes) {
    if (!node) continue;
    const nodeFindings = node.metadata?.findings;
    if (Array.isArray(nodeFindings)) {
      for (const f of nodeFindings) {
        if (f && typeof f === "object") {
          const item = f as FindingDetail;
          findings.push({
            id: String(item.id ?? `f-${node.id}-${findings.length + 1}`),
            nodeId: node.id,
            nodeName: node.name || node.id,
            severity:
              item.severity === "critical" || item.severity === "important"
                ? item.severity
                : "suggestion",
            observation: String(item.observation ?? "No observation provided"),
            remediation: item.remediation ? String(item.remediation) : undefined,
            status: item.status === "resolved" ? "resolved" : "open",
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Computes the critical path (longest weighted execution path) through the DAG.
 * Handles disconnected nodes, empty datasets, and cyclic graphs with visited Set cycle detection.
 */
export function findCriticalPath(dataset: GraphDataset | null | undefined): {
  path: string[];
  durationMs: number;
  nodeCount: number;
} {
  if (!dataset || !Array.isArray(dataset.nodes) || dataset.nodes.length === 0) {
    return { path: [], durationMs: 0, nodeCount: 0 };
  }

  const nodeMap = new Map<string, GraphNodeData>();
  const durationMap = new Map<string, number>();

  for (const node of dataset.nodes) {
    if (!node || !node.id) continue;
    nodeMap.set(node.id, node);
    const rawDur = Number(node.metrics?.durationMs ?? node.metadata?.durationMs ?? 0);
    const dur = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : 0;
    durationMap.set(node.id, dur);
  }

  if (nodeMap.size === 0) {
    return { path: [], durationMs: 0, nodeCount: 0 };
  }

  // Build adjacency list for forward edges
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const nodeId of nodeMap.keys()) {
    adj.set(nodeId, []);
    inDegree.set(nodeId, 0);
  }

  if (Array.isArray(dataset.edges)) {
    for (const edge of dataset.edges) {
      if (!edge || !edge.source || !edge.target) continue;
      if (nodeMap.has(edge.source) && nodeMap.has(edge.target) && edge.source !== edge.target) {
        adj.get(edge.source)?.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
      }
    }
  }

  // Memoized longest path search with cycle guard
  const memoDist = new Map<string, number>();
  const memoNext = new Map<string, string | null>();
  const visiting = new Set<string>();

  function getLongestFrom(u: string): number {
    if (memoDist.has(u)) {
      return memoDist.get(u) ?? 0;
    }
    if (visiting.has(u)) {
      // Cycle detected: return self duration and do not recurse infinitely
      return durationMap.get(u) ?? 0;
    }

    visiting.add(u);
    const selfDur = durationMap.get(u) ?? 0;
    let maxChildDist = 0;
    let bestChild: string | null = null;

    const children = adj.get(u) ?? [];
    for (const v of children) {
      const childDist = getLongestFrom(v);
      if (childDist > maxChildDist) {
        maxChildDist = childDist;
        bestChild = v;
      }
    }

    visiting.delete(u);
    const total = selfDur + maxChildDist;
    memoDist.set(u, total);
    memoNext.set(u, bestChild);
    return total;
  }

  // Find root nodes (inDegree === 0) or all nodes if graph is cyclic
  const rootCandidates = Array.from(nodeMap.keys()).filter((id) => (inDegree.get(id) ?? 0) === 0);
  const startNodes = rootCandidates.length > 0 ? rootCandidates : Array.from(nodeMap.keys());

  let maxTotalDist = -1;
  let bestStart: string | null = null;

  for (const start of startNodes) {
    const dist = getLongestFrom(start);
    if (dist > maxTotalDist) {
      maxTotalDist = dist;
      bestStart = start;
    }
  }

  // Reconstruct path
  const path: string[] = [];
  const pathVisited = new Set<string>();
  let curr = bestStart;

  while (curr && !pathVisited.has(curr)) {
    path.push(curr);
    pathVisited.add(curr);
    curr = memoNext.get(curr) ?? null;
  }

  const durationMs = path.reduce((sum, id) => sum + (durationMap.get(id) ?? 0), 0);

  return {
    path,
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
    nodeCount: path.length,
  };
}

/**
 * Computes the Gini coefficient / skew score (0 - 100) for duration distribution across nodes.
 */
function computeBottleneckScore(durations: number[]): number {
  if (durations.length <= 1) return 0;
  const filtered = durations.filter((d) => Number.isFinite(d) && d > 0);
  if (filtered.length === 0) return 0;

  const total = filtered.reduce((acc, d) => acc + d, 0);
  if (total <= 0 || !Number.isFinite(total)) return 0;

  const maxVal = Math.max(...filtered);
  const maxShare = maxVal / total;

  const normalized = Math.min(100, Math.round(maxShare * 100 * 1.2));
  return Number.isFinite(normalized) ? normalized : 0;
}

/**
 * Calculates graph KPI metrics, execution health, MTTR, and throughput.
 * Fully resilient against empty graphs, null datasets, and zero-duration scenarios (no NaN / Infinity).
 */
export function aggregateKpiScorecard(dataset: GraphDataset | null | undefined): KpiScorecard {
  if (!dataset || !Array.isArray(dataset.nodes) || dataset.nodes.length === 0) {
    return {
      totalNodes: 0,
      totalEdges: 0,
      successCount: 0,
      failureCount: 0,
      runningCount: 0,
      pendingCount: 0,
      skippedCount: 0,
      failureRate: 0,
      healthScore: 100,
      mttrMs: 0,
      totalDurationMs: 0,
      throughputNodesPerSec: 0,
      bottleneckScore: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      totalRetries: 0,
      totalRepairRounds: 0,
      recoveryEfficiency: 100,
      criticalPathDurationMs: 0,
      criticalPathNodeCount: 0,
    };
  }

  const totalNodes = dataset.nodes.length;
  const totalEdges = Array.isArray(dataset.edges) ? dataset.edges.length : 0;

  let successCount = 0;
  let failureCount = 0;
  let runningCount = 0;
  let pendingCount = 0;
  let skippedCount = 0;

  let promptTokens = 0;
  let completionTokens = 0;
  let reasoningTokens = 0;
  // Recorded dollars only; stays undefined when the run reported none.
  let totalCostUsd: number | undefined;
  let totalRetries = 0;
  let totalRepairRounds = 0;
  let recoveredCount = 0;

  const nodeDurations: number[] = [];
  const repairDurations: number[] = [];

  for (const node of dataset.nodes) {
    if (!node) continue;
    // Status is open vocabulary and optional: a node that never recorded one is not thereby
    // "pending" — that word is a specific claim about where the node sits, and this breakdown
    // only counts nodes into a bucket whose claim they actually made.
    const status = node.status;
    if (status === "success" || status === "cached") {
      successCount++;
    } else if (status === "error" || status === "warning") {
      failureCount++;
    } else if (status === "running") {
      runningCount++;
    } else if (status === "skipped") {
      skippedCount++;
    } else if (status === "pending") {
      pendingCount++;
    }

    // Retries & Repair rounds
    const retries = Number(node.metrics?.retries ?? 0);
    const repairRounds = Number(node.metadata?.repairRounds ?? node.metrics?.repairRounds ?? 0);
    if (Number.isFinite(retries)) totalRetries += retries;
    if (Number.isFinite(repairRounds)) totalRepairRounds += repairRounds;

    if (repairRounds > 0 || retries > 0) {
      if (status === "success" || status === "cached") {
        recoveredCount++;
      }
      const dur = Number(node.metrics?.durationMs ?? node.metadata?.durationMs ?? 0);
      if (Number.isFinite(dur) && dur > 0) {
        repairDurations.push(dur);
      }
    }

    // Timing & durations
    const rawDur = Number(node.metrics?.durationMs ?? node.metadata?.durationMs ?? 0);
    const duration = Number.isFinite(rawDur) && rawDur > 0 ? rawDur : 0;
    nodeDurations.push(duration);

    // Tokens
    const tIn = Number(node.metrics?.tokensIn ?? node.metrics?.tokens?.promptTokens ?? 0);
    const tOut = Number(node.metrics?.tokensOut ?? node.metrics?.tokens?.completionTokens ?? 0);
    const tReasoning = Number(node.metrics?.tokens?.reasoningTokens ?? 0);
    const nodeCost = node.metrics?.costUsd;

    if (Number.isFinite(tIn)) promptTokens += tIn;
    if (Number.isFinite(tOut)) completionTokens += tOut;
    if (Number.isFinite(tReasoning)) reasoningTokens += tReasoning;
    if (typeof nodeCost === "number" && Number.isFinite(nodeCost)) {
      totalCostUsd = (totalCostUsd ?? 0) + nodeCost;
    }
  }

  const totalTokens = promptTokens + completionTokens + reasoningTokens;
  const totalDurationMs = nodeDurations.reduce((acc, d) => acc + d, 0);

  const rawFailureRate = totalNodes > 0 ? (failureCount / totalNodes) * 100 : 0;
  const failureRate = Number.isFinite(rawFailureRate) ? Math.round(rawFailureRate * 10) / 10 : 0;

  // Mean Time To Recovery (MTTR) with zero/empty check
  const rawMttr =
    repairDurations.length > 0
      ? repairDurations.reduce((a, b) => a + b, 0) / repairDurations.length
      : 0;
  const mttrMs = Number.isFinite(rawMttr) ? Math.round(rawMttr) : 0;

  // Throughput: nodes processed per second (avoids division by 0)
  const rawThroughput =
    totalDurationMs > 0 ? (successCount + failureCount) / (totalDurationMs / 1000) : 0;
  const throughputNodesPerSec = Number.isFinite(rawThroughput)
    ? Math.round(rawThroughput * 100) / 100
    : 0;

  const bottleneckScore = computeBottleneckScore(nodeDurations);

  // Recovery efficiency: percent of repaired/retried nodes that successfully recovered
  const attemptedRecoveries =
    totalRepairRounds > 0 || totalRetries > 0
      ? recoveredCount + (failureCount > 0 ? failureCount : 0)
      : 0;
  const rawEfficiency =
    attemptedRecoveries > 0
      ? (recoveredCount / attemptedRecoveries) * 100
      : failureCount === 0
        ? 100
        : 0;
  const recoveryEfficiency = Number.isFinite(rawEfficiency) ? Math.round(rawEfficiency) : 100;

  // Critical path analysis
  const critPath = findCriticalPath(dataset);

  // Audit findings penalty
  const findings = extractAuditFindings(dataset);
  const openCriticalFindings = findings.filter(
    (f) => f.severity === "critical" && f.status === "open",
  ).length;
  const openImportantFindings = findings.filter(
    (f) => f.severity === "important" && f.status === "open",
  ).length;

  // Composite health score calculation (0 - 100)
  let healthScore = 100;
  healthScore -= failureRate * 0.45;
  healthScore -= bottleneckScore * 0.12;
  healthScore -= openCriticalFindings * 10;
  healthScore -= openImportantFindings * 4;
  if (totalRepairRounds > 0 && recoveryEfficiency < 50) {
    healthScore -= 10;
  }
  healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));
  if (!Number.isFinite(healthScore)) healthScore = 100;

  return {
    totalNodes,
    totalEdges,
    successCount,
    failureCount,
    runningCount,
    pendingCount,
    skippedCount,
    failureRate,
    healthScore,
    mttrMs,
    totalDurationMs: Number.isFinite(totalDurationMs) ? totalDurationMs : 0,
    throughputNodesPerSec,
    bottleneckScore,
    totalTokens,
    promptTokens,
    completionTokens,
    reasoningTokens,
    totalCostUsd: totalCostUsd === undefined ? undefined : Math.round(totalCostUsd * 10000) / 10000,
    totalRetries,
    totalRepairRounds,
    recoveryEfficiency,
    criticalPathDurationMs: critPath.durationMs,
    criticalPathNodeCount: critPath.nodeCount,
  };
}

/**
 * Aggregates token consumption and cost across nodes, models, tiers, and sections.
 */
export function aggregateTokenAttribution(
  dataset: GraphDataset | null | undefined,
): TokenAttribution {
  if (!dataset || !Array.isArray(dataset.nodes) || dataset.nodes.length === 0) {
    return {
      totalTokens: 0,
      byNode: [],
      byModel: [],
      byTier: [],
      bySection: [],
    };
  }

  // Pre-map sections
  const sectionTitleMap = new Map<string, string>();
  const nodeToSectionMap = new Map<string, { id: string; title: string }>();

  if (Array.isArray(dataset.sections)) {
    for (const sec of dataset.sections) {
      if (!sec) continue;
      sectionTitleMap.set(sec.id, sec.title || sec.id);
      if (Array.isArray(sec.nodeIds)) {
        for (const nid of sec.nodeIds) {
          nodeToSectionMap.set(nid, { id: sec.id, title: sec.title || sec.id });
        }
      }
    }
  }

  let totalTokens = 0;
  // Recorded dollars only; stays undefined when the run reported none.
  let totalCostUsd: number | undefined;

  const rawNodeDetails: Array<{
    nodeId: string;
    nodeName: string;
    kind?: string;
    model?: string;
    tier?: string;
    tokensIn: number;
    tokensOut: number;
    reasoningTokens: number;
    totalTokens: number;
    costUsd?: number;
    durationMs: number;
  }> = [];

  const modelMap = new Map<string, { tokens: number; costUsd?: number; nodeCount: number }>();
  const tierMap = new Map<string, { tokens: number; costUsd?: number; nodeCount: number }>();
  const sectionMap = new Map<
    string,
    { title: string; tokens: number; costUsd?: number; nodeCount: number }
  >();

  for (const node of dataset.nodes) {
    if (!node) continue;
    const tokensIn = Number(node.metrics?.tokensIn ?? node.metrics?.tokens?.promptTokens ?? 0);
    const tokensOut = Number(
      node.metrics?.tokensOut ?? node.metrics?.tokens?.completionTokens ?? 0,
    );
    const reasoningTokens = Number(node.metrics?.tokens?.reasoningTokens ?? 0);
    const nodeTotalTokens = Math.max(
      Number(node.metrics?.tokens?.totalTokens ?? 0),
      tokensIn + tokensOut + reasoningTokens,
    );
    const rawCost = node.metrics?.costUsd;
    const costUsd = typeof rawCost === "number" && Number.isFinite(rawCost) ? rawCost : undefined;
    const durationMs = Number(node.metrics?.durationMs ?? node.metadata?.durationMs ?? 0);

    totalTokens += nodeTotalTokens;
    if (costUsd !== undefined) totalCostUsd = (totalCostUsd ?? 0) + costUsd;

    // Neither a model name nor a tier is ever invented here: a node the host said nothing about
    // is grouped under "unknown" rather than under a plausible-looking vendor default.
    const reportedModel =
      node.telemetry?.model?.value || node.model || node.harnessModel || node.hostAgent?.model;
    const modelName = reportedModel ? String(reportedModel) : UNKNOWN_LABEL;
    const reportedTier = node.telemetry?.modelTier?.value || node.tier || node.hostAgent?.tier;
    const tierName = reportedTier ? String(reportedTier).toUpperCase() : UNKNOWN_LABEL;

    const secInfo = nodeToSectionMap.get(node.id) ?? { id: "ungrouped", title: "General Pipeline" };

    rawNodeDetails.push({
      nodeId: node.id,
      nodeName: node.name || node.id,
      kind: node.kind,
      model: modelName,
      tier: tierName,
      tokensIn,
      tokensOut,
      reasoningTokens,
      totalTokens: nodeTotalTokens,
      costUsd,
      durationMs,
    });

    // Model group
    const mPrev = modelMap.get(modelName) ?? { tokens: 0, nodeCount: 0 };
    modelMap.set(modelName, {
      tokens: mPrev.tokens + nodeTotalTokens,
      costUsd: addRecordedCost(mPrev.costUsd, costUsd),
      nodeCount: mPrev.nodeCount + 1,
    });

    // Tier group
    const tPrev = tierMap.get(tierName) ?? { tokens: 0, nodeCount: 0 };
    tierMap.set(tierName, {
      tokens: tPrev.tokens + nodeTotalTokens,
      costUsd: addRecordedCost(tPrev.costUsd, costUsd),
      nodeCount: tPrev.nodeCount + 1,
    });

    // Section group
    const sPrev = sectionMap.get(secInfo.id) ?? {
      title: secInfo.title,
      tokens: 0,
      nodeCount: 0,
    };
    sectionMap.set(secInfo.id, {
      title: secInfo.title,
      tokens: sPrev.tokens + nodeTotalTokens,
      costUsd: addRecordedCost(sPrev.costUsd, costUsd),
      nodeCount: sPrev.nodeCount + 1,
    });
  }

  // Format node token details with percentages
  const byNode: NodeTokenDetail[] = rawNodeDetails
    .map((item) => ({
      ...item,
      tokenPercentage:
        totalTokens > 0 ? Math.round((item.totalTokens / totalTokens) * 1000) / 10 : 0,
      costPercentage:
        totalCostUsd !== undefined && totalCostUsd > 0
          ? Math.round(((item.costUsd ?? 0) / totalCostUsd) * 1000) / 10
          : undefined,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens || (b.costUsd ?? 0) - (a.costUsd ?? 0));

  // Format category breakdowns
  const byModel: CategoryTokenBreakdown[] = Array.from(modelMap.entries())
    .map(([category, data]) => ({
      category,
      tokens: data.tokens,
      costUsd: data.costUsd === undefined ? undefined : Math.round(data.costUsd * 10000) / 10000,
      nodeCount: data.nodeCount,
      percentage: totalTokens > 0 ? Math.round((data.tokens / totalTokens) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const byTier: CategoryTokenBreakdown[] = Array.from(tierMap.entries())
    .map(([category, data]) => ({
      category,
      tokens: data.tokens,
      costUsd: data.costUsd === undefined ? undefined : Math.round(data.costUsd * 10000) / 10000,
      nodeCount: data.nodeCount,
      percentage: totalTokens > 0 ? Math.round((data.tokens / totalTokens) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const bySection: CategoryTokenBreakdown[] = Array.from(sectionMap.entries())
    .map(([, data]) => ({
      category: data.title,
      tokens: data.tokens,
      costUsd: data.costUsd === undefined ? undefined : Math.round(data.costUsd * 10000) / 10000,
      nodeCount: data.nodeCount,
      percentage: totalTokens > 0 ? Math.round((data.tokens / totalTokens) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  return {
    totalTokens,
    totalCostUsd: totalCostUsd === undefined ? undefined : Math.round(totalCostUsd * 10000) / 10000,
    byNode,
    byModel,
    byTier,
    bySection,
  };
}

/**
 * Builds the complete ExecutiveReportData package from the dataset.
 */
export function buildExecutiveReportData(
  dataset: GraphDataset | null | undefined,
  config?: Partial<ExecutiveReportConfig>,
): ExecutiveReportData {
  const safeDataset: GraphDataset = dataset ?? {
    id: "empty-report",
    title: "Executive Execution Report",
    nodes: [],
    edges: [],
  };

  const kpi = aggregateKpiScorecard(safeDataset);
  const tokenAttribution = aggregateTokenAttribution(safeDataset);
  const blastRadius = computeBlastRadiusMatrix(safeDataset);
  const findings = extractAuditFindings(safeDataset);
  const critPath = findCriticalPath(safeDataset);

  const nowIso = new Date().toISOString();

  const finalConfig: ExecutiveReportConfig = {
    title: config?.title || safeDataset.title || "Executive Pipeline & Incident Report",
    subtitle:
      config?.subtitle ||
      safeDataset.description ||
      "Architecture, KPIs, and Downstream Risk Analysis",
    generatedAt: config?.generatedAt || nowIso,
    generatedBy: config?.generatedBy || "GVUI Executive Intelligence Suite",
    includeScorecard: config?.includeScorecard !== false,
    includeBlastRadius: config?.includeBlastRadius !== false,
    includeTokenAttribution: config?.includeTokenAttribution !== false,
    includeNodeBreakdown: config?.includeNodeBreakdown !== false,
    includeFindings: config?.includeFindings !== false,
    theme: config?.theme || "dark",
    customNotes: config?.customNotes,
    format: config?.format || "html",
  };

  return {
    datasetId: safeDataset.id,
    datasetTitle: safeDataset.title || safeDataset.id,
    datasetDescription: safeDataset.description,
    generatedAt: nowIso,
    kpi,
    tokenAttribution,
    blastRadius,
    findings,
    criticalPath: critPath.path,
    config: finalConfig,
  };
}
