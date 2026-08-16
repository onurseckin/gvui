/**
 * Server-Sent Events (SSE) Live Telemetry Streaming Sink
 * 100% Zero-Any strict TypeScript.
 */

import { BackoffController } from "./backoff";
import { MessageDeduplicator } from "./deduplicator";
import { PacketQueue } from "./queue";
import {
  unrefTimer,
  type ConnectionStatus,
  type ITelemetrySink,
  type PacketType,
  type SSESinkConfig,
  type StreamingMetrics,
  type TelemetryPacket,
  type TransportProtocol,
} from "./types";

export const DEFAULT_SSE_EVENT_TYPES: readonly string[] = Object.freeze([
  "message",
  "telemetry",
  "node_status",
  "edge_traffic",
  "agent_event",
  "metric_update",
  "anomaly_alert",
  "log_chunk",
  "heartbeat",
  "ping",
  "pong",
]);

export class SSETelemetrySink implements ITelemetrySink {
  public readonly id: string;
  public readonly protocol: TransportProtocol = "sse";

  private eventSource: EventSource | null = null;
  private abortController: AbortController | null = null;
  private config: SSESinkConfig;
  private currentStatus: ConnectionStatus = "disconnected";
  private isExplicitlyClosed = false;
  private isPaused = false;
  private connectedAt: number | null = null;
  private totalReconnects = 0;
  private lastEventId: string | null = null;

  private incomingQueue: PacketQueue;
  private deduplicator: MessageDeduplicator;
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

  constructor(config: SSESinkConfig) {
    this.id = `sse-sink-${Math.random().toString(36).slice(2, 9)}`;
    this.config = {
      autoReconnect: true,
      maxBatchSize: 100,
      batchIntervalMs: 50,
      eventTypes: [...DEFAULT_SSE_EVENT_TYPES],
      ...config,
    };

    if (config.lastEventId) {
      this.lastEventId = config.lastEventId;
    }

    this.incomingQueue = new PacketQueue(config.queue);
    this.deduplicator = new MessageDeduplicator(config.deduplicator);
    this.backoff = new BackoffController(config.backoff);

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

  public get currentLastEventId(): string | null {
    return this.lastEventId;
  }

  /**
   * Connects to the SSE endpoint.
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
        err instanceof Error
          ? err
          : new Error(typeof err === "string" ? err : "SSE Connection failed");
      this.emitError(errorObj);

      if (this.config.autoReconnect && !this.isExplicitlyClosed) {
        this.scheduleReconnection();
      } else {
        this.setStatus("error");
      }
    }
  }

  /**
   * Closes the SSE connection.
   */
  public disconnect(_reason = "Client disconnected"): void {
    this.isExplicitlyClosed = true;
    this.backoff.cancel();
    this.clearBatchTimer();

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {
        // Ignore close errors
      }
      this.eventSource = null;
    }

    this.connectedAt = null;
    this.setStatus("disconnected");
  }

  /**
   * SSE is unidirectional (server -> client).
   * Sending packets client-side is not supported directly over EventSource protocol,
   * but returning false indicates the packet was not sent over SSE transport.
   */
  public send(_packet: TelemetryPacket): boolean {
    return false;
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
    this.flushIncomingQueue();
  }

  public subscribe(topic: string): void {
    this.activeSubscriptions.add(topic);
  }

  public unsubscribe(topic: string): void {
    this.activeSubscriptions.delete(topic);
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
      heartbeat: {
        latencyMs: 0,
        averageLatencyMs: 0,
        missedHeartbeats: 0,
        isHealthy: this.currentStatus === "connected",
        lastPingTimestamp: null,
        lastPongTimestamp: null,
        totalPingsSent: 0,
        totalPongsReceived: 0,
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

  private constructUrl(): string {
    const parsed = new URL(this.config.url, "http://localhost");
    if (this.lastEventId) {
      parsed.searchParams.set("lastEventId", this.lastEventId);
    }
    if (this.activeSubscriptions.size > 0) {
      parsed.searchParams.set("topics", Array.from(this.activeSubscriptions).join(","));
    }
    return parsed.toString();
  }

  private establishConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const fullUrl = this.constructUrl();
        if (typeof EventSource !== "undefined") {
          const init: EventSourceInit = {
            withCredentials: this.config.withCredentials ?? false,
          };

          this.eventSource = new EventSource(fullUrl, init);
          let isResolved = false;

          this.eventSource.onopen = () => {
            isResolved = true;
            this.handleOpen();
            resolve();
          };

          const handleRawEvent = (event: MessageEvent) => {
            if (event.lastEventId) {
              this.lastEventId = event.lastEventId;
            }
            this.handleMessage(event.data, event.type);
          };

          this.eventSource.onmessage = handleRawEvent;

          const types = this.config.eventTypes ?? DEFAULT_SSE_EVENT_TYPES;
          for (const type of types) {
            if (type !== "message") {
              this.eventSource.addEventListener(type, handleRawEvent as EventListener);
            }
          }

          this.eventSource.onerror = (_err: Event) => {
            if (!isResolved) {
              isResolved = true;
              this.handleError(new Error(`EventSource failed to connect to ${this.config.url}`));
              reject(new Error(`EventSource connection failed`));
            } else {
              this.handleError(new Error(`EventSource connection lost`));
            }
          };
        } else {
          // Fallback to fetch stream reader if EventSource is not present
          this.connectFetchStream(fullUrl, resolve, reject);
        }
      } catch (err: unknown) {
        reject(err instanceof Error ? err : new Error("Failed to construct SSE source"));
      }
    });
  }

  private async connectFetchStream(
    url: string,
    resolve: () => void,
    reject: (err: Error) => void,
  ): Promise<void> {
    this.abortController = new AbortController();
    try {
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
        ...(this.config.headers ?? {}),
      };
      if (this.lastEventId) {
        headers["Last-Event-ID"] = this.lastEventId;
      }

      const response = await fetch(url, {
        headers,
        signal: this.abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`SSE fetch stream error: ${response.status} ${response.statusText}`);
      }

      this.handleOpen();
      resolve();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const block of lines) {
          this.parseSSEBlock(block);
        }
      }

      this.handleError(new Error("SSE stream ended by server"));
    } catch (err: unknown) {
      if (this.isExplicitlyClosed) return;
      const errorObj =
        err instanceof Error
          ? err
          : new Error(typeof err === "string" ? err : "Fetch stream failed");
      reject(errorObj);
      this.handleError(errorObj);
    }
  }

  private parseSSEBlock(block: string): void {
    const lines = block.split("\n");
    let eventType = "message";
    let data = "";
    let id: string | null = null;

    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        data += (data ? "\n" : "") + line.slice(5).trim();
      } else if (line.startsWith("id:")) {
        id = line.slice(3).trim();
      }
    }

    if (id) {
      this.lastEventId = id;
    }

    if (data) {
      this.handleMessage(data, eventType);
    }
  }

  private handleOpen(): void {
    this.connectedAt = Date.now();
    this.backoff.recordSuccess();
    this.setStatus(this.isPaused ? "paused" : "connected");
  }

  private handleMessage(rawData: unknown, eventType: string): void {
    let byteLength = 0;
    if (typeof rawData === "string") {
      byteLength = rawData.length;
    }

    this.totalBytesReceived += byteLength;
    this.bytesThisInterval += byteLength;

    const packet = this.parseIncomingPacket(rawData, eventType);
    if (!packet) {
      return;
    }

    if (!this.deduplicator.track(packet)) {
      return;
    }

    this.totalPacketsReceived += 1;
    this.packetsThisInterval += 1;

    if (this.isPaused) {
      this.incomingQueue.push(packet);
      return;
    }

    this.dispatchPacket(packet);
  }

  private handleError(error: Error): void {
    this.emitError(error);

    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {
        // Ignore
      }
      this.eventSource = null;
    }

    this.connectedAt = null;

    if (this.config.autoReconnect && !this.isExplicitlyClosed) {
      this.scheduleReconnection();
    } else {
      this.setStatus(this.isExplicitlyClosed ? "disconnected" : "error");
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

  private parseIncomingPacket(raw: unknown, eventType: string): TelemetryPacket | null {
    if (this.config.transformIncoming) {
      return this.config.transformIncoming(raw);
    }

    if (typeof raw === "string") {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const typed = parsed as Partial<TelemetryPacket>;
          const inferredType = (typed.type ||
            (eventType !== "message" ? eventType : "custom")) as PacketType;
          return {
            id: typed.id || `sse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: inferredType,
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
        return {
          id: `sse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: (eventType !== "message" ? eventType : "custom") as PacketType,
          timestamp: Date.now(),
          payload: parsed,
        };
      } catch {
        return {
          id: `sse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: (eventType !== "message" ? eventType : "custom") as PacketType,
          timestamp: Date.now(),
          payload: raw,
        };
      }
    }

    return null;
  }

  private dispatchPacket(packet: TelemetryPacket): void {
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
      this.dispatchPacket(p);
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
