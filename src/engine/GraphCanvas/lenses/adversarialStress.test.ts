import { describe, expect, it } from "bun:test";
import { act } from "react-test-renderer";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import { DEFAULT_RISK_CONFIG, useCanvasLensStore } from "../../../store/useCanvasLensStore";
import {
  clamp,
  evaluateColorRamp,
  generateGlowStyle,
  normalizeValue,
  parseColor,
  parseHexColor,
  parseHslString,
  parseRgbString,
} from "./colorRamps";
import { buildAdjacencyGraph, calculateCriticalPath } from "./criticalPathLens";
import { evaluateCanvasLens } from "./lensEvaluator";
import { calculateNodeRisk, evaluateRiskLens } from "./riskLens";
import { extractNodeTokenDetail } from "./tokenLens";
import type { ColorStop } from "./types";

describe("Adversarial Stress & Boundary Resilience Tests", () => {
  describe("1. Color Interpolation & Normalization Bounds (0/0, Negative, NaN, Extremes)", () => {
    it("handles 0/0 division and identical min/max gracefully", () => {
      expect(normalizeValue(0, 0, 0, "linear")).toBe(0.5);
      expect(normalizeValue(100, 100, 100, "linear")).toBe(0.5);
      expect(normalizeValue(-50, -50, -50, "linear")).toBe(0.5);
      expect(normalizeValue(0, 0, 0, "log")).toBe(0.5);
      expect(normalizeValue(0, 0, 0, "sqrt")).toBe(0.5);
      expect(normalizeValue(0, 0, 0, "quantile")).toBe(0.5);
    });

    it("handles inverted min/max where min > max", () => {
      expect(normalizeValue(50, 100, 20, "linear")).toBe(0.5);
      expect(normalizeValue(50, 100, 20, "log")).toBe(0.5);
    });

    it("handles purely negative domain ranges", () => {
      const min = -1000;
      const max = -200;
      // val = -600 is right in the middle
      expect(normalizeValue(-600, min, max, "linear")).toBeCloseTo(0.5, 2);
      expect(normalizeValue(-1000, min, max, "linear")).toBe(0.0);
      expect(normalizeValue(-200, min, max, "linear")).toBe(1.0);
      expect(normalizeValue(-1500, min, max, "linear")).toBe(0.0); // Clamped
      expect(normalizeValue(0, min, max, "linear")).toBe(1.0); // Clamped
    });

    it("handles NaN, infinities, and non-numeric inputs", () => {
      expect(normalizeValue(Number.NaN, 0, 100)).toBe(0);
      expect(normalizeValue(Number.POSITIVE_INFINITY, 0, 100)).toBe(0);
      expect(normalizeValue(Number.NEGATIVE_INFINITY, 0, 100)).toBe(0);
      expect(clamp(Number.NaN, -10, 10)).toBe(-10);
    });

    it("evaluates empty, single-stop, or degenerate color ramps safely", () => {
      expect(evaluateColorRamp([], 0.5)).toBe("#3b82f6");

      const singleStop: ColorStop[] = [{ stop: 0.5, color: "#ff00ff" }];
      expect(evaluateColorRamp(singleStop, 0.0)).toBe("#ff00ff");
      expect(evaluateColorRamp(singleStop, 1.0)).toBe("#ff00ff");

      const duplicateStops: ColorStop[] = [
        { stop: 0.0, color: "#111111" },
        { stop: 0.0, color: "#222222" },
        { stop: 1.0, color: "#ffffff" },
      ];
      expect(evaluateColorRamp(duplicateStops, 0.0)).toBeDefined();
    });

    it("parses malformed and extreme color strings without throwing", () => {
      expect(parseHexColor("")).toBeNull();
      expect(parseHexColor("#")).toBeNull();
      expect(parseHexColor("#gg00zz")).toBeNull();
      expect(parseRgbString("rgb(999, -50, 1000)")).toEqual({ r: 255, g: 0, b: 255, a: 1 });
      expect(parseHslString("hsl(720deg, 150%, -20%)")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
      expect(parseColor("not-a-color")).toEqual({ r: 100, g: 116, b: 139, a: 1 });
      expect(generateGlowStyle("#000", -1, -5)).toBeDefined();
    });
  });

  describe("2. Disconnected Graphs & Complex DAG Topologies in Critical Path Method", () => {
    it("handles multiple disjoint disconnected components", () => {
      const disjointNodes: PositionedNode[] = [
        {
          id: "n1",
          name: "C1 Start",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          metrics: { durationMs: 200 },
        },
        {
          id: "n2",
          name: "C1 End",
          x: 150,
          y: 0,
          width: 100,
          height: 50,
          metrics: { durationMs: 400 },
        },
        {
          id: "n3",
          name: "C2 Start",
          x: 0,
          y: 100,
          width: 100,
          height: 50,
          metrics: { durationMs: 300 },
        },
        {
          id: "n4",
          name: "C2 End",
          x: 150,
          y: 100,
          width: 100,
          height: 50,
          metrics: { durationMs: 900 },
        },
      ];

      const disjointEdges: PositionedEdge[] = [
        { id: "e1", source: "n1", target: "n2", path: "M 0 0 L 150 0" },
        { id: "e2", source: "n3", target: "n4", path: "M 0 100 L 150 100" },
      ];

      const cp = calculateCriticalPath(disjointNodes, disjointEdges);

      // Total duration is max of C1 (600ms) and C2 (1200ms) = 1200ms
      expect(cp.totalDurationMs).toBe(1200);
      expect(cp.criticalPathNodes).toContain("n3");
      expect(cp.criticalPathNodes).toContain("n4");
      expect(cp.criticalPathEdges).toContain("e2");

      // C1 nodes have slack (1200 - 600 = 600ms)
      expect(cp.nodeInfoMap.get("n1")?.slackMs).toBe(600);
      expect(cp.nodeInfoMap.get("n2")?.slackMs).toBe(600);
    });

    it("handles isolated orphan nodes with zero edges", () => {
      const orphanNodes: PositionedNode[] = [
        {
          id: "orphan-1",
          name: "Isolated 1",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          metrics: { durationMs: 500 },
        },
        {
          id: "orphan-2",
          name: "Isolated 2",
          x: 150,
          y: 0,
          width: 100,
          height: 50,
          metrics: { durationMs: 1500 },
        },
      ];

      const cp = calculateCriticalPath(orphanNodes, []);
      expect(cp.totalDurationMs).toBe(1500);
      expect(cp.criticalPathNodes).toContain("orphan-2");
      expect(cp.nodeInfoMap.get("orphan-1")?.slackMs).toBe(1000);
    });

    it("handles broken edges referencing non-existent nodes", () => {
      const nodes: PositionedNode[] = [
        {
          id: "valid-1",
          name: "V1",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          metrics: { durationMs: 100 },
        },
        {
          id: "valid-2",
          name: "V2",
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          metrics: { durationMs: 200 },
        },
      ];

      const ghostEdges: PositionedEdge[] = [
        { id: "ghost-1", source: "valid-1", target: "does-not-exist", path: "M 0 0" },
        { id: "ghost-2", source: "does-not-exist", target: "valid-2", path: "M 0 0" },
        { id: "valid-edge", source: "valid-1", target: "valid-2", path: "M 0 0 L 100 0" },
      ];

      const graph = buildAdjacencyGraph(nodes, ghostEdges);
      expect(graph.adj.get("valid-1")).toEqual(["valid-2"]);
      expect(graph.inDegree.get("valid-2")).toBe(1);

      const cp = calculateCriticalPath(nodes, ghostEdges);
      expect(cp.totalDurationMs).toBe(300);
      expect(cp.criticalPathNodes).toEqual(["valid-1", "valid-2"]);
    });

    it("handles complex multi-cycle and reciprocal feedback loops", () => {
      const cyclicNodes: PositionedNode[] = [
        { id: "a", name: "A", x: 0, y: 0, width: 50, height: 50, metrics: { durationMs: 10 } },
        { id: "b", name: "B", x: 50, y: 0, width: 50, height: 50, metrics: { durationMs: 20 } },
        { id: "c", name: "C", x: 100, y: 0, width: 50, height: 50, metrics: { durationMs: 30 } },
      ];

      const cyclicEdges: PositionedEdge[] = [
        { id: "ab", source: "a", target: "b", path: "" },
        { id: "bc", source: "b", target: "c", path: "" },
        { id: "ca", source: "c", target: "a", path: "" }, // Loop 1: a->b->c->a
        { id: "ba", source: "b", target: "a", path: "" }, // Loop 2: a<->b
      ];

      const cp = calculateCriticalPath(cyclicNodes, cyclicEdges);
      expect(cp.isCyclic).toBe(true);
      expect(cp.detectedCycles.length).toBeGreaterThanOrEqual(1);
      expect(cp.criticalPathNodes.length).toBeGreaterThan(0);
    });

    it("handles large DAG scaling (100 nodes in complex multi-branch lattice)", () => {
      const latticeNodes: PositionedNode[] = [];
      const latticeEdges: PositionedEdge[] = [];
      const rowCount = 20;
      const colCount = 5;

      for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < colCount; c++) {
          const id = `node-${r}-${c}`;
          latticeNodes.push({
            id,
            name: `Node ${r},${c}`,
            x: c * 100,
            y: r * 80,
            width: 80,
            height: 40,
            metrics: { durationMs: (r + 1) * 10 + c * 5 },
          });

          if (r < rowCount - 1) {
            latticeEdges.push({
              id: `edge-${r}-${c}-down`,
              source: id,
              target: `node-${r + 1}-${c}`,
              path: "",
            });
            if (c < colCount - 1) {
              latticeEdges.push({
                id: `edge-${r}-${c}-diag`,
                source: id,
                target: `node-${r + 1}-${c + 1}`,
                path: "",
              });
            }
          }
        }
      }

      const startTime = performance.now();
      const cp = calculateCriticalPath(latticeNodes, latticeEdges);
      const elapsed = performance.now() - startTime;

      expect(latticeNodes.length).toBe(100);
      expect(cp.totalDurationMs).toBeGreaterThan(0);
      expect(cp.criticalPathNodes.length).toBe(rowCount);
      expect(elapsed).toBeLessThan(50); // Under 50ms for 100-node graph
    });
  });

  describe("3. Risk Lens Stress Testing & Factor Edge Cases", () => {
    it("handles zero weights configuration safely without NaN", () => {
      const node: PositionedNode = {
        id: "test",
        name: "Test",
        x: 0,
        y: 0,
        width: 100,
        height: 50,
      };

      const zeroWeights = {
        statusWeight: 0,
        retriesWeight: 0,
        findingsWeight: 0,
        commandsWeight: 0,
        complexityWeight: 0,
        blastRadiusWeight: 0,
      };

      const risk = calculateNodeRisk(node, [node], [], zeroWeights);
      expect(Number.isNaN(risk.compositeScore)).toBe(false);
      expect(risk.compositeScore).toBe(0);
    });

    it("evaluates massive finding and command failure counts without overflow", () => {
      const extremeFindings = Array.from({ length: 500 }, (_, i) => ({
        id: `f-${i}`,
        severity: i % 2 === 0 ? ("critical" as const) : ("important" as const),
        observation: "Test finding",
        status: "open" as const,
      }));

      const extremeCommands = Array.from({ length: 200 }, (_, i) => ({
        id: `c-${i}`,
        argv: ["error-cmd"],
        cwd: "/",
        exitCode: i % 3 === 0 ? 1 : 0,
        durationMs: 100,
        startedAt: "2026-08-15T00:00:00Z",
        finishedAt: "2026-08-15T00:00:00.1Z",
      }));

      const extremeNode: PositionedNode = {
        id: "extreme",
        name: "Extreme Anomaly",
        status: "error",
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        metrics: { retries: 50, repairRounds: 25 },
        metadata: {
          findings: extremeFindings,
          commands: extremeCommands,
        },
      };

      const res = evaluateRiskLens([extremeNode], [], DEFAULT_RISK_CONFIG);
      const overlay = res.nodeOverlays.get("extreme")!;
      expect(overlay.riskLevel).toBe("critical");
      expect(overlay.normalizedValue).toBeLessThanOrEqual(1.0);
      expect(overlay.normalizedValue).toBeGreaterThan(0.7);
    });
  });

  describe("4. Token Lens Stress Testing & Tier Pricing Fallbacks", () => {
    it("handles zero token nodes with instant duration", () => {
      const zeroNode: PositionedNode = {
        id: "zero",
        name: "Zero Token",
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        metrics: {
          tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          durationMs: 0,
        },
      };

      const detail = extractNodeTokenDetail(zeroNode);
      expect(detail.totalTokens).toBe(0);
      expect(detail.costUsd).toBe(0);
      expect(Number.isNaN(detail.costIntensity)).toBe(false);
      expect(detail.costIntensity).toBe(0);
    });

    it("handles unknown model tiers with fallback pricing", () => {
      const unknownNode: PositionedNode = {
        id: "unk",
        name: "Custom Agent",
        tier: undefined,
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        metrics: {
          tokens: { promptTokens: 100000, completionTokens: 50000, totalTokens: 150000 },
        },
      };

      const detail = extractNodeTokenDetail(unknownNode);
      expect(detail.tier).toBe("unknown");
      expect(detail.costUsd).toBeGreaterThan(0);
    });
  });

  describe("5. Store State Transitions & Master Evaluator", () => {
    it("cycles through all lens modes seamlessly", () => {
      const modes = ["none", "heatmap", "critical-path", "risk", "token"] as const;
      const testNodes: PositionedNode[] = [
        { id: "a", name: "A", x: 0, y: 0, width: 100, height: 50, metrics: { durationMs: 100 } },
      ];

      for (const mode of modes) {
        act(() => {
          useCanvasLensStore.getState().setActiveLens(mode);
        });
        expect(useCanvasLensStore.getState().activeLens).toBe(mode);

        const config = useCanvasLensStore.getState().getActiveConfig();
        const evalResult = evaluateCanvasLens(testNodes, [], config);
        expect(evalResult.lens).toBe(mode);
      }
    });

    it("clamps threshold updates safely", () => {
      act(() => {
        useCanvasLensStore.getState().setActiveLens("heatmap");
        useCanvasLensStore.getState().setThresholds(-0.5, 1.5);
      });
      expect(useCanvasLensStore.getState().configs.heatmap.minThreshold).toBe(0.0);
      expect(useCanvasLensStore.getState().configs.heatmap.maxThreshold).toBe(1.0);
    });
  });
});
