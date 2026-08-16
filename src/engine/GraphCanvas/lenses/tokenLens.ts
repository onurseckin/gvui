import type { ModelTier, PositionedEdge, PositionedNode } from "../../../types/graphData";
import { evaluateColorRamp, normalizeValue, resolveColorStops, rgbaString } from "./colorRamps";
import { extractNodeHeatmapValue } from "./heatmapLens";
import type {
  EdgeLensOverlay,
  HistogramBucket,
  LensConfig,
  LensLegendData,
  LensSummaryStats,
  LensTooltipData,
  NodeLensOverlay,
  NodeTokenDetail,
  TokenMetric,
} from "./types";

// ============================================================================
// Model Tier Pricing Constants
// ============================================================================

export interface TierPricing {
  promptUsdPer1M: number;
  completionUsdPer1M: number;
  reasoningUsdPer1M: number;
  cacheWriteUsdPer1M: number;
  cacheReadUsdPer1M: number;
}

export const TIER_PRICING: Readonly<Record<ModelTier | "unknown", TierPricing>> = Object.freeze({
  xs: {
    promptUsdPer1M: 0.15,
    completionUsdPer1M: 0.6,
    reasoningUsdPer1M: 0.6,
    cacheWriteUsdPer1M: 0.1875,
    cacheReadUsdPer1M: 0.0375,
  },
  s: {
    promptUsdPer1M: 0.5,
    completionUsdPer1M: 1.5,
    reasoningUsdPer1M: 1.5,
    cacheWriteUsdPer1M: 0.625,
    cacheReadUsdPer1M: 0.125,
  },
  m: {
    promptUsdPer1M: 3.0,
    completionUsdPer1M: 15.0,
    reasoningUsdPer1M: 15.0,
    cacheWriteUsdPer1M: 3.75,
    cacheReadUsdPer1M: 0.3,
  },
  l: {
    promptUsdPer1M: 15.0,
    completionUsdPer1M: 75.0,
    reasoningUsdPer1M: 75.0,
    cacheWriteUsdPer1M: 18.75,
    cacheReadUsdPer1M: 1.5,
  },
  unknown: {
    promptUsdPer1M: 1.0,
    completionUsdPer1M: 3.0,
    reasoningUsdPer1M: 3.0,
    cacheWriteUsdPer1M: 1.25,
    cacheReadUsdPer1M: 0.25,
  },
});

// ============================================================================
// Token & Cost Extraction Utilities
// ============================================================================

export function extractNodeTokenDetail(node: PositionedNode): NodeTokenDetail {
  const t = node.metrics?.tokens;
  const m = node.metrics;

  const promptTokens = t?.promptTokens ?? m?.tokensIn ?? 0;
  const completionTokens = t?.completionTokens ?? m?.tokensOut ?? 0;
  const reasoningTokens = t?.reasoningTokens ?? 0;
  const cacheCreationTokens = t?.cacheCreationTokens ?? 0;
  const cacheReadTokens = t?.cacheReadTokens ?? 0;

  const totalTokens =
    t?.totalTokens ??
    promptTokens + completionTokens + reasoningTokens + cacheCreationTokens + cacheReadTokens;

  const tier: ModelTier | "unknown" =
    node.tier ?? (node.hostAgent?.tier as ModelTier | undefined) ?? "unknown";
  const pricing = TIER_PRICING[tier] ?? TIER_PRICING.unknown;

  // Calculate cost
  let costUsd = m?.costUsd ?? 0;
  if (costUsd === 0 && totalTokens > 0) {
    costUsd =
      (promptTokens / 1_000_000) * pricing.promptUsdPer1M +
      (completionTokens / 1_000_000) * pricing.completionUsdPer1M +
      (reasoningTokens / 1_000_000) * pricing.reasoningUsdPer1M +
      (cacheCreationTokens / 1_000_000) * pricing.cacheWriteUsdPer1M +
      (cacheReadTokens / 1_000_000) * pricing.cacheReadUsdPer1M;
  }

  // Cost Intensity: USD per second of duration (or tokens per ms)
  const durationMs = Math.max(10, extractNodeHeatmapValue(node, "duration"));
  const costIntensity = (costUsd / (durationMs / 1000)) * 1000; // Cost per 1000s or density

  return {
    nodeId: node.id,
    promptTokens,
    completionTokens,
    reasoningTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens,
    costUsd: Number(costUsd.toFixed(6)),
    costIntensity: Number(costIntensity.toFixed(6)),
    tier,
    isTopConsumer: false, // Calculated after sorting all nodes
  };
}

/**
 * Formats token counts into clean human-readable strings (e.g. 1.2k, 45.8k, 2.4M).
 */
export function formatTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "0 tok";
  if (tokens < 1000) return `${Math.round(tokens)} tok`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k tok`;
  return `${(tokens / 1_000_000).toFixed(2)}M tok`;
}

/**
 * Formats USD cost cleanly.
 */
export function formatCostUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Extracts raw metric value based on TokenMetric.
 */
export function extractNodeTokenMetricValue(detail: NodeTokenDetail, metric: TokenMetric): number {
  switch (metric) {
    case "totalTokens":
      return detail.totalTokens;
    case "promptTokens":
      return detail.promptTokens;
    case "completionTokens":
      return detail.completionTokens;
    case "reasoningTokens":
      return detail.reasoningTokens;
    case "costUsd":
      return detail.costUsd;
    case "costIntensity":
      return detail.costIntensity;
    default:
      return detail.totalTokens;
  }
}

// ============================================================================
// Token Evaluation Engine
// ============================================================================

export interface TokenEvaluationResult {
  nodeOverlays: Map<string, NodeLensOverlay>;
  edgeOverlays: Map<string, EdgeLensOverlay>;
  summaryStats: LensSummaryStats;
  legendData: LensLegendData;
  tokenDetails: Map<string, NodeTokenDetail>;
}

export function evaluateTokenLens(
  nodes: readonly PositionedNode[],
  edges: readonly PositionedEdge[],
  config: LensConfig,
): TokenEvaluationResult {
  const stops = resolveColorStops(
    config.colorRamp === "viridis" ? "cyber-heat" : config.colorRamp,
    config.customStops,
  );
  const metric = config.tokenMetric;

  const tokenDetails = new Map<string, NodeTokenDetail>();
  const rawValuesList: number[] = [];
  const nodeValues = new Map<string, number>();

  let totalTokensSum = 0;
  let totalCostSum = 0;

  for (const node of nodes) {
    const detail = extractNodeTokenDetail(node);
    tokenDetails.set(node.id, detail);
    const val = extractNodeTokenMetricValue(detail, metric);
    nodeValues.set(node.id, val);
    rawValuesList.push(val);

    totalTokensSum += detail.totalTokens;
    totalCostSum += detail.costUsd;
  }

  // Pareto 80/20 Rule: Flag top 20% consumer nodes
  const sortedByTokens = Array.from(tokenDetails.values()).sort(
    (a, b) => b.totalTokens - a.totalTokens,
  );
  const topCount = Math.max(1, Math.ceil(nodes.length * 0.2));
  for (let i = 0; i < Math.min(topCount, sortedByTokens.length); i++) {
    if (sortedByTokens[i].totalTokens > 0) {
      sortedByTokens[i].isTopConsumer = true;
    }
  }

  const rawMin = rawValuesList.length > 0 ? Math.min(...rawValuesList) : 0;
  const rawMax = rawValuesList.length > 0 ? Math.max(...rawValuesList) : 1;
  const rawSum = rawValuesList.reduce((a, b) => a + b, 0);
  const rawAverage = rawValuesList.length > 0 ? rawSum / rawValuesList.length : 0;

  const sortedValues = [...rawValuesList].sort((a, b) => a - b);
  const rawMedian = sortedValues.length > 0 ? sortedValues[Math.floor(sortedValues.length / 2)] : 0;

  const nodeOverlays = new Map<string, NodeLensOverlay>();
  let activeNodesCount = 0;
  let filteredNodesCount = 0;

  for (const node of nodes) {
    const detail = tokenDetails.get(node.id)!;
    const rawVal = nodeValues.get(node.id) ?? 0;

    const normalized = normalizeValue(rawVal, rawMin, rawMax, config.scaleType, sortedValues);

    // Threshold check
    const meetsThreshold = normalized >= config.minThreshold && normalized <= config.maxThreshold;

    const isFiltered = !meetsThreshold;
    if (isFiltered) {
      filteredNodesCount++;
    } else {
      activeNodesCount++;
    }

    const color = evaluateColorRamp(stops, normalized, config.invertRamp);
    const fillColor = rgbaString(
      color,
      isFiltered ? config.dimOpacity * 0.3 : detail.isTopConsumer ? 0.25 : 0.14,
    );
    const borderColor = rgbaString(color, isFiltered ? config.dimOpacity * 0.5 : 0.85);
    const glowColor = color;
    const glowIntensity =
      config.showGlow && !isFiltered
        ? detail.isTopConsumer
          ? 0.9
          : config.glowIntensity * normalized
        : 0;
    const opacity = isFiltered ? (config.filterMode === "hide" ? 0 : config.dimOpacity) : 1;

    let badgeText = "";
    let badgeVariant: NodeLensOverlay["badgeVariant"] = "info";

    if (metric === "costUsd") {
      badgeText = formatCostUsd(detail.costUsd);
      badgeVariant = normalized > 0.7 ? "amber" : "cyan";
    } else if (metric === "costIntensity") {
      badgeText = `$${detail.costIntensity.toFixed(3)}/s`;
      badgeVariant = "indigo";
    } else {
      badgeText = formatTokenCount(rawVal);
      badgeVariant = detail.isTopConsumer ? "amber" : "info";
    }

    const formattedMetric =
      metric === "costUsd"
        ? formatCostUsd(rawVal)
        : metric === "costIntensity"
          ? `$${rawVal.toFixed(3)}/s`
          : formatTokenCount(rawVal);

    const tooltipContent: LensTooltipData = {
      title: `${node.name || node.id} ${detail.isTopConsumer ? "⚡ [TOP CONSUMER]" : ""}`,
      subtitle: `Tier ${detail.tier.toUpperCase()} • Cost: ${formatCostUsd(detail.costUsd)} • Total: ${formatTokenCount(detail.totalTokens)}`,
      primaryMetric: {
        label:
          metric === "costUsd"
            ? "Estimated LLM Cost"
            : metric === "costIntensity"
              ? "Cost Density / Velocity"
              : "Token Consumption",
        formatted: formattedMetric,
        unit: metric === "costUsd" ? "USD" : "tokens",
        raw: rawVal,
      },
      factors: [
        {
          label: "Prompt (Input) Tokens",
          value: formatTokenCount(detail.promptTokens),
          percentage:
            detail.totalTokens > 0
              ? Math.round((detail.promptTokens / detail.totalTokens) * 100)
              : 0,
        },
        {
          label: "Completion (Output) Tokens",
          value: formatTokenCount(detail.completionTokens),
          percentage:
            detail.totalTokens > 0
              ? Math.round((detail.completionTokens / detail.totalTokens) * 100)
              : 0,
        },
        {
          label: "Reasoning (Thinking) Tokens",
          value: formatTokenCount(detail.reasoningTokens),
          percentage:
            detail.totalTokens > 0
              ? Math.round((detail.reasoningTokens / detail.totalTokens) * 100)
              : 0,
        },
        {
          label: "Cache Read Tokens",
          value: formatTokenCount(detail.cacheReadTokens),
        },
        {
          label: "Cache Creation Tokens",
          value: formatTokenCount(detail.cacheCreationTokens),
        },
        {
          label: "Est. Total Cost",
          value: formatCostUsd(detail.costUsd),
        },
      ],
      summaryNote:
        detail.totalTokens > 0
          ? `Consumes ${((detail.totalTokens / Math.max(1, totalTokensSum)) * 100).toFixed(1)}% of total graph tokens.`
          : "No token consumption recorded for this node.",
    };

    nodeOverlays.set(node.id, {
      nodeId: node.id,
      rawValue: rawVal,
      normalizedValue: normalized,
      color,
      fillColor,
      borderColor,
      glowColor,
      glowIntensity,
      isFiltered,
      opacity,
      badgeText,
      badgeVariant,
      metricFormatted: formattedMetric,
      metricUnit: metric === "costUsd" ? "USD" : "tokens",
      tooltipContent,
      tokenBreakdown: {
        promptTokens: detail.promptTokens,
        completionTokens: detail.completionTokens,
        reasoningTokens: detail.reasoningTokens,
        cacheReadTokens: detail.cacheReadTokens,
        cacheWriteTokens: detail.cacheCreationTokens,
        totalTokens: detail.totalTokens,
        costUsd: detail.costUsd,
      },
    });
  }

  // Edge Overlays (Token payload transfer across channels)
  const edgeOverlays = new Map<string, EdgeLensOverlay>();
  const edgeTokenValues = edges.map((e) => e.traffic?.tokens ?? e.tokens ?? 0);
  const edgeMin = edgeTokenValues.length > 0 ? Math.min(...edgeTokenValues) : 0;
  const edgeMax = edgeTokenValues.length > 0 ? Math.max(...edgeTokenValues) : 1;

  for (const edge of edges) {
    const rawTokens = edge.traffic?.tokens ?? edge.tokens ?? 0;
    const normalized = normalizeValue(rawTokens, edgeMin, edgeMax, config.scaleType);
    const isFiltered = normalized < config.minThreshold || normalized > config.maxThreshold;

    const color = evaluateColorRamp(stops, normalized, config.invertRamp);
    const strokeWidth = 1.5 + normalized * 3.5;
    const opacity = isFiltered ? (config.filterMode === "hide" ? 0 : config.dimOpacity) : 0.85;

    edgeOverlays.set(edge.id, {
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      rawValue: rawTokens,
      normalizedValue: normalized,
      color,
      glowColor: color,
      strokeWidth,
      isCritical: false,
      isSubCritical: false,
      isFiltered,
      opacity,
      trafficTokens: rawTokens,
      badgeText: rawTokens > 0 ? formatTokenCount(rawTokens) : undefined,
    });
  }

  const histogramBuckets: HistogramBucket[] = [];
  const bucketCount = 5;
  const span = (rawMax - rawMin) / bucketCount;

  for (let i = 0; i < bucketCount; i++) {
    const bMin = rawMin + i * span;
    const bMax = i === bucketCount - 1 ? rawMax : rawMin + (i + 1) * span;
    const count = rawValuesList.filter(
      (v) => v >= bMin && (i === bucketCount - 1 ? v <= bMax : v < bMax),
    ).length;
    const midNorm = (i + 0.5) / bucketCount;
    const color = evaluateColorRamp(stops, midNorm, config.invertRamp);

    histogramBuckets.push({
      min: bMin,
      max: bMax,
      count,
      color,
    });
  }

  const unit = metric === "costUsd" ? "USD" : "tokens";

  const legendData: LensLegendData = {
    title: `Token Distribution: ${metric.charAt(0).toUpperCase() + metric.slice(1)}`,
    unit,
    minRaw: rawMin,
    maxRaw: rawMax,
    formattedMin: metric === "costUsd" ? formatCostUsd(rawMin) : formatTokenCount(rawMin),
    formattedMax: metric === "costUsd" ? formatCostUsd(rawMax) : formatTokenCount(rawMax),
    colorStops: [...stops],
    histogramBuckets,
  };

  const summaryStats: LensSummaryStats = {
    lens: "token",
    metricLabel: metric,
    totalNodes: nodes.length,
    activeNodesCount,
    filteredNodesCount,
    rawMin,
    rawMax,
    rawAverage,
    rawMedian,
    rawSum,
    formattedMin: metric === "costUsd" ? formatCostUsd(rawMin) : formatTokenCount(rawMin),
    formattedMax: metric === "costUsd" ? formatCostUsd(rawMax) : formatTokenCount(rawMax),
    formattedAverage:
      metric === "costUsd" ? formatCostUsd(rawAverage) : formatTokenCount(rawAverage),
    formattedSum: metric === "costUsd" ? formatCostUsd(rawSum) : formatTokenCount(rawSum),
    unit,
    totalCostUsd: Number(totalCostSum.toFixed(4)),
    totalTokens: totalTokensSum,
  };

  return {
    nodeOverlays,
    edgeOverlays,
    summaryStats,
    legendData,
    tokenDetails,
  };
}
