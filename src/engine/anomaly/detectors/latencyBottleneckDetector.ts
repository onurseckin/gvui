import type { GraphDataset, GraphNodeData } from "../../../types/graphData";
import type { AnomalyFinding, AnomalyThresholds, AnomalyDetectorFn } from "../types";

export function extractNodeDuration(node: GraphNodeData): number {
  if (typeof node.metrics?.durationMs === "number" && node.metrics.durationMs > 0) {
    return node.metrics.durationMs;
  }
  if (
    typeof node.metrics?.timingBreakdown?.wallDurationMs === "number" &&
    node.metrics.timingBreakdown.wallDurationMs > 0
  ) {
    return node.metrics.timingBreakdown.wallDurationMs;
  }
  if (
    typeof node.metrics?.timing?.wallDurationMs === "number" &&
    node.metrics.timing.wallDurationMs > 0
  ) {
    return node.metrics.timing.wallDurationMs;
  }
  if (typeof node.metadata?.durationMs === "number" && node.metadata.durationMs > 0) {
    return node.metadata.durationMs;
  }
  const commands = node.metadata?.commands || [];
  const cmdSum = commands.reduce(
    (acc, c) => acc + (typeof c.durationMs === "number" ? c.durationMs : 0),
    0,
  );
  if (cmdSum > 0) {
    return cmdSum;
  }
  return 0;
}

/**
 * Computes Critical Path and returns the sequence of node IDs on the critical path
 * along with the total duration.
 */
export function computeCriticalPath(dataset: GraphDataset): {
  pathNodes: string[];
  totalDurationMs: number;
} {
  const nodes = dataset.nodes || [];
  const edges = dataset.edges || [];
  if (nodes.length === 0) return { pathNodes: [], totalDurationMs: 0 };

  const nodeMap = new Map<string, GraphNodeData>();
  const durationMap = new Map<string, number>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    durationMap.set(node.id, extractNodeDuration(node));
  }

  // Build adjacency and in-degree for DAG
  const adj = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adj.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    if (adj.has(edge.source) && inDegree.has(edge.target)) {
      adj.get(edge.source)?.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
  }

  // Topological sorting
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  const dist = new Map<string, number>();
  const parent = new Map<string, string | null>();

  for (const node of nodes) {
    dist.set(node.id, durationMap.get(node.id) || 0);
    parent.set(node.id, null);
  }

  while (queue.length > 0) {
    const u = queue.shift();
    if (!u) continue;

    const uDist = dist.get(u) || 0;
    const neighbors = adj.get(u) || [];

    for (const v of neighbors) {
      const vDur = durationMap.get(v) || 0;
      if (uDist + vDur > (dist.get(v) || 0)) {
        dist.set(v, uDist + vDur);
        parent.set(v, u);
      }

      const newDeg = (inDegree.get(v) || 1) - 1;
      inDegree.set(v, newDeg);
      if (newDeg === 0) {
        queue.push(v);
      }
    }
  }

  // Find node with max distance
  let maxNode: string | null = null;
  let maxDist = -1;

  for (const [id, d] of dist.entries()) {
    if (d > maxDist) {
      maxDist = d;
      maxNode = id;
    }
  }

  const path: string[] = [];
  const visitedPath = new Set<string>();
  let curr = maxNode;
  while (curr !== null && !visitedPath.has(curr)) {
    visitedPath.add(curr);
    path.unshift(curr);
    curr = parent.get(curr) || null;
  }

  return {
    pathNodes: path,
    totalDurationMs: maxDist > 0 ? maxDist : 0,
  };
}

export const detectLatencyBottlenecks: AnomalyDetectorFn = (
  dataset: GraphDataset,
  thresholds: AnomalyThresholds,
): AnomalyFinding[] => {
  const findings: AnomalyFinding[] = [];
  const nodes = dataset.nodes || [];
  const edges = dataset.edges || [];
  if (nodes.length === 0) return findings;

  const durations: Array<{ node: GraphNodeData; duration: number }> = nodes.map((node) => ({
    node,
    duration: extractNodeDuration(node),
  }));

  const validDurations = durations.map((d) => d.duration).filter((d) => d > 0);

  let meanDuration = 0;
  let stdDevDuration = 0;

  if (validDurations.length >= thresholds.minNodeSampleForStats) {
    meanDuration = validDurations.reduce((acc, v) => acc + v, 0) / validDurations.length;
    const variance =
      validDurations.reduce((acc, v) => acc + Math.pow(v - meanDuration, 2), 0) /
      validDurations.length;
    stdDevDuration = Math.sqrt(variance);
  }

  const statisticalThreshold =
    meanDuration > 0
      ? meanDuration + thresholds.latencyDeviationMultiplier * stdDevDuration
      : thresholds.latencyThresholdMs;

  // 1. Critical Path Analysis
  const { pathNodes, totalDurationMs } = computeCriticalPath(dataset);

  if (totalDurationMs > 0 && pathNodes.length > 0) {
    for (const nodeId of pathNodes) {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;
      const dur = extractNodeDuration(node);
      const ratioOfCriticalPath = totalDurationMs > 0 ? dur / totalDurationMs : 0;

      if (dur >= 10000 && ratioOfCriticalPath >= thresholds.criticalPathSlowdownRatio) {
        const isCritical = dur >= 60000 || ratioOfCriticalPath >= 0.6;
        findings.push({
          id: `anomaly-latency-critical-path-${node.id}`,
          type: "latency_bottleneck",
          category: "performance",
          severity: isCritical ? "critical" : "error",
          title: `Critical Path Bottleneck on Node ${node.name || node.id}`,
          description: `Node "${node.name || node.id}" took ${(dur / 1000).toFixed(1)}s, consuming ${(ratioOfCriticalPath * 100).toFixed(1)}% of total Critical Path duration (${(totalDurationMs / 1000).toFixed(1)}s).`,
          nodeIds: [node.id],
          impactScore: Math.min(100, Math.round(ratioOfCriticalPath * 100)),
          metricValue: dur,
          thresholdValue: Math.round(totalDurationMs * thresholds.criticalPathSlowdownRatio),
          unit: "ms",
          remediation: {
            action: "Decompose or Parallelize Critical Path Task",
            suggestion: `Node ${node.id} is the single largest bottleneck holding back the entire orchestration pipeline. Parallelize sub-steps or enable execution caching.`,
            autoFixable: false,
          },
          evidence: {
            metrics: {
              nodeDurationMs: dur,
              totalCriticalPathMs: totalDurationMs,
              criticalPathSharePercentage: Number((ratioOfCriticalPath * 100).toFixed(1)),
              criticalPathLength: pathNodes.length,
            },
            relatedNodes: pathNodes,
            confidence: 0.95,
          },
          timestamp: Date.now(),
        });
      }
    }
  }

  // 2. Cognitive Stalling, Tool Hangs, and Commands
  for (const { node, duration } of durations) {
    const timing = node.metrics?.timingBreakdown || node.metrics?.timing;
    const thinkMs =
      typeof timing?.thinkDurationMs === "number"
        ? timing.thinkDurationMs
        : typeof timing?.cognitiveLatencyMs === "number"
          ? timing.cognitiveLatencyMs
          : 0;

    // Check cognitive stall
    if (thinkMs > 15000 && duration > 0 && thinkMs / duration >= 0.75) {
      findings.push({
        id: `anomaly-cognitive-stall-${node.id}`,
        type: "latency_bottleneck",
        category: "performance",
        severity: thinkMs >= 45000 ? "critical" : "warning",
        title: `Cognitive Thinking Stall on Node ${node.name || node.id}`,
        description: `Node "${node.name || node.id}" spent ${(thinkMs / 1000).toFixed(1)}s in reasoning/thinking state (${((thinkMs / duration) * 100).toFixed(0)}% of ${(duration / 1000).toFixed(1)}s total runtime).`,
        nodeIds: [node.id],
        impactScore: Math.min(90, Math.round((thinkMs / duration) * 80)),
        metricValue: thinkMs,
        thresholdValue: 15000,
        unit: "ms",
        remediation: {
          action: "Streamline Model Prompt Directives",
          suggestion: `Provide more deterministic few-shot examples or reduce prompt ambiguity to shorten model deliberation cycles.`,
          autoFixable: false,
        },
        evidence: {
          metrics: {
            thinkDurationMs: thinkMs,
            totalDurationMs: duration,
            thinkRatio: Number(((thinkMs / duration) * 100).toFixed(1)),
          },
          relatedNodes: [node.id],
          confidence: 0.9,
        },
        timestamp: Date.now(),
      });
    }

    // Check tool / command hang
    const commands = node.metadata?.commands || [];
    for (const cmd of commands) {
      if (cmd.durationMs >= thresholds.latencyThresholdMs) {
        findings.push({
          id: `anomaly-command-hang-${node.id}-${cmd.id}`,
          type: "latency_bottleneck",
          category: "performance",
          severity: cmd.durationMs >= 60000 ? "critical" : "error",
          title: `Long-Running Command Execution on Node ${node.name || node.id}`,
          description: `Command "${Array.isArray(cmd.argv) ? cmd.argv.join(" ") : cmd.id}" executed for ${(cmd.durationMs / 1000).toFixed(1)}s, exceeding the ${thresholds.latencyThresholdMs / 1000}s threshold.`,
          nodeIds: [node.id],
          impactScore: Math.min(
            95,
            Math.round((cmd.durationMs / thresholds.latencyThresholdMs) * 50),
          ),
          metricValue: cmd.durationMs,
          thresholdValue: thresholds.latencyThresholdMs,
          unit: "ms",
          remediation: {
            action: "Add Command Timeout or Background Async Flag",
            suggestion: `Ensure shell command '${Array.isArray(cmd.argv) ? cmd.argv[0] : "command"}' executes with bounded timeouts or asynchronous polling.`,
            autoFixable: false,
          },
          evidence: {
            metrics: {
              commandDurationMs: cmd.durationMs,
              exitCode: cmd.exitCode,
            },
            logs: cmd.stdoutSnippet ? [cmd.stdoutSnippet] : [],
            relatedNodes: [node.id],
            confidence: 0.95,
          },
          timestamp: Date.now(),
        });
      }
    }

    // 3. Statistical Latency Outlier
    if (
      duration > 0 &&
      validDurations.length >= thresholds.minNodeSampleForStats &&
      duration >= statisticalThreshold &&
      duration >= thresholds.latencyThresholdMs &&
      !findings.some((f) => f.nodeIds.includes(node.id) && f.type === "latency_bottleneck")
    ) {
      findings.push({
        id: `anomaly-latency-outlier-${node.id}`,
        type: "latency_bottleneck",
        category: "performance",
        severity: duration >= thresholds.latencyThresholdMs * 2 ? "critical" : "error",
        title: `Abnormal Execution Duration on Node ${node.name || node.id}`,
        description: `Node "${node.name || node.id}" took ${(duration / 1000).toFixed(1)}s (graph average: ${(meanDuration / 1000).toFixed(1)}s, threshold: ${(statisticalThreshold / 1000).toFixed(1)}s).`,
        nodeIds: [node.id],
        impactScore: Math.min(85, Math.round((duration / statisticalThreshold) * 60)),
        metricValue: duration,
        thresholdValue: Math.round(statisticalThreshold),
        unit: "ms",
        remediation: {
          action: "Optimize Task Workload",
          suggestion: `Profile sub-tasks on node ${node.id} to identify slow I/O or model latency stalls.`,
          autoFixable: false,
        },
        evidence: {
          metrics: {
            durationMs: duration,
            graphMeanDurationMs: Math.round(meanDuration),
            stdDevMs: Math.round(stdDevDuration),
          },
          relatedNodes: [node.id],
          confidence: 0.88,
        },
        timestamp: Date.now(),
      });
    }
  }

  // 4. Edge Transport Congestion & Latency
  for (const edge of edges) {
    const avgLatency =
      typeof edge.traffic?.avgLatencyMs === "number" ? edge.traffic.avgLatencyMs : 0;
    if (avgLatency >= thresholds.edgeLatencyThresholdMs) {
      findings.push({
        id: `anomaly-edge-latency-${edge.id}`,
        type: "latency_bottleneck",
        category: "performance",
        severity: avgLatency >= thresholds.edgeLatencyThresholdMs * 2 ? "error" : "warning",
        title: `Edge Communication Latency Spike on ${edge.id}`,
        description: `Edge between "${edge.source}" and "${edge.target}" has high average transport latency of ${(avgLatency / 1000).toFixed(2)}s (threshold: ${thresholds.edgeLatencyThresholdMs / 1000}s).`,
        nodeIds: [edge.source, edge.target],
        edgeIds: [edge.id],
        impactScore: Math.min(
          75,
          Math.round((avgLatency / thresholds.edgeLatencyThresholdMs) * 40),
        ),
        metricValue: avgLatency,
        thresholdValue: thresholds.edgeLatencyThresholdMs,
        unit: "ms",
        remediation: {
          action: "Compact Edge Payloads",
          suggestion: `Compress data payloads exchanged between ${edge.source} and ${edge.target} or switch to streaming transport.`,
          autoFixable: false,
        },
        evidence: {
          metrics: {
            avgLatencyMs: avgLatency,
            edgeStatus: edge.traffic?.status || "active",
          },
          relatedNodes: [edge.source, edge.target],
          relatedEdges: [edge.id],
          confidence: 0.9,
        },
        timestamp: Date.now(),
      });
    }
  }

  return findings;
};
