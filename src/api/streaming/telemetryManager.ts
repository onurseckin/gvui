/**
 * Unified Telemetry Streaming Manager
 * Orchestrates WebSocket, SSE, and Mock Sinks with type/topic routing and metrics.
 * 100% Zero-Any strict TypeScript.
 */

import { MockStreamingSink } from "./mockStreamingSink";
import { SSETelemetrySink } from "./sseSink";
import type {
  AnomalyAlertPayload,
  ConnectionStatus,
  ITelemetrySink,
  MockSinkConfig,
  NodeStatusPayload,
  PacketType,
  SSESinkConfig,
  StreamingMetrics,
  TelemetryPacket,
  TransportProtocol,
  WebSocketSinkConfig,
} from "./types";
import { WebSocketTelemetrySink } from "./websocketSink";

export type PacketCallback<T = unknown> = (packet: TelemetryPacket<T>) => void;
export type BatchCallback = (packets: TelemetryPacket[]) => void;
export type StatusCallback = (status: ConnectionStatus, previous: ConnectionStatus) => void;
export type ErrorCallback = (error: Error) => void;

export class TelemetryManager {
  private activeSink: ITelemetrySink | null = null;
  private currentProtocol: TransportProtocol | null = null;

  private typeListeners = new Map<PacketType, Set<PacketCallback>>();
  private topicListeners = new Map<string, Set<PacketCallback>>();
  private nodeListeners = new Map<string, Set<PacketCallback<NodeStatusPayload>>>();
  private anomalyListeners = new Set<PacketCallback<AnomalyAlertPayload>>();
  private globalPacketListeners = new Set<PacketCallback>();
  private globalBatchListeners = new Set<BatchCallback>();
  private statusListeners = new Set<StatusCallback>();
  private errorListeners = new Set<ErrorCallback>();

  private unbindSinkListeners: Array<() => void> = [];

  constructor() {}

  public get activeTransport(): TransportProtocol | null {
    return this.currentProtocol;
  }

  public get sink(): ITelemetrySink | null {
    return this.activeSink;
  }

  public get status(): ConnectionStatus {
    return this.activeSink ? this.activeSink.status : "disconnected";
  }

  public get endpointUrl(): string | null {
    return this.activeSink ? this.activeSink.endpointUrl : null;
  }

  /**
   * Connects via WebSocket.
   */
  public async connectWebSocket(config: WebSocketSinkConfig): Promise<WebSocketTelemetrySink> {
    this.teardownActiveSink();
    const sink = new WebSocketTelemetrySink(config);
    this.attachSink(sink, "websocket");
    await sink.connect();
    return sink;
  }

  /**
   * Connects via SSE.
   */
  public async connectSSE(config: SSESinkConfig): Promise<SSETelemetrySink> {
    this.teardownActiveSink();
    const sink = new SSETelemetrySink(config);
    this.attachSink(sink, "sse");
    await sink.connect();
    return sink;
  }

  /**
   * Connects via Mock simulator.
   */
  public async connectMock(config?: MockSinkConfig): Promise<MockStreamingSink> {
    this.teardownActiveSink();
    const sink = new MockStreamingSink(config);
    this.attachSink(sink, "mock");
    await sink.connect();
    return sink;
  }

  /**
   * Disconnects active sink.
   */
  public disconnect(reason = "Client requested disconnect"): void {
    if (this.activeSink) {
      this.activeSink.disconnect(reason);
    }
  }

  /**
   * Reconnects active sink.
   */
  public async reconnect(): Promise<void> {
    if (this.activeSink) {
      await this.activeSink.connect();
    }
  }

  /**
   * Pauses active stream.
   */
  public pause(): void {
    if (this.activeSink) {
      this.activeSink.pause();
    }
  }

  /**
   * Resumes active stream.
   */
  public resume(): void {
    if (this.activeSink) {
      this.activeSink.resume();
    }
  }

  /**
   * Sends packet via active sink.
   */
  public send(packet: TelemetryPacket): boolean {
    if (!this.activeSink) return false;
    return this.activeSink.send(packet);
  }

  /**
   * Subscribes to topic on active sink.
   */
  public subscribe(topic: string): void {
    if (this.activeSink) {
      this.activeSink.subscribe(topic);
    }
  }

  /**
   * Unsubscribes from topic on active sink.
   */
  public unsubscribe(topic: string): void {
    if (this.activeSink) {
      this.activeSink.unsubscribe(topic);
    }
  }

  // Listener subscriptions

  public onPacket(listener: PacketCallback): () => void {
    this.globalPacketListeners.add(listener);
    return () => this.globalPacketListeners.delete(listener);
  }

  public onBatch(listener: BatchCallback): () => void {
    this.globalBatchListeners.add(listener);
    return () => this.globalBatchListeners.delete(listener);
  }

  public onStatusChange(listener: StatusCallback): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  public onError(listener: ErrorCallback): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  public onType<T = unknown>(type: PacketType, listener: PacketCallback<T>): () => void {
    const castedListener = listener as PacketCallback;
    let set = this.typeListeners.get(type);
    if (!set) {
      set = new Set();
      this.typeListeners.set(type, set);
    }
    set.add(castedListener);
    return () => {
      set?.delete(castedListener);
      if (set && set.size === 0) {
        this.typeListeners.delete(type);
      }
    };
  }

  public onTopic<T = unknown>(topic: string, listener: PacketCallback<T>): () => void {
    const castedListener = listener as PacketCallback;
    let set = this.topicListeners.get(topic);
    if (!set) {
      set = new Set();
      this.topicListeners.set(topic, set);
    }
    set.add(castedListener);
    return () => {
      set?.delete(castedListener);
      if (set && set.size === 0) {
        this.topicListeners.delete(topic);
      }
    };
  }

  public onNodeUpdate(nodeId: string, listener: PacketCallback<NodeStatusPayload>): () => void {
    let set = this.nodeListeners.get(nodeId);
    if (!set) {
      set = new Set();
      this.nodeListeners.set(nodeId, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) {
        this.nodeListeners.delete(nodeId);
      }
    };
  }

  public onAnomaly(listener: PacketCallback<AnomalyAlertPayload>): () => void {
    this.anomalyListeners.add(listener);
    return () => this.anomalyListeners.delete(listener);
  }

  public getMetrics(): StreamingMetrics | null {
    return this.activeSink ? this.activeSink.getMetrics() : null;
  }

  public destroy(): void {
    this.teardownActiveSink();
    this.typeListeners.clear();
    this.topicListeners.clear();
    this.nodeListeners.clear();
    this.anomalyListeners.clear();
    this.globalPacketListeners.clear();
    this.globalBatchListeners.clear();
    this.statusListeners.clear();
    this.errorListeners.clear();
  }

  private attachSink(sink: ITelemetrySink, protocol: TransportProtocol): void {
    this.activeSink = sink;
    this.currentProtocol = protocol;

    const unPacket = sink.onPacket((packet) => {
      this.routePacket(packet);
    });

    const unBatch = sink.onBatch((batch) => {
      for (const listener of this.globalBatchListeners) {
        listener(batch);
      }
    });

    const unStatus = sink.onStatusChange((status, prev) => {
      for (const listener of this.statusListeners) {
        listener(status, prev);
      }
    });

    const unError = sink.onError((error) => {
      for (const listener of this.errorListeners) {
        listener(error);
      }
    });

    this.unbindSinkListeners = [unPacket, unBatch, unStatus, unError];
  }

  private teardownActiveSink(): void {
    for (const unbind of this.unbindSinkListeners) {
      unbind();
    }
    this.unbindSinkListeners = [];

    if (this.activeSink) {
      this.activeSink.disconnect("Switching streaming transport");
      if (
        "destroy" in this.activeSink &&
        typeof (this.activeSink as { destroy: () => void }).destroy === "function"
      ) {
        (this.activeSink as { destroy: () => void }).destroy();
      }
      this.activeSink = null;
    }
    this.currentProtocol = null;
  }

  private routePacket(packet: TelemetryPacket): void {
    for (const listener of this.globalPacketListeners) {
      listener(packet);
    }

    const typeSet = this.typeListeners.get(packet.type);
    if (typeSet) {
      for (const listener of typeSet) {
        listener(packet);
      }
    }

    if (packet.topic) {
      const topicSet = this.topicListeners.get(packet.topic);
      if (topicSet) {
        for (const listener of topicSet) {
          listener(packet);
        }
      }
    }

    if (packet.type === "node_status" && packet.nodeId) {
      const nodeSet = this.nodeListeners.get(packet.nodeId);
      if (nodeSet) {
        for (const listener of nodeSet) {
          listener(packet as TelemetryPacket<NodeStatusPayload>);
        }
      }
    }

    if (packet.type === "anomaly_alert") {
      for (const listener of this.anomalyListeners) {
        listener(packet as TelemetryPacket<AnomalyAlertPayload>);
      }
    }
  }
}

export const globalTelemetryManager = new TelemetryManager();
