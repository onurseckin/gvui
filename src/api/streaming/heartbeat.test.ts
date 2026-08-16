import { describe, expect, it } from "bun:test";
import { HeartbeatMonitor } from "./heartbeat";
import type { HeartbeatPayload } from "./types";

describe("HeartbeatMonitor", () => {
  it("starts periodic pings and emits payload to sender", async () => {
    const sentPings: HeartbeatPayload[] = [];
    const monitor = new HeartbeatMonitor({
      intervalMs: 50,
      timeoutMs: 30,
    });

    monitor.start((payload) => {
      sentPings.push(payload);
    });

    // 1st ping emitted immediately
    expect(sentPings.length).toBe(1);
    expect(sentPings[0].sequence).toBe(1);
    expect(sentPings[0].clientTimestamp).toBeGreaterThan(0);

    // Wait for 2nd ping
    await new Promise((r) => setTimeout(r, 65));
    expect(sentPings.length).toBeGreaterThanOrEqual(2);

    monitor.stop();
  });

  it("calculates RTT latency and updates rolling average on pong", async () => {
    const monitor = new HeartbeatMonitor({ intervalMs: 200, timeoutMs: 100 });
    let emittedAvg = 0;

    monitor.onLatency((_rtt, avg) => {
      emittedAvg = avg;
    });

    const now = Date.now();
    monitor.start(() => {});

    monitor.recordPong({ clientTimestamp: now - 30, sequence: 1 });
    expect(monitor.currentLatencyMs).toBeGreaterThanOrEqual(25);
    expect(emittedAvg).toBeGreaterThanOrEqual(25);

    monitor.recordPong({ clientTimestamp: now - 10, sequence: 2 });
    expect(monitor.currentAverageLatencyMs).toBeGreaterThan(0);

    monitor.stop();
  });

  it("triggers health degradation when missed heartbeats exceed threshold", async () => {
    let healthStatus = true;
    let missedCountEmitted = 0;

    const monitor = new HeartbeatMonitor({
      intervalMs: 25,
      timeoutMs: 15,
      maxMissedHeartbeats: 2,
    });

    monitor.onHealthChange((healthy) => {
      healthStatus = healthy;
    });

    monitor.onMissedThresholdReached((count) => {
      missedCountEmitted = count;
    });

    monitor.start(() => {
      // Intentionally do NOT reply with pong
    });

    // Wait enough time for 2 timeouts
    await new Promise((r) => setTimeout(r, 80));

    expect(monitor.missedCount).toBeGreaterThanOrEqual(2);
    expect(healthStatus).toBe(false);
    expect(missedCountEmitted).toBeGreaterThanOrEqual(2);
    expect(monitor.isHealthy).toBe(false);

    // Replying with a pong restores health
    monitor.recordPong({ clientTimestamp: Date.now() - 5, sequence: 1 });
    expect(monitor.isHealthy).toBe(true);
    expect(monitor.missedCount).toBe(0);

    monitor.stop();
  });

  it("includes custom metadata from pingPayloadBuilder", () => {
    let lastPayload: HeartbeatPayload | null = null;

    const monitor = new HeartbeatMonitor({
      intervalMs: 50,
      pingPayloadBuilder: () => ({ clientId: "agent-01", build: "v2.0" }),
    });

    monitor.start((payload) => {
      lastPayload = payload;
    });

    expect(lastPayload).not.toBeNull();
    expect((lastPayload as unknown as { clientId: string }).clientId).toBe("agent-01");
    expect((lastPayload as unknown as { build: string }).build).toBe("v2.0");

    monitor.stop();
  });
});
