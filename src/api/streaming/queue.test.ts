import { describe, expect, it } from "bun:test";
import { PacketQueue } from "./queue";
import type { TelemetryPacket } from "./types";

function createMockPacket(
  id: string,
  priority: "critical" | "high" | "normal" | "low" = "normal",
): TelemetryPacket {
  return {
    id,
    type: "test",
    timestamp: Date.now(),
    priority,
    payload: { id },
  };
}

describe("PacketQueue", () => {
  it("pushes, peeks, and pops packets in FIFO order", () => {
    const queue = new PacketQueue({ capacity: 5 });

    expect(queue.isEmpty).toBe(true);
    expect(queue.size).toBe(0);

    const p1 = createMockPacket("p1");
    const p2 = createMockPacket("p2");

    expect(queue.push(p1)).toBe(true);
    expect(queue.push(p2)).toBe(true);

    expect(queue.size).toBe(2);
    expect(queue.peek()?.id).toBe("p1");

    expect(queue.pop()?.id).toBe("p1");
    expect(queue.size).toBe(1);
    expect(queue.pop()?.id).toBe("p2");
    expect(queue.isEmpty).toBe(true);
    expect(queue.pop()).toBeUndefined();
  });

  it("handles batch drain and drainAll", () => {
    const queue = new PacketQueue({ capacity: 10 });
    queue.pushBatch([
      createMockPacket("1"),
      createMockPacket("2"),
      createMockPacket("3"),
      createMockPacket("4"),
    ]);

    expect(queue.size).toBe(4);

    const drained2 = queue.drain(2);
    expect(drained2.map((p) => p.id)).toEqual(["1", "2"]);
    expect(queue.size).toBe(2);

    const drainedRest = queue.drainAll();
    expect(drainedRest.map((p) => p.id)).toEqual(["3", "4"]);
    expect(queue.isEmpty).toBe(true);
  });

  it("drops oldest packet on overflow when dropPolicy is drop-oldest", () => {
    const queue = new PacketQueue({ capacity: 3, dropPolicy: "drop-oldest" });

    queue.push(createMockPacket("1"));
    queue.push(createMockPacket("2"));
    queue.push(createMockPacket("3"));
    expect(queue.size).toBe(3);

    // 4th push should evict "1"
    expect(queue.push(createMockPacket("4"))).toBe(true);
    expect(queue.size).toBe(3);

    const remaining = queue.drainAll();
    expect(remaining.map((p) => p.id)).toEqual(["2", "3", "4"]);
    expect(queue.getMetrics().totalDropped).toBe(1);
  });

  it("rejects new packet on overflow when dropPolicy is drop-newest", () => {
    const queue = new PacketQueue({ capacity: 2, dropPolicy: "drop-newest" });

    queue.push(createMockPacket("1"));
    queue.push(createMockPacket("2"));

    // 3rd push should be rejected
    expect(queue.push(createMockPacket("3"))).toBe(false);
    expect(queue.size).toBe(2);

    const remaining = queue.drainAll();
    expect(remaining.map((p) => p.id)).toEqual(["1", "2"]);
    expect(queue.getMetrics().totalDropped).toBe(1);
  });

  it("evicts lower priority packet when dropPolicy is drop-low-priority", () => {
    const queue = new PacketQueue({ capacity: 3, dropPolicy: "drop-low-priority" });

    queue.push(createMockPacket("p-norm-1", "normal"));
    queue.push(createMockPacket("p-low", "low"));
    queue.push(createMockPacket("p-norm-2", "normal"));
    expect(queue.size).toBe(3);

    // Incoming critical packet should evict p-low
    expect(queue.push(createMockPacket("p-crit", "critical"))).toBe(true);
    expect(queue.size).toBe(3);

    const remaining = queue.drainAll();
    expect(remaining.map((p) => p.id)).toEqual(["p-norm-1", "p-norm-2", "p-crit"]);

    // If queue contains all critical packets and a low comes in, reject low
    queue.push(createMockPacket("c1", "critical"));
    queue.push(createMockPacket("c2", "critical"));
    queue.push(createMockPacket("c3", "critical"));
    expect(queue.push(createMockPacket("low-rejected", "low"))).toBe(false);
  });

  it("tracks high watermark and resets metrics accurately", () => {
    const queue = new PacketQueue({ capacity: 10 });
    queue.pushBatch([createMockPacket("1"), createMockPacket("2"), createMockPacket("3")]);

    const metrics = queue.getMetrics();
    expect(metrics.highWatermark).toBe(3);
    expect(metrics.totalPushed).toBe(3);

    queue.pop();
    queue.resetMetrics();

    const resetMetrics = queue.getMetrics();
    expect(resetMetrics.totalPushed).toBe(0);
    expect(resetMetrics.totalPopped).toBe(0);
    expect(resetMetrics.highWatermark).toBe(2);
  });

  it("resizes capacity dynamically and trims excess", () => {
    const queue = new PacketQueue({ capacity: 5 });
    queue.pushBatch([
      createMockPacket("1"),
      createMockPacket("2"),
      createMockPacket("3"),
      createMockPacket("4"),
    ]);

    queue.setCapacity(2);
    expect(queue.capacity).toBe(2);
    expect(queue.size).toBe(2);

    const remaining = queue.drainAll();
    expect(remaining.map((p) => p.id)).toEqual(["3", "4"]);
  });
});
