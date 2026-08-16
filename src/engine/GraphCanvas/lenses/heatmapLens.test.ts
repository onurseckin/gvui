import { describe, expect, it } from "bun:test";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import { DEFAULT_HEATMAP_CONFIG } from "../../../store/useCanvasLensStore";
import {
  evaluateHeatmapLens,
  extractEdgeHeatmapValue,
  extractNodeHeatmapValue,
  formatDurationMs,
  formatMetricValue,
  getMetricUnit,
} from "./heatmapLens";

describe("heatmapLens Module", () => {
  const mockNodes: PositionedNode[] = [
    {
      id: "node-1",
      name: "Planner Agent",
      x: 0,
      y: 0,
      width: 150,
      height: 60,
      metrics: {
        durationMs: 1200,
        retries: 0,
        timingBreakdown: {
          wallDurationMs: 1200,
          cognitiveLatencyMs: 800,
          toolDurationMs: 300,
        },
      },
    },
    {
      id: "node-2",
      name: "Coder Agent",
      x: 200,
      y: 0,
      width: 150,
      height: 60,
      metrics: {
        durationMs: 4500,
        retries: 2,
        timingBreakdown: {
          wallDurationMs: 4500,
          cognitiveLatencyMs: 1500,
          toolDurationMs: 2500,
        },
      },
      metadata: {
        commands: [
          {
            id: "c1",
            argv: ["bun", "test"],
            cwd: "/",
            exitCode: 0,
            durationMs: 2500,
            startedAt: "2026-08-15T00:00:00Z",
            finishedAt: "2026-08-15T00:00:02.5Z",
          },
        ],
      },
    },
    {
      id: "node-3",
      name: "Validator Agent",
      x: 400,
      y: 0,
      width: 150,
      height: 60,
      metrics: {
        durationMs: 300,
        retries: 0,
      },
    },
  ];

  const mockEdges: PositionedEdge[] = [
    {
      id: "e1-2",
      source: "node-1",
      target: "node-2",
      path: "M 0 0 L 200 0",
      traffic: {
        avgLatencyMs: 150,
      },
    },
    {
      id: "e2-3",
      source: "node-2",
      target: "node-3",
      path: "M 200 0 L 400 0",
      traffic: {
        avgLatencyMs: 50,
      },
    },
  ];

  describe("Value Extraction Helpers", () => {
    it("extracts duration values with various fallback paths", () => {
      expect(extractNodeHeatmapValue(mockNodes[0], "duration")).toBe(1200);
      expect(extractNodeHeatmapValue(mockNodes[1], "duration")).toBe(4500);

      // Test metadata duration fallback
      const fallbackNode: PositionedNode = {
        id: "fb",
        name: "FB",
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        metadata: { durationMs: 950 },
      };
      expect(extractNodeHeatmapValue(fallbackNode, "duration")).toBe(950);
    });

    it("extracts frequency values", () => {
      expect(extractNodeHeatmapValue(mockNodes[0], "frequency")).toBe(1);
      expect(extractNodeHeatmapValue(mockNodes[1], "frequency")).toBe(3); // 1 + 2 retries
    });

    it("extracts cognitive latency", () => {
      expect(extractNodeHeatmapValue(mockNodes[0], "cognitiveLatency")).toBe(800);
      expect(extractNodeHeatmapValue(mockNodes[1], "cognitiveLatency")).toBe(1500);
    });

    it("extracts tool execution duration", () => {
      expect(extractNodeHeatmapValue(mockNodes[0], "toolDuration")).toBe(300);
      expect(extractNodeHeatmapValue(mockNodes[1], "toolDuration")).toBe(2500);
    });

    it("extracts edge latency values", () => {
      expect(extractEdgeHeatmapValue(mockEdges[0])).toBe(150);
      expect(extractEdgeHeatmapValue(mockEdges[1])).toBe(50);
    });
  });

  describe("Formatters & Units", () => {
    it("formats duration strings correctly across ms, s, min", () => {
      expect(formatDurationMs(350)).toBe("350 ms");
      expect(formatDurationMs(4500)).toBe("4.50 s");
      expect(formatDurationMs(12500)).toBe("12.5 s");
      expect(formatDurationMs(90000)).toBe("1m 30s");
      expect(formatDurationMs(0)).toBe("0 ms");
    });

    it("formats metrics and units", () => {
      expect(formatMetricValue(1200, "duration")).toBe("1.20 s");
      expect(formatMetricValue(5, "frequency")).toBe("5x");
      expect(getMetricUnit("duration")).toBe("ms");
      expect(getMetricUnit("frequency")).toBe("runs");
    });
  });

  describe("evaluateHeatmapLens()", () => {
    it("computes full overlay map, summary stats, and legend data", () => {
      const result = evaluateHeatmapLens(mockNodes, mockEdges, DEFAULT_HEATMAP_CONFIG);

      expect(result.nodeOverlays.size).toBe(3);
      expect(result.edgeOverlays.size).toBe(2);

      // Node 2 is the maximum duration (4500ms)
      const n2Overlay = result.nodeOverlays.get("node-2")!;
      expect(n2Overlay.rawValue).toBe(4500);
      expect(n2Overlay.normalizedValue).toBe(1.0);
      expect(n2Overlay.isFiltered).toBe(false);
      expect(n2Overlay.badgeVariant).toBe("error");

      // Node 3 is the minimum duration (300ms)
      const n3Overlay = result.nodeOverlays.get("node-3")!;
      expect(n3Overlay.rawValue).toBe(300);
      expect(n3Overlay.normalizedValue).toBe(0.0);

      // Summary Statistics
      expect(result.summaryStats.rawMax).toBe(4500);
      expect(result.summaryStats.rawMin).toBe(300);
      expect(result.summaryStats.rawSum).toBe(6000);
      expect(result.summaryStats.rawAverage).toBe(2000);

      // Legend Data
      expect(result.legendData.histogramBuckets.length).toBe(5);
    });

    it("respects threshold filtering and dim opacity", () => {
      const thresholdConfig = {
        ...DEFAULT_HEATMAP_CONFIG,
        minThreshold: 0.5, // Only top 50%
        filterMode: "dim" as const,
        dimOpacity: 0.1,
      };

      const result = evaluateHeatmapLens(mockNodes, mockEdges, thresholdConfig);

      const n1Overlay = result.nodeOverlays.get("node-1")!;
      const n2Overlay = result.nodeOverlays.get("node-2")!;

      expect(n2Overlay.isFiltered).toBe(false);
      expect(n2Overlay.opacity).toBe(1.0);

      expect(n1Overlay.isFiltered).toBe(true);
      expect(n1Overlay.opacity).toBe(0.1);
    });
  });
});
