import { describe, expect, it } from "bun:test";
import { MockStreamingSink } from "./mockStreamingSink";
import type { TelemetryPacket } from "./types";

describe("MockStreamingSink", () => {
  it("connects, emits synthetic telemetry, and tracks throughput", async () => {
    const sink = new MockStreamingSink({
      emissionIntervalMs: 20,
      nodesCount: 3,
      agentsCount: 2,
    });

    const received: TelemetryPacket[] = [];
    sink.onPacket((p) => {
      received.push(p);
    });

    await sink.connect();
    expect(sink.status).toBe("connected");

    await new Promise((r) => setTimeout(r, 80));
    expect(received.length).toBeGreaterThanOrEqual(2);

    const metrics = sink.getMetrics();
    expect(metrics.protocol).toBe("mock");
    expect(metrics.throughput.totalPackets).toBeGreaterThan(0);

    sink.destroy();
  });

  it("manually triggers node updates and anomalies", async () => {
    const sink = new MockStreamingSink();
    await sink.connect();

    const received: TelemetryPacket[] = [];
    sink.onPacket((p) => received.push(p));

    const nodePkt = sink.triggerNodeUpdate("node-x", "running", 0.75);
    expect(nodePkt.nodeId).toBe("node-x");
    expect(received.some((p) => p.nodeId === "node-x")).toBe(true);

    const anomPkt = sink.triggerAnomaly("stranded_lock", "node-x", "Lock held for 120s");
    expect(anomPkt.type).toBe("anomaly_alert");
    expect(received.some((p) => p.type === "anomaly_alert")).toBe(true);

    const agentPkt = sink.triggerAgentEvent("worker-01", "tool_call", "Ran vitest");
    expect(agentPkt.agentId).toBe("worker-01");
    expect(received.some((p) => p.agentId === "worker-01")).toBe(true);

    sink.destroy();
  });

  it("handles pause and resume correctly", async () => {
    const sink = new MockStreamingSink({ emissionIntervalMs: 20 });
    await sink.connect();

    const received: TelemetryPacket[] = [];
    sink.onPacket((p) => received.push(p));

    sink.pause();
    expect(sink.status).toBe("paused");

    sink.triggerNodeUpdate("node-paused", "cached");
    expect(received.length).toBe(0);

    sink.resume();
    expect(sink.status).toBe("connected");
    expect(received.some((p) => p.nodeId === "node-paused")).toBe(true);

    sink.destroy();
  });
});
