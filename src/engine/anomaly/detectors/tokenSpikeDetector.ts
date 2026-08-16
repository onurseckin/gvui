import type { GraphDataset, GraphNodeData } from "../../../types/graphData";
import type { AnomalyFinding, AnomalyThresholds, AnomalyDetectorFn } from "../types";

interface NodeTokenStats {
  node: GraphNodeData;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
}

export function extractNodeTotalTokens(node: GraphNodeData): number {
  if (typeof node.metrics?.tokens?.totalTokens === "number") {
    return node.metrics.tokens.totalTokens;
  }
  const inTokens = typeof node.metrics?.tokensIn === "number" ? node.metrics.tokensIn : 0;
  const outTokens = typeof node.metrics?.tokensOut === "number" ? node.metrics.tokensOut : 0;
  if (inTokens > 0 || outTokens > 0) {
    return inTokens + outTokens;
  }
  if (
    typeof node.metrics?.tokens?.promptTokens === "number" ||
    typeof node.metrics?.tokens?.completionTokens === "number"
  ) {
    const p = node.metrics.tokens.promptTokens || 0;
    const c = node.metrics.tokens.completionTokens || 0;
    return p + c;
  }
  return 0;
}

export function extractNodeReasoningTokens(node: GraphNodeData): number {
  if (typeof node.metrics?.tokens?.reasoningTokens === "number") {
    return node.metrics.tokens.reasoningTokens;
  }
  return 0;
}

export const detectTokenSpikes: AnomalyDetectorFn = (
  dataset: GraphDataset,
  thresholds: AnomalyThresholds,
): AnomalyFinding[] => {
  const findings: AnomalyFinding[] = [];
  const nodes = dataset.nodes || [];
  if (nodes.length === 0) return findings;

  const nodeStats: NodeTokenStats[] = nodes.map((node) => {
    const totalTokens = extractNodeTotalTokens(node);
    const promptTokens =
      typeof node.metrics?.tokens?.promptTokens === "number"
        ? node.metrics.tokens.promptTokens
        : typeof node.metrics?.tokensIn === "number"
          ? node.metrics.tokensIn
          : 0;
    const completionTokens =
      typeof node.metrics?.tokens?.completionTokens === "number"
        ? node.metrics.tokens.completionTokens
        : typeof node.metrics?.tokensOut === "number"
          ? node.metrics.tokensOut
          : 0;
    const reasoningTokens = extractNodeReasoningTokens(node);

    return {
      node,
      totalTokens,
      promptTokens,
      completionTokens,
      reasoningTokens,
    };
  });

  const validTokenCounts = nodeStats.map((s) => s.totalTokens).filter((t) => t > 0);

  let meanTokens = 0;
  let stdDevTokens = 0;

  if (validTokenCounts.length >= thresholds.minNodeSampleForStats) {
    meanTokens = validTokenCounts.reduce((acc, v) => acc + v, 0) / validTokenCounts.length;
    const variance =
      validTokenCounts.reduce((acc, v) => acc + Math.pow(v - meanTokens, 2), 0) /
      validTokenCounts.length;
    stdDevTokens = Math.sqrt(variance);
  }

  const statisticalThreshold =
    meanTokens > 0
      ? meanTokens + thresholds.tokenSpikeDeviationMultiplier * stdDevTokens
      : thresholds.tokenSpikeAbsoluteThreshold;

  for (const stat of nodeStats) {
    const { node, totalTokens, promptTokens, completionTokens, reasoningTokens } = stat;

    if (totalTokens === 0) continue;

    // 1. Cognitive / Reasoning Token Explosion
    const reasoningRatio = totalTokens > 0 ? reasoningTokens / totalTokens : 0;
    if (reasoningTokens > 10000 && reasoningRatio >= thresholds.cognitiveTokenRatioThreshold) {
      const isCritical = reasoningRatio >= 0.85 || reasoningTokens >= 40000;
      findings.push({
        id: `anomaly-token-reasoning-${node.id}`,
        type: "cognitive_token_spike",
        category: "resource",
        severity: isCritical ? "critical" : "error",
        title: `Cognitive Reasoning Token Spike on Node ${node.name || node.id}`,
        description: `Node "${node.name || node.id}" spent ${reasoningTokens.toLocaleString()} reasoning tokens (${(reasoningRatio * 100).toFixed(1)}% of total ${totalTokens.toLocaleString()} tokens). This indicates excessive internal chain-of-thought looping or model hesitation.`,
        nodeIds: [node.id],
        impactScore: Math.min(100, Math.round(reasoningRatio * 100)),
        metricValue: reasoningTokens,
        thresholdValue: Math.round(totalTokens * thresholds.cognitiveTokenRatioThreshold),
        unit: "reasoning tokens",
        remediation: {
          action: "Cap Reasoning Effort or Decompose Goal",
          suggestion: `Reduce reasoning effort parameter (e.g. from 'high' to 'medium') or break down node sub-tasks into explicit granular tool actions.`,
          autoFixable: true,
          quickFix: {
            type: "upgrade_tier",
            targetId: node.id,
            patch: {
              reasoningEffort: "medium",
            },
          },
        },
        evidence: {
          metrics: {
            reasoningTokens,
            totalTokens,
            reasoningPercentage: Number((reasoningRatio * 100).toFixed(1)),
            promptTokens,
            completionTokens,
          },
          relatedNodes: [node.id],
          confidence: 0.92,
        },
        timestamp: Date.now(),
      });
    }

    // 2. Absolute or Statistical Outlier Token Spike
    const isAbsoluteSpike = totalTokens >= thresholds.tokenSpikeAbsoluteThreshold;
    const isStatisticalSpike =
      validTokenCounts.length >= thresholds.minNodeSampleForStats &&
      totalTokens >= statisticalThreshold &&
      totalTokens > meanTokens * 2;

    if (isAbsoluteSpike || isStatisticalSpike) {
      const isCritical =
        totalTokens >= thresholds.tokenSpikeAbsoluteThreshold * 2 ||
        (meanTokens > 0 && totalTokens >= meanTokens * 4);

      findings.push({
        id: `anomaly-token-spike-${node.id}`,
        type: "cognitive_token_spike",
        category: "resource",
        severity: isCritical ? "critical" : "error",
        title: `Token Volume Spike on Node ${node.name || node.id}`,
        description: `Node "${node.name || node.id}" consumed ${totalTokens.toLocaleString()} tokens (Prompt: ${promptTokens.toLocaleString()}, Completion: ${completionTokens.toLocaleString()}), exceeding the threshold of ${Math.round(isStatisticalSpike ? statisticalThreshold : thresholds.tokenSpikeAbsoluteThreshold).toLocaleString()} tokens.`,
        nodeIds: [node.id],
        impactScore: Math.min(
          100,
          Math.round((totalTokens / thresholds.tokenSpikeAbsoluteThreshold) * 60),
        ),
        metricValue: totalTokens,
        thresholdValue: Math.round(
          isStatisticalSpike ? statisticalThreshold : thresholds.tokenSpikeAbsoluteThreshold,
        ),
        unit: "tokens",
        remediation: {
          action: "Prune Context Window & Summarize Handoffs",
          suggestion: `Node ${node.id} is receiving bloated context. Compress previous node outputs, filter file diffs, or enable selective tool response pruning.`,
          autoFixable: true,
          quickFix: {
            type: "prune_context",
            targetId: node.id,
          },
        },
        evidence: {
          metrics: {
            totalTokens,
            promptTokens,
            completionTokens,
            graphMeanTokens: Math.round(meanTokens),
            standardDeviationsAboveMean:
              stdDevTokens > 0 ? Number(((totalTokens - meanTokens) / stdDevTokens).toFixed(2)) : 0,
          },
          relatedNodes: [node.id],
          confidence: 0.95,
        },
        timestamp: Date.now(),
      });
    }
  }

  // 3. Unbounded Context Growth (Step-over-step accumulation)
  const sortedByStep = [...nodeStats]
    .filter((s) => typeof s.node.step === "number" && s.totalTokens > 0)
    .sort((a, b) => (a.node.step ?? 0) - (b.node.step ?? 0));

  for (let i = 1; i < sortedByStep.length; i++) {
    const prev = sortedByStep[i - 1];
    const curr = sortedByStep[i];
    if (prev && curr && curr.totalTokens >= prev.totalTokens * 3 && curr.totalTokens >= 25000) {
      findings.push({
        id: `anomaly-token-growth-${prev.node.id}-${curr.node.id}`,
        type: "unbounded_growth",
        category: "resource",
        severity: "warning",
        title: `Rapid Context Growth Between Steps ${prev.node.step} -> ${curr.node.step}`,
        description: `Token consumption escalated 3x from ${prev.totalTokens.toLocaleString()} tokens on "${prev.node.name || prev.node.id}" to ${curr.totalTokens.toLocaleString()} tokens on "${curr.node.name || curr.node.id}".`,
        nodeIds: [prev.node.id, curr.node.id],
        impactScore: 65,
        metricValue: curr.totalTokens,
        thresholdValue: prev.totalTokens * 2,
        unit: "tokens",
        remediation: {
          action: "Introduce Intermediate Summary Port",
          suggestion: `Add a context compaction or summary gate between step ${prev.node.step} and step ${curr.node.step} to cap cumulative context accumulation.`,
          autoFixable: false,
        },
        evidence: {
          metrics: {
            previousStepTokens: prev.totalTokens,
            currentStepTokens: curr.totalTokens,
            growthFactor: Number((curr.totalTokens / prev.totalTokens).toFixed(2)),
          },
          relatedNodes: [prev.node.id, curr.node.id],
          traceSteps: [prev.node.step ?? 0, curr.node.step ?? 0],
          confidence: 0.85,
        },
        timestamp: Date.now(),
      });
    }
  }

  return findings;
};
