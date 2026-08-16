import { describe, expect, it } from "bun:test";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import { DEFAULT_TOKEN_CONFIG } from "../../../store/useCanvasLensStore";
import {
  evaluateTokenLens,
  extractNodeTokenDetail,
  formatCostUsd,
  formatTokenCount,
} from "./tokenLens";

describe("tokenLens Module", () => {
  const mockNodes: PositionedNode[] = [
    {
      id: "node-xs",
      name: "Lightweight Router",
      tier: "xs",
      x: 0,
      y: 0,
      width: 150,
      height: 60,
      metrics: {
        tokens: {
          promptTokens: 1000,
          completionTokens: 200,
          reasoningTokens: 0,
          cacheReadTokens: 500,
          cacheCreationTokens: 0,
          totalTokens: 1700,
        },
      },
    },
    {
      id: "node-l",
      name: "Frontier Reasoner",
      tier: "l",
      x: 200,
      y: 0,
      width: 150,
      height: 60,
      metrics: {
        tokens: {
          promptTokens: 25000,
          completionTokens: 8000,
          reasoningTokens: 15000,
          cacheReadTokens: 10000,
          cacheCreationTokens: 5000,
          totalTokens: 63000,
        },
        durationMs: 4000,
      },
    },
  ];

  const mockEdges: PositionedEdge[] = [
    {
      id: "e1",
      source: "node-xs",
      target: "node-l",
      path: "M 0 0 L 200 0",
      traffic: {
        tokens: 1500,
      },
    },
  ];

  describe("Token & Cost Extraction", () => {
    it("extracts token breakdown and computes USD costs accurately", () => {
      const xsDetail = extractNodeTokenDetail(mockNodes[0]);
      expect(xsDetail.totalTokens).toBe(1700);
      expect(xsDetail.tier).toBe("xs");
      expect(xsDetail.costUsd).toBeGreaterThan(0);

      const lDetail = extractNodeTokenDetail(mockNodes[1]);
      expect(lDetail.totalTokens).toBe(63000);
      expect(lDetail.tier).toBe("l");
      expect(lDetail.reasoningTokens).toBe(15000);

      // Cost calculation check for tier L:
      // (25k/1M)*15 + (8k/1M)*75 + (15k/1M)*75 + (5k/1M)*18.75 + (10k/1M)*1.5
      // = 0.375 + 0.6 + 1.125 + 0.09375 + 0.015 = 2.20875
      expect(lDetail.costUsd).toBeCloseTo(2.20875, 2);
    });

    it("formats tokens and USD strings cleanly", () => {
      expect(formatTokenCount(500)).toBe("500 tok");
      expect(formatTokenCount(14500)).toBe("14.5k tok");
      expect(formatTokenCount(2500000)).toBe("2.50M tok");
      expect(formatCostUsd(0.0042)).toBe("$0.0042");
      expect(formatCostUsd(12.5)).toBe("$12.50");
    });
  });

  describe("evaluateTokenLens()", () => {
    it("identifies top 20% Pareto consumers and builds overlays", () => {
      const result = evaluateTokenLens(mockNodes, mockEdges, DEFAULT_TOKEN_CONFIG);

      expect(result.nodeOverlays.size).toBe(2);
      expect(result.edgeOverlays.size).toBe(1);

      const lOverlay = result.nodeOverlays.get("node-l")!;
      expect(lOverlay.tokenBreakdown?.totalTokens).toBe(63000);
      expect(lOverlay.tokenBreakdown?.reasoningTokens).toBe(15000);
      expect(lOverlay.badgeText).toBe("63.0k tok");

      const edgeOverlay = result.edgeOverlays.get("e1")!;
      expect(edgeOverlay.trafficTokens).toBe(1500);
      expect(edgeOverlay.badgeText).toBe("1.5k tok");

      // Summary stats
      expect(result.summaryStats.totalTokens).toBe(1700 + 63000);
      expect(result.summaryStats.totalCostUsd).toBeGreaterThan(2);
    });

    it("evaluates costUsd metric mode", () => {
      const costConfig = {
        ...DEFAULT_TOKEN_CONFIG,
        tokenMetric: "costUsd" as const,
      };
      const result = evaluateTokenLens(mockNodes, mockEdges, costConfig);
      const lOverlay = result.nodeOverlays.get("node-l")!;
      expect(lOverlay.badgeText).toContain("$");
    });
  });
});
