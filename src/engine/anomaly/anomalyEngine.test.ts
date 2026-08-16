import { describe, expect, it } from "bun:test";
import type { GraphDataset } from "../../types/graphData";
import {
  AnomalyEngine,
  calculateHealthScore,
  detectAnomalies,
  filterAnomalies,
  formatAnomalySummary,
} from "./AnomalyEngine";
import type { AnomalyFinding } from "./types";

describe("AnomalyEngine & Pipeline Diagnostics", () => {
  const sampleDataset: GraphDataset = {
    id: "pipeline-dataset-1",
    title: "Multi-Agent Orchestration Run",
    nodes: [
      {
        id: "root-orchestrator",
        name: "Root Orchestrator",
        status: "success",
        metrics: { durationMs: 1500, tokensIn: 1000, tokensOut: 500 },
      },
      {
        id: "worker-retry-loop",
        name: "Worker Retry Loop",
        status: "error",
        metrics: {
          retries: 4,
          repairRounds: 2,
          durationMs: 8000,
          tokensIn: 3000,
          tokensOut: 1200,
        },
      },
      {
        id: "worker-token-bloat",
        name: "Worker Token Bloat",
        status: "success",
        metrics: {
          durationMs: 4000,
          tokensIn: 75000,
          tokensOut: 6000,
        },
      },
      {
        id: "worker-stranded-lock",
        name: "Worker Stranded Lock",
        status: "running",
        metadata: {
          leaseToken: "lease-abc-999",
          leaseAgent: "agent-04",
          durationMs: 900000, // 15 mins > 10 mins
        },
      },
      {
        id: "worker-waiting-dep",
        name: "Worker Waiting Dep",
        status: "pending",
      },
    ],
    edges: [
      {
        id: "e1",
        source: "root-orchestrator",
        target: "worker-retry-loop",
        kind: "sequence",
      },
      {
        id: "e2",
        source: "root-orchestrator",
        target: "worker-token-bloat",
        kind: "spawn",
      },
      {
        id: "e3",
        source: "worker-stranded-lock",
        target: "worker-waiting-dep",
        kind: "dependency",
      },
    ],
  };

  it("handles null or empty dataset gracefully", () => {
    const report1 = detectAnomalies(null);
    expect(report1.healthScore).toBe(100);
    expect(report1.totalAnomalies).toBe(0);

    const report2 = detectAnomalies({
      id: "empty",
      title: "Empty",
      nodes: [],
      edges: [],
    });
    expect(report2.healthScore).toBe(100);
    expect(report2.totalAnomalies).toBe(0);
  });

  it("analyzes sample dataset and aggregates comprehensive report", () => {
    const engine = new AnomalyEngine();
    const report = engine.analyze(sampleDataset);

    expect(report.datasetId).toBe("pipeline-dataset-1");
    expect(report.totalAnomalies).toBeGreaterThan(0);
    expect(report.healthScore).toBeLessThan(100);
    expect(report.severityCounts.critical + report.severityCounts.error).toBeGreaterThan(0);
    expect(report.categoryCounts.execution).toBeGreaterThan(0);
    expect(report.categoryCounts.resource).toBeGreaterThan(0);
    expect(report.recommendedActions.length).toBeGreaterThan(0);
  });

  it("allows overriding detector thresholds and disabling specific detectors", () => {
    const strictEngine = new AnomalyEngine({
      thresholds: {
        tokenSpikeAbsoluteThreshold: 20000,
        maxRetries: 1,
      },
      enabledDetectors: ["cognitive_token_spike"],
    });

    const report = strictEngine.analyze(sampleDataset);
    for (const anom of report.anomalies) {
      expect(anom.type).toBe("cognitive_token_spike");
    }
  });

  it("runs node-focused diagnostics with analyzeNode", () => {
    const engine = new AnomalyEngine();
    const nodeFindings = engine.analyzeNode(sampleDataset, "worker-retry-loop");
    expect(nodeFindings.length).toBeGreaterThan(0);
    for (const f of nodeFindings) {
      expect(f.nodeIds).toContain("worker-retry-loop");
    }
  });

  it("calculates accurate health scores based on severity weights", () => {
    const emptyFindings: AnomalyFinding[] = [];
    expect(calculateHealthScore(emptyFindings)).toBe(100);

    const minorFindings: AnomalyFinding[] = [
      {
        id: "1",
        type: "runaway_retry_loop",
        category: "execution",
        severity: "info",
        title: "Info",
        description: "Desc",
        nodeIds: ["n1"],
        impactScore: 10,
        remediation: { action: "Act", suggestion: "Sug" },
        evidence: {},
        timestamp: Date.now(),
      },
      {
        id: "2",
        type: "runaway_retry_loop",
        category: "execution",
        severity: "warning",
        title: "Warn",
        description: "Desc",
        nodeIds: ["n1"],
        impactScore: 20,
        remediation: { action: "Act", suggestion: "Sug" },
        evidence: {},
        timestamp: Date.now(),
      },
    ];
    expect(calculateHealthScore(minorFindings)).toBe(90); // 100 - 2 - 8 = 90

    const criticalFindings: AnomalyFinding[] = [
      {
        id: "c1",
        type: "circular_dependency_deadlock",
        category: "topology",
        severity: "critical",
        title: "Deadlock",
        description: "Desc",
        nodeIds: ["n1", "n2"],
        impactScore: 100,
        remediation: { action: "Act", suggestion: "Sug" },
        evidence: {},
        timestamp: Date.now(),
      },
      {
        id: "c2",
        type: "stranded_distributed_lock",
        category: "execution",
        severity: "critical",
        title: "Lock",
        description: "Desc",
        nodeIds: ["n3"],
        impactScore: 100,
        remediation: { action: "Act", suggestion: "Sug" },
        evidence: {},
        timestamp: Date.now(),
      },
      {
        id: "c3",
        type: "error_cascade",
        category: "quality",
        severity: "critical",
        title: "Cascade",
        description: "Desc",
        nodeIds: ["n4"],
        impactScore: 100,
        remediation: { action: "Act", suggestion: "Sug" },
        evidence: {},
        timestamp: Date.now(),
      },
    ];
    expect(calculateHealthScore(criticalFindings)).toBe(0); // Clamped at 0
  });

  it("filters anomalies correctly across multi-dimensional criteria", () => {
    const engine = new AnomalyEngine();
    const report = engine.analyze(sampleDataset);

    // Search query filter
    const searchFiltered = filterAnomalies(report.anomalies, {
      searchQuery: "retry",
    });
    expect(searchFiltered.length).toBeGreaterThan(0);
    for (const f of searchFiltered) {
      const match =
        f.title.toLowerCase().includes("retry") ||
        f.description.toLowerCase().includes("retry") ||
        f.remediation.action.toLowerCase().includes("retry") ||
        f.nodeIds.some((id) => id.includes("retry"));
      expect(match).toBe(true);
    }

    // Severity filter
    const severityFiltered = filterAnomalies(report.anomalies, {
      severities: ["critical"],
    });
    for (const f of severityFiltered) {
      expect(f.severity).toBe("critical");
    }

    // Category filter
    const categoryFiltered = filterAnomalies(report.anomalies, {
      categories: ["resource"],
    });
    for (const f of categoryFiltered) {
      expect(f.category).toBe("resource");
    }

    // Auto-fixable filter
    const autoFixFiltered = filterAnomalies(report.anomalies, {
      autoFixableOnly: true,
    });
    for (const f of autoFixFiltered) {
      expect(f.remediation.autoFixable).toBe(true);
    }
  });

  it("applies immutable quick fixes successfully", () => {
    const engine = new AnomalyEngine();
    const report = engine.analyze(sampleDataset);

    // Find autoFixable finding for stranded lock
    const lockFinding = report.anomalies.find((f) => f.type === "stranded_distributed_lock");
    expect(lockFinding).toBeDefined();

    if (lockFinding) {
      const fixedDataset = engine.applyQuickFix(sampleDataset, lockFinding.id);
      expect(fixedDataset).not.toBe(sampleDataset); // Immutable copy

      const targetNode = fixedDataset.nodes.find((n) => n.id === "worker-stranded-lock");
      expect(targetNode?.metadata?.leaseToken).toBeUndefined();
      expect(targetNode?.status).toBe("pending");
    }
  });

  it("formats audit summary text cleanly", () => {
    const report = detectAnomalies(sampleDataset);
    const summary = formatAnomalySummary(report);

    expect(summary).toContain("=== GVUI GRAPH ANOMALY & DEFECT AUDIT ===");
    expect(summary).toContain(sampleDataset.id);
    expect(summary).toContain("Health Score:");
    expect(summary).toContain("Total Anomalies:");
  });
});
