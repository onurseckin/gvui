/**
 * Telemetry Heartbeat & Latency Health Monitor
 * 100% Zero-Any strict TypeScript.
 */

import {
  unrefTimer,
  type HeartbeatConfig,
  type HeartbeatMetrics,
  type HeartbeatPayload,
} from "./types";

export const DEFAULT_HEARTBEAT_CONFIG: Readonly<HeartbeatConfig> = Object.freeze({
  intervalMs: 15000,
  timeoutMs: 5000,
  maxMissedHeartbeats: 3,
});

export type PingSender = (payload: HeartbeatPayload) => void;
export type HealthChangeListener = (isHealthy: boolean) => void;
export type MissedThresholdListener = (missedCount: number) => void;
export type LatencyListener = (rttMs: number, avgLatencyMs: number) => void;

export class HeartbeatMonitor {
  private config: HeartbeatConfig;
  private sequence = 0;
  private intervalTimerId: ReturnType<typeof setInterval> | null = null;
  private timeoutTimerId: ReturnType<typeof setTimeout> | null = null;
  private pingSender: PingSender | null = null;

  private latencyMs = 0;
  private averageLatencyMs = 0;
  private recentLatencies: number[] = [];
  private missedHeartbeats = 0;
  private isHealthyState = true;
  private lastPingTimestamp: number | null = null;
  private lastPongTimestamp: number | null = null;
  private totalPingsSent = 0;
  private totalPongsReceived = 0;
  private pendingPingSequence: number | null = null;

  private healthChangeListeners = new Set<HealthChangeListener>();
  private missedThresholdListeners = new Set<MissedThresholdListener>();
  private latencyListeners = new Set<LatencyListener>();

  constructor(config?: Partial<HeartbeatConfig>) {
    this.config = { ...DEFAULT_HEARTBEAT_CONFIG, ...config };
    this.config.intervalMs = Math.max(10, this.config.intervalMs);
    this.config.timeoutMs = Math.max(5, this.config.timeoutMs);
    this.config.maxMissedHeartbeats = Math.max(1, this.config.maxMissedHeartbeats);
  }

  public get isHealthy(): boolean {
    return this.isHealthyState;
  }

  public get currentLatencyMs(): number {
    return this.latencyMs;
  }

  public get currentAverageLatencyMs(): number {
    return this.averageLatencyMs;
  }

  public get missedCount(): number {
    return this.missedHeartbeats;
  }

  public get pendingSequence(): number | null {
    return this.pendingPingSequence;
  }

  /**
   * Starts periodic heartbeat transmissions.
   */
  public start(sender: PingSender): void {
    this.stop();
    this.pingSender = sender;
    this.isHealthyState = true;

    // Send initial ping immediately
    this.sendPing();

    this.intervalTimerId = setInterval(() => {
      this.sendPing();
    }, this.config.intervalMs);
    unrefTimer(this.intervalTimerId);
  }

  /**
   * Stops heartbeat timers and clears active timeout.
   */
  public stop(): void {
    if (this.intervalTimerId !== null) {
      clearInterval(this.intervalTimerId);
      this.intervalTimerId = null;
    }
    this.clearTimeoutTimer();
    this.pendingPingSequence = null;
  }

  /**
   * Resets all metric counters and clears listeners.
   */
  public reset(): void {
    this.stop();
    this.sequence = 0;
    this.latencyMs = 0;
    this.averageLatencyMs = 0;
    this.recentLatencies = [];
    this.missedHeartbeats = 0;
    this.isHealthyState = true;
    this.lastPingTimestamp = null;
    this.lastPongTimestamp = null;
    this.totalPingsSent = 0;
    this.totalPongsReceived = 0;
  }

  /**
   * Records a pong received from the server.
   */
  public recordPong(payload?: Partial<HeartbeatPayload>): void {
    const now = Date.now();
    this.lastPongTimestamp = now;
    this.totalPongsReceived += 1;
    this.clearTimeoutTimer();
    this.pendingPingSequence = null;

    if (this.missedHeartbeats > 0) {
      this.missedHeartbeats = 0;
    }

    if (!this.isHealthyState) {
      this.setHealthy(true);
    }

    const clientTs = payload?.clientTimestamp ?? this.lastPingTimestamp ?? now;
    const rtt = Math.max(0, now - clientTs);
    this.latencyMs = rtt;

    // Maintain recent sliding window of 20 samples
    this.recentLatencies.push(rtt);
    if (this.recentLatencies.length > 20) {
      this.recentLatencies.shift();
    }

    const sum = this.recentLatencies.reduce((acc, val) => acc + val, 0);
    this.averageLatencyMs = Math.round(sum / this.recentLatencies.length);

    for (const listener of this.latencyListeners) {
      listener(this.latencyMs, this.averageLatencyMs);
    }
  }

  public onHealthChange(listener: HealthChangeListener): () => void {
    this.healthChangeListeners.add(listener);
    return () => this.healthChangeListeners.delete(listener);
  }

  public onMissedThresholdReached(listener: MissedThresholdListener): () => void {
    this.missedThresholdListeners.add(listener);
    return () => this.missedThresholdListeners.delete(listener);
  }

  public onLatency(listener: LatencyListener): () => void {
    this.latencyListeners.add(listener);
    return () => this.latencyListeners.delete(listener);
  }

  public getMetrics(): HeartbeatMetrics {
    return {
      latencyMs: this.latencyMs,
      averageLatencyMs: this.averageLatencyMs,
      missedHeartbeats: this.missedHeartbeats,
      isHealthy: this.isHealthyState,
      lastPingTimestamp: this.lastPingTimestamp,
      lastPongTimestamp: this.lastPongTimestamp,
      totalPingsSent: this.totalPingsSent,
      totalPongsReceived: this.totalPongsReceived,
    };
  }

  private sendPing(): void {
    if (!this.pingSender) return;

    this.sequence += 1;
    const now = Date.now();
    this.lastPingTimestamp = now;
    this.totalPingsSent += 1;
    this.pendingPingSequence = this.sequence;

    const payload: HeartbeatPayload = {
      clientTimestamp: now,
      sequence: this.sequence,
      ...(this.config.pingPayloadBuilder ? this.config.pingPayloadBuilder() : {}),
    };

    try {
      this.pingSender(payload);
    } catch {
      // Ignore synchronous transmission errors here, timeout will handle
    }

    this.clearTimeoutTimer();
    this.timeoutTimerId = setTimeout(() => {
      this.handlePingTimeout();
    }, this.config.timeoutMs);
    unrefTimer(this.timeoutTimerId);
  }

  private handlePingTimeout(): void {
    this.timeoutTimerId = null;
    this.pendingPingSequence = null;
    this.missedHeartbeats += 1;

    if (this.missedHeartbeats >= this.config.maxMissedHeartbeats) {
      if (this.isHealthyState) {
        this.setHealthy(false);
      }
      for (const listener of this.missedThresholdListeners) {
        listener(this.missedHeartbeats);
      }
    }
  }

  private setHealthy(healthy: boolean): void {
    this.isHealthyState = healthy;
    for (const listener of this.healthChangeListeners) {
      listener(healthy);
    }
  }

  private clearTimeoutTimer(): void {
    if (this.timeoutTimerId !== null) {
      clearTimeout(this.timeoutTimerId);
      this.timeoutTimerId = null;
    }
  }
}
