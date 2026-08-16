import { describe, expect, it } from "bun:test";
import type { GraphDataset } from "../../types/graphData";
import { detectAnomalies, formatAnomalySummary } from "./index";

describe("Anomaly Detection Engine Full Integration", () => {
  const complexOrchestrationGraph: GraphDataset = {
    id: "capsule-round-8-live-run",
    title: "Round 8 Telemetry & Anomaly Live Run",
    description: "Complex distributed agent topology with edge conditions and multi-tier workers",
    entry: "orchestrator-root",
    exits: ["terminal-signoff"],
    nodes: [
      {
        id: "orchestrator-root",
        name: "Meta-Orchestrator Root",
        kind: "orchestrator",
        status: "success",
        metrics: {
          durationMs: 1200,
          tokensIn: 2000,
          tokensOut: 800,
          costUsd: 0.02,
        },
      },
      {
        id: "worker-01-streaming",
        name: "Streaming Telemetry Worker",
        kind: "agent",
        status: "success",
        metrics: {
          durationMs: 15000,
          tokensIn: 12000,
          tokensOut: 4000,
        },
      },
      {
        id: "worker-02-anomaly",
        name: "Anomaly Detector Worker",
        kind: "agent",
        status: "error",
        metrics: {
          retries: 4,
          repairRounds: 2,
          durationMs: 28000,
          tokensIn: 62000,
          tokensOut: 18000,
          tokens: {
            totalTokens: 80000,
            reasoningTokens: 58000,
          },
        },
      },
      {
        id: "worker-03-lens",
        name: "Canvas Lens Worker",
        kind: "agent",
        status: "running",
        metadata: {
          leaseToken: "lease-lens-worker-token-xyz",
          leaseAgent: "worker-03",
          durationMs: 800000, // Stranded lock
        },
      },
      {
        id: "worker-04-sandbox",
        name: "Command Sandbox Worker",
        kind: "agent",
        status: "pending",
      },
      {
        id: "join-barrier",
        name: "Subsystem Join Barrier",
        kind: "join",
        status: "pending",
      },
      {
        id: "terminal-signoff",
        name: "Terminal Signoff",
        kind: "terminal",
        status: "pending",
      },
    ],
    edges: [
      { id: "e-root-1", source: "orchestrator-root", target: "worker-01-streaming", kind: "spawn" },
      { id: "e-root-2", source: "orchestrator-root", target: "worker-02-anomaly", kind: "spawn" },
      { id: "e-root-3", source: "orchestrator-root", target: "worker-03-lens", kind: "spawn" },
      { id: "e-3-4", source: "worker-03-lens", target: "worker-04-sandbox", kind: "dependency" },
      { id: "e-1-join", source: "worker-01-streaming", target: "join-barrier", kind: "join" },
      { id: "e-2-join", source: "worker-02-anomaly", target: "join-barrier", kind: "join" },
      { id: "e-4-join", source: "worker-04-sandbox", target: "join-barrier", kind: "join" },
      { id: "e-join-term", source: "join-barrier", target: "terminal-signoff", kind: "sequence" },
    ],
  };

  it("detects all 5 critical anomaly dimensions on a realistic graph", () => {
    const report = detectAnomalies(complexOrchestrationGraph);

    // 1. Retry loop detected on worker-02-anomaly
    const retryAnomalies = report.anomalies.filter((a) => a.type === "runaway_retry_loop");
    expect(retryAnomalies.length).toBeGreaterThan(0);
    expect(retryAnomalies.some((a) => a.nodeIds.includes("worker-02-anomaly"))).toBe(true);

    // 2. Token spike & cognitive reasoning explosion detected on worker-02-anomaly
    const tokenAnomalies = report.anomalies.filter((a) => a.type === "cognitive_token_spike");
    expect(tokenAnomalies.length).toBeGreaterThan(0);
    expect(tokenAnomalies.some((a) => a.nodeIds.includes("worker-02-anomaly"))).toBe(true);

    // 3. Stranded distributed lock detected on worker-03-lens
    const lockAnomalies = report.anomalies.filter((a) => a.type === "stranded_distributed_lock");
    expect(lockAnomalies.length).toBeGreaterThan(0);
    expect(lockAnomalies.some((a) => a.nodeIds.includes("worker-03-lens"))).toBe(true);

    // 4. Diamond join deadlock on join-barrier due to worker-02 failure
    const deadlockAnomalies = report.anomalies.filter((a) => a.type === "diamond_join_deadlock");
    expect(deadlockAnomalies.length).toBeGreaterThan(0);
    expect(deadlockAnomalies.some((a) => a.nodeIds.includes("join-barrier"))).toBe(true);

    // 5. Error cascade / blast radius from worker-02-anomaly
    const cascadeAnomalies = report.anomalies.filter((a) => a.type === "error_cascade");
    expect(cascadeAnomalies.length).toBeGreaterThan(0);
    expect(cascadeAnomalies.some((a) => a.nodeIds.includes("worker-02-anomaly"))).toBe(true);

    // Verify overall health score is degraded appropriately
    expect(report.healthScore).toBeLessThan(60);
    expect(report.totalAnomalies).toBe(report.anomalies.length);
  });

  it("produces robust recommendations and action plan", () => {
    const report = detectAnomalies(complexOrchestrationGraph);
    expect(report.recommendedActions.length).toBeGreaterThan(0);

    const summary = formatAnomalySummary(report);
    expect(summary).toContain("Top Anomalies:");
    expect(summary).toContain("Recommended Remediation Actions:");
  });
});
