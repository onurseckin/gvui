import { beforeEach, describe, expect, it } from "bun:test";
import { useStreamingStore } from "../../store/useStreamingStore";
import type {
  AgentEventPayload,
  AnomalyAlertPayload,
  LogChunkPayload,
  MetricUpdatePayload,
  NodeStatusPayload,
  TelemetryPacket,
} from "./types";

describe("useStreamingStore", () => {
  beforeEach(() => {
    useStreamingStore.getState().clearPackets();
    useStreamingStore.getState().clearLogs();
    useStreamingStore.getState().clearAnomalies();
    useStreamingStore.getState().resetFilters();
  });

  it("ingests node_status packets and projects to nodeStatusMap", () => {
    const store = useStreamingStore.getState();

    const nodePayload: NodeStatusPayload = {
      nodeId: "node-task-01",
      status: "running",
      progress: 0.5,
      message: "Building components",
      durationMs: 320,
    };

    const packet: TelemetryPacket<NodeStatusPayload> = {
      id: "pkt-node-1",
      type: "node_status",
      timestamp: 1700000000000,
      nodeId: "node-task-01",
      payload: nodePayload,
    };

    store.ingestPacket(packet);

    const state = useStreamingStore.getState();
    expect(state.packets.length).toBe(1);
    expect(state.packetsById["pkt-node-1"]).toBeDefined();

    const nodeSummary = state.getNodeTelemetry("node-task-01");
    expect(nodeSummary).toBeDefined();
    expect(nodeSummary?.status).toBe("running");
    expect(nodeSummary?.progress).toBe(0.5);
    expect(nodeSummary?.durationMs).toBe(320);
  });

  it("ingests agent_event packets and projects to agentStatusMap with token aggregation", () => {
    const store = useStreamingStore.getState();

    const agentPayload1: AgentEventPayload = {
      agentId: "worker-01",
      agentName: "Implementer 1",
      role: "implementer",
      eventType: "tool_call",
      severity: "info",
      tokens: 500,
    };

    store.ingestPacket({
      id: "pkt-agent-1",
      type: "agent_event",
      timestamp: 1700000001000,
      agentId: "worker-01",
      payload: agentPayload1,
    });

    const agentPayload2: AgentEventPayload = {
      agentId: "worker-01",
      eventType: "critic_approved",
      severity: "approve",
      tokens: 250,
    };

    store.ingestPacket({
      id: "pkt-agent-2",
      type: "agent_event",
      timestamp: 1700000002000,
      agentId: "worker-01",
      payload: agentPayload2,
    });

    const agentSummary = useStreamingStore.getState().getAgentTelemetry("worker-01");
    expect(agentSummary).toBeDefined();
    expect(agentSummary?.role).toBe("implementer");
    expect(agentSummary?.lastSeverity).toBe("approve");
    expect(agentSummary?.totalTokens).toBe(750); // 500 + 250
  });

  it("ingests metric_update packets and projects to metricsMap with history buffer", () => {
    const store = useStreamingStore.getState();

    for (let i = 1; i <= 5; i++) {
      const payload: MetricUpdatePayload = {
        metricName: "cpu_usage",
        value: 20 + i * 5,
        unit: "%",
        timestamp: 1700000000000 + i * 1000,
      };

      store.ingestPacket({
        id: `pkt-metric-${i}`,
        type: "metric_update",
        timestamp: payload.timestamp ?? 0,
        payload,
      });
    }

    const metric = useStreamingStore.getState().getMetricTelemetry("cpu_usage");
    expect(metric).toBeDefined();
    expect(metric?.value).toBe(45);
    expect(metric?.history.length).toBe(5);
  });

  it("collects anomaly alerts and logs up to bounded limits", () => {
    const store = useStreamingStore.getState();

    const anomaly: AnomalyAlertPayload = {
      anomalyId: "anom-99",
      type: "runaway_loop",
      severity: "critical",
      description: "Infinite retry detected",
    };

    store.ingestPacket({
      id: "pkt-anom-1",
      type: "anomaly_alert",
      timestamp: Date.now(),
      payload: anomaly,
    });

    const log: LogChunkPayload = {
      stream: "stdout",
      text: "Compiling typescript artifacts...",
      level: "info",
    };

    store.ingestPacket({
      id: "pkt-log-1",
      type: "log_chunk",
      timestamp: Date.now(),
      payload: log,
    });

    const state = useStreamingStore.getState();
    expect(state.getAnomalies().length).toBe(1);
    expect(state.getAnomalies()[0].anomalyId).toBe("anom-99");
    expect(state.getLatestLogs().length).toBe(1);
    expect(state.getLatestLogs()[0].text).toContain("Compiling typescript");
  });

  it("filters packets correctly based on type, nodeId, priority, and search query", () => {
    const store = useStreamingStore.getState();

    const packets: TelemetryPacket[] = [
      {
        id: "p1",
        type: "node_status",
        nodeId: "node-1",
        timestamp: 1,
        priority: "normal",
        payload: { name: "test1" },
      },
      {
        id: "p2",
        type: "node_status",
        nodeId: "node-2",
        timestamp: 2,
        priority: "high",
        payload: { name: "test2" },
      },
      {
        id: "p3",
        type: "agent_event",
        agentId: "agent-1",
        timestamp: 3,
        priority: "critical",
        payload: { msg: "important error alert" },
      },
    ];

    store.ingestBatch(packets);

    // Filter by type
    store.setFilters({ types: ["node_status"] });
    expect(store.getFilteredPackets().length).toBe(2);

    // Filter by nodeId
    store.setFilters({ nodeIds: ["node-2"] });
    expect(store.getFilteredPackets().length).toBe(1);
    expect(store.getFilteredPackets()[0].id).toBe("p2");

    // Filter by minPriority
    store.resetFilters();
    store.setFilters({ minPriority: "high" });
    expect(store.getFilteredPackets().length).toBe(2); // high and critical

    // Filter by search query
    store.resetFilters();
    store.setFilters({ searchQuery: "important" });
    expect(store.getFilteredPackets().length).toBe(1);
    expect(store.getFilteredPackets()[0].id).toBe("p3");
  });

  it("bounds maxStoredPackets and maxStoredLogs", () => {
    const store = useStreamingStore.getState();
    store.setMaxStoredPackets(3);
    store.setMaxStoredLogs(2);

    for (let i = 1; i <= 5; i++) {
      store.ingestPacket({
        id: `overflow-p-${i}`,
        type: "custom",
        timestamp: i,
        payload: { i },
      });
      store.ingestPacket({
        id: `overflow-log-${i}`,
        type: "log_chunk",
        timestamp: i,
        payload: { stream: "stdout", text: `Log line ${i}` },
      });
    }

    const state = useStreamingStore.getState();
    expect(state.packets.length).toBe(3);
    expect(state.packets.map((p) => p.id)).toEqual([
      "overflow-log-4",
      "overflow-p-5",
      "overflow-log-5",
    ]);
    expect(state.logs.length).toBe(2);
  });
});
