import type {
  GraphEdgeData,
  GraphNodeData,
  PositionedEdge,
  PositionedNode,
} from "../../../types/graphData";
import { evaluateColorRamp, normalizeValue, resolveColorStops, rgbaString } from "./colorRamps";
import type {
  EdgeLensOverlay,
  HeatmapMetric,
  HistogramBucket,
  LensConfig,
  LensLegendData,
  LensSummaryStats,
  LensTooltipData,
  NodeLensOverlay,
} from "./types";

// ============================================================================
// Value Extraction & Formatting
// ============================================================================

/**
 * Extracts raw numeric value for a node based on the selected HeatmapMetric.
 */
export function extractNodeHeatmapValue(node: GraphNodeData, metric: HeatmapMetric): number {
  switch (metric) {
    case "duration": {
      // Priority: node.metrics.durationMs -> timingBreakdown.wallDurationMs -> metadata.durationMs -> command durations
      if (node.metrics?.durationMs !== undefined && node.metrics.durationMs > 0) {
        return node.metrics.durationMs;
      }
      if (node.metrics?.timingBreakdown?.wallDurationMs !== undefined) {
        return node.metrics.timingBreakdown.wallDurationMs;
      }
      if (node.metrics?.timing?.wallDurationMs !== undefined) {
        return node.metrics.timing.wallDurationMs;
      }
      if (node.metadata?.durationMs !== undefined) {
        return node.metadata.durationMs;
      }
      if (node.metadata?.commands && node.metadata.commands.length > 0) {
        return node.metadata.commands.reduce((sum, cmd) => sum + (cmd.durationMs || 0), 0);
      }
      if (node.provenance?.events && node.provenance.events.length > 0) {
        return node.provenance.events.reduce((sum, ev) => sum + (ev.durationMs || 0), 0);
      }
      return 0;
    }

    case "frequency": {
      // Count visits, retries, chain of custody events, or step attempts
      let count = 1;
      if (node.metrics?.retries !== undefined) {
        count += node.metrics.retries;
      }
      if (node.metrics?.repairRounds !== undefined) {
        count += node.metrics.repairRounds;
      }
      if (node.metadata?.repairRounds !== undefined) {
        count += node.metadata.repairRounds;
      }
      if (node.provenance?.events && node.provenance.events.length > 0) {
        count = Math.max(count, node.provenance.events.length);
      }
      if (node.provenance?.totalAttempts !== undefined) {
        count = Math.max(count, node.provenance.totalAttempts);
      }
      return count;
    }

    case "cognitiveLatency": {
      if (node.metrics?.timingBreakdown?.cognitiveLatencyMs !== undefined) {
        return node.metrics.timingBreakdown.cognitiveLatencyMs;
      }
      if (node.metrics?.timingBreakdown?.thinkDurationMs !== undefined) {
        return node.metrics.timingBreakdown.thinkDurationMs;
      }
      if (node.metrics?.timing?.cognitiveLatencyMs !== undefined) {
        return node.metrics.timing.cognitiveLatencyMs;
      }
      if (node.metrics?.timing?.thinkDurationMs !== undefined) {
        return node.metrics.timing.thinkDurationMs;
      }
      // If tier is high or thinking effort is high, estimate a baseline if duration is present
      const duration = extractNodeHeatmapValue(node, "duration");
      if (node.hostAgent?.reasoningEffort === "high" || node.tier === "l") {
        return duration * 0.6;
      }
      return duration * 0.2;
    }

    case "toolDuration": {
      if (node.metrics?.timingBreakdown?.toolDurationMs !== undefined) {
        return node.metrics.timingBreakdown.toolDurationMs;
      }
      if (node.metrics?.timingBreakdown?.activeCommandDurationMs !== undefined) {
        return node.metrics.timingBreakdown.activeCommandDurationMs;
      }
      if (node.metrics?.timing?.toolDurationMs !== undefined) {
        return node.metrics.timing.toolDurationMs;
      }
      if (node.metadata?.commands && node.metadata.commands.length > 0) {
        return node.metadata.commands.reduce((sum, cmd) => sum + (cmd.durationMs || 0), 0);
      }
      return 0;
    }

    case "queueWait": {
      // Estimate wait latency between step trigger and execution start
      const wall = extractNodeHeatmapValue(node, "duration");
      const cog = extractNodeHeatmapValue(node, "cognitiveLatency");
      const tool = extractNodeHeatmapValue(node, "toolDuration");
      const overhead = Math.max(0, wall - cog - tool);
      return overhead;
    }

    default:
      return 0;
  }
}

/**
 * Extracts raw numeric value for an edge based on traffic / latency.
 */
export function extractEdgeHeatmapValue(edge: GraphEdgeData): number {
  if (edge.traffic?.avgLatencyMs !== undefined && edge.traffic.avgLatencyMs > 0) {
    return edge.traffic.avgLatencyMs;
  }
  if (edge.traffic?.exchanges && edge.traffic.exchanges.length > 0) {
    const totalLatency = edge.traffic.exchanges.reduce(
      (sum, ex) => sum + (ex.durationMs || ex.latencyMs || 0),
      0,
    );
    return totalLatency / edge.traffic.exchanges.length;
  }
  if (edge.weight !== undefined && edge.weight > 0) {
    return edge.weight;
  }
  return 0;
}

/**
 * Formats duration in milliseconds to human-friendly string.
 */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Formats a metric value according to its type.
 */
export function formatMetricValue(val: number, metric: HeatmapMetric): string {
  if (metric === "frequency") {
    return `${Math.round(val)}x`;
  }
  return formatDurationMs(val);
}

/**
 * Returns the unit string for a metric.
 */
export function getMetricUnit(metric: HeatmapMetric): string {
  if (metric === "frequency") return "runs";
  return "ms";
}

// ============================================================================
// Heatmap Evaluation Engine
// ============================================================================

export interface HeatmapEvaluationResult {
  nodeOverlays: Map<string, NodeLensOverlay>;
  edgeOverlays: Map<string, EdgeLensOverlay>;
  summaryStats: LensSummaryStats;
  legendData: LensLegendData;
}

export function evaluateHeatmapLens(
  nodes: readonly PositionedNode[],
  edges: readonly PositionedEdge[],
  config: LensConfig,
): HeatmapEvaluationResult {
  const metric = config.heatmapMetric;
  const stops = resolveColorStops(config.colorRamp, config.customStops);

  // Extract raw values for all nodes
  const nodeValues = new Map<string, number>();
  const rawValuesList: number[] = [];

  for (const node of nodes) {
    const val = extractNodeHeatmapValue(node, metric);
    nodeValues.set(node.id, val);
    rawValuesList.push(val);
  }

  // Calculate domain bounds
  const rawMin = rawValuesList.length > 0 ? Math.min(...rawValuesList) : 0;
  const rawMax = rawValuesList.length > 0 ? Math.max(...rawValuesList) : 1;
  const rawSum = rawValuesList.reduce((a, b) => a + b, 0);
  const rawAverage = rawValuesList.length > 0 ? rawSum / rawValuesList.length : 0;

  // Sorted list for quantile scaling and median
  const sortedValues = [...rawValuesList].sort((a, b) => a - b);
  const rawMedian =
    sortedValues.length > 0
      ? sortedValues.length % 2 === 0
        ? (sortedValues[sortedValues.length / 2 - 1] + sortedValues[sortedValues.length / 2]) / 2
        : sortedValues[Math.floor(sortedValues.length / 2)]
      : 0;

  // Evaluate Node Overlays
  const nodeOverlays = new Map<string, NodeLensOverlay>();
  let activeNodesCount = 0;
  let filteredNodesCount = 0;

  for (const node of nodes) {
    const rawVal = nodeValues.get(node.id) ?? 0;
    const normalized = normalizeValue(rawVal, rawMin, rawMax, config.scaleType, sortedValues);

    // Check thresholds
    const meetsThreshold = normalized >= config.minThreshold && normalized <= config.maxThreshold;

    const isFiltered = !meetsThreshold;
    if (isFiltered) {
      filteredNodesCount++;
    } else {
      activeNodesCount++;
    }

    const color = evaluateColorRamp(stops, normalized, config.invertRamp);
    const fillColor = rgbaString(color, isFiltered ? config.dimOpacity * 0.4 : 0.18);
    const borderColor = rgbaString(color, isFiltered ? config.dimOpacity * 0.6 : 0.85);
    const glowColor = color;
    const glowIntensity = config.showGlow && !isFiltered ? config.glowIntensity * normalized : 0;
    const opacity = isFiltered ? (config.filterMode === "hide" ? 0 : config.dimOpacity) : 1;

    const formattedVal = formatMetricValue(rawVal, metric);
    const unit = getMetricUnit(metric);

    // Build rich tooltip
    const totalDuration = extractNodeHeatmapValue(node, "duration");
    const cognitive = extractNodeHeatmapValue(node, "cognitiveLatency");
    const tool = extractNodeHeatmapValue(node, "toolDuration");
    const overhead = Math.max(0, totalDuration - cognitive - tool);

    const tooltipContent: LensTooltipData = {
      title: node.name || node.id,
      subtitle: `Kind: ${node.kind || "agent"} • Status: ${node.status || "completed"}`,
      primaryMetric: {
        label:
          metric === "duration"
            ? "Wall Duration"
            : metric === "frequency"
              ? "Execution Frequency"
              : metric === "cognitiveLatency"
                ? "Cognitive Latency"
                : "Tool Duration",
        formatted: formattedVal,
        unit,
        raw: rawVal,
      },
      factors: [
        {
          label: "Wall Clock Duration",
          value: formatDurationMs(totalDuration),
          percentage: totalDuration > 0 ? Math.round((totalDuration / (rawMax || 1)) * 100) : 0,
        },
        {
          label: "Thinking / Cognitive Time",
          value: formatDurationMs(cognitive),
          percentage: totalDuration > 0 ? Math.round((cognitive / totalDuration) * 100) : 0,
        },
        {
          label: "Tool / Command Execution",
          value: formatDurationMs(tool),
          percentage: totalDuration > 0 ? Math.round((tool / totalDuration) * 100) : 0,
        },
        {
          label: "Framework & Queue Overhead",
          value: formatDurationMs(overhead),
          percentage: totalDuration > 0 ? Math.round((overhead / totalDuration) * 100) : 0,
        },
      ],
      summaryNote:
        rawVal >= rawAverage
          ? `Above average execution time (${Math.round((rawVal / (rawAverage || 1)) * 100)}% of mean)`
          : `Below average execution time`,
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
      badgeText: formattedVal,
      badgeVariant: normalized > 0.75 ? "error" : normalized > 0.4 ? "warning" : "info",
      metricFormatted: formattedVal,
      metricUnit: unit,
      tooltipContent,
    });
  }

  // Evaluate Edge Overlays
  const edgeOverlays = new Map<string, EdgeLensOverlay>();
  const edgeRawValues = edges.map(extractEdgeHeatmapValue);
  const edgeMin = edgeRawValues.length > 0 ? Math.min(...edgeRawValues) : 0;
  const edgeMax = edgeRawValues.length > 0 ? Math.max(...edgeRawValues) : 1;

  for (const edge of edges) {
    const rawVal = extractEdgeHeatmapValue(edge);
    const normalized = normalizeValue(rawVal, edgeMin, edgeMax, config.scaleType);
    const isFiltered = normalized < config.minThreshold || normalized > config.maxThreshold;

    const color = evaluateColorRamp(stops, normalized, config.invertRamp);
    const strokeWidth = 1.5 + normalized * 3.5;
    const opacity = isFiltered ? (config.filterMode === "hide" ? 0 : config.dimOpacity) : 0.85;

    edgeOverlays.set(edge.id, {
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      rawValue: rawVal,
      normalizedValue: normalized,
      color,
      glowColor: color,
      strokeWidth,
      isCritical: false,
      isSubCritical: false,
      isFiltered,
      opacity,
      latencyMs: rawVal,
      badgeText: rawVal > 0 ? formatDurationMs(rawVal) : undefined,
    });
  }

  // Create Histogram Buckets for Legend
  const bucketCount = 5;
  const histogramBuckets: HistogramBucket[] = [];
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

  const unit = getMetricUnit(metric);

  const legendData: LensLegendData = {
    title: `Heatmap: ${metric.charAt(0).toUpperCase() + metric.slice(1)}`,
    unit,
    minRaw: rawMin,
    maxRaw: rawMax,
    formattedMin: formatMetricValue(rawMin, metric),
    formattedMax: formatMetricValue(rawMax, metric),
    colorStops: [...stops],
    histogramBuckets,
  };

  const summaryStats: LensSummaryStats = {
    lens: "heatmap",
    metricLabel: metric,
    totalNodes: nodes.length,
    activeNodesCount,
    filteredNodesCount,
    rawMin,
    rawMax,
    rawAverage,
    rawMedian,
    rawSum,
    formattedMin: formatMetricValue(rawMin, metric),
    formattedMax: formatMetricValue(rawMax, metric),
    formattedAverage: formatMetricValue(rawAverage, metric),
    formattedSum: formatMetricValue(rawSum, metric),
    unit,
  };

  return {
    nodeOverlays,
    edgeOverlays,
    summaryStats,
    legendData,
  };
}
