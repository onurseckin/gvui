/**
 * Mock / Synthetic Telemetry Streaming Sink
 * Realistic simulator for unit tests, offline development, and sandbox replay.
 * 100% Zero-Any strict TypeScript.
 */

import { MessageDeduplicator } from "./deduplicator";
import { PacketQueue } from "./queue";
import {
  unrefTimer,
  type AgentEventPayload,
  type AnomalyAlertPayload,
  type ConnectionStatus,
  type EdgeTrafficPayload,
  type ITelemetrySink,
  type LogChunkPayload,
  type MetricUpdatePayload,
  type MockSinkConfig,
  type NodeStatusPayload,
  type StreamingMetrics,
  type TelemetryPacket,
  type TransportProtocol,
} from "./types";

export class MockStreamingSink implements ITelemetrySink {
  public readonly id: string;
  public readonly protocol: TransportProtocol = "mock";

  private config: Required<MockSinkConfig>;
  private currentStatus: ConnectionStatus = "disconnected";
  private isPaused = false;
  private connectedAt: number | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private sequenceCounter = 0;

  private incomingQueue = new PacketQueue({ capacity: 5000 });
  private deduplicator = new MessageDeduplicator();

  // Synthetic nodes and agents state
  private nodeIds: string[] = [];
  private agentIds: string[] = [];
  private nodeStates = new Map<string, { status: NodeStatusPayload["status"]; progress: number }>();

  // Throughput calculation state
  private totalPacketsReceived = 0;
  private totalBytesReceived = 0;
  private packetsThisInterval = 0;
  private bytesThisInterval = 0;
  private currentPacketsPerSec = 0;
  private currentBytesPerSec = 0;
  private peakPacketsPerSec = 0;
  private throughputTimerId: ReturnType<typeof setInterval> | null = null;

  // Batching state
  private pendingBatch: TelemetryPacket[] = [];
  private batchFlushTimerId: ReturnType<typeof setTimeout> | null = null;

  // Listeners
  private packetListeners = new Set<(packet: TelemetryPacket) => void>();
  private batchListeners = new Set<(packets: TelemetryPacket[]) => void>();
  private statusListeners = new Set<
    (status: ConnectionStatus, previous: ConnectionStatus) => void
  >();
  private errorListeners = new Set<(error: Error) => void>();

  constructor(config?: MockSinkConfig) {
    this.id = `mock-sink-${Math.random().toString(36).slice(2, 9)}`;
    this.config = {
      emissionIntervalMs: 250,
      nodesCount: 6,
      agentsCount: 4,
      anomalyProbability: 0.05,
      speedMultiplier: 1.0,
      burstMode: false,
      autoStart: false,
      ...config,
    };

    this.initializeEntities();
    this.startThroughputTracker();

    if (this.config.autoStart) {
      void this.connect();
    }
  }

  public get status(): ConnectionStatus {
    return this.currentStatus;
  }

  public get endpointUrl(): string | null {
    return "mock://telemetry-stream";
  }

  public async connect(): Promise<void> {
    if (this.currentStatus === "connected") return;
    this.setStatus("connecting");

    await new Promise((resolve) => setTimeout(resolve, 50));

    this.connectedAt = Date.now();
    this.setStatus(this.isPaused ? "paused" : "connected");
    this.startEmitting();
  }

  public disconnect(_reason = "Mock disconnected"): void {
    this.stopEmitting();
    this.clearBatchTimer();
    this.connectedAt = null;
    this.setStatus("disconnected");
  }

  public send(packet: TelemetryPacket): boolean {
    if (this.currentStatus !== "connected") return false;
    // Echo or handle packet
    setTimeout(() => {
      this.dispatchPacket(packet);
    }, 10);
    return true;
  }

  public pause(): void {
    this.isPaused = true;
    if (this.currentStatus === "connected") {
      this.setStatus("paused");
    }
  }

  public resume(): void {
    this.isPaused = false;
    if (this.currentStatus === "paused") {
      this.setStatus("connected");
    }
    const queued = this.incomingQueue.drainAll();
    for (const p of queued) {
      this.emitPacket(p);
    }
  }

  public subscribe(_topic: string): void {}
  public unsubscribe(_topic: string): void {}

  public setSpeedMultiplier(multiplier: number): void {
    this.config.speedMultiplier = Math.max(0.1, multiplier);
    if (this.currentStatus === "connected") {
      this.startEmitting();
    }
  }

  public triggerAnomaly(
    type = "runaway_loop",
    targetNodeId?: string,
    description = "Synthetic anomalous condition triggered",
  ): TelemetryPacket<AnomalyAlertPayload> {
    const alert: AnomalyAlertPayload = {
      anomalyId: `anom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      severity: "critical",
      targetNodeId: targetNodeId ?? this.nodeIds[0],
      description,
      score: 0.95,
      suggestedRemediation: "Abort execution loop and rollback transaction",
    };

    const packet: TelemetryPacket<AnomalyAlertPayload> = {
      id: `pkt-${Date.now()}-${++this.sequenceCounter}`,
      type: "anomaly_alert",
      timestamp: Date.now(),
      priority: "critical",
      nodeId: alert.targetNodeId,
      payload: alert,
    };

    this.dispatchPacket(packet);
    return packet;
  }

  public triggerNodeUpdate(
    nodeId: string,
    status: NodeStatusPayload["status"],
    progress = 1.0,
  ): TelemetryPacket<NodeStatusPayload> {
    const payload: NodeStatusPayload = {
      nodeId,
      status,
      progress,
      durationMs: 450,
      metrics: { tokensIn: 1200, tokensOut: 350 },
    };

    const packet: TelemetryPacket<NodeStatusPayload> = {
      id: `pkt-${Date.now()}-${++this.sequenceCounter}`,
      type: "node_status",
      timestamp: Date.now(),
      nodeId,
      payload,
    };

    this.nodeStates.set(nodeId, { status, progress });
    this.dispatchPacket(packet);
    return packet;
  }

  public triggerAgentEvent(
    agentId: string,
    eventType: string,
    message = "Agent state transition",
  ): TelemetryPacket<AgentEventPayload> {
    const payload: AgentEventPayload = {
      agentId,
      agentName: `Agent-${agentId}`,
      eventType,
      severity: "info",
      message,
      durationMs: 120,
    };

    const packet: TelemetryPacket<AgentEventPayload> = {
      id: `pkt-${Date.now()}-${++this.sequenceCounter}`,
      type: "agent_event",
      timestamp: Date.now(),
      agentId,
      payload,
    };

    this.dispatchPacket(packet);
    return packet;
  }

  public onPacket(listener: (packet: TelemetryPacket) => void): () => void {
    this.packetListeners.add(listener);
    return () => this.packetListeners.delete(listener);
  }

  public onBatch(listener: (packets: TelemetryPacket[]) => void): () => void {
    this.batchListeners.add(listener);
    return () => this.batchListeners.delete(listener);
  }

  public onStatusChange(
    listener: (status: ConnectionStatus, previous: ConnectionStatus) => void,
  ): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  public onError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  public getMetrics(): StreamingMetrics {
    const now = Date.now();
    const uptime = this.connectedAt ? Math.max(0, now - this.connectedAt) : 0;

    return {
      status: this.currentStatus,
      protocol: this.protocol,
      endpointUrl: this.endpointUrl,
      uptimeMs: uptime,
      reconnectAttempts: 0,
      totalReconnects: 0,
      queue: this.incomingQueue.getMetrics(),
      deduplicator: this.deduplicator.getMetrics(),
      heartbeat: {
        latencyMs: 2,
        averageLatencyMs: 2,
        missedHeartbeats: 0,
        isHealthy: true,
        lastPingTimestamp: now,
        lastPongTimestamp: now,
        totalPingsSent: 10,
        totalPongsReceived: 10,
      },
      throughput: {
        packetsPerSec: this.currentPacketsPerSec,
        bytesPerSec: this.currentBytesPerSec,
        peakPacketsPerSec: this.peakPacketsPerSec,
        totalPackets: this.totalPacketsReceived,
        totalBytes: this.totalBytesReceived,
      },
    };
  }

  public destroy(): void {
    this.disconnect();
    if (this.throughputTimerId !== null) {
      clearInterval(this.throughputTimerId);
      this.throughputTimerId = null;
    }
    this.deduplicator.destroy();
    this.packetListeners.clear();
    this.batchListeners.clear();
    this.statusListeners.clear();
    this.errorListeners.clear();
  }

  private initializeEntities(): void {
    this.nodeIds = Array.from({ length: this.config.nodesCount }, (_, i) => `node-step-${i + 1}`);
    this.agentIds = Array.from({ length: this.config.agentsCount }, (_, i) => `worker-0${i + 1}`);

    for (const id of this.nodeIds) {
      this.nodeStates.set(id, { status: "pending", progress: 0 });
    }
  }

  private startEmitting(): void {
    this.stopEmitting();
    const interval = Math.max(
      20,
      Math.round(this.config.emissionIntervalMs / this.config.speedMultiplier),
    );

    this.timerId = setInterval(() => {
      if (this.currentStatus !== "connected") return;
      this.emitRandomTelemetryStep();
    }, interval);
    unrefTimer(this.timerId);
  }

  private stopEmitting(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private emitRandomTelemetryStep(): void {
    const choice = Math.random();

    if (Math.random() < this.config.anomalyProbability) {
      this.triggerAnomaly();
      return;
    }

    if (choice < 0.3) {
      this.emitSyntheticNodeUpdate();
    } else if (choice < 0.55) {
      this.emitSyntheticEdgeTraffic();
    } else if (choice < 0.75) {
      this.emitSyntheticAgentEvent();
    } else if (choice < 0.9) {
      this.emitSyntheticMetricUpdate();
    } else {
      this.emitSyntheticLogChunk();
    }
  }

  private emitSyntheticNodeUpdate(): void {
    const randomNodeId = this.nodeIds[Math.floor(Math.random() * this.nodeIds.length)];
    const current = this.nodeStates.get(randomNodeId) ?? { status: "pending", progress: 0 };

    let nextStatus: NodeStatusPayload["status"] = current.status;
    let nextProgress = current.progress;

    if (current.status === "pending") {
      nextStatus = "running";
      nextProgress = 0.2;
    } else if (current.status === "running") {
      nextProgress = Math.min(1.0, current.progress + 0.3);
      if (nextProgress >= 1.0) {
        nextStatus = Math.random() > 0.08 ? "success" : "error";
      }
    } else {
      nextStatus = "running";
      nextProgress = 0.1;
    }

    this.triggerNodeUpdate(randomNodeId, nextStatus, nextProgress);
  }

  private emitSyntheticEdgeTraffic(): void {
    const srcIndex = Math.floor(Math.random() * (this.nodeIds.length - 1));
    const src = this.nodeIds[srcIndex];
    const target = this.nodeIds[srcIndex + 1] ?? this.nodeIds[0];

    const payload: EdgeTrafficPayload = {
      edgeId: `edge-${src}->${target}`,
      source: src,
      target,
      tokens: Math.floor(100 + Math.random() * 2000),
      bytes: Math.floor(500 + Math.random() * 8000),
      latencyMs: Math.floor(15 + Math.random() * 80),
      exchangeType: "data_payload",
      summary: `Transferred intermediate execution state from ${src} to ${target}`,
    };

    const packet: TelemetryPacket<EdgeTrafficPayload> = {
      id: `pkt-${Date.now()}-${++this.sequenceCounter}`,
      type: "edge_traffic",
      timestamp: Date.now(),
      source: src,
      target,
      payload,
    };

    this.dispatchPacket(packet);
  }

  private emitSyntheticAgentEvent(): void {
    const randomAgentId = this.agentIds[Math.floor(Math.random() * this.agentIds.length)];
    const eventTypes = [
      "tool_call",
      "lease_acquired",
      "validation_started",
      "critic_approved",
      "token_metric",
    ];
    const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];

    this.triggerAgentEvent(randomAgentId, type, `Agent ${randomAgentId} performed ${type}`);
  }

  private emitSyntheticMetricUpdate(): void {
    const metrics = [
      {
        name: "system.tokens_per_sec",
        value: Math.floor(200 + Math.random() * 800),
        unit: "tok/s",
      },
      {
        name: "system.cpu_load",
        value: Math.round((0.15 + Math.random() * 0.4) * 100) / 100,
        unit: "ratio",
      },
      { name: "system.memory_mb", value: Math.floor(400 + Math.random() * 120), unit: "MB" },
      { name: "streaming.rtt_latency", value: Math.floor(2 + Math.random() * 12), unit: "ms" },
    ];

    const selected = metrics[Math.floor(Math.random() * metrics.length)];
    const payload: MetricUpdatePayload = {
      metricName: selected.name,
      value: selected.value,
      unit: selected.unit,
      timestamp: Date.now(),
    };

    const packet: TelemetryPacket<MetricUpdatePayload> = {
      id: `pkt-${Date.now()}-${++this.sequenceCounter}`,
      type: "metric_update",
      timestamp: Date.now(),
      payload,
    };

    this.dispatchPacket(packet);
  }

  private emitSyntheticLogChunk(): void {
    const streams: Array<"stdout" | "stderr" | "system"> = [
      "stdout",
      "stdout",
      "stdout",
      "stderr",
      "system",
    ];
    const stream = streams[Math.floor(Math.random() * streams.length)];
    const randomNodeId = this.nodeIds[Math.floor(Math.random() * this.nodeIds.length)];

    const payload: LogChunkPayload = {
      stream,
      text: `[${randomNodeId}] Executing subagent step chunk sequence #${this.sequenceCounter}`,
      lineNumber: this.sequenceCounter,
      level: stream === "stderr" ? "warn" : "info",
    };

    const packet: TelemetryPacket<LogChunkPayload> = {
      id: `pkt-${Date.now()}-${++this.sequenceCounter}`,
      type: "log_chunk",
      timestamp: Date.now(),
      nodeId: randomNodeId,
      payload,
    };

    this.dispatchPacket(packet);
  }

  private dispatchPacket(packet: TelemetryPacket): void {
    const rawLength = JSON.stringify(packet).length;
    this.totalBytesReceived += rawLength;
    this.bytesThisInterval += rawLength;

    if (!this.deduplicator.track(packet)) {
      return;
    }

    this.totalPacketsReceived += 1;
    this.packetsThisInterval += 1;

    if (this.isPaused) {
      this.incomingQueue.push(packet);
      return;
    }

    this.emitPacket(packet);
  }

  private emitPacket(packet: TelemetryPacket): void {
    for (const listener of this.packetListeners) {
      try {
        listener(packet);
      } catch (err: unknown) {
        this.emitError(err instanceof Error ? err : new Error("Error in mock packet listener"));
      }
    }

    this.pendingBatch.push(packet);
    if (this.pendingBatch.length >= 50) {
      this.flushBatch();
    } else if (this.batchFlushTimerId === null) {
      this.batchFlushTimerId = setTimeout(() => {
        this.flushBatch();
      }, 50);
      unrefTimer(this.batchFlushTimerId);
    }
  }

  private flushBatch(): void {
    this.clearBatchTimer();
    if (this.pendingBatch.length === 0) return;

    const batch = this.pendingBatch;
    this.pendingBatch = [];

    for (const listener of this.batchListeners) {
      try {
        listener(batch);
      } catch (err: unknown) {
        this.emitError(err instanceof Error ? err : new Error("Error in mock batch listener"));
      }
    }
  }

  private clearBatchTimer(): void {
    if (this.batchFlushTimerId !== null) {
      clearTimeout(this.batchFlushTimerId);
      this.batchFlushTimerId = null;
    }
  }

  private setStatus(newStatus: ConnectionStatus): void {
    if (this.currentStatus === newStatus) return;
    const prev = this.currentStatus;
    this.currentStatus = newStatus;

    for (const listener of this.statusListeners) {
      listener(newStatus, prev);
    }
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) {
      listener(error);
    }
  }

  private startThroughputTracker(): void {
    this.throughputTimerId = setInterval(() => {
      this.currentPacketsPerSec = this.packetsThisInterval;
      this.currentBytesPerSec = this.bytesThisInterval;

      if (this.packetsThisInterval > this.peakPacketsPerSec) {
        this.peakPacketsPerSec = this.packetsThisInterval;
      }

      this.packetsThisInterval = 0;
      this.bytesThisInterval = 0;
    }, 1000);
    unrefTimer(this.throughputTimerId);
  }
}
