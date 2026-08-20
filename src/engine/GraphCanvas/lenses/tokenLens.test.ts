import { describe, expect, it } from "bun:test";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import { DEFAULT_TOKEN_CONFIG } from "../../../store/useCanvasLensStore";
import {
  evaluateTokenLens,
  extractNodeTokenDetail,
  formatCostIntensity,
  formatCostUsd,
  formatTokenCount,
} from "./tokenLens";

describe("tokenLens Module", () => {
  const mockNodes: PositionedNode[] = [
    {
      id: "node-xs",
      name: "Lightweight Router",
      telemetry: { modelTier: { value: "xs", evidence_class: "host_reported" } },
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
      telemetry: { modelTier: { value: "l", evidence_class: "host_reported" } },
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
        costUsd: 2.20875,
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
    it("reports tokens for every node but dollars only where the data carries them", () => {
      const xsDetail = extractNodeTokenDetail(mockNodes[0]);
      expect(xsDetail.totalTokens).toBe(1700);
      expect(xsDetail.tier).toBe("xs");
      expect(xsDetail.costUsd).toBeUndefined();
      expect(xsDetail.costIntensity).toBeUndefined();

      const lDetail = extractNodeTokenDetail(mockNodes[1]);
      expect(lDetail.totalTokens).toBe(63000);
      expect(lDetail.tier).toBe("l");
      expect(lDetail.reasoningTokens).toBe(15000);
      expect(lDetail.costUsd).toBe(2.20875);
    });

    it("formats tokens and USD strings cleanly, and absent dollars as unknown", () => {
      expect(formatTokenCount(500)).toBe("500 tok");
      expect(formatTokenCount(14500)).toBe("14.5k tok");
      expect(formatTokenCount(2500000)).toBe("2.50M tok");
      expect(formatCostUsd(0.0042)).toBe("$0.0042");
      expect(formatCostUsd(12.5)).toBe("$12.50");
      expect(formatCostUsd(undefined)).toBe("unknown");
      expect(formatCostIntensity(undefined)).toBe("unknown");
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
      expect(result.summaryStats.totalCostUsd).toBe(2.2088);
    });

    it("evaluates costUsd metric mode", () => {
      const costConfig = {
        ...DEFAULT_TOKEN_CONFIG,
        tokenMetric: "costUsd" as const,
      };
      const result = evaluateTokenLens(mockNodes, mockEdges, costConfig);
      expect(result.nodeOverlays.get("node-l")!.badgeText).toBe("$2.21");
      expect(result.nodeOverlays.get("node-xs")!.badgeText).toBe("unknown");
    });

    it("totals no cost at all when no node recorded one", () => {
      const result = evaluateTokenLens([mockNodes[0]], mockEdges, DEFAULT_TOKEN_CONFIG);
      expect(result.summaryStats.totalCostUsd).toBeUndefined();
    });
  });

  describe("A node whose dataset recorded no tokens", () => {
    const silent: PositionedNode = {
      id: "silent",
      name: "Silent Agent",
      x: 0,
      y: 0,
      width: 150,
      height: 60,
    };

    it("carries no count at all rather than a zero for each", () => {
      const detail = extractNodeTokenDetail(silent);
      expect(detail.promptTokens).toBeUndefined();
      expect(detail.completionTokens).toBeUndefined();
      expect(detail.reasoningTokens).toBeUndefined();
      expect(detail.cacheReadTokens).toBeUndefined();
      expect(detail.cacheCreationTokens).toBeUndefined();
      expect(detail.totalTokens).toBeUndefined();
    });

    it("badges as unknown instead of a confident 0 tok", () => {
      const overlay = evaluateTokenLens([silent], [], DEFAULT_TOKEN_CONFIG).nodeOverlays.get(
        "silent",
      )!;
      expect(overlay.badgeText).toBe("unknown");
      expect(overlay.metricFormatted).toBe("unknown");
      expect(overlay.rawValue).toBeUndefined();
      expect(overlay.tokenBreakdown?.totalTokens).toBeUndefined();
    });

    it("says so in the tooltip and quotes no raw number", () => {
      const overlay = evaluateTokenLens([silent], [], DEFAULT_TOKEN_CONFIG).nodeOverlays.get(
        "silent",
      )!;
      expect(overlay.tooltipContent.primaryMetric.formatted).toBe("unknown");
      expect(overlay.tooltipContent.primaryMetric.raw).toBeUndefined();
      expect(overlay.tooltipContent.summaryNote).toBe(
        "No token consumption recorded for this node.",
      );
      for (const factor of overlay.tooltipContent.factors) {
        expect(factor.percentage).toBeUndefined();
      }
    });

    it("is never the top consumer, even as the only node in the graph", () => {
      const result = evaluateTokenLens([silent], [], DEFAULT_TOKEN_CONFIG);
      expect(result.tokenDetails.get("silent")!.isTopConsumer).toBe(false);
    });

    it("leaves the graph total absent when no node reported anything", () => {
      const result = evaluateTokenLens([silent], [], DEFAULT_TOKEN_CONFIG);
      expect(result.summaryStats.totalTokens).toBeUndefined();
      expect(result.summaryStats.formattedSum).toBe("unknown");
      expect(result.legendData.formattedMax).toBe("unknown");
    });
  });

  describe("A node whose dataset recorded a zero", () => {
    const measuredZero: PositionedNode = {
      id: "measured-zero",
      name: "Measured Zero",
      x: 0,
      y: 0,
      width: 150,
      height: 60,
      metrics: { tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } },
    };

    it("keeps the zero, because a measured zero is a measurement", () => {
      expect(extractNodeTokenDetail(measuredZero).totalTokens).toBe(0);
      const overlay = evaluateTokenLens([measuredZero], [], DEFAULT_TOKEN_CONFIG).nodeOverlays.get(
        "measured-zero",
      )!;
      expect(overlay.badgeText).toBe("0 tok");
      expect(overlay.rawValue).toBe(0);
      expect(overlay.tooltipContent.summaryNote).toBe(
        "Consumed 0 tok; the graph has no positive total to take a share of.",
      );
    });

    it("reports the components a partly silent node did record and no more", () => {
      const partial: PositionedNode = {
        ...measuredZero,
        id: "partial",
        metrics: { tokens: { promptTokens: 400 } },
      };
      const detail = extractNodeTokenDetail(partial);
      expect(detail.promptTokens).toBe(400);
      expect(detail.completionTokens).toBeUndefined();
      expect(detail.totalTokens).toBe(400);
    });
  });

  describe("Values the dataset never recorded", () => {
    const priced: PositionedNode = {
      id: "priced",
      name: "Priced",
      x: 0,
      y: 0,
      width: 150,
      height: 60,
      metrics: { costUsd: 1.5, tokens: { totalTokens: 10 } },
    };

    it("quotes no cost per second for a cost with no recorded duration", () => {
      expect(extractNodeTokenDetail(priced).costIntensity).toBeUndefined();
      expect(
        extractNodeTokenDetail({
          ...priced,
          metrics: { ...priced.metrics, timingBreakdown: { wallDurationMs: 3000 } },
        }).costIntensity,
      ).toBeCloseTo(500, 6);
    });

    it("leaves an edge that recorded no traffic without a value or a badge", () => {
      const result = evaluateTokenLens(
        [priced],
        [{ id: "e-silent", source: "priced", target: "priced", path: "M 0 0" }],
        DEFAULT_TOKEN_CONFIG,
      );
      const overlay = result.edgeOverlays.get("e-silent")!;
      expect(overlay.rawValue).toBeUndefined();
      expect(overlay.trafficTokens).toBeUndefined();
      expect(overlay.badgeText).toBeUndefined();
    });
  });

  describe("formatTokenCount", () => {
    it("renders an unrecorded count as unknown and a recorded zero as zero", () => {
      expect(formatTokenCount(undefined)).toBe("unknown");
      expect(formatTokenCount(0)).toBe("0 tok");
    });
  });
});
