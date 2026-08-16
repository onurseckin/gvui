import type { GraphDataset, GraphNodeData, GraphEdgeData } from "../../types/graphData";
import type {
  AnomalyCategory,
  AnomalyDetectorFn,
  AnomalyFilterOptions,
  AnomalyFinding,
  AnomalyReport,
  AnomalySeverity,
  AnomalyThresholds,
  DetectorConfig,
} from "./types";
import { DEFAULT_ANOMALY_THRESHOLDS } from "./types";
import { detectRetryLoops } from "./detectors/retryLoopDetector";
import { detectTokenSpikes } from "./detectors/tokenSpikeDetector";
import { detectStrandedLocks } from "./detectors/strandedLockDetector";
import { detectCycleDeadlocks, findGraphCycles } from "./detectors/cycleDeadlockDetector";
import {
  detectLatencyBottlenecks,
  computeCriticalPath,
} from "./detectors/latencyBottleneckDetector";
import {
  detectErrorCascades,
  computeDownstreamDescendants,
  buildOutAdjacency,
} from "./detectors/errorCascadeDetector";

const SEVERITY_ORDER: Record<AnomalySeverity, number> = {
  critical: 4,
  error: 3,
  warning: 2,
  info: 1,
};

/**
 * Computes graph health score from 0 (heavily degraded/deadlocked) to 100 (optimal).
 */
export function calculateHealthScore(anomalies: AnomalyFinding[]): number {
  if (anomalies.length === 0) return 100;

  let totalDeduction = 0;
  for (const anomaly of anomalies) {
    switch (anomaly.severity) {
      case "critical":
        totalDeduction += 35;
        break;
      case "error":
        totalDeduction += 18;
        break;
      case "warning":
        totalDeduction += 8;
        break;
      case "info":
        totalDeduction += 2;
        break;
    }
  }

  const score = Math.max(0, 100 - totalDeduction);
  return Math.round(score);
}

/**
 * Filter a list of anomaly findings by search query, severity, category, nodes, or quick fixes.
 */
export function filterAnomalies(
  anomalies: AnomalyFinding[],
  options: AnomalyFilterOptions = {},
): AnomalyFinding[] {
  return anomalies.filter((item) => {
    if (options.severities && options.severities.length > 0) {
      if (!options.severities.includes(item.severity)) return false;
    }

    if (options.categories && options.categories.length > 0) {
      if (!options.categories.includes(item.category)) return false;
    }

    if (options.nodeId) {
      if (!item.nodeIds.includes(options.nodeId)) return false;
    }

    if (options.edgeId && item.edgeIds) {
      if (!item.edgeIds.includes(options.edgeId)) return false;
    }

    if (options.autoFixableOnly) {
      if (!item.remediation.autoFixable) return false;
    }

    if (typeof options.minImpactScore === "number") {
      if (item.impactScore < options.minImpactScore) return false;
    }

    if (options.searchQuery && options.searchQuery.trim().length > 0) {
      const q = options.searchQuery.toLowerCase().trim();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchAction = item.remediation.action.toLowerCase().includes(q);
      const matchNodes = item.nodeIds.some((id) => id.toLowerCase().includes(q));
      if (!matchTitle && !matchDesc && !matchAction && !matchNodes) {
        return false;
      }
    }

    return true;
  });
}

export class AnomalyEngine {
  private readonly thresholds: AnomalyThresholds;
  private readonly config: DetectorConfig;
  private readonly defaultDetectors: AnomalyDetectorFn[];

  constructor(config: DetectorConfig = {}) {
    this.config = config;
    this.thresholds = {
      ...DEFAULT_ANOMALY_THRESHOLDS,
      ...(config.thresholds || {}),
    };
    this.defaultDetectors = [
      detectRetryLoops,
      detectTokenSpikes,
      detectStrandedLocks,
      detectCycleDeadlocks,
      detectLatencyBottlenecks,
      detectErrorCascades,
      ...(config.customDetectors || []),
    ];
  }

  /**
   * Runs all anomaly detectors over a graph dataset and aggregates a comprehensive report.
   */
  public analyze(dataset: GraphDataset | null | undefined): AnomalyReport {
    const datasetId = dataset?.id || "empty-dataset";
    const timestamp = new Date().toISOString();

    if (!dataset || !Array.isArray(dataset.nodes) || dataset.nodes.length === 0) {
      return {
        datasetId,
        timestamp,
        totalAnomalies: 0,
        severityCounts: { critical: 0, error: 0, warning: 0, info: 0 },
        categoryCounts: {
          topology: 0,
          execution: 0,
          resource: 0,
          performance: 0,
          quality: 0,
        },
        healthScore: 100,
        anomalies: [],
        topologicalCyclePaths: [],
        criticalPathBottlenecks: [],
        blastRadiusMap: {},
        recommendedActions: [],
      };
    }

    const allFindings: AnomalyFinding[] = [];

    for (const detector of this.defaultDetectors) {
      try {
        const results = detector(dataset, this.thresholds);
        allFindings.push(...results);
      } catch (err) {
        // Defensive handling for detector failures
        console.error("Anomaly detector failed:", err);
      }
    }

    // Filter by enabledDetectors if specified
    const filteredFindings = this.config.enabledDetectors
      ? allFindings.filter((f) => this.config.enabledDetectors?.includes(f.type))
      : allFindings;

    // Deduplicate findings by unique ID or matching signature
    const seenSignatures = new Set<string>();
    const deduplicated: AnomalyFinding[] = [];

    for (const finding of filteredFindings) {
      const sig = `${finding.type}:${finding.nodeIds.sort().join(",")}:${finding.title}`;
      if (!seenSignatures.has(sig)) {
        seenSignatures.add(sig);
        deduplicated.push(finding);
      }
    }

    // Sort findings: highest severity first, then highest impact score
    deduplicated.sort((a, b) => {
      const sevDiff = SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity];
      if (sevDiff !== 0) return sevDiff;
      return b.impactScore - a.impactScore;
    });

    const severityCounts = { critical: 0, error: 0, warning: 0, info: 0 };
    const categoryCounts: Record<AnomalyCategory, number> = {
      topology: 0,
      execution: 0,
      resource: 0,
      performance: 0,
      quality: 0,
    };

    for (const item of deduplicated) {
      severityCounts[item.severity]++;
      categoryCounts[item.category]++;
    }

    const healthScore = calculateHealthScore(deduplicated);

    // Topological cycle paths
    const { cycles } = findGraphCycles(dataset);

    // Critical path bottlenecks
    const { pathNodes } = computeCriticalPath(dataset);

    // Blast radius map
    const outAdj = buildOutAdjacency(dataset.edges || []);
    const blastRadiusMap: Record<string, string[]> = {};
    for (const node of dataset.nodes) {
      if (node.status === "error") {
        blastRadiusMap[node.id] = computeDownstreamDescendants(dataset, node.id, outAdj);
      }
    }

    // Recommended actions
    const recommendedActions = Array.from(
      new Set(deduplicated.map((f) => f.remediation.action).filter((a): a is string => Boolean(a))),
    ).slice(0, 8);

    return {
      datasetId,
      timestamp,
      totalAnomalies: deduplicated.length,
      severityCounts,
      categoryCounts,
      healthScore,
      anomalies: deduplicated,
      topologicalCyclePaths: cycles,
      criticalPathBottlenecks: pathNodes,
      blastRadiusMap,
      recommendedActions,
    };
  }

  /**
   * Runs diagnostics focused exclusively on a single node.
   */
  public analyzeNode(dataset: GraphDataset, nodeId: string): AnomalyFinding[] {
    const report = this.analyze(dataset);
    return report.anomalies.filter((f) => f.nodeIds.includes(nodeId));
  }

  /**
   * Runs diagnostics focused exclusively on a single edge.
   */
  public analyzeEdge(dataset: GraphDataset, edgeId: string): AnomalyFinding[] {
    const report = this.analyze(dataset);
    return report.anomalies.filter((f) => f.edgeIds && f.edgeIds.includes(edgeId));
  }

  /**
   * Applies an immutable quick fix patch to a graph dataset based on an autoFixable anomaly finding ID.
   */
  public applyQuickFix(dataset: GraphDataset, findingId: string): GraphDataset {
    const report = this.analyze(dataset);
    const finding = report.anomalies.find((f) => f.id === findingId);
    if (!finding || !finding.remediation.autoFixable || !finding.remediation.quickFix) {
      return dataset;
    }

    const qf = finding.remediation.quickFix;
    const nextNodes: GraphNodeData[] = [...dataset.nodes.map((n) => ({ ...n }))];
    let nextEdges: GraphEdgeData[] = [...dataset.edges.map((e) => ({ ...e }))];

    if (qf.type === "break_cycle" && qf.targetId) {
      // Remove edge or convert to async feedback
      nextEdges = nextEdges.filter((e) => e.id !== qf.targetId);
    } else if (qf.type === "reset_retries" && qf.targetId) {
      const idx = nextNodes.findIndex((n) => n.id === qf.targetId);
      if (idx !== -1 && nextNodes[idx]) {
        const targetNode = nextNodes[idx];
        const patchedMetrics = {
          ...(targetNode.metrics || {}),
          retries: 0,
          repairRounds: 0,
        };
        nextNodes[idx] = {
          ...targetNode,
          metrics: patchedMetrics,
          ...(qf.patch || {}),
        };
      }
    } else if (qf.type === "evict_lease" && qf.targetId) {
      const idx = nextNodes.findIndex((n) => n.id === qf.targetId);
      if (idx !== -1 && nextNodes[idx]) {
        const targetNode = nextNodes[idx];
        const patchedMetadata = {
          ...(targetNode.metadata || {}),
          leaseToken: undefined,
          leaseAgent: undefined,
        };
        nextNodes[idx] = {
          ...targetNode,
          metadata: patchedMetadata,
          status: "pending",
          ...(qf.patch || {}),
        };
      }
    } else if (qf.type === "prune_context" && qf.targetId) {
      const idx = nextNodes.findIndex((n) => n.id === qf.targetId);
      if (idx !== -1 && nextNodes[idx]) {
        const targetNode = nextNodes[idx];
        nextNodes[idx] = {
          ...targetNode,
          prompt: targetNode.prompt
            ? targetNode.prompt.slice(0, 1000) + " [Context Pruned]"
            : undefined,
          ...(qf.patch || {}),
        };
      }
    } else if (qf.type === "bypass_join" && qf.targetId) {
      const idx = nextNodes.findIndex((n) => n.id === qf.targetId);
      if (idx !== -1 && nextNodes[idx]) {
        nextNodes[idx] = {
          ...nextNodes[idx],
          status: "running",
          ...(qf.patch || {}),
        };
      }
    }

    return {
      ...dataset,
      nodes: nextNodes,
      edges: nextEdges,
    };
  }
}

/**
 * Convenience helper to detect all anomalies on a dataset with default or custom configuration.
 */
export function detectAnomalies(
  dataset: GraphDataset | null | undefined,
  config?: DetectorConfig,
): AnomalyReport {
  const engine = new AnomalyEngine(config);
  return engine.analyze(dataset);
}

/**
 * Generates a human-readable text summary of an AnomalyReport.
 */
export function formatAnomalySummary(report: AnomalyReport): string {
  const lines = [
    `=== GVUI GRAPH ANOMALY & DEFECT AUDIT ===`,
    `Dataset: ${report.datasetId}`,
    `Health Score: ${report.healthScore}/100`,
    `Total Anomalies: ${report.totalAnomalies} (Critical: ${report.severityCounts.critical}, Error: ${report.severityCounts.error}, Warning: ${report.severityCounts.warning}, Info: ${report.severityCounts.info})`,
    `Categories: Topology: ${report.categoryCounts.topology}, Execution: ${report.categoryCounts.execution}, Resource: ${report.categoryCounts.resource}, Performance: ${report.categoryCounts.performance}, Quality: ${report.categoryCounts.quality}`,
    ``,
    `Top Anomalies:`,
  ];

  for (let i = 0; i < Math.min(5, report.anomalies.length); i++) {
    const a = report.anomalies[i];
    if (a) {
      lines.push(`[${a.severity.toUpperCase()}] ${a.title} (Impact: ${a.impactScore}/100)`);
      lines.push(`  - ${a.description}`);
      lines.push(`  - Action: ${a.remediation.action}`);
    }
  }

  if (report.recommendedActions.length > 0) {
    lines.push(``);
    lines.push(`Recommended Remediation Actions:`);
    for (const act of report.recommendedActions) {
      lines.push(`• ${act}`);
    }
  }

  return lines.join("\n");
}
