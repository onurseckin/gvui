import { describe, expect, it } from "bun:test";
import type { GraphDataset, GraphNodeData } from "../../types/graphData";
import { DEFAULT_ANOMALY_THRESHOLDS } from "./types";
import { detectRetryLoops } from "./detectors/retryLoopDetector";
import {
  detectTokenSpikes,
  extractNodeTotalTokens,
  extractNodeReasoningTokens,
} from "./detectors/tokenSpikeDetector";
import { detectStrandedLocks } from "./detectors/strandedLockDetector";
import { detectCycleDeadlocks, findGraphCycles } from "./detectors/cycleDeadlockDetector";
import {
  detectLatencyBottlenecks,
  computeCriticalPath,
} from "./detectors/latencyBottleneckDetector";
import {
  detectErrorCascades,
  computeDownstreamDescendants,
} from "./detectors/errorCascadeDetector";

describe("Heuristic Anomaly Detectors", () => {
  describe("detectRetryLoops", () => {
    it("returns no findings for optimal nodes with 0 retries", () => {
      const dataset: GraphDataset = {
        id: "clean-graph",
        title: "Clean Graph",
        nodes: [
          {
            id: "node-1",
            name: "Worker 1",
            status: "success",
            metrics: { retries: 0, repairRounds: 0 },
          },
        ],
        edges: [],
      };

      const findings = detectRetryLoops(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      expect(findings.length).toBe(0);
    });

    it("detects warning severity on 1 retry", () => {
      const dataset: GraphDataset = {
        id: "retry-warn-graph",
        title: "Retry Warn Graph",
        nodes: [
          {
            id: "node-1",
            name: "Worker 1",
            status: "success",
            metrics: { retries: 1, repairRounds: 0 },
          },
        ],
        edges: [],
      };

      const findings = detectRetryLoops(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      expect(findings.length).toBe(1);
      expect(findings[0]?.severity).toBe("warning");
      expect(findings[0]?.type).toBe("runaway_retry_loop");
    });

    it("detects error severity when retries exceed maxRetries", () => {
      const dataset: GraphDataset = {
        id: "retry-error-graph",
        title: "Retry Error Graph",
        nodes: [
          {
            id: "node-1",
            name: "Worker 1",
            status: "error",
            metrics: { retries: 3, repairRounds: 1 },
          },
        ],
        edges: [],
      };

      const findings = detectRetryLoops(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      expect(findings.length).toBe(1);
      expect(findings[0]?.severity).toBe("error");
      expect(findings[0]?.remediation.autoFixable).toBe(true);
    });

    it("detects critical severity on runaway retries (2x threshold)", () => {
      const dataset: GraphDataset = {
        id: "retry-critical-graph",
        title: "Retry Critical Graph",
        nodes: [
          {
            id: "node-runaway",
            name: "Runaway Worker",
            status: "error",
            metrics: { retries: 7, repairRounds: 4 },
          },
        ],
        edges: [],
      };

      const findings = detectRetryLoops(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      expect(findings.length).toBe(1);
      expect(findings[0]?.severity).toBe("critical");
      expect(findings[0]?.impactScore).toBeGreaterThanOrEqual(90);
    });

    it("detects pushback loop on edge exchanges", () => {
      const dataset: GraphDataset = {
        id: "pushback-graph",
        title: "Pushback Graph",
        nodes: [
          { id: "node-a", name: "Worker A" },
          { id: "node-b", name: "Validator B" },
        ],
        edges: [
          {
            id: "edge-feedback",
            source: "node-b",
            target: "node-a",
            kind: "pushback",
            traffic: {
              exchanges: [
                { id: "ex-1", type: "rejection" },
                { id: "ex-2", type: "rejection" },
                { id: "ex-3", type: "rejection" },
              ],
            },
          },
        ],
      };

      const findings = detectRetryLoops(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      const edgeFinding = findings.find((f) => f.edgeIds?.includes("edge-feedback"));
      expect(edgeFinding).toBeDefined();
      expect(edgeFinding?.category).toBe("execution");
    });
  });

  describe("detectTokenSpikes", () => {
    it("correctly extracts tokens from various schema formats", () => {
      const n1: GraphNodeData = {
        id: "n1",
        name: "N1",
        metrics: { tokensIn: 1000, tokensOut: 500 },
      };
      expect(extractNodeTotalTokens(n1)).toBe(1500);

      const n2: GraphNodeData = {
        id: "n2",
        name: "N2",
        metrics: { tokens: { totalTokens: 8000, reasoningTokens: 2500 } },
      };
      expect(extractNodeTotalTokens(n2)).toBe(8000);
      expect(extractNodeReasoningTokens(n2)).toBe(2500);
    });

    it("flags absolute token spike exceeding threshold", () => {
      const dataset: GraphDataset = {
        id: "token-spike-graph",
        title: "Token Spike",
        nodes: [
          {
            id: "n-normal",
            name: "Normal Task",
            metrics: { tokensIn: 2000, tokensOut: 1000 },
          },
          {
            id: "n-huge",
            name: "Huge Prompt Task",
            metrics: { tokensIn: 65000, tokensOut: 5000 },
          },
        ],
        edges: [],
      };

      const findings = detectTokenSpikes(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      expect(findings.length).toBe(1);
      expect(findings[0]?.nodeIds).toContain("n-huge");
      expect(findings[0]?.type).toBe("cognitive_token_spike");
      expect(findings[0]?.category).toBe("resource");
    });

    it("flags cognitive reasoning token explosion", () => {
      const dataset: GraphDataset = {
        id: "reasoning-spike-graph",
        title: "Reasoning Spike",
        nodes: [
          {
            id: "n-reasoning",
            name: "Reasoning Deliberation Task",
            metrics: {
              tokens: {
                totalTokens: 25000,
                reasoningTokens: 21000,
                promptTokens: 2000,
                completionTokens: 2000,
              },
            },
          },
        ],
        edges: [],
      };

      const findings = detectTokenSpikes(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      const reasoningFinding = findings.find((f) => f.title.includes("Reasoning"));
      expect(reasoningFinding).toBeDefined();
      expect(reasoningFinding?.severity).toBe("error");
    });

    it("flags step-over-step rapid context accumulation", () => {
      const dataset: GraphDataset = {
        id: "context-growth-graph",
        title: "Context Growth",
        nodes: [
          {
            id: "step-1",
            name: "Step 1",
            step: 1,
            metrics: { tokensIn: 5000, tokensOut: 1000 },
          },
          {
            id: "step-2",
            name: "Step 2",
            step: 2,
            metrics: { tokensIn: 28000, tokensOut: 2000 },
          },
        ],
        edges: [{ id: "e1-2", source: "step-1", target: "step-2" }],
      };

      const findings = detectTokenSpikes(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      const growthFinding = findings.find((f) => f.type === "unbounded_growth");
      expect(growthFinding).toBeDefined();
      expect(growthFinding?.nodeIds).toEqual(["step-1", "step-2"]);
    });
  });

  describe("detectStrandedLocks", () => {
    it("detects stranded lock when duration exceeds lease timeout and blocks pending downstreams", () => {
      const dataset: GraphDataset = {
        id: "lock-graph",
        title: "Lock Graph",
        nodes: [
          {
            id: "task-holding-lock",
            name: "Task Holding Lock",
            status: "running",
            metadata: {
              leaseToken: "lease-xyz-123",
              leaseAgent: "worker-09",
              durationMs: 750000, // 12.5 mins > 10 min threshold
            },
          },
          {
            id: "task-blocked",
            name: "Task Blocked",
            status: "pending",
          },
        ],
        edges: [{ id: "e1", source: "task-holding-lock", target: "task-blocked" }],
      };

      const findings = detectStrandedLocks(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      expect(findings.length).toBe(1);
      expect(findings[0]?.severity).toBe("critical");
      expect(findings[0]?.type).toBe("stranded_distributed_lock");
      expect(findings[0]?.nodeIds).toContain("task-holding-lock");
      expect(findings[0]?.nodeIds).toContain("task-blocked");
      expect(findings[0]?.remediation.autoFixable).toBe(true);
    });

    it("detects zombie lease on terminated node", () => {
      const dataset: GraphDataset = {
        id: "zombie-lease-graph",
        title: "Zombie Lease Graph",
        nodes: [
          {
            id: "node-failed",
            name: "Failed Node",
            status: "error",
            provenance: {
              status: "leased",
              leaseToken: "unrevoked-token-123",
            },
          },
        ],
        edges: [],
      };

      const findings = detectStrandedLocks(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      const zombie = findings.find((f) => f.type === "zombie_lease");
      expect(zombie).toBeDefined();
      expect(zombie?.severity).toBe("error");
    });
  });

  describe("detectCycleDeadlocks", () => {
    it("finds circular dependency cycle in directed graph", () => {
      const dataset: GraphDataset = {
        id: "cycle-graph",
        title: "Cycle Graph",
        nodes: [
          { id: "node-a", name: "Node A", status: "running" },
          { id: "node-b", name: "Node B", status: "running" },
          { id: "node-c", name: "Node C", status: "pending" },
        ],
        edges: [
          { id: "e-ab", source: "node-a", target: "node-b", kind: "dependency" },
          { id: "e-bc", source: "node-b", target: "node-c", kind: "dependency" },
          { id: "e-ca", source: "node-c", target: "node-a", kind: "dependency" },
        ],
      };

      const { cycles } = findGraphCycles(dataset);
      expect(cycles.length).toBeGreaterThan(0);

      const findings = detectCycleDeadlocks(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      expect(findings.length).toBe(1);
      expect(findings[0]?.severity).toBe("critical");
      expect(findings[0]?.type).toBe("circular_dependency_deadlock");
      expect(findings[0]?.impactScore).toBe(100);
      expect(findings[0]?.remediation.quickFix?.type).toBe("break_cycle");
    });

    it("detects diamond join deadlock when upstream prerequisite failed", () => {
      const dataset: GraphDataset = {
        id: "diamond-deadlock-graph",
        title: "Diamond Deadlock Graph",
        nodes: [
          { id: "root", name: "Root", status: "success" },
          { id: "branch-1", name: "Branch 1", status: "success" },
          { id: "branch-2", name: "Branch 2", status: "error" },
          { id: "join-barrier", name: "Join Barrier", kind: "join", status: "pending" },
        ],
        edges: [
          { id: "e1", source: "root", target: "branch-1" },
          { id: "e2", source: "root", target: "branch-2" },
          { id: "e3", source: "branch-1", target: "join-barrier" },
          { id: "e4", source: "branch-2", target: "join-barrier" },
        ],
      };

      const findings = detectCycleDeadlocks(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      const joinFinding = findings.find((f) => f.type === "diamond_join_deadlock");
      expect(joinFinding).toBeDefined();
      expect(joinFinding?.severity).toBe("critical");
      expect(joinFinding?.nodeIds).toContain("join-barrier");
    });

    it("detects dangling edge references to non-existent nodes", () => {
      const dataset: GraphDataset = {
        id: "dangling-edge-graph",
        title: "Dangling Edge",
        nodes: [{ id: "node-1", name: "Node 1" }],
        edges: [{ id: "edge-dangling", source: "node-1", target: "non-existent-node-999" }],
      };

      const findings = detectCycleDeadlocks(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      const dangling = findings.find((f) => f.title.includes("Dangling Edge"));
      expect(dangling).toBeDefined();
      expect(dangling?.type).toBe("contract_violation");
    });
  });

  describe("detectLatencyBottlenecks", () => {
    it("computes DAG critical path correctly", () => {
      const dataset: GraphDataset = {
        id: "critical-path-graph",
        title: "Critical Path Graph",
        nodes: [
          { id: "start", name: "Start", metrics: { durationMs: 1000 } },
          { id: "slow-branch", name: "Slow Branch", metrics: { durationMs: 25000 } },
          { id: "fast-branch", name: "Fast Branch", metrics: { durationMs: 2000 } },
          { id: "end", name: "End", metrics: { durationMs: 5000 } },
        ],
        edges: [
          { id: "e1", source: "start", target: "slow-branch" },
          { id: "e2", source: "start", target: "fast-branch" },
          { id: "e3", source: "slow-branch", target: "end" },
          { id: "e4", source: "fast-branch", target: "end" },
        ],
      };

      const { pathNodes, totalDurationMs } = computeCriticalPath(dataset);
      expect(totalDurationMs).toBe(31000);
      expect(pathNodes).toEqual(["start", "slow-branch", "end"]);

      const findings = detectLatencyBottlenecks(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      const cpFinding = findings.find((f) => f.title.includes("Critical Path Bottleneck"));
      expect(cpFinding).toBeDefined();
      expect(cpFinding?.nodeIds).toContain("slow-branch");
    });

    it("detects cognitive stalling when think duration dominates runtime", () => {
      const dataset: GraphDataset = {
        id: "think-stall-graph",
        title: "Think Stall Graph",
        nodes: [
          {
            id: "node-ponder",
            name: "Pondering Agent",
            metrics: {
              durationMs: 20000,
              timingBreakdown: {
                thinkDurationMs: 18000,
                toolDurationMs: 2000,
              },
            },
          },
        ],
        edges: [],
      };

      const findings = detectLatencyBottlenecks(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      const stall = findings.find((f) => f.title.includes("Cognitive Thinking Stall"));
      expect(stall).toBeDefined();
      expect(stall?.type).toBe("latency_bottleneck");
    });

    it("detects command hang exceeding latency threshold", () => {
      const dataset: GraphDataset = {
        id: "cmd-hang-graph",
        title: "Command Hang Graph",
        nodes: [
          {
            id: "node-build",
            name: "Build Node",
            metadata: {
              commands: [
                {
                  id: "cmd-1",
                  argv: ["cargo", "build", "--release"],
                  cwd: "/workspace",
                  exitCode: 0,
                  durationMs: 45000,
                  startedAt: "2026-08-15T00:00:00Z",
                  finishedAt: "2026-08-15T00:00:45Z",
                },
              ],
            },
          },
        ],
        edges: [],
      };

      const findings = detectLatencyBottlenecks(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      const cmdHang = findings.find((f) => f.title.includes("Long-Running Command"));
      expect(cmdHang).toBeDefined();
      expect(cmdHang?.severity).toBe("error");
    });
  });

  describe("detectErrorCascades", () => {
    it("calculates downstream descendants and error cascade blast radius", () => {
      const dataset: GraphDataset = {
        id: "cascade-graph",
        title: "Cascade Graph",
        nodes: [
          { id: "root-fail", name: "Root Failure", status: "error" },
          { id: "child-1", name: "Child 1", status: "skipped" },
          { id: "child-2", name: "Child 2", status: "skipped" },
          { id: "grandchild", name: "Grandchild", status: "skipped" },
        ],
        edges: [
          { id: "e1", source: "root-fail", target: "child-1" },
          { id: "e2", source: "root-fail", target: "child-2" },
          { id: "e3", source: "child-1", target: "grandchild" },
        ],
      };

      const descendants = computeDownstreamDescendants(dataset, "root-fail");
      expect(descendants.length).toBe(3);
      expect(descendants).toContain("child-1");
      expect(descendants).toContain("child-2");
      expect(descendants).toContain("grandchild");

      const findings = detectErrorCascades(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      const cascade = findings.find((f) => f.type === "error_cascade");
      expect(cascade).toBeDefined();
      expect(cascade?.severity).toBe("critical");
      expect(cascade?.nodeIds).toContain("root-fail");
    });

    it("detects false success contract violation when commands fail", () => {
      const dataset: GraphDataset = {
        id: "false-success-graph",
        title: "False Success Graph",
        nodes: [
          {
            id: "node-deceptive",
            name: "Deceptive Success Node",
            status: "success",
            metadata: {
              commands: [
                {
                  id: "cmd-failed",
                  argv: ["bun", "test"],
                  cwd: "/app",
                  exitCode: 1,
                  durationMs: 1200,
                  startedAt: "2026-08-15T00:00:00Z",
                  finishedAt: "2026-08-15T00:00:01Z",
                  stderrSnippet: "Test failed with 3 errors",
                },
              ],
            },
          },
        ],
        edges: [],
      };

      const findings = detectErrorCascades(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      const contract = findings.find((f) => f.title.includes("Contract Violation: False Success"));
      expect(contract).toBeDefined();
      expect(contract?.severity).toBe("critical");
    });

    it("detects unresolved critical findings on success node", () => {
      const dataset: GraphDataset = {
        id: "unresolved-findings-graph",
        title: "Unresolved Findings Graph",
        nodes: [
          {
            id: "node-with-findings",
            name: "Audited Node",
            status: "success",
            metadata: {
              findings: [
                {
                  id: "f-1",
                  severity: "critical",
                  observation: "Security vulnerability in auth middleware",
                  status: "open",
                },
              ],
            },
          },
        ],
        edges: [],
      };

      const findings = detectErrorCascades(dataset, DEFAULT_ANOMALY_THRESHOLDS);
      const findingViolation = findings.find((f) =>
        f.title.includes("Unresolved Critical Findings"),
      );
      expect(findingViolation).toBeDefined();
      expect(findingViolation?.severity).toBe("critical");
    });
  });
});
