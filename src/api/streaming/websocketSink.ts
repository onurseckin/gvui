/**
 * WebSocket Live Telemetry Streaming Sink
 * 100% Zero-Any strict TypeScript.
 */

import { BackoffController } from "./backoff";
import { MessageDeduplicator } from "./deduplicator";
import { HeartbeatMonitor } from "./heartbeat";
import { PacketQueue } from "./queue";
import {
  unrefTimer,
  type ConnectionStatus,
  type HeartbeatPayload,
  type ITelemetrySink,
  type PacketType,
  type StreamingMetrics,
  type TelemetryPacket,
  type TransportProtocol,
  type WebSocketSinkConfig,
} from "./types";

function isSocketOpen(ws: WebSocket | null): boolean {
  if (!ws) return false;
  return ws.readyState === 1;
}

export class WebSocketTelemetrySink implements ITelemetrySink {
  public readonly id: string;
  public readonly protocol: TransportProtocol = "websocket";

  private ws: WebSocket | null = null;
  private config: WebSocketSinkConfig;
  private currentStatus: ConnectionStatus = "disconnected";
  private isExplicitlyClosed = false;
  private isPaused = false;
  private connectedAt: number | null = null;
  private totalReconnects = 0;

  private outgoingQueue: PacketQueue;
  private incomingQueue: PacketQueue;
  private deduplicator: MessageDeduplicator;
  private heartbeat: HeartbeatMonitor;
  private backoff: BackoffController;

  private activeSubscriptions = new Set<string>();

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

  // Cleanups
  private unbindHeartbeatThreshold: (() => void) | null = null;

  constructor(config: WebSocketSinkConfig) {
    this.id = `ws-sink-${Math.random().toString(36).slice(2, 9)}`;
    this.config = {
      autoReconnect: true,
      maxBatchSize: 100,
      batchIntervalMs: 50,
      ...config,
    };

    this.outgoingQueue = new PacketQueue(config.queue);
    this.incomingQueue = new PacketQueue(config.queue);
    this.deduplicator = new MessageDeduplicator(config.deduplicator);
    this.heartbeat = new HeartbeatMonitor(config.heartbeat);
    this.backoff = new BackoffController(config.backoff);

    this.unbindHeartbeatThreshold = this.heartbeat.onMissedThresholdReached(() => {
      this.handleMissedHeartbeats();
    });

    this.startThroughputTracker();
  }

  public get status(): ConnectionStatus {
    return this.currentStatus;
  }

  public get endpointUrl(): string | null {
    return this.config.url;
  }

  public get subscriptions(): readonly string[] {
    return Array.from(this.activeSubscriptions);
  }

  /**
   * Connects to the WebSocket endpoint.
   */
  public async connect(): Promise<void> {
    if (this.currentStatus === "connected" || this.currentStatus === "connecting") {
      return;
    }

    this.isExplicitlyClosed = false;
    this.setStatus("connecting");

    try {
      await this.establishConnection();
    } catch (err: unknown) {
      const errorObj =
        err instanceof Error ? err : new Error(typeof err === "string" ? err : "Connection failed");
      this.emitError(errorObj);

      if (this.config.autoReconnect && !this.isExplicitlyClosed) {
        this.scheduleReconnection();
      } else {
        this.setStatus("error");
      }
    }
  }

  /**
   * Explicitly closes connection and cancels scheduled retries.
   */
  public disconnect(reason = "Client requested disconnect"): void {
    this.isExplicitlyClosed = true;
    this.backoff.cancel();
    this.heartbeat.stop();
    this.clearBatchTimer();

    if (this.ws) {
      try {
        this.ws.close(1000, reason);
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }

    this.connectedAt = null;
    this.setStatus("disconnected");
  }

  /**
   * Sends a telemetry packet or queues it if currently offline.
   */
  public send(packet: TelemetryPacket): boolean {
    if (this.currentStatus === "connected" && isSocketOpen(this.ws)) {
      try {
        const payloadStr = this.config.transformOutgoing
          ? this.config.transformOutgoing(packet)
          : JSON.stringify(packet);
        // Bridge Uint8ArrayArrayBufferLike to DOM WebSocket payload signature
        this.ws?.send(payloadStr as unknown as string | BufferSource);
        return true;
      } catch {
        this.outgoingQueue.push(packet);
        return false;
      }
    }

    // Queue for when connection is restored
    return this.outgoingQueue.push(packet);
  }

  /**
   * Pauses incoming packet dispatching (packets buffer in incoming queue).
   */
  public pause(): void {
    this.isPaused = true;
    if (this.currentStatus === "connected") {
      this.setStatus("paused");
    }
  }

  /**
   * Resumes incoming packet dispatching and flushes queued packets.
   */
  public resume(): void {
    this.isPaused = false;
    if (this.currentStatus === "paused") {
      this.setStatus("connected");
    }
    this.flushIncomingQueue();
  }

  /**
   * Subscribes to a topic.
   */
  public subscribe(topic: string): void {
    if (!topic || this.activeSubscriptions.has(topic)) return;
    this.activeSubscriptions.add(topic);

    if (this.currentStatus === "connected" && isSocketOpen(this.ws)) {
      this.sendTopicAction("subscribe", topic);
    }
  }

  /**
   * Unsubscribes from a topic.
   */
  public unsubscribe(topic: string): void {
    if (!topic || !this.activeSubscriptions.has(topic)) return;
    this.activeSubscriptions.delete(topic);

    if (this.currentStatus === "connected" && isSocketOpen(this.ws)) {
      this.sendTopicAction("unsubscribe", topic);
    }
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
      reconnectAttempts: this.backoff.getAttemptCount(),
      totalReconnects: this.totalReconnects,
      queue: this.incomingQueue.getMetrics(),
      deduplicator: this.deduplicator.getMetrics(),
      heartbeat: this.heartbeat.getMetrics(),
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
    if (this.unbindHeartbeatThreshold) {
      this.unbindHeartbeatThreshold();
      this.unbindHeartbeatThreshold = null;
    }
    this.deduplicator.destroy();
    this.packetListeners.clear();
    this.batchListeners.clear();
    this.statusListeners.clear();
    this.errorListeners.clear();
  }

  private establishConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const protocols = this.config.subprotocols ?? this.config.protocols;
        this.ws = protocols
          ? new WebSocket(this.config.url, protocols)
          : new WebSocket(this.config.url);

        if (this.config.binaryType) {
          this.ws.binaryType = this.config.binaryType;
        }

        let isResolved = false;

        this.ws.onopen = () => {
          isResolved = true;
          this.handleOpen();
          resolve();
        };

        this.ws.onmessage = (event: MessageEvent) => {
          this.handleMessage(event);
        };

        this.ws.onerror = (_event: Event) => {
          const err = new Error(`WebSocket error on ${this.config.url}`);
          if (!isResolved) {
            isResolved = true;
            reject(err);
          } else {
            this.emitError(err);
          }
        };

        this.ws.onclose = (event: CloseEvent) => {
          this.handleClose(event);
          if (!isResolved) {
            isResolved = true;
            reject(new Error(`WebSocket closed before connecting (code: ${event.code})`));
          }
        };
      } catch (err: unknown) {
        reject(err instanceof Error ? err : new Error("Failed to construct WebSocket"));
      }
    });
  }

  private handleOpen(): void {
    this.connectedAt = Date.now();
    this.backoff.recordSuccess(true);
    this.setStatus(this.isPaused ? "paused" : "connected");

    // Flush queued outgoing messages first
    this.flushOutgoingQueue();

    // Resubscribe topics
    for (const topic of this.activeSubscriptions) {
      this.sendTopicAction("subscribe", topic);
    }

    // Start heartbeat
    this.heartbeat.start((payload: HeartbeatPayload) => {
      this.sendPing(payload);
    });
  }

  private handleMessage(event: MessageEvent): void {
    const rawData = event.data;
    let byteLength = 0;

    if (typeof rawData === "string") {
      byteLength = rawData.length;
    } else if (rawData instanceof ArrayBuffer) {
      byteLength = rawData.byteLength;
    } else if (rawData && typeof (rawData as Blob).size === "number") {
      byteLength = (rawData as Blob).size;
    }

    this.totalBytesReceived += byteLength;
    this.bytesThisInterval += byteLength;

    const packet = this.parseIncomingPacket(rawData);
    if (!packet) {
      return;
    }

    // Handle heartbeat pong
    if (packet.type === "pong" || packet.type === "heartbeat") {
      const payload = packet.payload as Partial<HeartbeatPayload>;
      this.heartbeat.recordPong(payload);
    }

    this.dispatchPacket(packet);
  }

  private handleClose(event: CloseEvent): void {
    this.heartbeat.stop();
    this.ws = null;
    this.connectedAt = null;

    if (this.isExplicitlyClosed || event.code === 1000) {
      this.setStatus("disconnected");
      return;
    }

    if (this.config.autoReconnect) {
      this.scheduleReconnection();
    } else {
      this.setStatus("closed");
    }
  }

  private scheduleReconnection(): void {
    if (this.isExplicitlyClosed || this.backoff.isMaxAttemptsReached()) {
      this.setStatus("disconnected");
      return;
    }

    this.setStatus("reconnecting");
    this.totalReconnects += 1;

    this.backoff
      .scheduleRetry(async () => {
        if (this.isExplicitlyClosed) return;
        await this.establishConnection();
      })
      .catch((err: unknown) => {
        const errorObj =
          err instanceof Error
            ? err
            : new Error(typeof err === "string" ? err : "Reconnection failed");
        this.emitError(errorObj);

        if (
          !this.isExplicitlyClosed &&
          this.config.autoReconnect &&
          !this.backoff.isMaxAttemptsReached()
        ) {
          this.scheduleReconnection();
        } else {
          this.setStatus("disconnected");
        }
      });
  }

  private handleMissedHeartbeats(): void {
    this.emitError(
      new Error(
        `Heartbeat missed threshold (${this.heartbeat.missedCount}). Reconnecting socket...`,
      ),
    );
    if (this.ws) {
      try {
        this.ws.close(4001, "Heartbeat timeout");
      } catch {
        // Ignore
      }
    }
  }

  private parseIncomingPacket(raw: unknown): TelemetryPacket | null {
    if (this.config.transformIncoming) {
      return this.config.transformIncoming(raw);
    }

    if (typeof raw === "string") {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && "type" in parsed) {
          const typed = parsed as Partial<TelemetryPacket>;
          return {
            id: typed.id || `pkt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: typed.type as PacketType,
            timestamp: typeof typed.timestamp === "number" ? typed.timestamp : Date.now(),
            sequence: typed.sequence,
            source: typed.source,
            target: typed.target,
            nodeId: typed.nodeId,
            agentId: typed.agentId,
            priority: typed.priority ?? "normal",
            topic: typed.topic,
            payload: typed.payload ?? parsed,
            metadata: typed.metadata,
          };
        }
        // If string is JSON without type, wrap as raw
        return {
          id: `raw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: "custom",
          timestamp: Date.now(),
          payload: parsed,
        };
      } catch {
        return {
          id: `raw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: "custom",
          timestamp: Date.now(),
          payload: raw,
        };
      }
    }

    return null;
  }

  private dispatchPacket(packet: TelemetryPacket): void {
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
        this.emitError(
          err instanceof Error ? err : new Error("Error inside packet listener callback"),
        );
      }
    }

    this.pendingBatch.push(packet);
    if (this.pendingBatch.length >= (this.config.maxBatchSize ?? 100)) {
      this.flushBatch();
    } else if (this.batchFlushTimerId === null) {
      this.batchFlushTimerId = setTimeout(() => {
        this.flushBatch();
      }, this.config.batchIntervalMs ?? 50);
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
        this.emitError(
          err instanceof Error ? err : new Error("Error inside batch listener callback"),
        );
      }
    }
  }

  private clearBatchTimer(): void {
    if (this.batchFlushTimerId !== null) {
      clearTimeout(this.batchFlushTimerId);
      this.batchFlushTimerId = null;
    }
  }

  private flushIncomingQueue(): void {
    const packets = this.incomingQueue.drainAll();
    for (const p of packets) {
      this.emitPacket(p);
    }
  }

  private flushOutgoingQueue(): void {
    if (!isSocketOpen(this.ws)) return;
    const queued = this.outgoingQueue.drainAll();
    for (const packet of queued) {
      this.send(packet);
    }
  }

  private sendPing(payload: HeartbeatPayload): void {
    if (isSocketOpen(this.ws)) {
      const pingPacket: TelemetryPacket<HeartbeatPayload> = {
        id: `ping-${payload.sequence}`,
        type: "ping",
        timestamp: payload.clientTimestamp,
        payload,
      };
      try {
        this.ws?.send(JSON.stringify(pingPacket));
      } catch {
        // Handled by timeout
      }
    }
  }

  private sendTopicAction(action: "subscribe" | "unsubscribe", topic: string): void {
    if (!isSocketOpen(this.ws)) return;
    try {
      this.ws?.send(
        JSON.stringify({
          action,
          topic,
          timestamp: Date.now(),
        }),
      );
    } catch {
      // Ignore send errors
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
