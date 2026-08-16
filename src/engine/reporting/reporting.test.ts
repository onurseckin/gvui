import { describe, expect, it } from "bun:test";
import type { GraphDataset } from "../../types/graphData";
import {
  aggregateKpiScorecard,
  aggregateTokenAttribution,
  buildExecutiveReportData,
  extractAuditFindings,
  findCriticalPath,
} from "./metricsAggregator";
import { computeBlastRadiusMatrix, simulateNodeFailure } from "./blastRadiusEngine";
import {
  escapeHtml,
  generateExecutiveReportHtml,
  generateExecutiveReportJson,
  generateExecutiveReportMarkdown,
} from "./formatters";

const mockComplexDataset: GraphDataset = {
  id: "test-pipeline-alpha",
  title: "Multi-Agent Architecture & Validation Suite",
  description: "Test execution trace for autonomous agent orchestrator",
  sections: [
    {
      id: "sec-orchestration",
      title: "Core Orchestration",
      nodeIds: ["node-orch", "node-router"],
    },
    {
      id: "sec-execution",
      title: "Task Execution Workers",
      nodeIds: ["node-worker-1", "node-worker-2"],
    },
    {
      id: "sec-validation",
      title: "Adversarial Validation",
      nodeIds: ["node-gate"],
    },
  ],
  nodes: [
    {
      id: "node-orch",
      name: "Meta Orchestrator",
      kind: "orchestrator",
      status: "success",
      model: "claude-3-7-sonnet",
      tier: "l",
      step: 1,
      metrics: {
        tokensIn: 5000,
        tokensOut: 2000,
        costUsd: 0.045,
        durationMs: 3200,
        retries: 0,
        repairRounds: 0,
        tokens: {
          promptTokens: 5000,
          completionTokens: 2000,
          reasoningTokens: 800,
          totalTokens: 7800,
        },
      },
    },
    {
      id: "node-router",
      name: "Task Router",
      kind: "router",
      status: "success",
      model: "gpt-4o-mini",
      tier: "s",
      step: 2,
      metrics: {
        tokensIn: 1200,
        tokensOut: 400,
        costUsd: 0.002,
        durationMs: 650,
      },
    },
    {
      id: "node-worker-1",
      name: "Implementer Agent 01",
      kind: "agent",
      status: "success",
      model: "claude-3-7-sonnet",
      tier: "l",
      step: 3,
      metrics: {
        tokensIn: 8500,
        tokensOut: 3200,
        costUsd: 0.082,
        durationMs: 8400,
        retries: 1,
        repairRounds: 1,
      },
      metadata: {
        findings: [
          {
            id: "find-01",
            severity: "important",
            observation: "Missing null guard on input payload",
            remediation: "Added optional chaining",
            status: "resolved",
          },
        ],
      },
    },
    {
      id: "node-worker-2",
      name: "Implementer Agent 02",
      kind: "agent",
      status: "error",
      model: "deepseek-r1",
      tier: "m",
      step: 3,
      metrics: {
        tokensIn: 6200,
        tokensOut: 1800,
        costUsd: 0.015,
        durationMs: 4100,
        retries: 2,
      },
      metadata: {
        findings: [
          {
            id: "find-02",
            severity: "critical",
            observation: "Process memory limit exceeded",
            remediation: "Increase worker allocation",
            status: "open",
          },
        ],
      },
    },
    {
      id: "node-gate",
      name: "Quality Gate Validator",
      kind: "gate",
      status: "pending",
      model: "gpt-4o",
      tier: "m",
      step: 4,
      metrics: {
        tokensIn: 500,
        tokensOut: 100,
        costUsd: 0.003,
        durationMs: 0,
      },
    },
  ],
  edges: [
    { id: "e1", source: "node-orch", target: "node-router", kind: "dispatch" },
    { id: "e2", source: "node-router", target: "node-worker-1", kind: "spawn" },
    { id: "e3", source: "node-router", target: "node-worker-2", kind: "spawn" },
    { id: "e4", source: "node-worker-1", target: "node-gate", kind: "validation" },
    { id: "e5", source: "node-worker-2", target: "node-gate", kind: "validation" },
  ],
};

describe("Executive Reporting Engine Test Suite", () => {
  describe("Metrics Aggregator", () => {
    it("handles null / undefined / empty datasets gracefully", () => {
      const emptyKpi = aggregateKpiScorecard(null);
      expect(emptyKpi.totalNodes).toBe(0);
      expect(emptyKpi.totalEdges).toBe(0);
      expect(emptyKpi.healthScore).toBe(100);
      expect(emptyKpi.failureRate).toBe(0);
      expect(Number.isFinite(emptyKpi.mttrMs)).toBe(true);
      expect(Number.isFinite(emptyKpi.throughputNodesPerSec)).toBe(true);

      const emptyAttribution = aggregateTokenAttribution(undefined);
      expect(emptyAttribution.totalTokens).toBe(0);
      expect(emptyAttribution.byNode).toEqual([]);
      expect(emptyAttribution.byModel).toEqual([]);

      const emptyFindings = extractAuditFindings(null);
      expect(emptyFindings).toEqual([]);

      const emptyCritPath = findCriticalPath(null);
      expect(emptyCritPath.path).toEqual([]);
      expect(emptyCritPath.durationMs).toBe(0);
    });

    it("handles zero-node and zero-edge datasets without NaN or Infinity in MTTR and throughput", () => {
      const zeroDataset: GraphDataset = {
        id: "zero-graph",
        title: "Zero Graph",
        nodes: [],
        edges: [],
      };

      const kpi = aggregateKpiScorecard(zeroDataset);
      expect(kpi.totalNodes).toBe(0);
      expect(kpi.totalEdges).toBe(0);
      expect(kpi.mttrMs).toBe(0);
      expect(kpi.throughputNodesPerSec).toBe(0);
      expect(kpi.failureRate).toBe(0);
      expect(kpi.healthScore).toBe(100);
      expect(kpi.recoveryEfficiency).toBe(100);
      expect(kpi.bottleneckScore).toBe(0);

      // Verify no field contains NaN or Infinity
      for (const [, val] of Object.entries(kpi)) {
        if (typeof val === "number") {
          expect(Number.isNaN(val)).toBe(false);
          expect(Number.isFinite(val)).toBe(true);
        }
      }
    });

    it("accurately computes KPI scorecards on complex datasets", () => {
      const kpi = aggregateKpiScorecard(mockComplexDataset);
      expect(kpi.totalNodes).toBe(5);
      expect(kpi.totalEdges).toBe(5);
      expect(kpi.successCount).toBe(3);
      expect(kpi.failureCount).toBe(1);
      expect(kpi.pendingCount).toBe(1);
      expect(kpi.failureRate).toBe(20);
      expect(kpi.totalRetries).toBe(3);
      expect(kpi.totalRepairRounds).toBe(1);
      expect(kpi.totalCostUsd).toBeCloseTo(0.147, 3);
      expect(kpi.totalDurationMs).toBe(16350);
      expect(kpi.healthScore).toBeLessThan(100);
      expect(kpi.healthScore).toBeGreaterThan(0);
    });

    it("accurately computes token attribution by node, model, tier, and section", () => {
      const attribution = aggregateTokenAttribution(mockComplexDataset);
      expect(attribution.totalTokens).toBeGreaterThan(20000);
      expect(attribution.totalCostUsd).toBeCloseTo(0.147, 3);

      expect(attribution.byNode.length).toBe(5);
      expect(attribution.byNode[0].nodeId).toBeDefined();
      expect(attribution.byNode[0].tokenPercentage).toBeGreaterThan(0);

      expect(attribution.byModel.length).toBeGreaterThan(0);
      const claudeModel = attribution.byModel.find((m) => m.category.includes("claude"));
      expect(claudeModel).toBeDefined();
      expect(claudeModel?.nodeCount).toBe(2);

      expect(attribution.bySection.length).toBe(3);
      const executionSection = attribution.bySection.find((s) => s.category.includes("Execution"));
      expect(executionSection).toBeDefined();
      expect(executionSection?.nodeCount).toBe(2);
    });

    it("correctly identifies critical path and handles cycles without infinite recursion", () => {
      const critPath = findCriticalPath(mockComplexDataset);
      expect(critPath.path.length).toBeGreaterThan(1);
      expect(critPath.path[0]).toBe("node-orch");
      expect(critPath.durationMs).toBeGreaterThan(0);

      // Cyclic graph test
      const cyclicDataset: GraphDataset = {
        id: "cyclic",
        title: "Cyclic Graph",
        nodes: [
          { id: "a", name: "A", metrics: { durationMs: 100 } },
          { id: "b", name: "B", metrics: { durationMs: 200 } },
        ],
        edges: [
          { id: "e1", source: "a", target: "b" },
          { id: "e2", source: "b", target: "a" },
        ],
      };
      const cyclicResult = findCriticalPath(cyclicDataset);
      expect(cyclicResult.path.length).toBeGreaterThan(0);
      expect(cyclicResult.durationMs).toBeGreaterThan(0);
    });

    it("extracts findings and formats full ExecutiveReportData", () => {
      const findings = extractAuditFindings(mockComplexDataset);
      expect(findings.length).toBe(2);
      expect(findings.find((f) => f.id === "find-01")?.status).toBe("resolved");
      expect(findings.find((f) => f.id === "find-02")?.severity).toBe("critical");

      const fullReport = buildExecutiveReportData(mockComplexDataset, {
        customNotes: "Critical test run observation notes.",
      });
      expect(fullReport.datasetId).toBe("test-pipeline-alpha");
      expect(fullReport.kpi.totalNodes).toBe(5);
      expect(fullReport.blastRadius.items.length).toBe(5);
      expect(fullReport.config.customNotes).toBe("Critical test run observation notes.");
    });
  });

  describe("Blast Radius Engine", () => {
    it("computes downstream reach, cascade depth, and risk levels", () => {
      const matrix = computeBlastRadiusMatrix(mockComplexDataset);
      expect(matrix.items.length).toBe(5);
      expect(matrix.maxGraphDepth).toBeGreaterThanOrEqual(3);

      const orchImpact = matrix.items.find((item) => item.nodeId === "node-orch");
      expect(orchImpact).toBeDefined();
      expect(orchImpact?.directDownstreamCount).toBe(1);
      expect(orchImpact?.transitiveDownstreamCount).toBe(4);
      expect(orchImpact?.blastRadiusScore).toBeGreaterThan(50);
      expect(orchImpact?.cascadeTree.length).toBe(4);

      const gateImpact = matrix.items.find((item) => item.nodeId === "node-gate");
      expect(gateImpact).toBeDefined();
      expect(gateImpact?.directDownstreamCount).toBe(0);
      expect(gateImpact?.transitiveDownstreamCount).toBe(0);
      expect(gateImpact?.riskLevel).toBe("low");
    });

    it("simulates single node failure downstream consequences", () => {
      const sim = simulateNodeFailure(mockComplexDataset, "node-router");
      expect(sim.affectedNodes).toContain("node-worker-1");
      expect(sim.affectedNodes).toContain("node-worker-2");
      expect(sim.affectedNodes).toContain("node-gate");
      expect(sim.cascadeDepth).toBeGreaterThanOrEqual(2);
      expect(sim.totalCostAtRisk).toBeGreaterThan(0);
    });

    it("prevents infinite recursion on cyclic graphs during blast radius calculation and simulation", () => {
      const complexCyclicDataset: GraphDataset = {
        id: "cyclic-complex",
        title: "Cyclic Test Network",
        nodes: [
          {
            id: "c1",
            name: "Node C1",
            kind: "agent",
            status: "success",
            metrics: { costUsd: 0.01 },
          },
          {
            id: "c2",
            name: "Node C2",
            kind: "agent",
            status: "running",
            metrics: { costUsd: 0.02 },
          },
          { id: "c3", name: "Node C3", kind: "agent", status: "error", metrics: { costUsd: 0.03 } },
          { id: "c4", name: "Node C4", kind: "gate", status: "pending", metrics: { costUsd: 0.0 } },
        ],
        edges: [
          { id: "ce1", source: "c1", target: "c2" },
          { id: "ce2", source: "c2", target: "c3" },
          { id: "ce3", source: "c3", target: "c1" }, // cycle C1 -> C2 -> C3 -> C1
          { id: "ce4", source: "c3", target: "c4" },
          { id: "ce5", source: "c4", target: "c4" }, // self loop
        ],
      };

      const matrix = computeBlastRadiusMatrix(complexCyclicDataset);
      expect(matrix.items.length).toBe(4);
      expect(matrix.items.every((it) => Number.isFinite(it.blastRadiusScore))).toBe(true);

      // Traversal from C1 should visit C2, C3, C4 without getting stuck in cycle
      const c1Impact = matrix.items.find((it) => it.nodeId === "c1");
      expect(c1Impact).toBeDefined();
      expect(c1Impact?.affectedNodeIds).toContain("c2");
      expect(c1Impact?.affectedNodeIds).toContain("c3");
      expect(c1Impact?.affectedNodeIds).toContain("c4");
      expect(c1Impact?.affectedNodeIds).not.toContain("c1"); // source node excluded from affected downstream

      // Simulate failure on node in cycle
      const sim = simulateNodeFailure(complexCyclicDataset, "c2");
      expect(sim.affectedNodes).toContain("c3");
      expect(sim.affectedNodes).toContain("c1");
      expect(sim.affectedNodes).toContain("c4");
    });
  });

  describe("Formatters (HTML, Markdown, JSON)", () => {
    it("escapes HTML strings correctly to prevent XSS injection", () => {
      expect(escapeHtml("<script>alert('xss')</script>")).toBe(
        "&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;",
      );
      expect(escapeHtml(null)).toBe("");
      expect(escapeHtml('Hello & "World" <test>')).toBe(
        "Hello &amp; &quot;World&quot; &lt;test&gt;",
      );
    });

    it("prevents XSS injection in HTML export when node names, remarks, or findings contain malicious scripts", () => {
      const maliciousDataset: GraphDataset = {
        id: "xss-test-id",
        title: "Malicious <script>alert('title-xss')</script>",
        description: "Desc <img src=x onerror=alert('desc-xss')>",
        nodes: [
          {
            id: "node-xss-1",
            name: "Agent <script>alert('node-name-xss')</script>",
            kind: "agent",
            status: "error",
            model: "model<script>bad()</script>",
            metrics: { durationMs: 100, costUsd: 0.01 },
            metadata: {
              findings: [
                {
                  id: "f-xss",
                  severity: "critical",
                  observation: "Observation <svg onload=alert(1)>",
                  remediation: "Remediation <iframe src=javascript:alert(2)>",
                  status: "open",
                },
              ],
            },
          },
        ],
        edges: [],
      };

      const report = buildExecutiveReportData(maliciousDataset, {
        customNotes: "Custom remarks <script>alert('notes-xss')</script>",
      });
      const html = generateExecutiveReportHtml(report);

      // Verify no unescaped dangerous tags exist in generated HTML
      expect(html).not.toContain("<script>alert('title-xss')</script>");
      expect(html).not.toContain("<img src=x onerror=alert('desc-xss')>");
      expect(html).not.toContain("<script>alert('node-name-xss')</script>");
      expect(html).not.toContain("<svg onload=alert(1)>");
      expect(html).not.toContain("<iframe src=javascript:alert(2)>");
      expect(html).not.toContain("<script>alert('notes-xss')</script>");

      // Verify properly escaped entity representations exist
      expect(html).toContain("&lt;script&gt;alert(&#039;node-name-xss&#039;)&lt;/script&gt;");
      expect(html).toContain("&lt;svg onload=alert(1)&gt;");
    });

    it("generates full standalone HTML with @media print stylesheet", () => {
      const report = buildExecutiveReportData(mockComplexDataset);
      const html = generateExecutiveReportHtml(report);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<title>Multi-Agent Architecture &amp; Validation Suite</title>");
      expect(html).toContain("@media print");
      expect(html).toContain("CONFIDENTIAL // ARCHITECTURE AUDIT");
      expect(html).toContain("Multi-Agent Architecture &amp; Validation Suite");
      expect(html).toContain("Executive KPI Scorecard");
    });

    it("generates valid GitHub-Flavored Markdown report", () => {
      const report = buildExecutiveReportData(mockComplexDataset);
      const md = generateExecutiveReportMarkdown(report);
      expect(md).toContain("# Multi-Agent Architecture & Validation Suite");
      expect(md).toContain("## Executive KPI Scorecard");
      expect(md).toContain("## Failure Blast Radius & Downstream Risk Matrix");
      expect(md).toContain("## Token & Cost Attribution");
    });

    it("generates structured JSON export", () => {
      const report = buildExecutiveReportData(mockComplexDataset);
      const jsonStr = generateExecutiveReportJson(report);
      const parsed = JSON.parse(jsonStr);
      expect(parsed.datasetId).toBe("test-pipeline-alpha");
      expect(parsed.kpi.totalNodes).toBe(5);
    });
  });
});
