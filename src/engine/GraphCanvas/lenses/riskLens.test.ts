import { describe, expect, it } from "bun:test";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import { DEFAULT_RISK_CONFIG } from "../../../store/useCanvasLensStore";
import { calculateNodeRisk, evaluateRiskLens, extractNodeRiskValue } from "./riskLens";
import { DEFAULT_RISK_WEIGHTS } from "./types";

describe("riskLens Module", () => {
  const mockNodes: PositionedNode[] = [
    {
      id: "node-safe",
      name: "Safe Orchestrator",
      status: "success",
      x: 0,
      y: 0,
      width: 150,
      height: 60,
      metrics: { retries: 0 },
    },
    {
      id: "node-moderate",
      name: "Moderate Agent",
      status: "warning",
      x: 200,
      y: 0,
      width: 150,
      height: 60,
      metrics: { retries: 1 },
      metadata: {
        findings: [
          {
            id: "f1",
            severity: "suggestion",
            observation: "minor improvement",
            status: "open",
          },
        ],
      },
    },
    {
      id: "node-critical",
      name: "Failing Subagent",
      status: "error",
      x: 400,
      y: 0,
      width: 150,
      height: 60,
      metrics: { retries: 3, repairRounds: 2 },
      metadata: {
        findings: [
          {
            id: "f2",
            severity: "critical",
            observation: "Syntax crash",
            status: "open",
          },
        ],
        commands: [
          {
            id: "c-err",
            argv: ["bun", "test"],
            cwd: "/",
            exitCode: 1,
            durationMs: 120,
            startedAt: "2026-08-15T00:00:00Z",
            finishedAt: "2026-08-15T00:00:01Z",
          },
        ],
      },
    },
  ];

  const mockEdges: PositionedEdge[] = [
    { id: "e1", source: "node-safe", target: "node-moderate", path: "M 0 0 L 200 0" },
    { id: "e2", source: "node-critical", target: "node-moderate", path: "M 400 0 L 200 0" },
  ];

  describe("Multi-Factor Risk Assessment", () => {
    it("calculates comprehensive risk factor breakdown", () => {
      const safeRisk = calculateNodeRisk(mockNodes[0], mockNodes, mockEdges, DEFAULT_RISK_WEIGHTS);
      expect(safeRisk.level).toBe("low");
      expect(safeRisk.compositeScore).toBeLessThan(0.25);
      expect(safeRisk.errorCount).toBe(0);

      const critRisk = calculateNodeRisk(mockNodes[2], mockNodes, mockEdges, DEFAULT_RISK_WEIGHTS);
      expect(critRisk.level).toBe("critical");
      expect(critRisk.statusRisk).toBe(1.0);
      expect(critRisk.retriesRisk).toBe(1.0);
      expect(critRisk.criticalFindingCount).toBe(1);
      expect(critRisk.commandFailures).toBe(1);
      expect(critRisk.compositeScore).toBeGreaterThanOrEqual(0.75);
    });

    it("extracts specific risk metric dimensions", () => {
      const critRisk = calculateNodeRisk(mockNodes[2], mockNodes, mockEdges, DEFAULT_RISK_WEIGHTS);
      expect(extractNodeRiskValue(critRisk, "composite")).toBe(critRisk.compositeScore);
      expect(extractNodeRiskValue(critRisk, "retryCount")).toBe(critRisk.retryCount);
      expect(extractNodeRiskValue(critRisk, "errorRate")).toBe(critRisk.statusRisk);
    });
  });

  describe("evaluateRiskLens()", () => {
    it("evaluates risk overlays, styling, and blast radius edges", () => {
      const result = evaluateRiskLens(mockNodes, mockEdges, DEFAULT_RISK_CONFIG);

      expect(result.nodeOverlays.size).toBe(3);
      expect(result.edgeOverlays.size).toBe(2);

      const critOverlay = result.nodeOverlays.get("node-critical")!;
      expect(critOverlay.riskLevel).toBe("critical");
      expect(critOverlay.badgeVariant).toBe("error");
      expect(critOverlay.badgeText).toContain("CRITICAL");

      // Blast radius edge from critical node
      const blastEdgeOverlay = result.edgeOverlays.get("e2")!;
      expect(blastEdgeOverlay.isCritical).toBe(true);
      expect(blastEdgeOverlay.badgeText).toBe("BLAST PATH");

      // Summary Stats
      expect(result.summaryStats.highRiskNodeCount).toBeGreaterThanOrEqual(1);
      expect(result.summaryStats.totalNodes).toBe(3);
    });
  });
});
