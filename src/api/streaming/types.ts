/**
 * Telemetry Streaming Engine Types
 * 100% Zero-Any strict TypeScript definitions.
 */

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "paused"
  | "error"
  | "closed";

export type TransportProtocol = "websocket" | "sse" | "mock";

export type PacketPriority = "critical" | "high" | "normal" | "low";

export type PacketType =
  | "node_status"
  | "edge_traffic"
  | "agent_event"
  | "metric_update"
  | "log_chunk"
  | "anomaly_alert"
  | "heartbeat"
  | "ping"
  | "pong"
  | "system_status"
  | "subscription_ack"
  | "custom"
  | (string & {});

export interface TelemetryPacket<T = unknown> {
  id: string;
  type: PacketType;
  timestamp: number;
  sequence?: number;
  source?: string;
  target?: string;
  nodeId?: string;
  agentId?: string;
  priority?: PacketPriority;
  topic?: string;
  payload: T;
  metadata?: Record<string, unknown>;
}

export interface NodeStatusPayload {
  nodeId: string;
  status: "pending" | "running" | "success" | "error" | "warning" | "skipped" | "cached";
  progress?: number;
  message?: string;
  durationMs?: number;
  metrics?: Record<string, unknown>;
}

export interface EdgeTrafficPayload {
  edgeId: string;
  source: string;
  target: string;
  tokens?: number;
  bytes?: number;
  latencyMs?: number;
  exchangeType?: string;
  summary?: string;
}

export interface AgentEventPayload {
  agentId: string;
  agentName?: string;
  role?: string;
  taskId?: string;
  eventType: string;
  severity?: "info" | "warn" | "error" | "approve" | "reject";
  message?: string;
  durationMs?: number;
  tokens?: number;
}

export interface MetricUpdatePayload {
  metricName: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
  timestamp?: number;
}

export interface LogChunkPayload {
  stream: "stdout" | "stderr" | "system";
  text: string;
  lineNumber?: number;
  level?: "info" | "warn" | "error" | "debug";
}

export interface AnomalyAlertPayload {
  anomalyId: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  targetNodeId?: string;
  targetAgentId?: string;
  description: string;
  score?: number;
  suggestedRemediation?: string;
}

export interface HeartbeatPayload {
  clientTimestamp: number;
  serverTimestamp?: number;
  rttMs?: number;
  sequence: number;
  clientId?: string;
}

export interface SystemStatusPayload {
  version?: string;
  activeConnections?: number;
  uptimeSeconds?: number;
  loadAverage?: number;
  memoryUsageBytes?: number;
}

export type DropPolicy = "drop-oldest" | "drop-newest" | "drop-low-priority";

export type JitterStrategy = "none" | "full" | "equal" | "decorrelated";

export interface BackoffConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  jitter: JitterStrategy;
  maxAttempts: number;
  resetTimeoutMs?: number;
}

export interface QueueConfig {
  capacity: number;
  dropPolicy: DropPolicy;
  highWatermark?: number;
}

export interface DeduplicatorConfig {
  capacity: number;
  ttlMs: number;
  keyExtractor?: (packet: TelemetryPacket) => string;
}

export interface HeartbeatConfig {
  intervalMs: number;
  timeoutMs: number;
  maxMissedHeartbeats: number;
  pingPayloadBuilder?: () => Record<string, unknown>;
}

export interface QueueMetrics {
  capacity: number;
  size: number;
  totalPushed: number;
  totalPopped: number;
  totalDropped: number;
  highWatermark: number;
}

export interface DeduplicatorMetrics {
  trackedKeysCount: number;
  duplicateCount: number;
  uniqueCount: number;
  evictionCount: number;
}

export interface HeartbeatMetrics {
  latencyMs: number;
  averageLatencyMs: number;
  missedHeartbeats: number;
  isHealthy: boolean;
  lastPingTimestamp: number | null;
  lastPongTimestamp: number | null;
  totalPingsSent: number;
  totalPongsReceived: number;
}

export interface ThroughputStats {
  packetsPerSec: number;
  bytesPerSec: number;
  peakPacketsPerSec: number;
  totalPackets: number;
  totalBytes: number;
}

export interface StreamingMetrics {
  status: ConnectionStatus;
  protocol: TransportProtocol;
  endpointUrl: string | null;
  uptimeMs: number;
  reconnectAttempts: number;
  totalReconnects: number;
  queue: QueueMetrics;
  deduplicator: DeduplicatorMetrics;
  heartbeat: HeartbeatMetrics;
  throughput: ThroughputStats;
}

export interface SinkOptions {
  url: string;
  protocols?: string | string[];
  headers?: Record<string, string>;
  backoff?: Partial<BackoffConfig>;
  queue?: Partial<QueueConfig>;
  deduplicator?: Partial<DeduplicatorConfig>;
  heartbeat?: Partial<HeartbeatConfig>;
  autoReconnect?: boolean;
  maxBatchSize?: number;
  batchIntervalMs?: number;
  transformIncoming?: (raw: unknown) => TelemetryPacket | null;
  transformOutgoing?: (packet: TelemetryPacket) => string | Uint8Array;
}

export interface WebSocketSinkConfig extends SinkOptions {
  binaryType?: "blob" | "arraybuffer";
  subprotocols?: string[];
}

export interface SSESinkConfig extends SinkOptions {
  withCredentials?: boolean;
  eventTypes?: string[];
  lastEventId?: string;
}

export interface MockSinkConfig {
  emissionIntervalMs?: number;
  nodesCount?: number;
  agentsCount?: number;
  anomalyProbability?: number;
  speedMultiplier?: number;
  burstMode?: boolean;
  autoStart?: boolean;
}

export interface ITelemetrySink {
  readonly id: string;
  readonly protocol: TransportProtocol;
  readonly status: ConnectionStatus;
  readonly endpointUrl: string | null;

  connect(): Promise<void>;
  disconnect(reason?: string): void;
  send(packet: TelemetryPacket): boolean;
  pause(): void;
  resume(): void;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;

  onPacket(listener: (packet: TelemetryPacket) => void): () => void;
  onBatch(listener: (packets: TelemetryPacket[]) => void): () => void;
  onStatusChange(
    listener: (status: ConnectionStatus, previous: ConnectionStatus) => void,
  ): () => void;
  onError(listener: (error: Error) => void): () => void;
  getMetrics(): StreamingMetrics;
}

/**
 * Safely unrefs a NodeJS / Bun timer so it doesn't prevent event loop termination.
 */
export function unrefTimer(timer: unknown): void {
  if (
    timer !== null &&
    typeof timer === "object" &&
    "unref" in timer &&
    typeof (timer as { unref: () => void }).unref === "function"
  ) {
    (timer as { unref: () => void }).unref();
  }
}
