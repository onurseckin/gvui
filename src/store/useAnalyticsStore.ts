import { create } from "zustand";
import type {
  CommandExecutionDetail,
  EdgeTrafficExchange,
  FindingDetail,
  GraphDataset,
  GraphNodeData,
  NodeKind,
  NodeStatus,
} from "../types/graphData";

// ============================================================================
// Core Analytics Types
// ============================================================================

export interface PhaseVelocityMetric {
  step: number;
  label: string;
  nodeCount: number;
  durationMs: number;
  tokens: number;
  /** Sum of the recorded costs in this phase. Absent when no node in it recorded one. */
  costUsd?: number;
  velocityNodesPerMin: number;
  hasErrors: boolean;
}

export interface RunVelocityMetrics {
  totalWallClockMs: number;
  totalCognitiveMs: number;
  totalToolMs: number;
  totalOverheadMs: number;
  cognitivePercentage: number;
  toolPercentage: number;
  overheadPercentage: number;
  wallClockVsCognitiveRatio: number;
  nodesPerMinute: number;
  tokensPerSecond: number;
  phaseVelocities: PhaseVelocityMetric[];
  fastestStep: PhaseVelocityMetric | null;
  slowestStep: PhaseVelocityMetric | null;
  avgStepDurationMs: number;
}

export interface ConcurrencyBin {
  binIndex: number;
  startTimeMs: number;
  endTimeMs: number;
  timeLabel: string;
  activeCount: number;
  intensity: number; // 0.0 to 1.0 normalized
  nodeIds: string[];
  nodeNames: string[];
  models: string[];
}

export interface ConcurrencyHeatmapMetrics {
  peakConcurrency: number;
  averageConcurrency: number;
  bins: ConcurrencyBin[];
  maxStepConcurrency: number;
  stepConcurrency: Array<{ step: number; count: number; nodeIds: string[] }>;
}

export interface ModelTokenBreakdown {
  model: string;
  tier: string;
  nodeCount: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  /** Sum of the recorded costs for this model. Absent when none of its nodes recorded one. */
  costUsd?: number;
  percentageOfTokens: number;
  /** Absent whenever the run has no recorded cost to take a share of. */
  percentageOfCost?: number;
}

export interface RoleTokenBreakdown {
  role: "prompt" | "completion" | "reasoning" | "cacheWrite" | "cacheRead";
  label: string;
  tokens: number;
  percentage: number;
}

export interface TierTokenBreakdown {
  tier: "xs" | "s" | "m" | "l";
  nodeCount: number;
  tokens: number;
  /** Sum of the recorded costs on this tier's nodes. Absent when none recorded one. */
  costUsd?: number;
}

export interface TokenDistributionMetrics {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalReasoningTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalTokens: number;
  /** Recorded dollars only, summed. Absent when the run carries no cost at all. */
  totalCostUsd?: number;
  cacheEfficiencyPercent: number; // cacheRead / (cacheRead + prompt) * 100
  byModel: ModelTokenBreakdown[];
  byRole: RoleTokenBreakdown[];
  /** Only tiers the host actually reported. A tier is never inferred from a model name. */
  byTier: TierTokenBreakdown[];
}

export interface RepairHistogramBin {
  roundsLabel: string;
  roundCount: number; // 0, 1, 2, 3+
  nodeCount: number;
  percentage: number;
  nodeIds: string[];
  nodeNames: string[];
}

export interface RepairedNodeDetail {
  nodeId: string;
  nodeName: string;
  repairRounds: number;
  status: NodeStatus | "unknown";
  reasons: string[];
}

export interface RepairCycleMetrics {
  totalRepairs: number;
  firstPassSuccessCount: number;
  firstPassSuccessRate: number; // 0 - 100
  maxRepairsOnNode: number;
  avgRepairsPerNode: number;
  repairedNodesCount: number;
  bins: RepairHistogramBin[];
  repairedNodes: RepairedNodeDetail[];
}

export type ErrorCategoryKey =
  | "syntax_type"
  | "test_assertion"
  | "lint_format"
  | "validation_rejection"
  | "timeout_deadlock"
  | "rate_limit_quota"
  | "command_failure"
  | "runtime_unhandled";

export interface ErrorTaxonomyItem {
  category: ErrorCategoryKey;
  label: string;
  count: number;
  percentage: number;
  affectedNodeIds: string[];
  sampleMessages: string[];
  severity: "critical" | "important" | "warning";
}

export interface ErrorTaxonomyMetrics {
  totalErrors: number;
  unresolvedCount: number;
  resolvedCount: number;
  errorNodeCount: number;
  errorRate: number; // error nodes / total nodes * 100
  items: ErrorTaxonomyItem[];
}

export interface CriticalPathNodeInfo {
  nodeId: string;
  nodeName: string;
  kind?: NodeKind;
  status?: NodeStatus;
  durationMs: number;
  cumulativeDurationMs: number;
  percentOfCriticalPath: number;
  step?: number;
  model?: string;
}

export interface BottleneckRankItem {
  rank: number;
  nodeId: string;
  nodeName: string;
  kind?: NodeKind;
  status?: NodeStatus;
  durationMs: number;
  percentOfTotalDuration: number;
  isOnCriticalPath: boolean;
}

export interface CriticalPathMetrics {
  pathNodeIds: string[];
  pathNodes: CriticalPathNodeInfo[];
  totalCriticalPathDurationMs: number;
  longestNodeInPath: CriticalPathNodeInfo | null;
  bottleneckRankings: BottleneckRankItem[];
  estimatedQueueWaitMs: number;
  parallelEfficiencyPercent: number;
  criticalPathRatio: number;
}

export interface AnalyticsMetrics {
  totalNodes: number;
  completedNodes: number;
  successNodes: number;
  errorNodes: number;
  runningNodes: number;
  pendingNodes: number;
  skippedNodes: number;
  successRate: number; // 0-100
  runVelocity: RunVelocityMetrics;
  concurrency: ConcurrencyHeatmapMetrics;
  tokenDistribution: TokenDistributionMetrics;
  repairCycles: RepairCycleMetrics;
  errorTaxonomy: ErrorTaxonomyMetrics;
  criticalPath: CriticalPathMetrics;
}

// ============================================================================
// Helper Utilities & Extraction Functions
// ============================================================================

export function safeNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/**
 * Host-reported tier only. Inferring one from a model name would hardcode vendor names and hand
 * back a guess that renders identically to a measurement, so an unreported tier stays unspecified.
 */
export function resolveNodeTier(node: GraphNodeData): "xs" | "s" | "m" | "l" | "unspecified" {
  const candidates = [node.telemetry?.modelTier?.value, node.tier, node.hostAgent?.tier];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const normalized = candidate.toLowerCase();
    if (normalized === "xs" || normalized === "s" || normalized === "m" || normalized === "l") {
      return normalized;
    }
  }
  return "unspecified";
}

export function extractNodeModel(node: GraphNodeData): string {
  const reported = node.telemetry?.model?.value;
  if (typeof reported === "string" && reported.trim().length > 0) return reported.trim();
  if (typeof node.model === "string" && node.model.trim().length > 0) return node.model.trim();
  if (typeof node.harnessModel === "string" && node.harnessModel.trim().length > 0) {
    return node.harnessModel.trim();
  }
  if (typeof node.hostAgent?.model === "string" && node.hostAgent.model.trim().length > 0) {
    return node.hostAgent.model.trim();
  }
  const metaModel = (node.metadata as Record<string, unknown> | undefined)?.model;
  if (typeof metaModel === "string" && metaModel.trim().length > 0) {
    return metaModel.trim();
  }
  return "Unspecified Model";
}

export interface ExtractedTokens {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  /** Recorded dollars only. Absent when the node carries no cost figure. */
  costUsd?: number;
}

export function extractNodeTokens(node: GraphNodeData): ExtractedTokens {
  const metrics = node.metrics;
  const meta = node.metadata;
  const rawTokenObj = (metrics?.tokens ?? meta?.tokens) as Record<string, unknown> | undefined;

  const rawPrompt =
    rawTokenObj?.promptTokens ??
    rawTokenObj?.inputTokens ??
    metrics?.tokensIn ??
    (meta as Record<string, unknown> | undefined)?.tokensIn;
  const promptTokens = Math.max(0, safeNumber(rawPrompt));

  const rawCompletion =
    rawTokenObj?.completionTokens ??
    rawTokenObj?.outputTokens ??
    metrics?.tokensOut ??
    (meta as Record<string, unknown> | undefined)?.tokensOut;
  const completionTokens = Math.max(0, safeNumber(rawCompletion));

  const rawReasoning = rawTokenObj?.reasoningTokens ?? rawTokenObj?.thinkingTokens;
  const reasoningTokens = Math.max(0, safeNumber(rawReasoning));

  const rawCacheCreation = rawTokenObj?.cacheCreationTokens ?? rawTokenObj?.cacheWriteTokens;
  const cacheCreationTokens = Math.max(0, safeNumber(rawCacheCreation));

  const rawCacheRead = rawTokenObj?.cacheReadTokens;
  const cacheReadTokens = Math.max(0, safeNumber(rawCacheRead));

  let totalTokens = promptTokens + completionTokens + reasoningTokens + cacheCreationTokens;
  const rawTotal = rawTokenObj?.totalTokens;
  if (rawTotal !== undefined) {
    totalTokens = Math.max(totalTokens, safeNumber(rawTotal));
  }

  // Recorded dollars only: this codebase holds no rate card, so tokens never become money here.
  const rawCost = metrics?.costUsd ?? (meta as Record<string, unknown> | undefined)?.costUsd;
  const costUsd = rawCost === undefined ? undefined : Math.max(0, safeNumber(rawCost));

  return {
    promptTokens,
    completionTokens,
    reasoningTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens,
    costUsd,
  };
}

export function extractNodeDuration(node: GraphNodeData): number {
  if (node.metrics?.durationMs !== undefined) {
    return Math.max(0, safeNumber(node.metrics.durationMs));
  }
  if (node.metadata?.durationMs !== undefined) {
    return Math.max(0, safeNumber(node.metadata.durationMs));
  }
  const wall =
    node.metrics?.timingBreakdown?.wallDurationMs ??
    node.metadata?.timingBreakdown?.wallDurationMs ??
    node.metrics?.timing?.wallDurationMs ??
    node.metadata?.timing?.wallDurationMs;
  if (wall !== undefined) {
    return Math.max(0, safeNumber(wall));
  }
  const commands = node.metadata?.commands;
  if (Array.isArray(commands) && commands.length > 0) {
    let cmdDuration = 0;
    for (const cmd of commands) {
      if (typeof cmd === "object" && cmd !== null) {
        if (cmd.durationMs !== undefined) {
          cmdDuration += Math.max(0, safeNumber(cmd.durationMs));
        } else if (cmd.startedAt && cmd.finishedAt) {
          const start = new Date(cmd.startedAt).getTime();
          const end = new Date(cmd.finishedAt).getTime();
          if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
            cmdDuration += end - start;
          }
        }
      }
    }
    if (cmdDuration > 0) return cmdDuration;
  }
  return 0;
}

export function extractNodeRepairRounds(node: GraphNodeData): number {
  if (
    typeof node.metrics?.repairRounds === "number" &&
    Number.isFinite(node.metrics.repairRounds)
  ) {
    return Math.max(0, Math.floor(node.metrics.repairRounds));
  }
  if (
    typeof node.metadata?.repairRounds === "number" &&
    Number.isFinite(node.metadata.repairRounds)
  ) {
    return Math.max(0, Math.floor(node.metadata.repairRounds));
  }
  if (typeof node.metrics?.retries === "number" && Number.isFinite(node.metrics.retries)) {
    return Math.max(0, Math.floor(node.metrics.retries));
  }
  if (typeof node.metadata?.attempt === "number" && node.metadata.attempt > 1) {
    return Math.max(0, Math.floor(node.metadata.attempt - 1));
  }
  if (typeof node.metadata?.round === "number" && node.metadata.round > 1) {
    return Math.max(0, Math.floor(node.metadata.round - 1));
  }
  const remediations = node.provenance?.remediations ?? node.metadata?.findings;
  if (Array.isArray(remediations) && remediations.length > 0) {
    return remediations.length;
  }
  return 0;
}

export function categorizeError(message: string): ErrorCategoryKey {
  const lower = message.toLowerCase();

  // 1. Rate limits and quotas
  if (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("quota exceeded") ||
    lower.includes("throttled") ||
    lower.includes("too many requests")
  ) {
    return "rate_limit_quota";
  }

  // 2. Timeouts & Deadlocks
  if (
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("deadline exceeded") ||
    lower.includes("lease expired") ||
    lower.includes("deadlock")
  ) {
    return "timeout_deadlock";
  }

  // 3. Validation & Gate rejections
  if (
    lower.includes("validation reject") ||
    lower.includes("validation gate") ||
    lower.includes("validator reject") ||
    lower.includes("validation failure") ||
    lower.includes("gate rejection") ||
    lower.includes("audit finding") ||
    lower.includes("proof missing") ||
    lower.includes("rejection") ||
    lower.includes("validator") ||
    lower.includes("revalidation")
  ) {
    return "validation_rejection";
  }

  // 4. Test & Assertion Failures
  if (
    lower.includes("assertion failed") ||
    lower.includes("expect(") ||
    lower.includes("vitest") ||
    lower.includes("bun test") ||
    lower.includes("failed test") ||
    lower.includes("tests failed") ||
    lower.includes("assertion error") ||
    lower.includes("assert") ||
    lower.includes("jest")
  ) {
    return "test_assertion";
  }

  // 5. Lint & Style Violations
  if (
    lower.includes("oxlint") ||
    lower.includes("eslint") ||
    lower.includes("prettier") ||
    lower.includes("linter") ||
    lower.includes("lint violation") ||
    lower.includes("style violation") ||
    lower.includes("format error") ||
    lower.includes("lint")
  ) {
    return "lint_format";
  }

  // 6. Command & Shell Failures
  if (
    lower.includes("exit code") ||
    lower.includes("command failed") ||
    lower.includes("spawn error") ||
    lower.includes("sh:") ||
    lower.includes("bash:") ||
    lower.includes("shell error") ||
    lower.includes("process exited")
  ) {
    return "command_failure";
  }

  // 7. Syntax & Type Errors
  if (
    lower.includes("typescript") ||
    lower.includes("type error") ||
    lower.includes("typeerror") ||
    lower.includes("syntax error") ||
    lower.includes("cannot find name") ||
    lower.includes("parse error") ||
    /\bts\d{4}\b/i.test(message) ||
    /\b(syntax|typescript|type)\b/i.test(message)
  ) {
    return "syntax_type";
  }

  return "runtime_unhandled";
}

// ============================================================================
// Core Analytics Calculation Engine
// ============================================================================

export function computeAnalyticsMetrics(dataset: GraphDataset | null): AnalyticsMetrics {
  const emptyMetrics: AnalyticsMetrics = {
    totalNodes: 0,
    completedNodes: 0,
    successNodes: 0,
    errorNodes: 0,
    runningNodes: 0,
    pendingNodes: 0,
    skippedNodes: 0,
    successRate: 0,
    runVelocity: {
      totalWallClockMs: 0,
      totalCognitiveMs: 0,
      totalToolMs: 0,
      totalOverheadMs: 0,
      cognitivePercentage: 0,
      toolPercentage: 0,
      overheadPercentage: 0,
      wallClockVsCognitiveRatio: 0,
      nodesPerMinute: 0,
      tokensPerSecond: 0,
      phaseVelocities: [],
      fastestStep: null,
      slowestStep: null,
      avgStepDurationMs: 0,
    },
    concurrency: {
      peakConcurrency: 0,
      averageConcurrency: 0,
      bins: [],
      maxStepConcurrency: 0,
      stepConcurrency: [],
    },
    tokenDistribution: {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalReasoningTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      totalTokens: 0,
      cacheEfficiencyPercent: 0,
      byModel: [],
      byRole: [],
      byTier: [],
    },
    repairCycles: {
      totalRepairs: 0,
      firstPassSuccessCount: 0,
      firstPassSuccessRate: 0,
      maxRepairsOnNode: 0,
      avgRepairsPerNode: 0,
      repairedNodesCount: 0,
      bins: [],
      repairedNodes: [],
    },
    errorTaxonomy: {
      totalErrors: 0,
      unresolvedCount: 0,
      resolvedCount: 0,
      errorNodeCount: 0,
      errorRate: 0,
      items: [],
    },
    criticalPath: {
      pathNodeIds: [],
      pathNodes: [],
      totalCriticalPathDurationMs: 0,
      longestNodeInPath: null,
      bottleneckRankings: [],
      estimatedQueueWaitMs: 0,
      parallelEfficiencyPercent: 0,
      criticalPathRatio: 0,
    },
  };

  if (!dataset || !Array.isArray(dataset.nodes) || dataset.nodes.length === 0) {
    return emptyMetrics;
  }

  const nodes = dataset.nodes;
  const edges = Array.isArray(dataset.edges) ? dataset.edges : [];
  const totalNodes = nodes.length;

  let successNodes = 0;
  let errorNodes = 0;
  let runningNodes = 0;
  let pendingNodes = 0;
  let skippedNodes = 0;

  for (const node of nodes) {
    const status = node.status ?? "pending";
    if (status === "success" || status === "cached") successNodes++;
    else if (status === "error") errorNodes++;
    else if (status === "running") runningNodes++;
    else if (status === "skipped") skippedNodes++;
    else pendingNodes++;
  }

  const completedNodes = successNodes + errorNodes;
  const successRate = completedNodes > 0 ? (successNodes / completedNodes) * 100 : 0;

  // --------------------------------------------------------------------------
  // 1. Run Velocity & Durations
  // --------------------------------------------------------------------------
  let totalCognitiveMs = 0;
  let totalToolMs = 0;
  let sumNodeDurationsMs = 0;

  for (const node of nodes) {
    const duration = extractNodeDuration(node);
    sumNodeDurationsMs += duration;

    const timing =
      node.metrics?.timingBreakdown ??
      node.metadata?.timingBreakdown ??
      node.metrics?.timing ??
      node.metadata?.timing;
    const thinkMs = safeNumber(timing?.thinkDurationMs ?? timing?.cognitiveLatencyMs);
    const toolMs = safeNumber(timing?.toolDurationMs ?? timing?.activeCommandDurationMs);

    totalCognitiveMs += thinkMs;
    totalToolMs += toolMs;
  }

  // --------------------------------------------------------------------------
  // 6. Critical Path DAG Analysis (Longest Path in DAG)
  // --------------------------------------------------------------------------
  const nodeMap = new Map<string, GraphNodeData>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Build adjacency list excluding cycle edges
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    if (edge.isCycle) continue;
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      adj.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }
  }

  // Topological sorting via Kahn's algorithm (safe with cycle detection)
  const queue: string[] = [];
  for (const [nodeId, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(nodeId);
  }

  const topoOrder: string[] = [];
  const tempInDegree = new Map(inDegree);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoOrder.push(curr);
    for (const neighbor of adj.get(curr) ?? []) {
      const nextDeg = (tempInDegree.get(neighbor) ?? 1) - 1;
      tempInDegree.set(neighbor, nextDeg);
      if (nextDeg === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (topoOrder.length < nodes.length) {
    for (const node of nodes) {
      if (!topoOrder.includes(node.id)) {
        topoOrder.push(node.id);
      }
    }
  }

  // Dynamic programming for longest path
  const dist = new Map<string, number>();
  const hops = new Map<string, number>();
  const prevNode = new Map<string, string | null>();

  for (const node of nodes) {
    dist.set(node.id, extractNodeDuration(node));
    hops.set(node.id, 1);
    prevNode.set(node.id, null);
  }

  for (const u of topoOrder) {
    const uDist = dist.get(u) ?? 0;
    const uHops = hops.get(u) ?? 1;
    for (const v of adj.get(u) ?? []) {
      const vDuration = extractNodeDuration(nodeMap.get(v)!);
      const newDist = uDist + vDuration;
      const currDist = dist.get(v) ?? 0;
      const newHops = uHops + 1;
      const currHops = hops.get(v) ?? 1;

      if (newDist > currDist || (newDist === currDist && newHops >= currHops)) {
        dist.set(v, newDist);
        hops.set(v, newHops);
        prevNode.set(v, u);
      }
    }
  }

  let maxTerminalNodeId = nodes[0]?.id ?? "";
  let maxPathDuration = dist.get(maxTerminalNodeId) ?? 0;
  let maxHops = hops.get(maxTerminalNodeId) ?? 1;

  for (const [nodeId, d] of dist.entries()) {
    const h = hops.get(nodeId) ?? 1;
    if (d > maxPathDuration || (d === maxPathDuration && h >= maxHops)) {
      maxPathDuration = d;
      maxHops = h;
      maxTerminalNodeId = nodeId;
    }
  }

  const criticalPathIdsReversed: string[] = [];
  let currStep: string | null = maxTerminalNodeId;
  const visited = new Set<string>();

  while (currStep && !visited.has(currStep)) {
    visited.add(currStep);
    criticalPathIdsReversed.push(currStep);
    currStep = prevNode.get(currStep) ?? null;
  }

  const criticalPathIds = criticalPathIdsReversed.reverse();
  const criticalPathSet = new Set(criticalPathIds);

  let cumulativeMs = 0;
  const pathNodes: CriticalPathNodeInfo[] = criticalPathIds.map((id) => {
    const n = nodeMap.get(id)!;
    const dur = extractNodeDuration(n);
    cumulativeMs += dur;
    return {
      nodeId: n.id,
      nodeName: n.name,
      kind: n.kind,
      status: n.status,
      durationMs: dur,
      cumulativeDurationMs: cumulativeMs,
      percentOfCriticalPath: maxPathDuration > 0 ? (dur / maxPathDuration) * 100 : 0,
      step: n.step,
      model: extractNodeModel(n),
    };
  });

  const longestNodeInPath =
    pathNodes.length > 0
      ? pathNodes.reduce((prev, current) => (prev.durationMs > current.durationMs ? prev : current))
      : null;

  // Bottleneck rankings
  const bottleneckRankings: BottleneckRankItem[] = [...nodes]
    .sort((a, b) => extractNodeDuration(b) - extractNodeDuration(a))
    .map((n, idx) => {
      const dur = extractNodeDuration(n);
      return {
        rank: idx + 1,
        nodeId: n.id,
        nodeName: n.name,
        kind: n.kind,
        status: n.status,
        durationMs: dur,
        percentOfTotalDuration: sumNodeDurationsMs > 0 ? (dur / sumNodeDurationsMs) * 100 : 0,
        isOnCriticalPath: criticalPathSet.has(n.id),
      };
    });

  let totalWallClockMs = maxPathDuration;
  if (totalWallClockMs === 0 && sumNodeDurationsMs > 0) {
    totalWallClockMs = sumNodeDurationsMs;
  }

  const totalOverheadMs = Math.max(0, totalWallClockMs - totalCognitiveMs - totalToolMs);
  const cognitivePercentage =
    totalWallClockMs > 0 ? Math.min(100, (totalCognitiveMs / totalWallClockMs) * 100) : 0;
  const toolPercentage =
    totalWallClockMs > 0 ? Math.min(100, (totalToolMs / totalWallClockMs) * 100) : 0;
  const overheadPercentage =
    totalWallClockMs > 0 ? Math.min(100, (totalOverheadMs / totalWallClockMs) * 100) : 0;
  const wallClockVsCognitiveRatio = totalWallClockMs > 0 ? totalCognitiveMs / totalWallClockMs : 0;

  const nodesPerMinute = totalWallClockMs > 0 ? completedNodes / (totalWallClockMs / 60_000) : 0;

  // Phase Velocities by Step
  const stepMap = new Map<number, GraphNodeData[]>();
  for (const node of nodes) {
    const s = typeof node.step === "number" ? node.step : 1;
    if (!stepMap.has(s)) stepMap.set(s, []);
    stepMap.get(s)!.push(node);
  }

  const sortedSteps = Array.from(stepMap.keys()).sort((a, b) => a - b);
  const phaseVelocities: PhaseVelocityMetric[] = sortedSteps.map((step) => {
    const stepNodes = stepMap.get(step)!;
    const stepDuration = Math.max(...stepNodes.map((n) => extractNodeDuration(n)), 0);
    let stepTokens = 0;
    let stepCost: number | undefined;
    let stepHasErrors = false;

    for (const n of stepNodes) {
      const tok = extractNodeTokens(n);
      stepTokens += tok.totalTokens;
      if (tok.costUsd !== undefined) stepCost = (stepCost ?? 0) + tok.costUsd;
      if (n.status === "error") stepHasErrors = true;
    }

    const vel =
      stepDuration > 0 ? stepNodes.length / (stepDuration / 60_000) : stepNodes.length * 60;

    return {
      step,
      label: `Phase ${step}`,
      nodeCount: stepNodes.length,
      durationMs: stepDuration,
      tokens: stepTokens,
      costUsd: stepCost,
      velocityNodesPerMin: vel,
      hasErrors: stepHasErrors,
    };
  });

  const fastestStep =
    phaseVelocities.length > 0
      ? phaseVelocities.reduce((prev, current) =>
          prev.velocityNodesPerMin > current.velocityNodesPerMin ? prev : current,
        )
      : null;

  const slowestStep =
    phaseVelocities.length > 0
      ? phaseVelocities.reduce((prev, current) =>
          prev.velocityNodesPerMin < current.velocityNodesPerMin ? prev : current,
        )
      : null;

  const avgStepDurationMs =
    phaseVelocities.length > 0
      ? phaseVelocities.reduce((sum, p) => sum + p.durationMs, 0) / phaseVelocities.length
      : 0;

  // --------------------------------------------------------------------------
  // 2. Concurrency Heatmap
  // --------------------------------------------------------------------------
  const stepConcurrency = sortedSteps.map((step) => {
    const stepNodes = stepMap.get(step)!;
    return {
      step,
      count: stepNodes.length,
      nodeIds: stepNodes.map((n) => n.id),
    };
  });

  const maxStepConcurrency =
    stepConcurrency.length > 0 ? Math.max(...stepConcurrency.map((s) => s.count)) : 1;

  const BIN_COUNT = 12;
  const bins: ConcurrencyBin[] = [];
  const binDurationMs = totalWallClockMs > 0 ? totalWallClockMs / BIN_COUNT : 1000;

  for (let i = 0; i < BIN_COUNT; i++) {
    const startMs = i * binDurationMs;
    const endMs = (i + 1) * binDurationMs;
    const activeNodeIds: string[] = [];
    const activeNodeNames: string[] = [];
    const modelsSet = new Set<string>();

    const minStep = sortedSteps.length > 0 ? sortedSteps[0] : 1;
    const maxStep = sortedSteps.length > 0 ? sortedSteps[sortedSteps.length - 1] : 1;
    const stepRange = Math.max(1, maxStep - minStep + 1);

    for (const node of nodes) {
      const s = typeof node.step === "number" ? node.step : 1;
      const normalizedStep = (s - minStep) / stepRange;
      const binIdxForNode = Math.min(BIN_COUNT - 1, Math.floor(normalizedStep * BIN_COUNT));

      if (binIdxForNode === i) {
        activeNodeIds.push(node.id);
        activeNodeNames.push(node.name);
        modelsSet.add(extractNodeModel(node));
      }
    }

    const activeCount = activeNodeIds.length;
    const intensity = maxStepConcurrency > 0 ? Math.min(1.0, activeCount / maxStepConcurrency) : 0;

    bins.push({
      binIndex: i,
      startTimeMs: startMs,
      endTimeMs: endMs,
      timeLabel: `${Math.round(startMs / 1000)}s - ${Math.round(endMs / 1000)}s`,
      activeCount,
      intensity,
      nodeIds: activeNodeIds,
      nodeNames: activeNodeNames,
      models: Array.from(modelsSet),
    });
  }

  const peakConcurrency = maxStepConcurrency;
  const averageConcurrency =
    totalWallClockMs > 0 && sumNodeDurationsMs > 0
      ? sumNodeDurationsMs / totalWallClockMs
      : nodes.length > 0 && sortedSteps.length > 0
        ? nodes.length / sortedSteps.length
        : 1;

  // --------------------------------------------------------------------------
  // 3. Token Consumption Distributions
  // --------------------------------------------------------------------------
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalReasoningTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;
  // Stays undefined until a node reports dollars, so an unpriced run totals to nothing at all.
  let totalCostUsd: number | undefined;

  const modelMap = new Map<
    string,
    {
      model: string;
      tier: string;
      nodeCount: number;
      promptTokens: number;
      completionTokens: number;
      reasoningTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      totalTokens: number;
      costUsd?: number;
    }
  >();

  const tierMap = new Map<
    "xs" | "s" | "m" | "l",
    { nodeCount: number; tokens: number; costUsd?: number }
  >();

  for (const node of nodes) {
    const tok = extractNodeTokens(node);
    totalPromptTokens += tok.promptTokens;
    totalCompletionTokens += tok.completionTokens;
    totalReasoningTokens += tok.reasoningTokens;
    totalCacheCreationTokens += tok.cacheCreationTokens;
    totalCacheReadTokens += tok.cacheReadTokens;
    if (tok.costUsd !== undefined) totalCostUsd = (totalCostUsd ?? 0) + tok.costUsd;

    const modelName = extractNodeModel(node);
    const tier = resolveNodeTier(node);

    if (!modelMap.has(modelName)) {
      modelMap.set(modelName, {
        model: modelName,
        tier,
        nodeCount: 0,
        promptTokens: 0,
        completionTokens: 0,
        reasoningTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 0,
      });
    }

    const entry = modelMap.get(modelName)!;
    entry.nodeCount++;
    entry.promptTokens += tok.promptTokens;
    entry.completionTokens += tok.completionTokens;
    entry.reasoningTokens += tok.reasoningTokens;
    entry.cacheCreationTokens += tok.cacheCreationTokens;
    entry.cacheReadTokens += tok.cacheReadTokens;
    entry.totalTokens += tok.totalTokens;
    if (tok.costUsd !== undefined) entry.costUsd = (entry.costUsd ?? 0) + tok.costUsd;

    if (tier !== "unspecified") {
      const t = tierMap.get(tier) ?? { nodeCount: 0, tokens: 0 };
      t.nodeCount++;
      t.tokens += tok.totalTokens;
      if (tok.costUsd !== undefined) t.costUsd = (t.costUsd ?? 0) + tok.costUsd;
      tierMap.set(tier, t);
    }
  }

  const grandTotalTokens =
    totalPromptTokens + totalCompletionTokens + totalReasoningTokens + totalCacheCreationTokens;

  const tokensPerSecond = totalWallClockMs > 0 ? grandTotalTokens / (totalWallClockMs / 1000) : 0;

  const byModel: ModelTokenBreakdown[] = Array.from(modelMap.values())
    .map((m) => ({
      ...m,
      percentageOfTokens: grandTotalTokens > 0 ? (m.totalTokens / grandTotalTokens) * 100 : 0,
      percentageOfCost:
        totalCostUsd !== undefined && totalCostUsd > 0
          ? ((m.costUsd ?? 0) / totalCostUsd) * 100
          : undefined,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  const byRole: RoleTokenBreakdown[] = [
    {
      role: "prompt",
      label: "Prompt (Input)",
      tokens: totalPromptTokens,
      percentage: grandTotalTokens > 0 ? (totalPromptTokens / grandTotalTokens) * 100 : 0,
    },
    {
      role: "completion",
      label: "Completion (Output)",
      tokens: totalCompletionTokens,
      percentage: grandTotalTokens > 0 ? (totalCompletionTokens / grandTotalTokens) * 100 : 0,
    },
    {
      role: "reasoning",
      label: "Reasoning (Thinking)",
      tokens: totalReasoningTokens,
      percentage: grandTotalTokens > 0 ? (totalReasoningTokens / grandTotalTokens) * 100 : 0,
    },
    {
      role: "cacheWrite",
      label: "Cache Creation (Write)",
      tokens: totalCacheCreationTokens,
      percentage: grandTotalTokens > 0 ? (totalCacheCreationTokens / grandTotalTokens) * 100 : 0,
    },
    {
      role: "cacheRead",
      label: "Cache Read",
      tokens: totalCacheReadTokens,
      percentage: grandTotalTokens > 0 ? (totalCacheReadTokens / grandTotalTokens) * 100 : 0,
    },
  ];

  const byTier: TierTokenBreakdown[] = (["xs", "s", "m", "l"] as const)
    .map((tierKey) => ({ tier: tierKey, ...(tierMap.get(tierKey) ?? { nodeCount: 0, tokens: 0 }) }))
    .filter((entry) => entry.nodeCount > 0);

  const cacheEfficiencyPercent =
    totalPromptTokens + totalCacheReadTokens > 0
      ? (totalCacheReadTokens / (totalPromptTokens + totalCacheReadTokens)) * 100
      : 0;

  // --------------------------------------------------------------------------
  // 4. Repair Cycle Histograms
  // --------------------------------------------------------------------------
  let totalRepairs = 0;
  let firstPassSuccessCount = 0;
  let maxRepairsOnNode = 0;
  const repairedNodes: RepairedNodeDetail[] = [];

  const repairBucketMap = new Map<number, { nodeIds: string[]; nodeNames: string[] }>();
  repairBucketMap.set(0, { nodeIds: [], nodeNames: [] });
  repairBucketMap.set(1, { nodeIds: [], nodeNames: [] });
  repairBucketMap.set(2, { nodeIds: [], nodeNames: [] });
  repairBucketMap.set(3, { nodeIds: [], nodeNames: [] });

  for (const node of nodes) {
    const rounds = extractNodeRepairRounds(node);
    totalRepairs += rounds;
    if (rounds > maxRepairsOnNode) maxRepairsOnNode = rounds;

    if (rounds === 0) {
      firstPassSuccessCount++;
      repairBucketMap.get(0)!.nodeIds.push(node.id);
      repairBucketMap.get(0)!.nodeNames.push(node.name);
    } else if (rounds === 1) {
      repairBucketMap.get(1)!.nodeIds.push(node.id);
      repairBucketMap.get(1)!.nodeNames.push(node.name);
    } else if (rounds === 2) {
      repairBucketMap.get(2)!.nodeIds.push(node.id);
      repairBucketMap.get(2)!.nodeNames.push(node.name);
    } else {
      repairBucketMap.get(3)!.nodeIds.push(node.id);
      repairBucketMap.get(3)!.nodeNames.push(node.name);
    }

    if (rounds > 0) {
      const reasons: string[] = [];
      const findings = node.metadata?.findings ?? node.provenance?.remediations;
      if (Array.isArray(findings)) {
        for (const f of findings) {
          if (typeof f === "object" && f !== null) {
            const obs = (f as { observation?: string; remediation?: string }).observation;
            if (obs) reasons.push(obs);
          }
        }
      }
      repairedNodes.push({
        nodeId: node.id,
        nodeName: node.name,
        repairRounds: rounds,
        status: node.status ?? "unknown",
        reasons: reasons.length > 0 ? reasons : ["Automated adversarial repair cycle"],
      });
    }
  }

  const firstPassSuccessRate = nodes.length > 0 ? (firstPassSuccessCount / nodes.length) * 100 : 0;
  const avgRepairsPerNode = nodes.length > 0 ? totalRepairs / nodes.length : 0;
  const repairedNodesCount = repairedNodes.length;

  const repairBins: RepairHistogramBin[] = [
    {
      roundsLabel: "0 Repairs (1st Pass)",
      roundCount: 0,
      nodeCount: repairBucketMap.get(0)!.nodeIds.length,
      percentage:
        nodes.length > 0 ? (repairBucketMap.get(0)!.nodeIds.length / nodes.length) * 100 : 0,
      nodeIds: repairBucketMap.get(0)!.nodeIds,
      nodeNames: repairBucketMap.get(0)!.nodeNames,
    },
    {
      roundsLabel: "1 Repair Round",
      roundCount: 1,
      nodeCount: repairBucketMap.get(1)!.nodeIds.length,
      percentage:
        nodes.length > 0 ? (repairBucketMap.get(1)!.nodeIds.length / nodes.length) * 100 : 0,
      nodeIds: repairBucketMap.get(1)!.nodeIds,
      nodeNames: repairBucketMap.get(1)!.nodeNames,
    },
    {
      roundsLabel: "2 Repair Rounds",
      roundCount: 2,
      nodeCount: repairBucketMap.get(2)!.nodeIds.length,
      percentage:
        nodes.length > 0 ? (repairBucketMap.get(2)!.nodeIds.length / nodes.length) * 100 : 0,
      nodeIds: repairBucketMap.get(2)!.nodeIds,
      nodeNames: repairBucketMap.get(2)!.nodeNames,
    },
    {
      roundsLabel: "3+ Repair Rounds",
      roundCount: 3,
      nodeCount: repairBucketMap.get(3)!.nodeIds.length,
      percentage:
        nodes.length > 0 ? (repairBucketMap.get(3)!.nodeIds.length / nodes.length) * 100 : 0,
      nodeIds: repairBucketMap.get(3)!.nodeIds,
      nodeNames: repairBucketMap.get(3)!.nodeNames,
    },
  ];

  // --------------------------------------------------------------------------
  // 5. Error Frequency Taxonomy
  // --------------------------------------------------------------------------
  const categoryCountMap = new Map<
    ErrorCategoryKey,
    {
      count: number;
      affectedNodes: Set<string>;
      samples: string[];
      severity: "critical" | "important" | "warning";
    }
  >();

  const CATEGORY_META: Record<
    ErrorCategoryKey,
    { label: string; severity: "critical" | "important" | "warning" }
  > = {
    syntax_type: { label: "Syntax & Type Errors", severity: "critical" },
    test_assertion: { label: "Test & Assertion Failures", severity: "critical" },
    lint_format: { label: "Lint & Style Violations", severity: "warning" },
    validation_rejection: { label: "Validation & Gate Rejections", severity: "important" },
    timeout_deadlock: { label: "Timeouts & Deadlocks", severity: "critical" },
    rate_limit_quota: { label: "Rate Limits & Quotas", severity: "warning" },
    command_failure: { label: "Command & Shell Failures", severity: "important" },
    runtime_unhandled: { label: "Runtime & Unhandled Exceptions", severity: "critical" },
  };

  for (const cat of Object.keys(CATEGORY_META) as ErrorCategoryKey[]) {
    categoryCountMap.set(cat, {
      count: 0,
      affectedNodes: new Set<string>(),
      samples: [],
      severity: CATEGORY_META[cat].severity,
    });
  }

  let totalErrors = 0;
  let unresolvedCount = 0;
  let resolvedCount = 0;
  const errorNodeSet = new Set<string>();

  for (const node of nodes) {
    if (node.status === "error") {
      errorNodeSet.add(node.id);
    }

    const findings = (node.metadata?.findings ?? []) as FindingDetail[];
    for (const f of findings) {
      totalErrors++;
      if (f.status === "resolved") resolvedCount++;
      else unresolvedCount++;
      const cat = categorizeError(`${f.observation ?? ""} ${f.remediation ?? ""}`);
      const entry = categoryCountMap.get(cat)!;
      entry.count++;
      entry.affectedNodes.add(node.id);
      if (f.observation && entry.samples.length < 3) {
        entry.samples.push(f.observation);
      }
    }

    const commands = (node.metadata?.commands ?? []) as CommandExecutionDetail[];
    for (const cmd of commands) {
      if (cmd.exitCode !== 0) {
        totalErrors++;
        errorNodeSet.add(node.id);
        const errMsg = `${cmd.stderrSnippet ?? cmd.stderrTail ?? `Exit code ${cmd.exitCode}`}`;
        const cat = categorizeError(errMsg);
        const entry = categoryCountMap.get(cat)!;
        entry.count++;
        entry.affectedNodes.add(node.id);
        if (entry.samples.length < 3) {
          entry.samples.push(errMsg);
        }
      }
    }

    if (node.status === "error" && findings.length === 0 && commands.length === 0) {
      totalErrors++;
      const msg = node.logs ?? node.badge?.text ?? `${node.name} encountered error`;
      const cat = categorizeError(msg);
      const entry = categoryCountMap.get(cat)!;
      entry.count++;
      entry.affectedNodes.add(node.id);
      if (entry.samples.length < 3) {
        entry.samples.push(msg);
      }
    }
  }

  for (const edge of edges) {
    const exchanges = (edge.traffic?.exchanges ?? edge.exchanges ?? []) as EdgeTrafficExchange[];
    for (const ex of exchanges) {
      if (ex.status === "error" || ex.verdict === "FAIL" || ex.type === "rejection") {
        totalErrors++;
        const msg =
          ex.rejectionObservation ??
          ex.observation ??
          ex.summary ??
          `Exchange rejection on ${edge.source} -> ${edge.target}`;
        const cat = categorizeError(msg);
        const entry = categoryCountMap.get(cat)!;
        entry.count++;
        if (edge.source) entry.affectedNodes.add(edge.source);
        if (entry.samples.length < 3) {
          entry.samples.push(msg);
        }
      }
    }
  }

  const errorTaxonomyItems: ErrorTaxonomyItem[] = (Object.keys(CATEGORY_META) as ErrorCategoryKey[])
    .map((cat) => {
      const entry = categoryCountMap.get(cat)!;
      return {
        category: cat,
        label: CATEGORY_META[cat].label,
        count: entry.count,
        percentage: totalErrors > 0 ? (entry.count / totalErrors) * 100 : 0,
        affectedNodeIds: Array.from(entry.affectedNodes),
        sampleMessages: entry.samples,
        severity: entry.severity,
      };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);

  const errorTaxonomy: ErrorTaxonomyMetrics = {
    totalErrors,
    unresolvedCount,
    resolvedCount,
    errorNodeCount: errorNodeSet.size,
    errorRate: nodes.length > 0 ? (errorNodeSet.size / nodes.length) * 100 : 0,
    items: errorTaxonomyItems,
  };

  const estimatedQueueWaitMs = Math.max(0, totalWallClockMs - maxPathDuration);
  const parallelEfficiencyPercent =
    maxPathDuration > 0 && peakConcurrency > 0
      ? Math.min(100, (sumNodeDurationsMs / (maxPathDuration * peakConcurrency)) * 100)
      : 100;
  const criticalPathRatio = totalWallClockMs > 0 ? maxPathDuration / totalWallClockMs : 1.0;

  const criticalPath: CriticalPathMetrics = {
    pathNodeIds: criticalPathIds,
    pathNodes,
    totalCriticalPathDurationMs: maxPathDuration,
    longestNodeInPath,
    bottleneckRankings,
    estimatedQueueWaitMs,
    parallelEfficiencyPercent,
    criticalPathRatio,
  };

  return {
    totalNodes,
    completedNodes,
    successNodes,
    errorNodes,
    runningNodes,
    pendingNodes,
    skippedNodes,
    successRate,
    runVelocity: {
      totalWallClockMs,
      totalCognitiveMs,
      totalToolMs,
      totalOverheadMs,
      cognitivePercentage,
      toolPercentage,
      overheadPercentage,
      wallClockVsCognitiveRatio,
      nodesPerMinute,
      tokensPerSecond,
      phaseVelocities,
      fastestStep,
      slowestStep,
      avgStepDurationMs,
    },
    concurrency: {
      peakConcurrency,
      averageConcurrency,
      bins,
      maxStepConcurrency,
      stepConcurrency,
    },
    tokenDistribution: {
      totalPromptTokens,
      totalCompletionTokens,
      totalReasoningTokens,
      totalCacheCreationTokens,
      totalCacheReadTokens,
      totalTokens: grandTotalTokens,
      totalCostUsd,
      cacheEfficiencyPercent,
      byModel,
      byRole,
      byTier,
    },
    repairCycles: {
      totalRepairs,
      firstPassSuccessCount,
      firstPassSuccessRate,
      maxRepairsOnNode,
      avgRepairsPerNode,
      repairedNodesCount,
      bins: repairBins,
      repairedNodes,
    },
    errorTaxonomy,
    criticalPath,
  };
}

// ============================================================================
// Dataset Filtering Engine
// ============================================================================

export interface AnalyticsFilterOptions {
  searchQuery: string;
  nodeStatus: "all" | NodeStatus;
  modelTier: "all" | "xs" | "s" | "m" | "l" | "unspecified";
  nodeKind: "all" | NodeKind;
  stepRange: [number, number] | null;
}

export function filterDataset(
  dataset: GraphDataset | null,
  filters: AnalyticsFilterOptions,
): GraphDataset | null {
  if (!dataset || !Array.isArray(dataset.nodes)) return null;

  const query = filters.searchQuery.trim().toLowerCase();
  const filteredNodes = dataset.nodes.filter((node) => {
    if (filters.nodeStatus !== "all" && (node.status ?? "pending") !== filters.nodeStatus) {
      return false;
    }

    if (filters.modelTier !== "all") {
      const tier = resolveNodeTier(node);
      if (tier !== filters.modelTier) return false;
    }

    if (filters.nodeKind !== "all" && (node.kind ?? "agent") !== filters.nodeKind) {
      return false;
    }

    if (filters.stepRange !== null) {
      const nodeStep = typeof node.step === "number" ? node.step : 1;
      const [minStep, maxStep] = filters.stepRange;
      if (nodeStep < minStep || nodeStep > maxStep) return false;
    }

    if (query.length > 0) {
      const name = (node.name ?? "").toLowerCase();
      const id = (node.id ?? "").toLowerCase();
      const model = extractNodeModel(node).toLowerCase();
      const desc = (node.description ?? "").toLowerCase();
      const tools = (node.tools ?? []).map((t) => t.name.toLowerCase()).join(" ");
      const matches =
        name.includes(query) ||
        id.includes(query) ||
        model.includes(query) ||
        desc.includes(query) ||
        tools.includes(query);
      if (!matches) return false;
    }

    return true;
  });

  const nodeSet = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = (dataset.edges ?? []).filter(
    (e) => nodeSet.has(e.source) && nodeSet.has(e.target),
  );

  return {
    ...dataset,
    nodes: filteredNodes,
    edges: filteredEdges,
  };
}

// ============================================================================
// Zustand Store Definition
// ============================================================================

export type AnalyticsTab =
  | "overview"
  | "velocity"
  | "concurrency"
  | "tokens"
  | "repairs"
  | "errors"
  | "bottlenecks";

export interface AnalyticsStoreState {
  dataset: GraphDataset | null;
  filters: AnalyticsFilterOptions;
  activeTab: AnalyticsTab;
  selectedNodeId: string | null;
  computedMetrics: AnalyticsMetrics;
  filteredMetrics: AnalyticsMetrics;
}

export interface AnalyticsStoreActions {
  setDataset: (dataset: GraphDataset | null) => void;
  setSearchQuery: (query: string) => void;
  setNodeStatus: (status: "all" | NodeStatus) => void;
  setModelTier: (tier: "all" | "xs" | "s" | "m" | "l" | "unspecified") => void;
  setNodeKind: (kind: "all" | NodeKind) => void;
  setStepRange: (range: [number, number] | null) => void;
  setActiveTab: (tab: AnalyticsTab) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  resetFilters: () => void;
  recompute: () => void;
}

export type AnalyticsStore = AnalyticsStoreState & AnalyticsStoreActions;

export const DEFAULT_ANALYTICS_FILTERS: Readonly<AnalyticsFilterOptions> = Object.freeze({
  searchQuery: "",
  nodeStatus: "all",
  modelTier: "all",
  nodeKind: "all",
  stepRange: null,
});

export const useAnalyticsStore = create<AnalyticsStore>()((set, get) => ({
  dataset: null,
  filters: { ...DEFAULT_ANALYTICS_FILTERS },
  activeTab: "overview",
  selectedNodeId: null,
  computedMetrics: computeAnalyticsMetrics(null),
  filteredMetrics: computeAnalyticsMetrics(null),

  setDataset: (dataset) => {
    const computed = computeAnalyticsMetrics(dataset);
    const filteredDataset = filterDataset(dataset, get().filters);
    const filtered = computeAnalyticsMetrics(filteredDataset);
    set({
      dataset,
      computedMetrics: computed,
      filteredMetrics: filtered,
    });
  },

  setSearchQuery: (query) => {
    const newFilters = { ...get().filters, searchQuery: query };
    const filteredDataset = filterDataset(get().dataset, newFilters);
    set({
      filters: newFilters,
      filteredMetrics: computeAnalyticsMetrics(filteredDataset),
    });
  },

  setNodeStatus: (status) => {
    const newFilters = { ...get().filters, nodeStatus: status };
    const filteredDataset = filterDataset(get().dataset, newFilters);
    set({
      filters: newFilters,
      filteredMetrics: computeAnalyticsMetrics(filteredDataset),
    });
  },

  setModelTier: (tier) => {
    const newFilters = { ...get().filters, modelTier: tier };
    const filteredDataset = filterDataset(get().dataset, newFilters);
    set({
      filters: newFilters,
      filteredMetrics: computeAnalyticsMetrics(filteredDataset),
    });
  },

  setNodeKind: (kind) => {
    const newFilters = { ...get().filters, nodeKind: kind };
    const filteredDataset = filterDataset(get().dataset, newFilters);
    set({
      filters: newFilters,
      filteredMetrics: computeAnalyticsMetrics(filteredDataset),
    });
  },

  setStepRange: (range) => {
    const newFilters = { ...get().filters, stepRange: range };
    const filteredDataset = filterDataset(get().dataset, newFilters);
    set({
      filters: newFilters,
      filteredMetrics: computeAnalyticsMetrics(filteredDataset),
    });
  },

  setActiveTab: (activeTab) => set({ activeTab }),

  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),

  resetFilters: () => {
    const reset = { ...DEFAULT_ANALYTICS_FILTERS };
    const dataset = get().dataset;
    set({
      filters: reset,
      filteredMetrics: computeAnalyticsMetrics(dataset),
    });
  },

  recompute: () => {
    const dataset = get().dataset;
    const computed = computeAnalyticsMetrics(dataset);
    const filteredDataset = filterDataset(dataset, get().filters);
    const filtered = computeAnalyticsMetrics(filteredDataset);
    set({
      computedMetrics: computed,
      filteredMetrics: filtered,
    });
  },
}));

// ============================================================================
// Convenient Selectors
// ============================================================================

export const useAnalyticsDataset = () => useAnalyticsStore((state) => state.dataset);
export const useAnalyticsMetrics = () => useAnalyticsStore((state) => state.computedMetrics);
export const useFilteredAnalyticsMetrics = () =>
  useAnalyticsStore((state) => state.filteredMetrics);
export const useAnalyticsFilters = () => useAnalyticsStore((state) => state.filters);
export const useAnalyticsTab = () => useAnalyticsStore((state) => state.activeTab);
export const useAnalyticsSelectedNode = () => useAnalyticsStore((state) => state.selectedNodeId);
