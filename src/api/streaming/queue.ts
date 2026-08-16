/**
 * High-Throughput Bounded Packet Queue with Drop Policies
 * 100% Zero-Any strict TypeScript.
 */

import type {
  DropPolicy,
  PacketPriority,
  QueueConfig,
  QueueMetrics,
  TelemetryPacket,
} from "./types";

export const DEFAULT_QUEUE_CONFIG: Readonly<QueueConfig> = Object.freeze({
  capacity: 5000,
  dropPolicy: "drop-oldest",
  highWatermark: 0,
});

const PRIORITY_SCORES: Readonly<Record<PacketPriority, number>> = Object.freeze({
  critical: 3,
  high: 2,
  normal: 1,
  low: 0,
});

function getPriorityScore(priority?: PacketPriority): number {
  if (!priority) return PRIORITY_SCORES.normal;
  return PRIORITY_SCORES[priority] ?? PRIORITY_SCORES.normal;
}

export class PacketQueue {
  private buffer: TelemetryPacket[] = [];
  private config: QueueConfig;
  private totalPushed = 0;
  private totalPopped = 0;
  private totalDropped = 0;
  private highWatermark = 0;

  constructor(config?: Partial<QueueConfig>) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
    this.config.capacity = Math.max(1, this.config.capacity);
  }

  public get size(): number {
    return this.buffer.length;
  }

  public get capacity(): number {
    return this.config.capacity;
  }

  public get isFull(): boolean {
    return this.buffer.length >= this.config.capacity;
  }

  public get isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  public setCapacity(newCapacity: number): void {
    this.config.capacity = Math.max(1, newCapacity);
    if (this.buffer.length > this.config.capacity) {
      const excess = this.buffer.length - this.config.capacity;
      this.buffer.splice(0, excess);
      this.totalDropped += excess;
    }
  }

  public setDropPolicy(policy: DropPolicy): void {
    this.config.dropPolicy = policy;
  }

  /**
   * Pushes a single telemetry packet into the queue according to configured drop policy.
   * Returns true if packet was enqueued, false if dropped.
   */
  public push(packet: TelemetryPacket): boolean {
    if (this.buffer.length >= this.config.capacity) {
      const admitted = this.handleOverflow(packet);
      if (!admitted) {
        this.totalDropped += 1;
        return false;
      }
    } else {
      this.buffer.push(packet);
    }

    this.totalPushed += 1;
    if (this.buffer.length > this.highWatermark) {
      this.highWatermark = this.buffer.length;
    }
    return true;
  }

  /**
   * Pushes multiple packets. Returns count of admitted packets.
   */
  public pushBatch(packets: readonly TelemetryPacket[]): number {
    let admittedCount = 0;
    for (const p of packets) {
      if (this.push(p)) {
        admittedCount += 1;
      }
    }
    return admittedCount;
  }

  /**
   * Pops the oldest packet from the front of the queue.
   */
  public pop(): TelemetryPacket | undefined {
    if (this.buffer.length === 0) {
      return undefined;
    }
    const item = this.buffer.shift();
    if (item) {
      this.totalPopped += 1;
    }
    return item;
  }

  /**
   * Peeks the front packet without removing it.
   */
  public peek(): TelemetryPacket | undefined {
    return this.buffer[0];
  }

  /**
   * Drains up to maxCount packets from the queue.
   */
  public drain(maxCount?: number): TelemetryPacket[] {
    if (this.buffer.length === 0) {
      return [];
    }

    const count =
      maxCount !== undefined && maxCount > 0
        ? Math.min(maxCount, this.buffer.length)
        : this.buffer.length;

    const drained = this.buffer.splice(0, count);
    this.totalPopped += drained.length;
    return drained;
  }

  /**
   * Drains all packets currently in the queue.
   */
  public drainAll(): TelemetryPacket[] {
    return this.drain();
  }

  /**
   * Clears the entire queue buffer.
   */
  public clear(): void {
    this.buffer = [];
  }

  /**
   * Returns current queue metrics.
   */
  public getMetrics(): QueueMetrics {
    return {
      capacity: this.config.capacity,
      size: this.buffer.length,
      totalPushed: this.totalPushed,
      totalPopped: this.totalPopped,
      totalDropped: this.totalDropped,
      highWatermark: this.highWatermark,
    };
  }

  /**
   * Resets internal metric counters.
   */
  public resetMetrics(): void {
    this.totalPushed = 0;
    this.totalPopped = 0;
    this.totalDropped = 0;
    this.highWatermark = this.buffer.length;
  }

  private handleOverflow(incoming: TelemetryPacket): boolean {
    switch (this.config.dropPolicy) {
      case "drop-newest":
        return false;

      case "drop-low-priority": {
        const incomingScore = getPriorityScore(incoming.priority);
        let lowestIndex = -1;
        let lowestScore = incomingScore;

        for (let i = 0; i < this.buffer.length; i++) {
          const itemScore = getPriorityScore(this.buffer[i].priority);
          if (itemScore < lowestScore) {
            lowestScore = itemScore;
            lowestIndex = i;
          }
        }

        if (lowestIndex !== -1) {
          this.buffer.splice(lowestIndex, 1);
          this.totalDropped += 1;
          this.buffer.push(incoming);
          return true;
        }

        // No item has lower priority than incoming packet, drop incoming
        return false;
      }

      case "drop-oldest":
      default:
        this.buffer.shift();
        this.totalDropped += 1;
        this.buffer.push(incoming);
        return true;
    }
  }
}
