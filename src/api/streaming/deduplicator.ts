/**
 * Sliding Window Message Deduplication Engine
 * 100% Zero-Any strict TypeScript.
 */

import {
  unrefTimer,
  type DeduplicatorConfig,
  type DeduplicatorMetrics,
  type TelemetryPacket,
} from "./types";

export const DEFAULT_DEDUPLICATOR_CONFIG: Readonly<DeduplicatorConfig> = Object.freeze({
  capacity: 10000,
  ttlMs: 60000,
});

/**
 * Standard composite key generator for telemetry packets without explicit unique IDs.
 */
export function defaultExtractPacketKey(packet: TelemetryPacket): string {
  if (packet.id && packet.id.trim().length > 0) {
    return packet.id.trim();
  }

  const seq = packet.sequence !== undefined ? `seq:${packet.sequence}` : `ts:${packet.timestamp}`;
  const src = packet.source ?? "";
  const node = packet.nodeId ?? "";
  const agent = packet.agentId ?? "";
  return `${packet.type}|${seq}|${src}|${node}|${agent}`;
}

export class MessageDeduplicator {
  private keyTimestamps = new Map<string, number>();
  private config: DeduplicatorConfig;
  private duplicateCount = 0;
  private uniqueCount = 0;
  private evictionCount = 0;
  private pruneTimerId: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<DeduplicatorConfig>, autoPruneIntervalMs = 15000) {
    this.config = { ...DEFAULT_DEDUPLICATOR_CONFIG, ...config };
    this.config.capacity = Math.max(1, this.config.capacity);
    this.config.ttlMs = Math.max(10, this.config.ttlMs);

    if (autoPruneIntervalMs > 0) {
      this.pruneTimerId = setInterval(() => {
        this.pruneExpired();
      }, autoPruneIntervalMs);
      unrefTimer(this.pruneTimerId);
    }
  }

  public get size(): number {
    return this.keyTimestamps.size;
  }

  public get capacity(): number {
    return this.config.capacity;
  }

  public get ttlMs(): number {
    return this.config.ttlMs;
  }

  /**
   * Generates a key for a given packet using custom extractor or fallback.
   */
  public extractKey(packet: TelemetryPacket): string {
    if (this.config.keyExtractor) {
      return this.config.keyExtractor(packet);
    }
    return defaultExtractPacketKey(packet);
  }

  /**
   * Checks if a packet has already been seen within the TTL window without updating its timestamp.
   */
  public isDuplicate(packet: TelemetryPacket, now: number = Date.now()): boolean {
    const key = this.extractKey(packet);
    const timestamp = this.keyTimestamps.get(key);
    if (timestamp === undefined) {
      return false;
    }
    if (now - timestamp > this.config.ttlMs) {
      this.keyTimestamps.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Tracks a packet. Returns true if the packet is NEW (not seen or expired),
   * or false if it is a DUPLICATE.
   */
  public track(packet: TelemetryPacket, now: number = Date.now()): boolean {
    const key = this.extractKey(packet);
    const existingTs = this.keyTimestamps.get(key);

    if (existingTs !== undefined && now - existingTs <= this.config.ttlMs) {
      this.duplicateCount += 1;
      return false;
    }

    // Capacity eviction: delete oldest inserted entries if at capacity
    if (this.keyTimestamps.size >= this.config.capacity) {
      this.evictOldest();
    }

    this.keyTimestamps.set(key, now);
    this.uniqueCount += 1;
    return true;
  }

  /**
   * Filters a batch of packets, returning only non-duplicate packets.
   */
  public filterBatch(
    packets: readonly TelemetryPacket[],
    now: number = Date.now(),
  ): TelemetryPacket[] {
    const result: TelemetryPacket[] = [];
    for (const p of packets) {
      if (this.track(p, now)) {
        result.push(p);
      }
    }
    return result;
  }

  /**
   * Prunes entries older than ttlMs.
   */
  public pruneExpired(now: number = Date.now()): number {
    const ttl = this.config.ttlMs;
    let pruned = 0;

    for (const [key, timestamp] of this.keyTimestamps.entries()) {
      if (now - timestamp > ttl) {
        this.keyTimestamps.delete(key);
        pruned += 1;
      }
    }

    this.evictionCount += pruned;
    return pruned;
  }

  /**
   * Clears all tracked keys and stops internal pruning.
   */
  public clear(): void {
    this.keyTimestamps.clear();
  }

  public destroy(): void {
    if (this.pruneTimerId !== null) {
      clearInterval(this.pruneTimerId);
      this.pruneTimerId = null;
    }
    this.clear();
  }

  public getMetrics(): DeduplicatorMetrics {
    return {
      trackedKeysCount: this.keyTimestamps.size,
      duplicateCount: this.duplicateCount,
      uniqueCount: this.uniqueCount,
      evictionCount: this.evictionCount,
    };
  }

  public resetMetrics(): void {
    this.duplicateCount = 0;
    this.uniqueCount = 0;
    this.evictionCount = 0;
  }

  private evictOldest(): void {
    const iterator = this.keyTimestamps.keys();
    const first = iterator.next();
    if (!first.done && first.value !== undefined) {
      this.keyTimestamps.delete(first.value);
      this.evictionCount += 1;
    }
  }
}
