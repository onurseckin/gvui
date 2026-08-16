/**
 * Comprehensive Test Suite for Autonomous Self-Healing Graph Engine
 * 100% Zero-Any Strict TypeScript
 */

import { describe, expect, it, beforeEach } from "bun:test";
import type { GraphDataset } from "../../types/graphData";
import type { AnomalyFinding } from "../anomaly/types";
import { CircuitBreaker, CircuitBreakerManager, CircuitBreakerOpenError } from "./circuitBreaker";
import { IncidentRecorder, IncidentReplayEngine } from "./incidentReplay";
import { SelfHealingEngine } from "./selfHealingEngine";
import { type Incident, type PlaybookRule, type ReplaySession } from "./types";
import { useSelfHealingStore } from "../../store/useSelfHealingStore";

const createMockGraph = (): GraphDataset => ({
  id: "test-graph",
  title: "Test Pipeline Graph",
  nodes: [
    {
      id: "node_orchestrator",
      name: "Orchestrator",
      kind: "orchestrator",
      status: "success",
    },
    {
      id: "node_worker_1",
      name: "Worker 1",
      kind: "agent",
      status: "success",
    },
    {
      id: "node_worker_2",
      name: "Worker 2 (Backup)",
      kind: "agent",
      status: "success",
    },
    {
      id: "node_validator",
      name: "Validator",
      kind: "critic",
      status: "success",
    },
  ],
  edges: [
    {
      id: "edge_orch_w1",
      source: "node_orchestrator",
      target: "node_worker_1",
      kind: "dispatch",
    },
    {
      id: "edge_w1_val",
      source: "node_worker_1",
      target: "node_validator",
      kind: "validation",
    },
  ],
});

describe("Tri-State Circuit Breaker", () => {
  it("initializes in CLOSED state and allows successful executions", async () => {
    const breaker = new CircuitBreaker({
      id: "test-breaker",
      failureThreshold: 3,
      resetTimeoutMs: 500,
      halfOpenSuccessThreshold: 2,
    });

    expect(breaker.getState()).toBe("CLOSED");
    expect(breaker.canExecute()).toBe(true);

    const result = await breaker.execute(() => "ok");
    expect(result).toBe("ok");
    expect(breaker.getInfo().successCount).toBe(1);
    expect(breaker.getInfo().failureCount).toBe(0);
  });

  it("transitions from CLOSED to OPEN after failureThreshold is reached", async () => {
    const stateChanges: Array<{ from: string; to: string }> = [];
    const breaker = new CircuitBreaker({
      id: "fail-breaker",
      failureThreshold: 2,
      resetTimeoutMs: 300,
      onStateChange: (from, to) => {
        stateChanges.push({ from, to });
      },
    });

    // 1st failure
    let err1: unknown;
    try {
      await breaker.execute(() => {
        throw new Error("fail 1");
      });
    } catch (e) {
      err1 = e;
    }
    expect((err1 as Error)?.message).toBe("fail 1");
    expect(breaker.getState()).toBe("CLOSED");
    expect(breaker.getInfo().failureCount).toBe(1);

    // 2nd failure -> trips to OPEN
    let err2: unknown;
    try {
      await breaker.execute(() => {
        throw new Error("fail 2");
      });
    } catch (e) {
      err2 = e;
    }
    expect((err2 as Error)?.message).toBe("fail 2");
    expect(breaker.getState()).toBe("OPEN");
    expect(breaker.canExecute()).toBe(false);
    expect(stateChanges).toEqual([{ from: "CLOSED", to: "OPEN" }]);

    // Immediate execution in OPEN should throw CircuitBreakerOpenError
    let err3: unknown;
    try {
      await breaker.execute(() => "should not run");
    } catch (e) {
      err3 = e;
    }
    expect(err3 instanceof CircuitBreakerOpenError).toBe(true);
  });

  it("executes fallback when circuit is OPEN or when execution fails", async () => {
    const breaker = new CircuitBreaker({
      id: "fallback-breaker",
      failureThreshold: 1,
      resetTimeoutMs: 500,
    });

    // Fails and falls back
    const fallbackResult1 = await breaker.execute(
      () => {
        throw new Error("service dead");
      },
      (err) => `fallback-for-${err?.message}`,
    );
    expect(fallbackResult1).toBe("fallback-for-service dead");
    expect(breaker.getState()).toBe("OPEN");

    // Blocked and falls back without calling target
    let calledTarget = false;
    const fallbackResult2 = await breaker.execute(
      () => {
        calledTarget = true;
        return "live";
      },
      () => "cached-fallback",
    );
    expect(fallbackResult2).toBe("cached-fallback");
    expect(calledTarget).toBe(false);
  });

  it("transitions OPEN -> HALF_OPEN after timeout and closes after consecutive successes", async () => {
    const breaker = new CircuitBreaker({
      id: "recovery-breaker",
      failureThreshold: 1,
      resetTimeoutMs: 50,
      halfOpenSuccessThreshold: 2,
    });

    breaker.trip("manual test trip");
    expect(breaker.getState()).toBe("OPEN");

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Checking state transitions to HALF_OPEN
    expect(breaker.getState()).toBe("HALF_OPEN");
    expect(breaker.canExecute()).toBe(true);

    // 1st trial success
    await breaker.execute(() => "trial-1");
    expect(breaker.getState()).toBe("HALF_OPEN");
    expect(breaker.getInfo().consecutiveSuccesses).toBe(1);

    // 2nd trial success -> closes circuit
    await breaker.execute(() => "trial-2");
    expect(breaker.getState()).toBe("CLOSED");
    expect(breaker.canExecute()).toBe(true);
  });

  it("trips immediately back to OPEN if a trial fails during HALF_OPEN", async () => {
    const breaker = new CircuitBreaker({
      id: "half-open-fail-breaker",
      failureThreshold: 1,
      resetTimeoutMs: 50,
      halfOpenSuccessThreshold: 2,
    });

    breaker.trip();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(breaker.getState()).toBe("HALF_OPEN");

    // Trial failure trips back to OPEN
    await expect(
      breaker.execute(() => {
        throw new Error("trial failed");
      }),
    ).rejects.toThrow("trial failed");

    expect(breaker.getState()).toBe("OPEN");
  });

  it("CircuitBreakerManager manages multiple named breakers cleanly", async () => {
    const manager = new CircuitBreakerManager({
      failureThreshold: 2,
      resetTimeoutMs: 1000,
    });

    const b1 = manager.getOrCreate("service-A");
    const b2 = manager.getOrCreate("service-B");

    expect(manager.getAllBreakers().size).toBe(2);
    expect(b1.id).toBe("service-A");
    expect(b2.id).toBe("service-B");

    manager.trip("service-A", "overload");
    expect(b1.getState()).toBe("OPEN");
    expect(b2.getState()).toBe("CLOSED");

    const infos = manager.getAllInfos();
    expect(infos["service-A"].state).toBe("OPEN");
    expect(infos["service-B"].state).toBe("CLOSED");

    manager.resetAll();
    expect(b1.getState()).toBe("CLOSED");
    expect(b2.getState()).toBe("CLOSED");
  });
});

describe("Self-Healing Engine: Heartbeat & Dead Node Auto-Restart", () => {
  let engine: SelfHealingEngine;

  beforeEach(() => {
    engine = new SelfHealingEngine({
      heartbeatIntervalMs: 100,
      deadNodeTimeoutMs: 300,
      degradedNodeTimeoutMs: 150,
      maxRestartAttempts: 3,
      backoffBaseMs: 100,
      backoffMultiplier: 2,
      backoffMaxMs: 1000,
      autoRemediationEnabled: true,
    });
  });

  it("tracks healthy node heartbeats", () => {
    const record = engine.recordHeartbeat("node_worker_1", "healthy", { cpuUsage: 25 });
    expect(record.nodeId).toBe("node_worker_1");
    expect(record.status).toBe("healthy");
    expect(record.restartAttempts).toBe(0);
    expect(record.metrics?.cpuUsage).toBe(25);

    const fetched = engine.getNodeHealth("node_worker_1");
    expect(fetched?.status).toBe("healthy");
  });

  it("calculates exponential backoff correctly", () => {
    expect(engine.calculateBackoffMs(1)).toBe(100); // 100 * 2^0
    expect(engine.calculateBackoffMs(2)).toBe(200); // 100 * 2^1
    expect(engine.calculateBackoffMs(3)).toBe(400); // 100 * 2^2
    expect(engine.calculateBackoffMs(4)).toBe(800); // 100 * 2^3
    expect(engine.calculateBackoffMs(5)).toBe(1000); // Capped at backoffMaxMs
  });

  it("detects degraded and dead nodes based on heartbeat elapsed time", () => {
    const now = 1000000;
    engine.recordHeartbeat("node_worker_1", "healthy", undefined, now);

    // Advance 200ms -> degraded
    const degradedCheck = engine.checkHeartbeats(undefined, now + 200);
    expect(degradedCheck.degradedNodes).toContain("node_worker_1");
    expect(engine.getNodeHealth("node_worker_1")?.status).toBe("degraded");

    // Advance 400ms -> dead
    const deadCheck = engine.checkHeartbeats(undefined, now + 400);
    expect(deadCheck.deadNodes).toContain("node_worker_1");
    expect(deadCheck.actionsTaken.length).toBeGreaterThan(0);
    expect(engine.getNodeHealth("node_worker_1")?.status).toBe("recovering");
    expect(engine.getNodeHealth("node_worker_1")?.restartAttempts).toBe(1);
  });

  it("stops restarting and creates critical incident when maxRestartAttempts is exceeded", () => {
    const graph = createMockGraph();
    engine.recordHeartbeat("node_worker_1", "healthy");

    // 1st restart
    engine.triggerAutoRestart("node_worker_1", graph);
    expect(engine.getNodeHealth("node_worker_1")?.restartAttempts).toBe(1);

    // 2nd restart
    engine.triggerAutoRestart("node_worker_1", graph);
    expect(engine.getNodeHealth("node_worker_1")?.restartAttempts).toBe(2);

    // 3rd restart
    engine.triggerAutoRestart("node_worker_1", graph);
    expect(engine.getNodeHealth("node_worker_1")?.restartAttempts).toBe(3);

    // 4th restart -> exceeded
    const result = engine.triggerAutoRestart("node_worker_1", graph);
    expect(result?.success).toBe(false);
    expect(result?.error).toContain("Exceeded max restart attempts");

    const incidents = engine.getActiveIncidents();
    expect(incidents.length).toBe(1);
    expect(incidents[0].severity).toBe("critical");
    expect(incidents[0].nodeId).toBe("node_worker_1");
  });

  it("resets restart count when a healthy heartbeat is restored", () => {
    engine.recordHeartbeat("node_worker_1", "healthy");
    engine.triggerAutoRestart("node_worker_1");
    expect(engine.getNodeHealth("node_worker_1")?.restartAttempts).toBe(1);

    // Node recovers and sends healthy heartbeat
    engine.recordHeartbeat("node_worker_1", "healthy");
    expect(engine.getNodeHealth("node_worker_1")?.restartAttempts).toBe(0);
    expect(engine.getNodeHealth("node_worker_1")?.status).toBe("healthy");
  });
});

describe("Self-Healing Engine: Fallback Routing", () => {
  let engine: SelfHealingEngine;

  beforeEach(() => {
    engine = new SelfHealingEngine();
  });

  it("registers, activates, and deactivates fallback routes", () => {
    const route = engine.registerFallbackRoute(
      "edge_orch_w1",
      "node_orchestrator",
      "node_worker_1",
      "node_worker_2",
      "Worker 1 latency high",
    );

    expect(route.active).toBe(false);
    expect(engine.getEffectiveTarget("node_orchestrator", "node_worker_1", "edge_orch_w1")).toBe(
      "node_worker_1",
    );

    engine.activateFallbackRoute("edge_orch_w1");
    expect(engine.getEffectiveTarget("node_orchestrator", "node_worker_1", "edge_orch_w1")).toBe(
      "node_worker_2",
    );

    engine.deactivateFallbackRoute("edge_orch_w1");
    expect(engine.getEffectiveTarget("node_orchestrator", "node_worker_1", "edge_orch_w1")).toBe(
      "node_worker_1",
    );
  });

  it("auto-routes around dead nodes using topology substitute matching", () => {
    const graph = createMockGraph();
    const routes = engine.autoRouteAroundDeadNode("node_worker_1", graph);

    expect(routes.length).toBe(1);
    expect(routes[0].originalEdgeId).toBe("edge_orch_w1");
    expect(routes[0].fallbackTargetNodeId).toBe("node_worker_2");
    expect(routes[0].active).toBe(true);

    const effective = engine.getEffectiveTarget(
      "node_orchestrator",
      "node_worker_1",
      "edge_orch_w1",
    );
    expect(effective).toBe("node_worker_2");
  });
});

describe("Self-Healing Engine: Anomaly Integration & Playbooks", () => {
  let engine: SelfHealingEngine;

  beforeEach(() => {
    engine = new SelfHealingEngine();
  });

  it("executes built-in playbook on error cascade anomaly", async () => {
    const graph = createMockGraph();
    const anomaly: AnomalyFinding = {
      id: "anom_001",
      type: "error_cascade",
      category: "execution",
      severity: "error",
      title: "Error Cascade Detected",
      description: "Cascading failure across worker nodes",
      nodeIds: ["node_worker_1"],
      impactScore: 85,
      remediation: { action: "trip_circuit", suggestion: "Trip circuit breaker" },
      evidence: {},
      timestamp: Date.now(),
    };

    const results = await engine.handleAnomaly(anomaly, graph);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].action).toBe("trip_circuit");
    expect(results[0].success).toBe(true);

    // Circuit breaker for node_worker_1 should be tripped
    expect(engine.circuitBreakers.getBreaker("node_worker_1")?.getState()).toBe("OPEN");

    const incidents = engine.getAllIncidents();
    expect(incidents.length).toBe(1);
    expect(incidents[0].status).toBe("remediated");
    expect(incidents[0].remediationsApplied.length).toBe(1);
  });

  it("supports custom playbook registration and cooldown enforcement", async () => {
    let customCallCount = 0;
    const customRule: PlaybookRule = {
      id: "custom_throttle_rule",
      name: "Custom Throttle Playbook",
      enabled: true,
      priority: 200,
      cooldownMs: 5000,
      triggerOnAnomalyTypes: ["cognitive_token_spike"],
      actions: ["throttle"],
      customRemediator: (ctx) => {
        customCallCount += 1;
        return [
          {
            action: "throttle",
            success: true,
            targetId: ctx.nodeId,
            message: "Throttled LLM call rate",
          },
        ];
      },
    };

    // Remove built-in token spike rule to isolate custom rule
    engine.removePlaybook("pb_token_spike_throttle");
    engine.registerPlaybook(customRule);

    const anomaly: AnomalyFinding = {
      id: "anom_002",
      type: "cognitive_token_spike",
      category: "resource",
      severity: "warning",
      title: "Token Spike",
      description: "Sudden token surge",
      nodeIds: ["node_worker_1"],
      impactScore: 70,
      remediation: { action: "throttle", suggestion: "Throttle agent" },
      evidence: {},
      timestamp: Date.now(),
    };

    // First trigger executes
    const res1 = await engine.handleAnomaly(anomaly);
    expect(res1.length).toBe(1);
    expect(customCallCount).toBe(1);

    // Immediate second trigger within cooldown is blocked
    const res2 = await engine.handleAnomaly(anomaly);
    expect(res2.length).toBe(0);
    expect(customCallCount).toBe(1);
  });
});

describe("Incident Recording & Deterministic Replay Engine", () => {
  it("records incident steps, navigates replay, and validates time-travel invariants", () => {
    const graph = createMockGraph();
    const recorder = new IncidentRecorder();
    const replayEngine = new IncidentReplayEngine(recorder);

    const incident: Incident = {
      id: "inc_test_100",
      title: "Worker 1 Failure Incident",
      description: "Node worker 1 stopped responding",
      severity: "high",
      status: "detected",
      nodeId: "node_worker_1",
      detectedAt: 1000,
      remediationsApplied: [],
      initialSnapshot: graph,
    };

    const session = recorder.createSession(incident, graph, "Worker 1 Replay");
    expect(session.steps.length).toBe(1);
    expect(session.steps[0].type).toBe("initial");

    // Step 1: Anomaly detected (node worker 1 errored)
    const graphStep1: GraphDataset = JSON.parse(JSON.stringify(graph));
    graphStep1.nodes[1].status = "error";
    recorder.recordStep(session.id, {
      timestamp: 1100,
      type: "anomaly",
      description: "Anomaly: Worker 1 heartbeat missed",
      snapshot: graphStep1,
    });

    // Step 2: Remediation - fallback route activated
    const graphStep2: GraphDataset = JSON.parse(JSON.stringify(graphStep1));
    graphStep2.edges[0].target = "node_worker_2";
    recorder.recordStep(session.id, {
      timestamp: 1200,
      type: "route_updated",
      description: "Fallback route activated -> node_worker_2",
      snapshot: graphStep2,
      actionTaken: "fallback_route",
      targetId: "edge_orch_w1",
    });

    // Step 3: Resolved
    const graphStep3: GraphDataset = JSON.parse(JSON.stringify(graphStep2));
    graphStep3.nodes[1].status = "success";
    recorder.recordStep(session.id, {
      timestamp: 1300,
      type: "resolved",
      description: "Incident resolved and pipeline stabilized",
      snapshot: graphStep3,
    });

    expect(session.steps.length).toBe(4);

    // Test Replay Navigation
    replayEngine.loadSession(session);
    expect(replayEngine.getCurrentStepIndex()).toBe(0);
    expect(replayEngine.getCurrentSnapshot()?.nodes[1].status).toBe("success");

    replayEngine.stepForward();
    expect(replayEngine.getCurrentStepIndex()).toBe(1);
    expect(replayEngine.getCurrentSnapshot()?.nodes[1].status).toBe("error");

    replayEngine.stepForward();
    expect(replayEngine.getCurrentStepIndex()).toBe(2);
    expect(replayEngine.getCurrentSnapshot()?.edges[0].target).toBe("node_worker_2");

    replayEngine.stepBackward();
    expect(replayEngine.getCurrentStepIndex()).toBe(1);

    replayEngine.jumpToStep(3);
    expect(replayEngine.getCurrentStepIndex()).toBe(3);
    expect(replayEngine.getCurrentStep()?.type).toBe("resolved");

    replayEngine.reset();
    expect(replayEngine.getCurrentStepIndex()).toBe(0);

    // Test Time-Travel Invariant Validation
    const validation = replayEngine.validateTimeTravelInvariants(session);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.stepCount).toBe(4);
    expect(validation.metrics.edgeIntegrityPreserved).toBe(true);
    expect(validation.metrics.deterministicHashMatches).toBe(true);
  });

  it("exports and imports replay sessions via JSON", () => {
    const graph = createMockGraph();
    const recorder = new IncidentRecorder();
    const replayEngine = new IncidentReplayEngine(recorder);

    const incident: Incident = {
      id: "inc_export_test",
      title: "Export Replay",
      description: "Testing export",
      severity: "low",
      status: "resolved",
      detectedAt: 5000,
      remediationsApplied: [],
    };

    const session = recorder.createSession(incident, graph);
    const json = replayEngine.exportSessionJson(session);
    expect(typeof json).toBe("string");

    const imported = replayEngine.importSessionJson(json);
    expect(imported.id).toBe(session.id);
    expect(imported.steps.length).toBe(session.steps.length);
  });
});

describe("Zustand Store: useSelfHealingStore", () => {
  beforeEach(() => {
    useSelfHealingStore.getState().resetAll();
  });

  it("updates and retrieves configuration, incidents, and node health", () => {
    const store = useSelfHealingStore.getState();
    expect(store.enabled).toBe(true);

    store.updateConfig({ deadNodeTimeoutMs: 7000 });
    expect(useSelfHealingStore.getState().config.deadNodeTimeoutMs).toBe(7000);

    const incident: Incident = {
      id: "inc_store_1",
      title: "Store Incident",
      description: "Testing store recording",
      severity: "high",
      status: "detected",
      detectedAt: Date.now(),
      remediationsApplied: [],
    };

    store.recordIncident(incident);
    expect(useSelfHealingStore.getState().incidents.length).toBe(1);
    expect(useSelfHealingStore.getState().activeIncidents.length).toBe(1);

    store.resolveIncident("inc_store_1", "Manually resolved");
    expect(useSelfHealingStore.getState().incidents[0].status).toBe("resolved");
    expect(useSelfHealingStore.getState().activeIncidents.length).toBe(0);

    store.updateNodeHealth("node_1", { status: "degraded", restartAttempts: 2 });
    expect(useSelfHealingStore.getState().nodeHealth["node_1"].status).toBe("degraded");
    expect(useSelfHealingStore.getState().nodeHealth["node_1"].restartAttempts).toBe(2);
  });

  it("manages circuit breaker records and fallback routes in store", () => {
    const store = useSelfHealingStore.getState();

    store.updateCircuitBreaker("node_orch", { state: "OPEN", failureCount: 5 });
    expect(useSelfHealingStore.getState().circuitBreakers["node_orch"].state).toBe("OPEN");

    store.setFallbackRoute("edge_1", {
      originalEdgeId: "edge_1",
      sourceNodeId: "node_orch",
      targetNodeId: "node_w1",
      fallbackTargetNodeId: "node_w2",
      active: true,
      reason: "Latency spike",
      createdAt: Date.now(),
    });

    expect(useSelfHealingStore.getState().fallbackRouteTable["edge_1"].active).toBe(true);
    store.removeFallbackRoute("edge_1");
    expect(useSelfHealingStore.getState().fallbackRouteTable["edge_1"]).toBeUndefined();
  });

  it("manages replay player state within the store", () => {
    const store = useSelfHealingStore.getState();
    const graph = createMockGraph();

    const session: ReplaySession = {
      id: "session_store_1",
      incidentId: "inc_1",
      title: "Store Replay Session",
      createdAt: Date.now(),
      initialGraph: graph,
      status: "idle",
      currentStepIndex: 0,
      steps: [
        {
          stepIndex: 0,
          timestamp: 100,
          type: "initial",
          description: "Step 0",
          snapshot: graph,
        },
        {
          stepIndex: 1,
          timestamp: 200,
          type: "remediation_completed",
          description: "Step 1",
          snapshot: graph,
        },
      ],
    };

    store.startReplay(session);
    expect(useSelfHealingStore.getState().replayPlayer.currentSessionId).toBe("session_store_1");
    expect(useSelfHealingStore.getState().replayPlayer.totalSteps).toBe(2);
    expect(useSelfHealingStore.getState().replayPlayer.stepIndex).toBe(0);

    store.playReplay();
    expect(useSelfHealingStore.getState().replayPlayer.isPlaying).toBe(true);

    store.pauseReplay();
    expect(useSelfHealingStore.getState().replayPlayer.isPlaying).toBe(false);

    store.stepReplay("forward");
    expect(useSelfHealingStore.getState().replayPlayer.stepIndex).toBe(1);

    store.stepReplay("backward");
    expect(useSelfHealingStore.getState().replayPlayer.stepIndex).toBe(0);

    store.jumpReplay(1);
    expect(useSelfHealingStore.getState().replayPlayer.stepIndex).toBe(1);

    store.resetReplay();
    expect(useSelfHealingStore.getState().replayPlayer.stepIndex).toBe(0);
  });

  it("synchronizes state from SelfHealingEngine", () => {
    const engine = new SelfHealingEngine();
    engine.recordHeartbeat("node_engine_sync", "healthy");
    engine.circuitBreakers.trip("node_engine_sync", "Tripped");

    const store = useSelfHealingStore.getState();
    store.syncFromEngine(engine);

    expect(useSelfHealingStore.getState().nodeHealth["node_engine_sync"]).toBeDefined();
    expect(useSelfHealingStore.getState().circuitBreakers["node_engine_sync"].state).toBe("OPEN");
  });
});

describe("Adversarial Scenarios & Invariant Validation", () => {
  it("detects malformed snapshots and dangling edges during time-travel validation", () => {
    const recorder = new IncidentRecorder();
    const replayEngine = new IncidentReplayEngine(recorder);

    const corruptGraph: GraphDataset = {
      id: "corrupt-graph",
      title: "Corrupt Graph",
      nodes: [{ id: "n1", name: "N1", kind: "agent", status: "success" }],
      edges: [{ id: "e1", source: "n1", target: "n_missing", kind: "dispatch" }],
    };

    const incident: Incident = {
      id: "inc_corrupt",
      title: "Corrupt Graph Incident",
      description: "Testing dangling edge detection",
      severity: "medium",
      status: "detected",
      detectedAt: 1000,
      remediationsApplied: [],
      initialSnapshot: corruptGraph,
    };

    const session = recorder.createSession(incident, corruptGraph);
    const validation = replayEngine.validateTimeTravelInvariants(session);

    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
    expect(validation.errors[0]).toContain("dangling edge");
    expect(validation.metrics.edgeIntegrityPreserved).toBe(false);
  });

  it("enforces audit log capacity limits when flooded with entries", () => {
    const engine = new SelfHealingEngine({ maxAuditLogHistory: 5 });

    for (let i = 0; i < 10; i++) {
      engine.addAuditLog("custom", `Message ${i}`);
    }

    const logs = engine.getAuditLog();
    expect(logs.length).toBe(5);
    expect(logs[0].message).toBe("Message 9");
  });

  it("handles full end-to-end self-healing orchestration workflow", async () => {
    const graph = createMockGraph();
    let restartedNode: string | undefined;

    const engine = new SelfHealingEngine(
      {
        circuitBreakerFailureThreshold: 2,
        deadNodeTimeoutMs: 200,
        autoRemediationEnabled: true,
      },
      {
        nodeRestarter: (nodeId) => {
          restartedNode = nodeId;
          return true;
        },
      },
    );

    // 1. Worker 1 starts failing
    engine.recordHeartbeat("node_worker_1", "healthy");

    // 2. Anomaly detected
    const anomaly: AnomalyFinding = {
      id: "anom_cascade",
      type: "error_cascade",
      category: "execution",
      severity: "critical",
      title: "Cascade on Worker 1",
      description: "Failure detected",
      nodeIds: ["node_worker_1"],
      impactScore: 90,
      remediation: { action: "trip_circuit", suggestion: "Trip breaker" },
      evidence: {},
      timestamp: Date.now(),
    };

    const remediations = await engine.handleAnomaly(anomaly, graph);
    expect(remediations.some((r) => r.action === "trip_circuit" && r.success)).toBe(true);
    expect(engine.circuitBreakers.getBreaker("node_worker_1")?.getState()).toBe("OPEN");

    // 3. Fallback routing
    const fallbackRoutes = engine.autoRouteAroundDeadNode("node_worker_1", graph);
    expect(fallbackRoutes.length).toBe(1);
    expect(engine.getEffectiveTarget("node_orchestrator", "node_worker_1", "edge_orch_w1")).toBe(
      "node_worker_2",
    );

    // 4. Dead node auto-restart
    const restartResult = engine.triggerAutoRestart("node_worker_1", graph);
    expect(restartResult?.success).toBe(true);
    expect(restartedNode).toBe("node_worker_1");

    // 5. Worker 1 recovers, reports healthy heartbeat
    engine.recordHeartbeat("node_worker_1", "healthy");
    expect(engine.getNodeHealth("node_worker_1")?.status).toBe("healthy");
    expect(engine.getNodeHealth("node_worker_1")?.restartAttempts).toBe(0);

    // 6. Reset circuit breaker & restore original route
    engine.circuitBreakers.reset("node_worker_1");
    expect(engine.circuitBreakers.getBreaker("node_worker_1")?.getState()).toBe("CLOSED");

    engine.deactivateFallbackRoute("edge_orch_w1");
    expect(engine.getEffectiveTarget("node_orchestrator", "node_worker_1", "edge_orch_w1")).toBe(
      "node_worker_1",
    );

    // 7. Resolve incident
    const activeIncidents = engine.getActiveIncidents();
    expect(activeIncidents.length).toBe(1);
    const resolved = engine.resolveIncident(activeIncidents[0].id, graph);
    expect(resolved?.status).toBe("resolved");
    expect(engine.getActiveIncidents().length).toBe(0);
  });
});

describe("Round 2 Adversarial Remediation Tests", () => {
  describe("Finding 1: Max backoff cap validation on exponential dead node restart", () => {
    it("strictly bounds backoff at backoffMaxMs across normal, extreme, and edge-case attempt counts", () => {
      const engine = new SelfHealingEngine({
        backoffBaseMs: 500,
        backoffMultiplier: 2,
        backoffMaxMs: 8000,
      });

      // Normal exponential growth
      expect(engine.calculateBackoffMs(1)).toBe(500); // 500 * 2^0
      expect(engine.calculateBackoffMs(2)).toBe(1000); // 500 * 2^1
      expect(engine.calculateBackoffMs(3)).toBe(2000); // 500 * 2^2
      expect(engine.calculateBackoffMs(4)).toBe(4000); // 500 * 2^3
      expect(engine.calculateBackoffMs(5)).toBe(8000); // 500 * 2^4 = 8000 (hits cap)

      // Exceeding cap
      expect(engine.calculateBackoffMs(6)).toBe(8000); // 16000 -> 8000
      expect(engine.calculateBackoffMs(10)).toBe(8000);
      expect(engine.calculateBackoffMs(50)).toBe(8000);
      expect(engine.calculateBackoffMs(1000)).toBe(8000); // Huge exponent (avoids Infinity overflow)

      // Edge cases: non-positive and non-finite attempts
      expect(engine.calculateBackoffMs(0)).toBe(500);
      expect(engine.calculateBackoffMs(-5)).toBe(500);
      expect(engine.calculateBackoffMs(NaN)).toBe(500);
      expect(engine.calculateBackoffMs(Infinity)).toBe(500);
    });

    it("schedules node restart with properly capped backoff timestamps", () => {
      const engine = new SelfHealingEngine({
        backoffBaseMs: 200,
        backoffMultiplier: 3,
        backoffMaxMs: 1500,
        maxRestartAttempts: 10,
      });

      engine.recordHeartbeat("node_test_cap", "healthy");

      for (let attempt = 1; attempt <= 6; attempt++) {
        const result = engine.triggerAutoRestart("node_test_cap");
        expect(result?.success).toBe(true);
        const health = engine.getNodeHealth("node_test_cap");
        expect(health?.restartAttempts).toBe(attempt);
        const details = result?.details as { backoffMs: number } | undefined;
        expect(details?.backoffMs).toBeLessThanOrEqual(1500);
      }
    });
  });

  describe("Finding 2: Half-open circuit breaker failure resets immediately to open", () => {
    it("resets state immediately to OPEN on failure during HALF_OPEN trial", async () => {
      const stateHistory: Array<{ from: string; to: string }> = [];
      const breaker = new CircuitBreaker({
        id: "trial-fail-breaker",
        failureThreshold: 1,
        resetTimeoutMs: 50,
        halfOpenSuccessThreshold: 3,
        onStateChange: (from, to) => {
          stateHistory.push({ from, to });
        },
      });

      // Trip to OPEN
      breaker.trip("Initial trip");
      expect(breaker.getState()).toBe("OPEN");
      expect(stateHistory).toEqual([{ from: "CLOSED", to: "OPEN" }]);

      // Wait for timeout -> transitions to HALF_OPEN
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(breaker.getState()).toBe("HALF_OPEN");
      expect(stateHistory).toEqual([
        { from: "CLOSED", to: "OPEN" },
        { from: "OPEN", to: "HALF_OPEN" },
      ]);

      // Execute trial 1 (success)
      await breaker.execute(() => "ok-trial-1");
      expect(breaker.getState()).toBe("HALF_OPEN");
      expect(breaker.getInfo().consecutiveSuccesses).toBe(1);

      // Execute trial 2 (fails) -> Must immediately transition to OPEN
      const failureTimeBefore = Date.now();
      await expect(
        breaker.execute(() => {
          throw new Error("trial-2-crashed");
        }),
      ).rejects.toThrow("trial-2-crashed");

      expect(breaker.getState()).toBe("OPEN");
      expect(breaker.canExecute()).toBe(false);
      expect(breaker.getInfo().consecutiveSuccesses).toBe(0);
      expect(breaker.getInfo().lastTrippedAt).toBeGreaterThanOrEqual(failureTimeBefore);

      expect(stateHistory).toEqual([
        { from: "CLOSED", to: "OPEN" },
        { from: "OPEN", to: "HALF_OPEN" },
        { from: "HALF_OPEN", to: "OPEN" },
      ]);

      // Immediate subsequent call is blocked with CircuitBreakerOpenError
      await expect(breaker.execute(() => "should-fail")).rejects.toThrow(CircuitBreakerOpenError);
    });
  });

  describe("Finding 3: Replay engine validates corrupted snapshot timeline boundaries", () => {
    const recorder = new IncidentRecorder();
    const replayEngine = new IncidentReplayEngine(recorder);
    const validGraph = createMockGraph();

    it("rejects sessions with corrupted initial step 0 boundaries", () => {
      const corruptSession: ReplaySession = {
        id: "sess_corrupt_step0",
        incidentId: "inc_0",
        title: "Corrupt Step 0",
        createdAt: 1000,
        initialGraph: validGraph,
        status: "idle",
        currentStepIndex: 0,
        steps: [
          {
            stepIndex: 5, // Non-zero initial step index
            timestamp: 1000,
            type: "anomaly",
            description: "Invalid start",
            snapshot: validGraph,
          },
        ],
      };

      const result = replayEngine.validateTimeTravelInvariants(corruptSession);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Initial step boundary"))).toBe(true);
    });

    it("rejects sessions with out-of-bounds currentStepIndex", () => {
      const corruptSession: ReplaySession = {
        id: "sess_corrupt_oob",
        incidentId: "inc_oob",
        title: "Corrupt OOB Index",
        createdAt: 1000,
        initialGraph: validGraph,
        status: "idle",
        currentStepIndex: 10, // Only 1 step exists
        steps: [
          {
            stepIndex: 0,
            timestamp: 1000,
            type: "initial",
            description: "Start",
            snapshot: validGraph,
          },
        ],
      };

      const result = replayEngine.validateTimeTravelInvariants(corruptSession);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Session boundary corrupted"))).toBe(true);
    });

    it("rejects timeline regressions with non-monotonic timestamps", () => {
      const regressedSession: ReplaySession = {
        id: "sess_time_regression",
        incidentId: "inc_regress",
        title: "Timeline Regression",
        createdAt: 1000,
        initialGraph: validGraph,
        status: "idle",
        currentStepIndex: 0,
        steps: [
          {
            stepIndex: 0,
            timestamp: 2000,
            type: "initial",
            description: "Step 0",
            snapshot: validGraph,
          },
          {
            stepIndex: 1,
            timestamp: 1500, // Regressed earlier in time
            type: "anomaly",
            description: "Step 1",
            snapshot: validGraph,
          },
        ],
      };

      const result = replayEngine.validateTimeTravelInvariants(regressedSession);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Timeline regression"))).toBe(true);
    });

    it("rejects snapshots with duplicate node IDs or malformed nodes", () => {
      const duplicateGraph: GraphDataset = {
        id: "dup-graph",
        title: "Duplicate Nodes Graph",
        nodes: [
          { id: "node_dup", name: "Node A", kind: "agent", status: "success" },
          { id: "node_dup", name: "Node B (Duplicate ID)", kind: "agent", status: "success" },
        ],
        edges: [],
      };

      const session: ReplaySession = {
        id: "sess_dup_node",
        incidentId: "inc_dup",
        title: "Duplicate Node Session",
        createdAt: 1000,
        initialGraph: duplicateGraph,
        status: "idle",
        currentStepIndex: 0,
        steps: [
          {
            stepIndex: 0,
            timestamp: 1000,
            type: "initial",
            description: "Initial duplicate snapshot",
            snapshot: duplicateGraph,
          },
        ],
      };

      const result = replayEngine.validateTimeTravelInvariants(session);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("duplicate node ID"))).toBe(true);
    });
  });
});
