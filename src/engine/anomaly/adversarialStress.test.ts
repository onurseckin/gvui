import { describe, expect, it } from "bun:test";
import type { GraphDataset, GraphNodeData, GraphEdgeData } from "../../types/graphData";
import { detectAnomalies, DEFAULT_ANOMALY_THRESHOLDS } from "./index";
import { findGraphCycles } from "./detectors/cycleDeadlockDetector";

describe("Adversarial Stress Testing & Boundary Gauntlet", () => {
  describe("1. Cyclic Graph Edge Cases", () => {
    it("handles large 50-node circular ring without stack overflow", () => {
      const nodeCount = 50;
      const nodes: GraphNodeData[] = [];
      const edges: GraphEdgeData[] = [];

      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          id: `ring-node-${i}`,
          name: `Ring Node ${i}`,
          status: "running",
          metrics: { durationMs: 100 },
        });
        edges.push({
          id: `ring-edge-${i}`,
          source: `ring-node-${i}`,
          target: `ring-node-${(i + 1) % nodeCount}`,
          kind: "dependency",
        });
      }

      const ringDataset: GraphDataset = {
        id: "large-ring-graph",
        title: "Large Ring",
        nodes,
        edges,
      };

      const start = performance.now();
      const report = detectAnomalies(ringDataset);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100); // Sub-100ms execution
      expect(report.anomalies.some((a) => a.type === "circular_dependency_deadlock")).toBe(true);
      expect(report.healthScore).toBeLessThanOrEqual(65);
    });

    it("handles self-loops and multi-edge reciprocal deadlocks", () => {
      const dataset: GraphDataset = {
        id: "self-loop-and-reciprocal",
        title: "Self Loop",
        nodes: [
          { id: "self-loop-node", name: "Self Loop Node", status: "running" },
          { id: "node-x", name: "Node X", status: "running" },
          { id: "node-y", name: "Node Y", status: "running" },
        ],
        edges: [
          { id: "e-self", source: "self-loop-node", target: "self-loop-node" },
          { id: "e-xy", source: "node-x", target: "node-y" },
          { id: "e-yx", source: "node-y", target: "node-x" },
        ],
      };

      const { cycles } = findGraphCycles(dataset);
      expect(cycles.length).toBeGreaterThanOrEqual(2);

      const report = detectAnomalies(dataset);
      const cycleFindings = report.anomalies.filter(
        (a) => a.type === "circular_dependency_deadlock",
      );
      expect(cycleFindings.length).toBeGreaterThan(0);
    });
  });

  describe("2. Zero Tokens, Null Metrics & Malformed Inputs", () => {
    it("handles nodes with zero, negative, NaN, or undefined tokens gracefully without false spikes", () => {
      const dataset: GraphDataset = {
        id: "malformed-tokens-dataset",
        title: "Malformed Tokens",
        nodes: [
          {
            id: "node-zero-tokens",
            name: "Zero Tokens",
            metrics: { tokensIn: 0, tokensOut: 0, costUsd: 0 },
          },
          {
            id: "node-negative-tokens",
            name: "Negative Tokens",
            metrics: { tokensIn: -100, tokensOut: -50 },
          },
          {
            id: "node-no-metrics",
            name: "No Metrics",
          },
          {
            id: "node-nan-metrics",
            name: "NaN Metrics",
            metrics: {
              durationMs: NaN,
              tokens: { totalTokens: NaN, reasoningTokens: NaN },
            },
          },
        ],
        edges: [
          { id: "e1", source: "node-zero-tokens", target: "node-negative-tokens" },
          { id: "e2", source: "node-negative-tokens", target: "node-no-metrics" },
          { id: "e3", source: "node-no-metrics", target: "node-nan-metrics" },
        ],
      };

      const report = detectAnomalies(dataset);
      const tokenSpikes = report.anomalies.filter((a) => a.type === "cognitive_token_spike");
      expect(tokenSpikes.length).toBe(0);
      expect(report.healthScore).toBe(100);
      expect(report.totalAnomalies).toBe(0);
    });

    it("handles empty or single node graph without errors", () => {
      const singleNodeDataset: GraphDataset = {
        id: "single-node",
        title: "Single Node",
        nodes: [{ id: "solo", name: "Solo Worker", status: "success" }],
        edges: [],
      };

      const report = detectAnomalies(singleNodeDataset);
      expect(report.healthScore).toBe(100);
      expect(report.totalAnomalies).toBe(0);
    });
  });

  describe("3. Stranded Lock Timeouts & Boundary Expirations", () => {
    it("detects expired lease with ISO-8601 string timestamp", () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      const dataset: GraphDataset = {
        id: "iso-lease-dataset",
        title: "ISO Lease",
        nodes: [
          {
            id: "expired-iso-node",
            name: "Expired ISO Node",
            status: "running",
            metadata: {
              leaseToken: "iso-token-123",
              expires_at: pastDate,
            },
          },
        ],
        edges: [],
      };

      const report = detectAnomalies(dataset);
      const lockAnomalies = report.anomalies.filter((a) => a.type === "stranded_distributed_lock");
      expect(lockAnomalies.length).toBe(1);
      expect(lockAnomalies[0]?.severity).toBe("error");
    });

    it("evaluates exact boundary behavior at timeout threshold", () => {
      const exactTimeoutMs = DEFAULT_ANOMALY_THRESHOLDS.leaseTimeoutMs;
      const dataset: GraphDataset = {
        id: "boundary-lease-dataset",
        title: "Boundary Lease",
        nodes: [
          {
            id: "node-below-timeout",
            name: "Below Timeout",
            status: "running",
            metadata: {
              leaseToken: "token-below",
              durationMs: exactTimeoutMs - 1000,
            },
          },
          {
            id: "node-above-timeout",
            name: "Above Timeout",
            status: "running",
            metadata: {
              leaseToken: "token-above",
              durationMs: exactTimeoutMs + 5000,
            },
          },
        ],
        edges: [],
      };

      const report = detectAnomalies(dataset);
      const lockAbove = report.anomalies.find(
        (a) => a.nodeIds.includes("node-above-timeout") && a.type === "stranded_distributed_lock",
      );
      const lockBelow = report.anomalies.find(
        (a) => a.nodeIds.includes("node-below-timeout") && a.type === "stranded_distributed_lock",
      );

      expect(lockAbove).toBeDefined();
      expect(lockAbove?.severity).toBe("error");
      expect(lockBelow).toBeDefined();
      expect(lockBelow?.severity).toBe("warning"); // Near expiration warning (80% threshold)
    });
  });

  describe("4. Massive Graph Scale Performance (1,000 Nodes)", () => {
    it("analyzes 1,000 node DAG efficiently with zero memory leak or lag", () => {
      const nodeCount = 1000;
      const nodes: GraphNodeData[] = [];
      const edges: GraphEdgeData[] = [];

      for (let i = 0; i < nodeCount; i++) {
        nodes.push({
          id: `node-${i}`,
          name: `Worker ${i}`,
          status: i % 10 === 0 ? "error" : "success",
          metrics: {
            durationMs: (i % 20) * 100,
            tokensIn: (i % 50) * 200,
            tokensOut: 100,
            retries: i === 500 ? 5 : 0,
          },
        });

        if (i > 0) {
          edges.push({
            id: `edge-${i - 1}-${i}`,
            source: `node-${i - 1}`,
            target: `node-${i}`,
            kind: "sequence",
          });
        }
      }

      const massiveDataset: GraphDataset = {
        id: "massive-1000-graph",
        title: "Massive 1000 Graph",
        nodes,
        edges,
      };

      const t0 = performance.now();
      const report = detectAnomalies(massiveDataset);
      const t1 = performance.now();

      expect(t1 - t0).toBeLessThan(500); // 1,000 nodes analyzed in <500ms
      expect(report.totalAnomalies).toBeGreaterThan(0);

      // Verify retry runaway was caught on node-500
      const retryOn500 = report.anomalies.find(
        (a) => a.nodeIds.includes("node-500") && a.type === "runaway_retry_loop",
      );
      expect(retryOn500).toBeDefined();
    });
  });

  describe("5. Disjoint Island Components & Dangling Topology", () => {
    it("handles graphs with multiple disconnected subgraphs correctly", () => {
      const dataset: GraphDataset = {
        id: "disjoint-islands",
        title: "Disjoint Islands",
        entry: "island1-root",
        nodes: [
          // Island 1
          { id: "island1-root", name: "Island 1 Root", status: "success" },
          { id: "island1-leaf", name: "Island 1 Leaf", status: "success" },
          // Island 2 (Disconnected)
          { id: "island2-node-a", name: "Island 2 Node A", status: "success" },
          { id: "island2-node-b", name: "Island 2 Node B", status: "success" },
        ],
        edges: [
          { id: "e-isl1", source: "island1-root", target: "island1-leaf" },
          { id: "e-isl2", source: "island2-node-a", target: "island2-node-b" },
        ],
      };

      const report = detectAnomalies(dataset);
      // Island 2 root should be flagged as orphaned/unreachable from entry
      const orphan = report.anomalies.find((a) => a.type === "orphaned_subgraph");
      expect(orphan).toBeDefined();
      expect(orphan?.nodeIds).toContain("island2-node-a");
    });
  });
});
