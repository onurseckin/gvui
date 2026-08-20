import type { ModelTier, PositionedEdge, PositionedNode } from "../../../types/graphData";
import { UNKNOWN_LABEL } from "../../../state/graphSchema";
import { evaluateColorRamp, normalizeValue, resolveColorStops, rgbaString } from "./colorRamps";
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
// Token & Cost Extraction Utilities
// ============================================================================

/**
 * Host-reported tier only. A tier is never derived from a model name: that would dress a guess up
 * as a measurement, and the chip it feeds is indistinguishable from a reported one.
 */
function resolveReportedTier(node: PositionedNode): ModelTier | "unknown" {
  const reported = node.telemetry?.modelTier?.value ?? node.hostAgent?.tier;
  if (typeof reported !== "string") return "unknown";
  const normalized = reported.toLowerCase();
  if (normalized === "xs" || normalized === "s" || normalized === "m" || normalized === "l") {
    return normalized;
  }
  return "unknown";
}

/** Wall duration exactly as the run recorded it, or nothing. */
function readRecordedDurationMs(node: PositionedNode): number | undefined {
  const candidates = [node.metrics?.durationMs, node.metrics?.timingBreakdown?.wallDurationMs];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Recorded counts only. A node that reported nothing gets no number at all: summing five absences
 * into a zero would report a measurement the run never took.
 */
export function extractNodeTokenDetail(node: PositionedNode): NodeTokenDetail {
  const t = node.metrics?.tokens;
  const m = node.metrics;

  const promptTokens = t?.promptTokens ?? m?.tokensIn;
  const completionTokens = t?.completionTokens ?? m?.tokensOut;
  const reasoningTokens = t?.reasoningTokens;
  const cacheCreationTokens = t?.cacheCreationTokens;
  const cacheReadTokens = t?.cacheReadTokens;

  const parts = [
    promptTokens,
    completionTokens,
    reasoningTokens,
    cacheCreationTokens,
    cacheReadTokens,
  ].filter((part): part is number => typeof part === "number" && Number.isFinite(part));
  const totalTokens =
    t?.totalTokens ?? (parts.length > 0 ? parts.reduce((sum, part) => sum + part, 0) : undefined);

  // Recorded dollars only. There is no rate card in this codebase, so a run whose nodes never
  // carried a cost simply has no cost to show.
  const recordedCost =
    typeof m?.costUsd === "number" && Number.isFinite(m.costUsd) ? m.costUsd : undefined;

  // Dollars per second needs a duration the run measured. Falling back to a nominal one would
  // turn a recorded cost into an invented rate.
  const durationMs = readRecordedDurationMs(node);
  const costIntensity =
    recordedCost === undefined || durationMs === undefined || durationMs <= 0
      ? undefined
      : (recordedCost / (durationMs / 1000)) * 1000;

  return {
    nodeId: node.id,
    promptTokens,
    completionTokens,
    reasoningTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens,
    costUsd: recordedCost === undefined ? undefined : Number(recordedCost.toFixed(6)),
    costIntensity: costIntensity === undefined ? undefined : Number(costIntensity.toFixed(6)),
    tier: resolveReportedTier(node),
    isTopConsumer: false, // Calculated after sorting all nodes
  };
}

/**
 * Formats a recorded token count (e.g. 1.2k, 45.8k, 2.4M). A count nobody recorded is not a count
 * and renders as unknown, because "0 tok" claims a measurement the run never took.
 */
export function formatTokenCount(tokens: number | undefined): string {
  if (tokens === undefined) return UNKNOWN_LABEL;
  if (!Number.isFinite(tokens) || tokens <= 0) return "0 tok";
  if (tokens < 1000) return `${Math.round(tokens)} tok`;
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k tok`;
  return `${(tokens / 1_000_000).toFixed(2)}M tok`;
}

/**
 * Formats USD cost cleanly. An absent cost renders as "unknown" rather than as a confident $0.00.
 */
export function formatCostUsd(usd: number | undefined): string {
  if (usd === undefined || !Number.isFinite(usd)) return UNKNOWN_LABEL;
  if (usd <= 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Cost per second of recorded duration; absent whenever the underlying cost is. */
export function formatCostIntensity(intensity: number | undefined): string {
  if (intensity === undefined || !Number.isFinite(intensity)) return UNKNOWN_LABEL;
  return `$${intensity.toFixed(3)}/s`;
}

/** Formats a legend or summary bound in the units of the active metric. */
function formatMetricBound(metric: TokenMetric, value: number | undefined): string {
  if (metric === "costUsd") return formatCostUsd(value);
  if (metric === "costIntensity") return formatCostIntensity(value);
  return formatTokenCount(value);
}

/**
 * Extracts raw metric value based on TokenMetric. Cost metrics come back undefined when the node
 * carries no recorded dollars, so callers can tell "no cost reported" from "cost was zero".
 */
export function extractNodeTokenMetricValue(
  detail: NodeTokenDetail,
  metric: TokenMetric,
): number | undefined {
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

/**
 * A component's share of a node's total. Both numbers have to be recorded for a share to exist:
 * a percentage of an unknown total is arithmetic on a value nobody measured.
 */
function shareOfTotal(
  part: number | undefined,
  total: number | undefined,
): { percentage?: number } {
  if (part === undefined || total === undefined || total <= 0) return {};
  return { percentage: Math.round((part / total) * 100) };
}

/** What this node took of the graph, or a plain statement that nothing was recorded for it. */
function summariseConsumption(total: number | undefined, graphTotal: number | undefined): string {
  if (total === undefined) return "No token consumption recorded for this node.";
  if (graphTotal === undefined || graphTotal <= 0) {
    return `Consumed ${formatTokenCount(total)}; the graph has no positive total to take a share of.`;
  }
  return `Consumes ${((total / graphTotal) * 100).toFixed(1)}% of total graph tokens.`;
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
  const nodeValues = new Map<string, number | undefined>();

  // Stays undefined until some node actually reports tokens, so a silent run totals to nothing
  // rather than to a confident zero.
  let totalTokensSum: number | undefined;
  // Stays undefined until some node actually reports dollars, so an unpriced run totals to nothing
  // rather than to a confident zero.
  let totalCostSum: number | undefined;

  for (const node of nodes) {
    const detail = extractNodeTokenDetail(node);
    tokenDetails.set(node.id, detail);
    const val = extractNodeTokenMetricValue(detail, metric);
    nodeValues.set(node.id, val);
    if (val !== undefined) rawValuesList.push(val);

    if (detail.totalTokens !== undefined)
      totalTokensSum = (totalTokensSum ?? 0) + detail.totalTokens;
    if (detail.costUsd !== undefined) totalCostSum = (totalCostSum ?? 0) + detail.costUsd;
  }

  // Pareto 80/20 Rule: Flag top 20% consumer nodes. A node that reported no tokens cannot be one
  // of the biggest consumers, so it ranks last rather than as a zero-token measurement.
  const sortedByTokens = Array.from(tokenDetails.values()).sort(
    (a, b) => (b.totalTokens ?? -1) - (a.totalTokens ?? -1),
  );
  const topCount = Math.max(1, Math.ceil(nodes.length * 0.2));
  for (let i = 0; i < Math.min(topCount, sortedByTokens.length); i++) {
    const total = sortedByTokens[i].totalTokens;
    if (total !== undefined && total > 0) {
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
    const rawVal = nodeValues.get(node.id);
    // An unreported metric has no place on the ramp; it sits at the floor and says so in its badge.
    const normalized =
      rawVal === undefined
        ? 0
        : normalizeValue(rawVal, rawMin, rawMax, config.scaleType, sortedValues);

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
      badgeText = formatCostIntensity(detail.costIntensity);
      badgeVariant = "indigo";
    } else {
      badgeText = formatTokenCount(rawVal);
      badgeVariant = detail.isTopConsumer ? "amber" : "info";
    }

    const formattedMetric =
      metric === "costUsd"
        ? formatCostUsd(rawVal)
        : metric === "costIntensity"
          ? formatCostIntensity(rawVal)
          : formatTokenCount(rawVal);

    const tooltipContent: LensTooltipData = {
      title: `${node.name || node.id} ${detail.isTopConsumer ? "⚡ [TOP CONSUMER]" : ""}`,
      subtitle: `Tier ${detail.tier === "unknown" ? UNKNOWN_LABEL : detail.tier.toUpperCase()} • Cost: ${formatCostUsd(detail.costUsd)} • Total: ${formatTokenCount(detail.totalTokens)}`,
      primaryMetric: {
        label:
          metric === "costUsd"
            ? "Recorded LLM Cost"
            : metric === "costIntensity"
              ? "Cost Density / Velocity"
              : "Token Consumption",
        formatted: formattedMetric,
        unit: metric === "costUsd" ? "USD" : "tokens",
        ...(rawVal === undefined ? {} : { raw: rawVal }),
      },
      factors: [
        {
          label: "Prompt (Input) Tokens",
          value: formatTokenCount(detail.promptTokens),
          ...shareOfTotal(detail.promptTokens, detail.totalTokens),
        },
        {
          label: "Completion (Output) Tokens",
          value: formatTokenCount(detail.completionTokens),
          ...shareOfTotal(detail.completionTokens, detail.totalTokens),
        },
        {
          label: "Reasoning (Thinking) Tokens",
          value: formatTokenCount(detail.reasoningTokens),
          ...shareOfTotal(detail.reasoningTokens, detail.totalTokens),
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
          label: "Recorded Total Cost",
          value: formatCostUsd(detail.costUsd),
        },
      ],
      summaryNote: summariseConsumption(detail.totalTokens, totalTokensSum),
    };

    nodeOverlays.set(node.id, {
      nodeId: node.id,
      ...(rawVal === undefined ? {} : { rawValue: rawVal }),
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
  // Only edges whose traffic was actually recorded take part in the scale.
  const edgeTokenValues = edges
    .map((e) => e.traffic?.tokens)
    .filter((tokens): tokens is number => tokens !== undefined);
  const edgeMin = edgeTokenValues.length > 0 ? Math.min(...edgeTokenValues) : 0;
  const edgeMax = edgeTokenValues.length > 0 ? Math.max(...edgeTokenValues) : 1;

  for (const edge of edges) {
    const rawTokens = edge.traffic?.tokens;
    const normalized =
      rawTokens === undefined ? 0 : normalizeValue(rawTokens, edgeMin, edgeMax, config.scaleType);
    const isFiltered = normalized < config.minThreshold || normalized > config.maxThreshold;

    const color = evaluateColorRamp(stops, normalized, config.invertRamp);
    const strokeWidth = 1.5 + normalized * 3.5;
    const opacity = isFiltered ? (config.filterMode === "hide" ? 0 : config.dimOpacity) : 0.85;

    edgeOverlays.set(edge.id, {
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      ...(rawTokens === undefined ? {} : { rawValue: rawTokens, trafficTokens: rawTokens }),
      normalizedValue: normalized,
      color,
      glowColor: color,
      strokeWidth,
      isCritical: false,
      isSubCritical: false,
      isFiltered,
      opacity,
      badgeText: rawTokens !== undefined && rawTokens > 0 ? formatTokenCount(rawTokens) : undefined,
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
  const hasValues = rawValuesList.length > 0;

  const legendData: LensLegendData = {
    title: `Token Distribution: ${metric.charAt(0).toUpperCase() + metric.slice(1)}`,
    unit,
    minRaw: rawMin,
    maxRaw: rawMax,
    formattedMin: formatMetricBound(metric, hasValues ? rawMin : undefined),
    formattedMax: formatMetricBound(metric, hasValues ? rawMax : undefined),
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
    formattedMin: formatMetricBound(metric, hasValues ? rawMin : undefined),
    formattedMax: formatMetricBound(metric, hasValues ? rawMax : undefined),
    formattedAverage: formatMetricBound(metric, hasValues ? rawAverage : undefined),
    formattedSum: formatMetricBound(metric, hasValues ? rawSum : undefined),
    unit,
    totalCostUsd: totalCostSum === undefined ? undefined : Number(totalCostSum.toFixed(4)),
    ...(totalTokensSum === undefined ? {} : { totalTokens: totalTokensSum }),
  };

  return {
    nodeOverlays,
    edgeOverlays,
    summaryStats,
    legendData,
    tokenDetails,
  };
}
