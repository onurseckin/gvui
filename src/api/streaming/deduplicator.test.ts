import { describe, expect, it } from "bun:test";
import { defaultExtractPacketKey, MessageDeduplicator } from "./deduplicator";
import type { TelemetryPacket } from "./types";

function makePacket(
  id: string,
  type = "test_event",
  sequence?: number,
  source?: string,
  nodeId?: string,
): TelemetryPacket {
  return {
    id,
    type,
    timestamp: Date.now(),
    sequence,
    source,
    nodeId,
    payload: { id },
  };
}

describe("MessageDeduplicator", () => {
  it("extracts composite fallback key when id is missing or empty", () => {
    const p1 = makePacket("", "node_status", 42, "worker-1", "node-a");
    const key = defaultExtractPacketKey(p1);
    expect(key).toBe("node_status|seq:42|worker-1|node-a|");
  });

  it("identifies duplicates and tracks unique messages", () => {
    const deduplicator = new MessageDeduplicator({ capacity: 100, ttlMs: 5000 }, 0);

    const p1 = makePacket("msg-1");
    const p2 = makePacket("msg-2");

    expect(deduplicator.isDuplicate(p1)).toBe(false);
    expect(deduplicator.track(p1)).toBe(true);
    expect(deduplicator.isDuplicate(p1)).toBe(true);

    // Second track with same id should return false
    expect(deduplicator.track(p1)).toBe(false);

    // p2 is new
    expect(deduplicator.track(p2)).toBe(true);

    const metrics = deduplicator.getMetrics();
    expect(metrics.uniqueCount).toBe(2);
    expect(metrics.duplicateCount).toBe(1);
    expect(metrics.trackedKeysCount).toBe(2);

    deduplicator.destroy();
  });

  it("filters batch of packets removing duplicates", () => {
    const deduplicator = new MessageDeduplicator({ capacity: 100, ttlMs: 5000 }, 0);

    const batch = [
      makePacket("1"),
      makePacket("2"),
      makePacket("1"), // duplicate
      makePacket("3"),
      makePacket("2"), // duplicate
    ];

    const filtered = deduplicator.filterBatch(batch);
    expect(filtered.map((p) => p.id)).toEqual(["1", "2", "3"]);

    deduplicator.destroy();
  });

  it("evicts oldest keys when capacity is exceeded", () => {
    const deduplicator = new MessageDeduplicator({ capacity: 3, ttlMs: 100000 }, 0);

    deduplicator.track(makePacket("k1"));
    deduplicator.track(makePacket("k2"));
    deduplicator.track(makePacket("k3"));
    expect(deduplicator.size).toBe(3);

    // 4th item forces eviction of "k1"
    deduplicator.track(makePacket("k4"));
    expect(deduplicator.size).toBe(3);
    expect(deduplicator.isDuplicate(makePacket("k1"))).toBe(false);
    expect(deduplicator.isDuplicate(makePacket("k4"))).toBe(true);

    deduplicator.destroy();
  });

  it("expires keys older than TTL", () => {
    const deduplicator = new MessageDeduplicator({ capacity: 100, ttlMs: 100 }, 0);
    const now = Date.now();

    deduplicator.track(makePacket("temp"), now);
    expect(deduplicator.isDuplicate(makePacket("temp"), now + 50)).toBe(true);

    // After TTL
    expect(deduplicator.isDuplicate(makePacket("temp"), now + 150)).toBe(false);

    // Manual prune
    deduplicator.track(makePacket("expired-1"), now);
    deduplicator.track(makePacket("fresh-1"), now + 80);
    const pruned = deduplicator.pruneExpired(now + 120);
    expect(pruned).toBeGreaterThanOrEqual(1);

    deduplicator.destroy();
  });

  it("supports custom key extractor function", () => {
    const deduplicator = new MessageDeduplicator(
      {
        keyExtractor: (p) => `custom:${p.type}:${p.nodeId}`,
      },
      0,
    );

    const pA = makePacket("id-1", "typeA", 1, "src", "node1");
    const pB = makePacket("id-2", "typeA", 2, "src", "node1"); // different id, same custom key

    expect(deduplicator.track(pA)).toBe(true);
    expect(deduplicator.track(pB)).toBe(false); // Duplicate under custom extractor!

    deduplicator.destroy();
  });
});
