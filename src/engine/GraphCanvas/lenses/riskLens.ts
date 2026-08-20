import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import {
  clamp,
  evaluateColorRamp,
  normalizeValue,
  resolveColorStops,
  rgbaString,
} from "./colorRamps";
import type {
  EdgeLensOverlay,
  HistogramBucket,
  LensConfig,
  LensLegendData,
  LensSummaryStats,
  LensTooltipData,
  NodeLensOverlay,
  NodeRiskDetail,
  RiskMetric,
  RiskWeightConfig,
} from "./types";

// ============================================================================
// Multi-Factor Risk Assessment Engine
// ============================================================================

/**
 * Calculates detailed risk breakdown for a single node.
 */
export function calculateNodeRisk(
  node: PositionedNode,
  allNodes: readonly PositionedNode[],
  allEdges: readonly PositionedEdge[],
  weights: RiskWeightConfig,
): NodeRiskDetail {
  // 1. Status Risk (0.0 - 1.0)
  let statusRisk = 0;
  let errorCount = 0;
  if (node.status === "error") {
    statusRisk = 1.0;
    errorCount++;
  } else if (node.status === "warning") {
    statusRisk = 0.6;
  } else if (node.status === "running") {
    statusRisk = 0.2;
  } else if (node.status === "pending") {
    statusRisk = 0.1;
  } else if (node.status === "skipped") {
    statusRisk = 0.05;
  } else {
    statusRisk = 0.0;
  }

  // 2. Retries & Repair Rounds Risk (0.0 - 1.0)
  let retryCount = 0;
  if (node.metrics?.retries !== undefined) retryCount += node.metrics.retries;
  if (node.metrics?.repairRounds !== undefined) retryCount += node.metrics.repairRounds;
  if (node.metadata?.repairRounds !== undefined) retryCount += node.metadata.repairRounds;
  if (node.provenance?.events) {
    const errorEvents = node.provenance.events.filter(
      (e) => e.status === "error" || e.status === "rejected",
    );
    retryCount += errorEvents.length;
    errorCount += errorEvents.length;
  }

  // Retries risk curve: 1 retry -> 0.4, 2 retries -> 0.7, 3+ -> 1.0
  const retriesRisk = clamp(retryCount >= 3 ? 1.0 : retryCount * 0.35, 0, 1);

  // 3. Findings & Audit Severity Risk (0.0 - 1.0)
  let findingCount = 0;
  let criticalFindingCount = 0;

  if (node.metadata?.findings && node.metadata.findings.length > 0) {
    for (const f of node.metadata.findings) {
      if (f.status === "open") {
        findingCount++;
        if (f.severity === "critical") criticalFindingCount++;
      }
    }
  }

  if (node.provenance?.remediations && node.provenance.remediations.length > 0) {
    for (const rem of node.provenance.remediations) {
      if (rem.status === "open") {
        findingCount++;
        if (rem.severity === "critical") criticalFindingCount++;
      }
    }
  }

  const findingsRisk = clamp(
    criticalFindingCount * 0.5 + (findingCount - criticalFindingCount) * 0.2,
    0,
    1,
  );

  // 4. Command Failures Risk (0.0 - 1.0)
  let commandFailures = 0;
  if (node.metadata?.commands && node.metadata.commands.length > 0) {
    for (const cmd of node.metadata.commands) {
      if (cmd.exitCode !== 0) commandFailures++;
    }
  }

  const commandsRisk = clamp(commandFailures > 0 ? 0.5 + commandFailures * 0.25 : 0, 0, 1);

  // 5. Model & Reasoning Complexity Risk (0.0 - 1.0)
  let complexityRisk = 0;
  if (node.telemetry?.modelTier?.value === "l") complexityRisk += 0.4;
  if (node.hostAgent?.reasoningEffort === "high") complexityRisk += 0.3;
  if (node.tools && node.tools.length > 4) complexityRisk += 0.3;
  complexityRisk = clamp(complexityRisk, 0, 1);

  // 6. Blast Radius Risk (Impact of node failure on downstream dependents)
  let outDegree = 0;
  for (const edge of allEdges) {
    if (edge.source === node.id) outDegree++;
  }
  const blastRadiusRisk = clamp(outDegree / Math.max(1, allNodes.length * 0.3), 0, 1);

  // Weighted Composite Risk Score
  const totalWeight =
    weights.statusWeight +
    weights.retriesWeight +
    weights.findingsWeight +
    weights.commandsWeight +
    weights.complexityWeight +
    weights.blastRadiusWeight;

  const rawComposite =
    statusRisk * weights.statusWeight +
    retriesRisk * weights.retriesWeight +
    findingsRisk * weights.findingsWeight +
    commandsRisk * weights.commandsWeight +
    complexityRisk * weights.complexityWeight +
    blastRadiusRisk * weights.blastRadiusWeight;

  const compositeScore = Number((totalWeight > 0 ? rawComposite / totalWeight : 0).toFixed(4));

  // Risk Level Classification
  let level: NodeRiskDetail["level"] = "low";
  if (compositeScore >= 0.75) {
    level = "critical";
  } else if (compositeScore >= 0.5) {
    level = "high";
  } else if (compositeScore >= 0.25) {
    level = "moderate";
  }

  return {
    nodeId: node.id,
    statusRisk,
    retriesRisk,
    findingsRisk,
    commandsRisk,
    complexityRisk,
    blastRadiusRisk,
    compositeScore,
    level,
    errorCount,
    retryCount,
    findingCount,
    criticalFindingCount,
    commandFailures,
  };
}

/**
 * Extracts specific raw value based on selected RiskMetric.
 */
export function extractNodeRiskValue(detail: NodeRiskDetail, metric: RiskMetric): number {
  switch (metric) {
    case "composite":
      return detail.compositeScore;
    case "errorRate":
      return detail.statusRisk;
    case "retryCount":
      return detail.retryCount;
    case "findingSeverity":
      return detail.findingsRisk;
    case "failureProbability":
      return detail.compositeScore;
    case "blastRadius":
      return detail.blastRadiusRisk;
    default:
      return detail.compositeScore;
  }
}

// ============================================================================
// Risk Evaluation Engine
// ============================================================================

export interface RiskEvaluationResult {
  nodeOverlays: Map<string, NodeLensOverlay>;
  edgeOverlays: Map<string, EdgeLensOverlay>;
  summaryStats: LensSummaryStats;
  legendData: LensLegendData;
  riskDetails: Map<string, NodeRiskDetail>;
}

export function evaluateRiskLens(
  nodes: readonly PositionedNode[],
  edges: readonly PositionedEdge[],
  config: LensConfig,
): RiskEvaluationResult {
  const stops = resolveColorStops(
    config.colorRamp === "viridis" ? "risk-alert" : config.colorRamp,
    config.customStops,
  );
  const metric = config.riskMetric;
  const weights = config.riskWeights;

  const riskDetails = new Map<string, NodeRiskDetail>();
  const rawValuesList: number[] = [];
  const nodeValues = new Map<string, number>();

  for (const node of nodes) {
    const detail = calculateNodeRisk(node, nodes, edges, weights);
    riskDetails.set(node.id, detail);
    const val = extractNodeRiskValue(detail, metric);
    nodeValues.set(node.id, val);
    rawValuesList.push(val);
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
  let highRiskNodeCount = 0;

  for (const node of nodes) {
    const detail = riskDetails.get(node.id)!;
    const rawVal = nodeValues.get(node.id) ?? 0;

    const normalized =
      metric === "retryCount"
        ? normalizeValue(rawVal, 0, Math.max(3, rawMax), config.scaleType, sortedValues)
        : normalizeValue(rawVal, 0, 1, config.scaleType, sortedValues);

    if (detail.level === "critical" || detail.level === "high") {
      highRiskNodeCount++;
    }

    // Threshold check
    const meetsThreshold = normalized >= config.minThreshold && normalized <= config.maxThreshold;

    const isFiltered = !meetsThreshold;
    if (isFiltered) {
      filteredNodesCount++;
    } else {
      activeNodesCount++;
    }

    const color = evaluateColorRamp(stops, normalized, config.invertRamp);
    const fillColor = rgbaString(color, isFiltered ? config.dimOpacity * 0.3 : 0.2);
    const borderColor = rgbaString(color, isFiltered ? config.dimOpacity * 0.5 : 0.9);
    const glowColor = color;
    const glowIntensity =
      config.showGlow && !isFiltered
        ? detail.level === "critical"
          ? 1.0
          : config.glowIntensity * normalized
        : 0;
    const opacity = isFiltered ? (config.filterMode === "hide" ? 0 : config.dimOpacity) : 1;

    let badgeText = `${Math.round(normalized * 100)}% Risk`;
    let badgeVariant: NodeLensOverlay["badgeVariant"] = "info";

    if (detail.level === "critical") {
      badgeText = `CRITICAL (${Math.round(detail.compositeScore * 100)}%)`;
      badgeVariant = "error";
    } else if (detail.level === "high") {
      badgeText = `HIGH (${Math.round(detail.compositeScore * 100)}%)`;
      badgeVariant = "amber";
    } else if (detail.level === "moderate") {
      badgeText = `MODERATE (${Math.round(detail.compositeScore * 100)}%)`;
      badgeVariant = "neutral";
    } else {
      badgeText = `LOW (${Math.round(detail.compositeScore * 100)}%)`;
      badgeVariant = "success";
    }

    const formattedMetric = `${Math.round(rawVal * 100)}%`;

    const tooltipContent: LensTooltipData = {
      title: `${node.name || node.id} [${detail.level.toUpperCase()} RISK]`,
      subtitle: `Composite Risk Score: ${(detail.compositeScore * 100).toFixed(1)}%`,
      primaryMetric: {
        label: "Risk Factor",
        formatted: formattedMetric,
        unit: "%",
        raw: rawVal,
      },
      factors: [
        {
          label: "Status / Errors",
          value: `${Math.round(detail.statusRisk * 100)}% (${node.status || "ok"})`,
          severity: detail.statusRisk > 0.5 ? "error" : "normal",
        },
        {
          label: "Retries / Repairs",
          value: `${detail.retryCount} attempts`,
          severity: detail.retryCount > 1 ? "warning" : "normal",
        },
        {
          label: "Audit Findings",
          value: `${detail.findingCount} open (${detail.criticalFindingCount} crit)`,
          severity:
            detail.criticalFindingCount > 0
              ? "critical"
              : detail.findingCount > 0
                ? "warning"
                : "normal",
        },
        {
          label: "Command Failures",
          value: `${detail.commandFailures} failed`,
          severity: detail.commandFailures > 0 ? "error" : "normal",
        },
        {
          label: "Blast Radius Potential",
          value: `${Math.round(detail.blastRadiusRisk * 100)}%`,
        },
      ],
      summaryNote:
        detail.level === "critical"
          ? "Immediate attention needed: Multi-point failures or critical unresolved findings detected."
          : detail.level === "high"
            ? "Elevated failure risk due to repeated retries or command anomalies."
            : "Execution within normal operational risk parameters.",
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
      metricUnit: "%",
      tooltipContent,
      riskScore: detail.compositeScore,
      riskLevel: detail.level,
    });
  }

  // Edge Overlays (Highlight downstream blast edges from high risk nodes)
  const edgeOverlays = new Map<string, EdgeLensOverlay>();

  for (const edge of edges) {
    const srcDetail = riskDetails.get(edge.source);
    const isHighRiskSrc =
      srcDetail && (srcDetail.level === "critical" || srcDetail.level === "high");

    const color = isHighRiskSrc ? "#ef4444" : "#64748b";
    const strokeWidth = isHighRiskSrc ? 3 : 1.5;
    const isFiltered = !isHighRiskSrc && config.filterMode === "highlight";
    const opacity = isFiltered ? (config.filterMode === "hide" ? 0 : config.dimOpacity) : 0.8;

    edgeOverlays.set(edge.id, {
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      rawValue: isHighRiskSrc ? 1 : 0,
      normalizedValue: isHighRiskSrc ? 1 : 0,
      color,
      glowColor: color,
      strokeWidth,
      strokeDasharray: isHighRiskSrc ? "4 2" : undefined,
      isCritical: Boolean(isHighRiskSrc),
      isSubCritical: false,
      isFiltered,
      opacity,
      badgeText: isHighRiskSrc ? "BLAST PATH" : undefined,
    });
  }

  const histogramBuckets: HistogramBucket[] = [];
  const bucketCount = 4;

  for (let i = 0; i < bucketCount; i++) {
    const bMin = i * 0.25;
    const bMax = (i + 1) * 0.25;
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

  const legendData: LensLegendData = {
    title: `Risk Analysis: ${metric.charAt(0).toUpperCase() + metric.slice(1)}`,
    unit: "%",
    minRaw: 0,
    maxRaw: 1,
    formattedMin: "0%",
    formattedMax: "100%",
    colorStops: [...stops],
    histogramBuckets,
  };

  const summaryStats: LensSummaryStats = {
    lens: "risk",
    metricLabel: metric,
    totalNodes: nodes.length,
    activeNodesCount,
    filteredNodesCount,
    rawMin,
    rawMax,
    rawAverage,
    rawMedian,
    rawSum,
    formattedMin: `${Math.round(rawMin * 100)}%`,
    formattedMax: `${Math.round(rawMax * 100)}%`,
    formattedAverage: `${Math.round(rawAverage * 100)}%`,
    formattedSum: `${rawSum.toFixed(2)}`,
    unit: "%",
    highRiskNodeCount,
  };

  return {
    nodeOverlays,
    edgeOverlays,
    summaryStats,
    legendData,
    riskDetails,
  };
}
