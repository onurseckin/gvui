import { describe, expect, it } from "bun:test";
import { TelemetryManager } from "./telemetryManager";
import type { AnomalyAlertPayload, NodeStatusPayload, TelemetryPacket } from "./types";

describe("TelemetryManager", () => {
  it("routes packets to topic, type, node, and anomaly subscribers", async () => {
    const manager = new TelemetryManager();
    await manager.connectMock({ emissionIntervalMs: 500, autoStart: false });

    let typeMatchCount = 0;
    let topicMatchCount = 0;
    let nodeMatchCount = 0;
    let anomalyAlert: AnomalyAlertPayload | null = null;

    manager.onType("node_status", () => {
      typeMatchCount += 1;
    });

    manager.onTopic("telemetry/metrics", () => {
      topicMatchCount += 1;
    });

    manager.onNodeUpdate("node-target", (p: TelemetryPacket<NodeStatusPayload>) => {
      if (p.payload.nodeId === "node-target") {
        nodeMatchCount += 1;
      }
    });

    manager.onAnomaly((p: TelemetryPacket<AnomalyAlertPayload>) => {
      anomalyAlert = p.payload;
    });

    // Send node_status packet
    manager.send({
      id: "p1",
      type: "node_status",
      timestamp: Date.now(),
      nodeId: "node-target",
      payload: { nodeId: "node-target", status: "running" },
    });

    // Send topic packet
    manager.send({
      id: "p2",
      type: "metric_update",
      timestamp: Date.now(),
      topic: "telemetry/metrics",
      payload: { metricName: "cpu", value: 45 },
    });

    // Send anomaly packet
    manager.send({
      id: "p3",
      type: "anomaly_alert",
      timestamp: Date.now(),
      payload: {
        anomalyId: "anom-1",
        type: "stranded_lock",
        severity: "critical",
        description: "Deadlock detected",
      },
    });

    await new Promise((r) => setTimeout(r, 40));

    expect(typeMatchCount).toBe(1);
    expect(topicMatchCount).toBe(1);
    expect(nodeMatchCount).toBe(1);
    expect(anomalyAlert).not.toBeNull();
    expect((anomalyAlert as AnomalyAlertPayload | null)?.type).toBe("stranded_lock");

    manager.destroy();
  });

  it("handles transport switching seamlessly", async () => {
    const manager = new TelemetryManager();

    expect(manager.activeTransport).toBeNull();
    expect(manager.status).toBe("disconnected");

    await manager.connectMock({ autoStart: false });
    expect(manager.activeTransport).toBe("mock");
    expect(manager.status).toBe("connected");

    manager.disconnect();
    expect(manager.status).toBe("disconnected");

    manager.destroy();
  });
});
