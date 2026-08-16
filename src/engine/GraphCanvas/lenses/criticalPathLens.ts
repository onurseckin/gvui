import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import { evaluateColorRamp, normalizeValue, resolveColorStops, rgbaString } from "./colorRamps";
import { extractNodeHeatmapValue, formatDurationMs } from "./heatmapLens";
import type {
  CriticalPathEvaluation,
  CriticalPathNodeInfo,
  EdgeLensOverlay,
  HistogramBucket,
  LensConfig,
  LensLegendData,
  LensSummaryStats,
  LensTooltipData,
  NodeLensOverlay,
} from "./types";

// ============================================================================
// Graph Adjacency & Cycle Detection (Tarjan's / Kahn's algorithm)
// ============================================================================

interface AdjacencyGraph {
  adj: Map<string, string[]>; // Outgoing edges: u -> [v1, v2]
  revAdj: Map<string, string[]>; // Incoming edges: v -> [u1, u2]
  edgeMap: Map<string, PositionedEdge>; // "u->v" -> Edge
  nodeMap: Map<string, PositionedNode>;
  inDegree: Map<string, number>;
  outDegree: Map<string, number>;
}

export function buildAdjacencyGraph(
  nodes: readonly PositionedNode[],
  edges: readonly PositionedEdge[],
): AdjacencyGraph {
  const adj = new Map<string, string[]>();
  const revAdj = new Map<string, string[]>();
  const edgeMap = new Map<string, PositionedEdge>();
  const nodeMap = new Map<string, PositionedNode>();
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const node of nodes) {
    adj.set(node.id, []);
    revAdj.set(node.id, []);
    nodeMap.set(node.id, node);
    inDegree.set(node.id, 0);
    outDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      // Avoid duplicate edges in adjacency
      const currentAdj = adj.get(edge.source) || [];
      if (!currentAdj.includes(edge.target)) {
        currentAdj.push(edge.target);
        adj.set(edge.source, currentAdj);

        const currentRev = revAdj.get(edge.target) || [];
        currentRev.push(edge.source);
        revAdj.set(edge.target, currentRev);

        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
        outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
      }
      edgeMap.set(`${edge.source}->${edge.target}`, edge);
    }
  }

  return { adj, revAdj, edgeMap, nodeMap, inDegree, outDegree };
}

/**
 * Detects cycles using DFS with 3 colors (0: unvisited, 1: visiting, 2: visited).
 * Returns array of cycles found.
 */
export function detectCycles(
  nodes: readonly PositionedNode[],
  adj: Map<string, string[]>,
): string[][] {
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const cycles: string[][] = [];

  for (const node of nodes) {
    color.set(node.id, 0);
  }

  function dfs(u: string, stack: string[]): void {
    color.set(u, 1);
    stack.push(u);

    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      if (color.get(v) === 1) {
        // Back-edge found -> cycle!
        const cycleStartIndex = stack.indexOf(v);
        if (cycleStartIndex !== -1) {
          cycles.push(stack.slice(cycleStartIndex));
        }
      } else if (color.get(v) === 0) {
        parent.set(v, u);
        dfs(v, stack);
      }
    }

    stack.pop();
    color.set(u, 2);
  }

  for (const node of nodes) {
    if (color.get(node.id) === 0) {
      dfs(node.id, []);
    }
  }

  return cycles;
}

/**
 * Computes topological sort of the graph. If cycles exist, removes back-edges to form a DAG.
 */
export function computeTopologicalOrder(
  nodes: readonly PositionedNode[],
  adj: Map<string, string[]>,
  inDegree: Map<string, number>,
): { order: string[]; isCyclic: boolean } {
  const inDeg = new Map<string, number>(inDegree);
  const queue: string[] = [];
  const order: string[] = [];

  for (const node of nodes) {
    if ((inDeg.get(node.id) || 0) === 0) {
      queue.push(node.id);
    }
  }

  while (queue.length > 0) {
    const u = queue.shift()!;
    order.push(u);

    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      const current = inDeg.get(v) || 0;
      const updated = current - 1;
      inDeg.set(v, updated);
      if (updated === 0) {
        queue.push(v);
      }
    }
  }

  const isCyclic = order.length < nodes.length;

  // If there are unvisited nodes due to cycles, append them in order
  if (isCyclic) {
    for (const node of nodes) {
      if (!order.includes(node.id)) {
        order.push(node.id);
      }
    }
  }

  return { order, isCyclic };
}

// ============================================================================
// Critical Path Method (CPM) Algorithm
// ============================================================================

export function calculateCriticalPath(
  nodes: readonly PositionedNode[],
  edges: readonly PositionedEdge[],
  subCriticalTolerancePct: number = 0.15,
): CriticalPathEvaluation {
  if (nodes.length === 0) {
    return {
      totalDurationMs: 0,
      criticalPathNodes: [],
      criticalPathEdges: [],
      subCriticalNodes: [],
      subCriticalEdges: [],
      bottlenecks: [],
      nodeInfoMap: new Map(),
      isCyclic: false,
      detectedCycles: [],
    };
  }

  const graph = buildAdjacencyGraph(nodes, edges);
  const detectedCycles = detectCycles(nodes, graph.adj);
  const { order, isCyclic } = computeTopologicalOrder(nodes, graph.adj, graph.inDegree);

  // Extract node durations (minimum 1ms so instantaneous nodes have finite time)
  const durations = new Map<string, number>();
  for (const node of nodes) {
    const d = Math.max(1, extractNodeHeatmapValue(node, "duration"));
    durations.set(node.id, d);
  }

  // 1. FORWARD PASS: Early Start (ES) and Early Finish (EF)
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();

  for (const u of order) {
    const preds = graph.revAdj.get(u) || [];
    let maxPredEF = 0;

    for (const p of preds) {
      const predEF = earlyFinish.get(p) || 0;
      const edge = graph.edgeMap.get(`${p}->${u}`);
      const edgeLatency = edge?.traffic?.avgLatencyMs || 0;
      const arrival = predEF + edgeLatency;
      if (arrival > maxPredEF) {
        maxPredEF = arrival;
      }
    }

    const es = maxPredEF;
    const ef = es + (durations.get(u) || 0);

    earlyStart.set(u, es);
    earlyFinish.set(u, ef);
  }

  // Total project duration is the maximum EF among all nodes
  let totalDurationMs = 0;
  for (const ef of earlyFinish.values()) {
    if (ef > totalDurationMs) {
      totalDurationMs = ef;
    }
  }

  // 2. BACKWARD PASS: Late Finish (LF) and Late Start (LS)
  const lateStart = new Map<string, number>();
  const lateFinish = new Map<string, number>();

  // Process nodes in reverse topological order
  const reverseOrder = [...order].reverse();

  for (const u of reverseOrder) {
    const succs = graph.adj.get(u) || [];
    let minSuccLS = totalDurationMs;

    if (succs.length > 0) {
      for (const s of succs) {
        const succLS = lateStart.get(s) ?? totalDurationMs;
        const edge = graph.edgeMap.get(`${u}->${s}`);
        const edgeLatency = edge?.traffic?.avgLatencyMs || 0;
        const deadline = succLS - edgeLatency;
        if (deadline < minSuccLS) {
          minSuccLS = deadline;
        }
      }
    }

    const lf = minSuccLS;
    const ls = lf - (durations.get(u) || 0);

    lateFinish.set(u, lf);
    lateStart.set(u, ls);
  }

  // 3. SLACK / FLOAT & CRITICAL PATH IDENTIFICATION
  const nodeInfoMap = new Map<string, CriticalPathNodeInfo>();
  const criticalNodes: string[] = [];
  const subCriticalNodes: string[] = [];
  const slackToleranceMs = totalDurationMs * subCriticalTolerancePct;

  // We find minimum slack (ideally <= 1ms due to floating point rounding)
  let minSlackObserved = Number.MAX_SAFE_INTEGER;
  for (const u of order) {
    const es = earlyStart.get(u) || 0;
    const ls = lateStart.get(u) || 0;
    const slack = Math.max(0, ls - es);
    if (slack < minSlackObserved) {
      minSlackObserved = slack;
    }
  }

  const criticalThreshold = Math.max(1, minSlackObserved + 2); // 2ms tolerance for zero-slack

  let rankCounter = 1;
  for (const u of order) {
    const dur = durations.get(u) || 0;
    const es = earlyStart.get(u) || 0;
    const ef = earlyFinish.get(u) || 0;
    const ls = lateStart.get(u) || 0;
    const lf = lateFinish.get(u) || 0;
    const slack = Math.max(0, ls - es);

    const isCritical = slack <= criticalThreshold;
    const isSubCritical = !isCritical && slack <= slackToleranceMs;

    if (isCritical) {
      criticalNodes.push(u);
    } else if (isSubCritical) {
      subCriticalNodes.push(u);
    }

    // Bottleneck score: Duration weight + In/Out Fan centrality + Slack penalty
    const durationRatio = totalDurationMs > 0 ? dur / totalDurationMs : 0;
    const inDeg = graph.inDegree.get(u) || 0;
    const outDeg = graph.outDegree.get(u) || 0;
    const degreeCentrality = (inDeg + outDeg) / Math.max(1, nodes.length);
    const slackScore = totalDurationMs > 0 ? 1 - Math.min(1, slack / totalDurationMs) : 1;

    const bottleneckScore = Number(
      (durationRatio * 0.6 + slackScore * 0.3 + degreeCentrality * 0.1).toFixed(4),
    );

    nodeInfoMap.set(u, {
      nodeId: u,
      durationMs: dur,
      earlyStartMs: es,
      earlyFinishMs: ef,
      lateStartMs: ls,
      lateFinishMs: lf,
      slackMs: slack,
      isCritical,
      isSubCritical,
      bottleneckScore,
      rank: isCritical ? rankCounter++ : 0,
    });
  }

  // 4. CRITICAL EDGES IDENTIFICATION
  const criticalEdges: string[] = [];
  const subCriticalEdges: string[] = [];

  for (const edge of edges) {
    const srcInfo = nodeInfoMap.get(edge.source);
    const tgtInfo = nodeInfoMap.get(edge.target);

    if (srcInfo && tgtInfo) {
      if (srcInfo.isCritical && tgtInfo.isCritical) {
        // Check if this edge directly connects sequential critical nodes
        const expectedArrival = srcInfo.earlyFinishMs + (edge.traffic?.avgLatencyMs || 0);
        if (Math.abs(expectedArrival - tgtInfo.earlyStartMs) <= criticalThreshold + 5) {
          criticalEdges.push(edge.id);
        }
      } else if (
        (srcInfo.isCritical || srcInfo.isSubCritical) &&
        (tgtInfo.isCritical || tgtInfo.isSubCritical)
      ) {
        subCriticalEdges.push(edge.id);
      }
    }
  }

  // Top Bottlenecks sorted by bottleneck score descending
  const bottlenecks = Array.from(nodeInfoMap.values())
    .sort((a, b) => b.bottleneckScore - a.bottleneckScore)
    .slice(0, 5);

  return {
    totalDurationMs,
    criticalPathNodes: criticalNodes,
    criticalPathEdges: criticalEdges,
    subCriticalNodes,
    subCriticalEdges,
    bottlenecks,
    nodeInfoMap,
    isCyclic,
    detectedCycles,
  };
}

// ============================================================================
// Critical Path Evaluation Engine
// ============================================================================

export interface CriticalPathEvaluationResult {
  nodeOverlays: Map<string, NodeLensOverlay>;
  edgeOverlays: Map<string, EdgeLensOverlay>;
  summaryStats: LensSummaryStats;
  legendData: LensLegendData;
  criticalPathData: CriticalPathEvaluation;
}

export function evaluateCriticalPathLens(
  nodes: readonly PositionedNode[],
  edges: readonly PositionedEdge[],
  config: LensConfig,
): CriticalPathEvaluationResult {
  const stops = resolveColorStops(config.colorRamp, config.customStops);
  const metric = config.criticalPathMetric;
  const cpData = calculateCriticalPath(nodes, edges, config.subCriticalThresholdPct / 100);

  const rawValuesList: number[] = [];
  const nodeValues = new Map<string, number>();

  for (const node of nodes) {
    const info = cpData.nodeInfoMap.get(node.id);
    let val = 0;
    if (info) {
      if (metric === "slack") {
        val = info.slackMs;
      } else if (metric === "bottleneckScore") {
        val = info.bottleneckScore * 100;
      } else {
        val = info.durationMs;
      }
    }
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

  for (const node of nodes) {
    const info = cpData.nodeInfoMap.get(node.id);
    const rawVal = nodeValues.get(node.id) ?? 0;

    let normalized = 0;
    if (metric === "slack") {
      // Invert slack: 0 slack = 1.0 (highest importance / red), high slack = 0.0
      normalized = rawMax > rawMin ? 1 - (rawVal - rawMin) / (rawMax - rawMin) : 1;
    } else {
      normalized = normalizeValue(rawVal, rawMin, rawMax, config.scaleType, sortedValues);
    }

    const isCritical = info?.isCritical ?? false;
    const isSubCritical = info?.isSubCritical ?? false;
    const isBottleneck = cpData.bottlenecks.some((b) => b.nodeId === node.id);

    // Threshold check
    const meetsThreshold = normalized >= config.minThreshold && normalized <= config.maxThreshold;

    const isFiltered = !meetsThreshold;
    if (isFiltered) {
      filteredNodesCount++;
    } else {
      activeNodesCount++;
    }

    let color = evaluateColorRamp(stops, normalized, config.invertRamp);
    if (isCritical) {
      color = "#ef4444"; // Vivid crimson red for critical path nodes
    } else if (isSubCritical && config.traceSubCriticalPaths) {
      color = "#f59e0b"; // Amber for near-critical nodes
    }

    const fillColor = rgbaString(
      color,
      isFiltered ? config.dimOpacity * 0.4 : isCritical ? 0.28 : 0.15,
    );
    const borderColor = isCritical
      ? "#ef4444"
      : rgbaString(color, isFiltered ? config.dimOpacity * 0.6 : 0.85);

    const glowColor = isCritical ? "#ef4444" : color;
    const glowIntensity =
      config.showGlow && !isFiltered ? (isCritical ? 1.0 : config.glowIntensity * normalized) : 0;
    const opacity = isFiltered ? (config.filterMode === "hide" ? 0 : config.dimOpacity) : 1;

    let badgeText = "";
    let badgeVariant: NodeLensOverlay["badgeVariant"] = "info";

    if (isCritical) {
      badgeText = `CP #${info?.rank || 1} • ${formatDurationMs(info?.durationMs || 0)}`;
      badgeVariant = "error";
    } else if (metric === "bottleneckScore") {
      badgeText = `Bottleneck (${Math.round((info?.bottleneckScore || 0) * 100)}%)`;
      badgeVariant = "amber";
    } else if (info) {
      badgeText = `+${formatDurationMs(info.slackMs)} slack`;
      badgeVariant = isSubCritical ? "warning" : "neutral";
    }

    const formattedMetric =
      metric === "slack"
        ? `${formatDurationMs(info?.slackMs || 0)} slack`
        : metric === "bottleneckScore"
          ? `${Math.round((info?.bottleneckScore || 0) * 100)}% impact`
          : formatDurationMs(info?.durationMs || 0);

    const tooltipContent: LensTooltipData = {
      title: `${node.name || node.id} ${isCritical ? "★ [CRITICAL PATH]" : ""}`,
      subtitle: `CPM Early Finish: ${formatDurationMs(info?.earlyFinishMs || 0)} • Slack: ${formatDurationMs(info?.slackMs || 0)}`,
      primaryMetric: {
        label: isCritical ? "Critical Path Step" : "Schedule Impact",
        formatted: formattedMetric,
        unit: metric === "bottleneckScore" ? "%" : "ms",
        raw: rawVal,
      },
      factors: [
        {
          label: "Duration",
          value: formatDurationMs(info?.durationMs || 0),
          severity: isCritical ? "critical" : "normal",
        },
        {
          label: "Early Start (ES)",
          value: formatDurationMs(info?.earlyStartMs || 0),
        },
        {
          label: "Early Finish (EF)",
          value: formatDurationMs(info?.earlyFinishMs || 0),
        },
        {
          label: "Late Start (LS)",
          value: formatDurationMs(info?.lateStartMs || 0),
        },
        {
          label: "Late Finish (LF)",
          value: formatDurationMs(info?.lateFinishMs || 0),
        },
        {
          label: "Total Float / Slack",
          value: formatDurationMs(info?.slackMs || 0),
          severity: isCritical
            ? "critical"
            : info?.slackMs && info.slackMs < 500
              ? "warning"
              : "normal",
        },
        {
          label: "Bottleneck Index",
          value: `${Math.round((info?.bottleneckScore || 0) * 100)}%`,
          severity: isBottleneck ? "error" : "normal",
        },
      ],
      summaryNote: isCritical
        ? `Any delay in this node directly increases total pipeline execution by the exact delay amount.`
        : `This node can be delayed up to ${formatDurationMs(info?.slackMs || 0)} without delaying total completion.`,
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
      metricUnit: metric === "bottleneckScore" ? "%" : "ms",
      tooltipContent,
      isCritical,
      isBottleneck,
      slackMs: info?.slackMs,
      criticalPathRank: info?.rank,
    });
  }

  // Edge Overlays with critical path highlight
  const edgeOverlays = new Map<string, EdgeLensOverlay>();

  for (const edge of edges) {
    const isCriticalEdge = cpData.criticalPathEdges.includes(edge.id);
    const isSubCriticalEdge = cpData.subCriticalEdges.includes(edge.id);

    let color = "#64748b";
    let strokeWidth = 2;
    let animationSpeed: number | undefined = undefined;

    if (isCriticalEdge) {
      color = "#ef4444"; // Bright red critical line
      strokeWidth = 4;
      animationSpeed = 1.2; // Pulse along critical path
    } else if (isSubCriticalEdge && config.traceSubCriticalPaths) {
      color = "#f59e0b";
      strokeWidth = 2.8;
      animationSpeed = 2.0;
    }

    const isFiltered = !isCriticalEdge && !isSubCriticalEdge && config.filterMode === "highlight";
    const opacity = isFiltered ? (config.filterMode === "hide" ? 0 : config.dimOpacity) : 1;

    edgeOverlays.set(edge.id, {
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      rawValue: edge.traffic?.avgLatencyMs || 0,
      normalizedValue: isCriticalEdge ? 1.0 : isSubCriticalEdge ? 0.6 : 0.1,
      color,
      glowColor: color,
      strokeWidth,
      strokeDasharray: isCriticalEdge ? "6 3" : undefined,
      isCritical: isCriticalEdge,
      isSubCritical: isSubCriticalEdge,
      isFiltered,
      opacity,
      animationSpeed,
      badgeText: isCriticalEdge ? "CRITICAL" : undefined,
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

  const unit = metric === "bottleneckScore" ? "%" : "ms";

  const legendData: LensLegendData = {
    title: `Critical Path: ${metric.charAt(0).toUpperCase() + metric.slice(1)}`,
    unit,
    minRaw: rawMin,
    maxRaw: rawMax,
    formattedMin: formatDurationMs(rawMin),
    formattedMax: formatDurationMs(rawMax),
    colorStops: [...stops],
    histogramBuckets,
  };

  const topBottlenecks = cpData.bottlenecks.map((b) => {
    const node = nodes.find((n) => n.id === b.nodeId);
    return {
      id: b.nodeId,
      name: node?.name || b.nodeId,
      score: b.bottleneckScore,
    };
  });

  const summaryStats: LensSummaryStats = {
    lens: "critical-path",
    metricLabel: metric,
    totalNodes: nodes.length,
    activeNodesCount,
    filteredNodesCount,
    rawMin,
    rawMax,
    rawAverage,
    rawMedian,
    rawSum,
    formattedMin: formatDurationMs(rawMin),
    formattedMax: formatDurationMs(rawMax),
    formattedAverage: formatDurationMs(rawAverage),
    formattedSum: formatDurationMs(rawSum),
    unit,
    criticalPathLengthMs: cpData.totalDurationMs,
    criticalPathNodeCount: cpData.criticalPathNodes.length,
    topBottlenecks,
  };

  return {
    nodeOverlays,
    edgeOverlays,
    summaryStats,
    legendData,
    criticalPathData: cpData,
  };
}
