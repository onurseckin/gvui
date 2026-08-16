import { describe, expect, it } from "bun:test";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import { DEFAULT_CRITICAL_PATH_CONFIG } from "../../../store/useCanvasLensStore";
import {
  buildAdjacencyGraph,
  calculateCriticalPath,
  computeTopologicalOrder,
  detectCycles,
  evaluateCriticalPathLens,
} from "./criticalPathLens";

describe("criticalPathLens Module", () => {
  // Graph topology:
  // Start (100ms) -> Branch A (500ms) -> Join (200ms)
  //               -> Branch B (1000ms) -> Join
  // Total path A: 100 + 500 + 200 = 800ms
  // Total path B (Critical): 100 + 1000 + 200 = 1300ms
  const mockNodes: PositionedNode[] = [
    {
      id: "start",
      name: "Start Node",
      x: 0,
      y: 0,
      width: 120,
      height: 50,
      metrics: { durationMs: 100 },
    },
    {
      id: "branchA",
      name: "Fast Task",
      x: 150,
      y: -50,
      width: 120,
      height: 50,
      metrics: { durationMs: 500 },
    },
    {
      id: "branchB",
      name: "Slow Task",
      x: 150,
      y: 50,
      width: 120,
      height: 50,
      metrics: { durationMs: 1000 },
    },
    {
      id: "join",
      name: "Join Node",
      x: 300,
      y: 0,
      width: 120,
      height: 50,
      metrics: { durationMs: 200 },
    },
  ];

  const mockEdges: PositionedEdge[] = [
    { id: "e-start-a", source: "start", target: "branchA", path: "M 0 0 L 150 -50" },
    { id: "e-start-b", source: "start", target: "branchB", path: "M 0 0 L 150 50" },
    { id: "e-a-join", source: "branchA", target: "join", path: "M 150 -50 L 300 0" },
    { id: "e-b-join", source: "branchB", target: "join", path: "M 150 50 L 300 0" },
  ];

  describe("Graph Analysis & CPM Foundations", () => {
    it("builds correct adjacency and degree maps", () => {
      const graph = buildAdjacencyGraph(mockNodes, mockEdges);
      expect(graph.adj.get("start")).toEqual(["branchA", "branchB"]);
      expect(graph.inDegree.get("join")).toBe(2);
      expect(graph.outDegree.get("start")).toBe(2);
    });

    it("computes topological sort on DAG", () => {
      const graph = buildAdjacencyGraph(mockNodes, mockEdges);
      const { order, isCyclic } = computeTopologicalOrder(mockNodes, graph.adj, graph.inDegree);
      expect(isCyclic).toBe(false);
      expect(order.indexOf("start")).toBe(0);
      expect(order.indexOf("join")).toBe(3);
    });

    it("detects and breaks cycles safely without crashing", () => {
      const cyclicEdges: PositionedEdge[] = [
        ...mockEdges,
        { id: "e-cycle", source: "join", target: "start", path: "M 300 0 L 0 0" },
      ];
      const graph = buildAdjacencyGraph(mockNodes, cyclicEdges);
      const cycles = detectCycles(mockNodes, graph.adj);
      expect(cycles.length).toBeGreaterThan(0);

      const cpResult = calculateCriticalPath(mockNodes, cyclicEdges);
      expect(cpResult.isCyclic).toBe(true);
      expect(cpResult.criticalPathNodes.length).toBeGreaterThan(0);
    });
  });

  describe("Critical Path Method (CPM) Calculations", () => {
    it("accurately computes project duration, slack, and critical path nodes", () => {
      const cp = calculateCriticalPath(mockNodes, mockEdges);

      // Project total duration = 100 (start) + 1000 (branchB) + 200 (join) = 1300ms
      expect(cp.totalDurationMs).toBe(1300);

      // Critical path nodes: start, branchB, join
      expect(cp.criticalPathNodes).toContain("start");
      expect(cp.criticalPathNodes).toContain("branchB");
      expect(cp.criticalPathNodes).toContain("join");
      expect(cp.criticalPathNodes).not.toContain("branchA");

      // Critical edges: e-start-b, e-b-join
      expect(cp.criticalPathEdges).toContain("e-start-b");
      expect(cp.criticalPathEdges).toContain("e-b-join");

      // Branch A should have 500ms slack (1300 - 800)
      const branchAInfo = cp.nodeInfoMap.get("branchA")!;
      expect(branchAInfo.slackMs).toBe(500);
      expect(branchAInfo.isCritical).toBe(false);

      // Branch B should have 0ms slack
      const branchBInfo = cp.nodeInfoMap.get("branchB")!;
      expect(branchBInfo.slackMs).toBe(0);
      expect(branchBInfo.isCritical).toBe(true);
    });

    it("ranks bottlenecks correctly based on duration and degree", () => {
      const cp = calculateCriticalPath(mockNodes, mockEdges);
      expect(cp.bottlenecks.length).toBeGreaterThan(0);
      // branchB has highest duration (1000ms) on critical path -> top bottleneck
      expect(cp.bottlenecks[0].nodeId).toBe("branchB");
    });
  });

  describe("evaluateCriticalPathLens()", () => {
    it("generates critical path node overlays and animated edge overlays", () => {
      const result = evaluateCriticalPathLens(mockNodes, mockEdges, DEFAULT_CRITICAL_PATH_CONFIG);

      expect(result.nodeOverlays.size).toBe(4);
      expect(result.edgeOverlays.size).toBe(4);

      const branchBOverlay = result.nodeOverlays.get("branchB")!;
      expect(branchBOverlay.isCritical).toBe(true);
      expect(branchBOverlay.color).toBe("#ef4444"); // Red critical highlight
      expect(branchBOverlay.badgeText).toContain("CP #");

      const branchAOverlay = result.nodeOverlays.get("branchA")!;
      expect(branchAOverlay.isCritical).toBe(false);
      expect(branchAOverlay.badgeText).toContain("+500 ms slack");

      // Edge overlay checks
      const critEdgeOverlay = result.edgeOverlays.get("e-start-b")!;
      expect(critEdgeOverlay.isCritical).toBe(true);
      expect(critEdgeOverlay.strokeWidth).toBe(4);
      expect(critEdgeOverlay.strokeDasharray).toBe("6 3");

      // Summary stats
      expect(result.summaryStats.criticalPathLengthMs).toBe(1300);
      expect(result.summaryStats.criticalPathNodeCount).toBe(3);
    });

    it("handles empty and single-node graphs gracefully", () => {
      const emptyResult = evaluateCriticalPathLens([], [], DEFAULT_CRITICAL_PATH_CONFIG);
      expect(emptyResult.nodeOverlays.size).toBe(0);
      expect(emptyResult.summaryStats.totalNodes).toBe(0);

      const singleNode: PositionedNode[] = [mockNodes[0]];
      const singleResult = evaluateCriticalPathLens(singleNode, [], DEFAULT_CRITICAL_PATH_CONFIG);
      expect(singleResult.nodeOverlays.size).toBe(1);
      expect(singleResult.nodeOverlays.get("start")?.isCritical).toBe(true);
    });
  });
});
