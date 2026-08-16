import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import { evaluateCriticalPathLens } from "./criticalPathLens";
import { evaluateHeatmapLens } from "./heatmapLens";
import { evaluateRiskLens } from "./riskLens";
import { evaluateTokenLens } from "./tokenLens";
import type {
  EdgeLensOverlay,
  LensConfig,
  LensEvaluationResult,
  LensLegendData,
  LensSummaryStats,
  NodeLensOverlay,
} from "./types";

/**
 * Empty baseline result when no lens is active ("none").
 */
export function createEmptyEvaluationResult(
  nodes: readonly PositionedNode[],
  edges: readonly PositionedEdge[],
): LensEvaluationResult {
  const nodeOverlays = new Map<string, NodeLensOverlay>();
  const edgeOverlays = new Map<string, EdgeLensOverlay>();

  for (const node of nodes) {
    nodeOverlays.set(node.id, {
      nodeId: node.id,
      rawValue: 0,
      normalizedValue: 0,
      color: "#64748b",
      fillColor: "transparent",
      borderColor: "transparent",
      glowColor: "transparent",
      glowIntensity: 0,
      isFiltered: false,
      opacity: 1,
      badgeText: "",
      badgeVariant: "neutral",
      metricFormatted: "",
      metricUnit: "",
      tooltipContent: {
        title: node.name || node.id,
        primaryMetric: {
          label: "No Lens Active",
          formatted: "-",
          raw: 0,
        },
        factors: [],
      },
    });
  }

  for (const edge of edges) {
    edgeOverlays.set(edge.id, {
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      rawValue: 0,
      normalizedValue: 0,
      color: "#64748b",
      glowColor: "transparent",
      strokeWidth: 1.5,
      isCritical: false,
      isSubCritical: false,
      isFiltered: false,
      opacity: 1,
    });
  }

  const legendData: LensLegendData = {
    title: "No Lens Active",
    unit: "",
    minRaw: 0,
    maxRaw: 0,
    formattedMin: "0",
    formattedMax: "0",
    colorStops: [],
    histogramBuckets: [],
  };

  const summaryStats: LensSummaryStats = {
    lens: "none",
    metricLabel: "none",
    totalNodes: nodes.length,
    activeNodesCount: nodes.length,
    filteredNodesCount: 0,
    rawMin: 0,
    rawMax: 0,
    rawAverage: 0,
    rawMedian: 0,
    rawSum: 0,
    formattedMin: "0",
    formattedMax: "0",
    formattedAverage: "0",
    formattedSum: "0",
    unit: "",
  };

  return {
    lens: "none",
    metricName: "none",
    nodeOverlays,
    edgeOverlays,
    summaryStats,
    legendData,
  };
}

/**
 * Unified lens evaluation entry point.
 */
export function evaluateCanvasLens(
  nodes: readonly PositionedNode[],
  edges: readonly PositionedEdge[],
  config: LensConfig,
): LensEvaluationResult {
  if (config.lens === "none" || nodes.length === 0) {
    return createEmptyEvaluationResult(nodes, edges);
  }

  switch (config.lens) {
    case "heatmap": {
      const res = evaluateHeatmapLens(nodes, edges, config);
      return {
        lens: "heatmap",
        metricName: config.heatmapMetric,
        nodeOverlays: res.nodeOverlays,
        edgeOverlays: res.edgeOverlays,
        summaryStats: res.summaryStats,
        legendData: res.legendData,
      };
    }

    case "critical-path": {
      const res = evaluateCriticalPathLens(nodes, edges, config);
      return {
        lens: "critical-path",
        metricName: config.criticalPathMetric,
        nodeOverlays: res.nodeOverlays,
        edgeOverlays: res.edgeOverlays,
        summaryStats: res.summaryStats,
        legendData: res.legendData,
        criticalPathData: res.criticalPathData,
      };
    }

    case "risk": {
      const res = evaluateRiskLens(nodes, edges, config);
      return {
        lens: "risk",
        metricName: config.riskMetric,
        nodeOverlays: res.nodeOverlays,
        edgeOverlays: res.edgeOverlays,
        summaryStats: res.summaryStats,
        legendData: res.legendData,
      };
    }

    case "token": {
      const res = evaluateTokenLens(nodes, edges, config);
      return {
        lens: "token",
        metricName: config.tokenMetric,
        nodeOverlays: res.nodeOverlays,
        edgeOverlays: res.edgeOverlays,
        summaryStats: res.summaryStats,
        legendData: res.legendData,
      };
    }

    default:
      return createEmptyEvaluationResult(nodes, edges);
  }
}
