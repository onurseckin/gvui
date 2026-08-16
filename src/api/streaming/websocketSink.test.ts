import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { TelemetryPacket } from "./types";
import { WebSocketTelemetrySink } from "./websocketSink";

// WebSocket Test Double
class MockWebSocket {
  public static instances: MockWebSocket[] = [];
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public url: string;
  public protocols?: string | string[];
  public readyState: number = 0; // CONNECTING
  public binaryType: "blob" | "arraybuffer" = "blob";

  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;

  public sentMessages: string[] = [];

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);

    // Simulate async connection
    setTimeout(() => {
      if (this.readyState === 0) {
        this.readyState = 1; // OPEN
        if (this.onopen) {
          this.onopen(new Event("open"));
        }
      }
    }, 10);
  }

  public send(data: string): void {
    this.sentMessages.push(data);
  }

  public close(code = 1000, reason = ""): void {
    this.readyState = 3; // CLOSED
    if (this.onclose) {
      this.onclose(new CloseEvent("close", { code, reason }));
    }
  }

  public simulateMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage(
        new MessageEvent("message", {
          data: typeof data === "string" ? data : JSON.stringify(data),
        }),
      );
    }
  }

  public simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }
}

describe("WebSocketTelemetrySink", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it("connects and transitions status to connected", async () => {
    const sink = new WebSocketTelemetrySink({
      url: "ws://localhost:8080/telemetry",
      autoReconnect: false,
    });

    expect(sink.status).toBe("disconnected");

    const connectPromise = sink.connect();
    expect(sink.status).toBe("connecting");

    await connectPromise;
    expect(sink.status).toBe("connected");
    expect(MockWebSocket.instances.length).toBe(1);

    sink.destroy();
  });

  it("receives and parses telemetry packets, deduplicating incoming", async () => {
    const sink = new WebSocketTelemetrySink({
      url: "ws://localhost:8080/telemetry",
    });

    await sink.connect();
    const wsInstance = MockWebSocket.instances[0];

    const receivedPackets: TelemetryPacket[] = [];
    sink.onPacket((p) => {
      receivedPackets.push(p);
    });

    const packetA: TelemetryPacket = {
      id: "pkt-101",
      type: "node_status",
      timestamp: Date.now(),
      nodeId: "node-1",
      payload: { status: "running" },
    };

    // Emit packetA
    wsInstance.simulateMessage(packetA);
    expect(receivedPackets.length).toBe(1);
    expect(receivedPackets[0].id).toBe("pkt-101");
    expect(receivedPackets[0].nodeId).toBe("node-1");

    // Emit same packetA again (duplicate) -> should be deduplicated
    wsInstance.simulateMessage(packetA);
    expect(receivedPackets.length).toBe(1);

    // Emit packetB
    const packetB: TelemetryPacket = {
      id: "pkt-102",
      type: "metric_update",
      timestamp: Date.now(),
      payload: { value: 99 },
    };
    wsInstance.simulateMessage(packetB);
    expect(receivedPackets.length).toBe(2);

    sink.destroy();
  });

  it("buffers outgoing packets while offline and flushes upon connection", async () => {
    const sink = new WebSocketTelemetrySink({
      url: "ws://localhost:8080/telemetry",
    });

    const packetOffline: TelemetryPacket = {
      id: "out-1",
      type: "agent_event",
      timestamp: Date.now(),
      payload: { eventType: "start" },
    };

    // Send while disconnected
    const sent = sink.send(packetOffline);
    expect(sent).toBe(true); // queued into outgoing buffer

    await sink.connect();
    const wsInstance = MockWebSocket.instances[0];

    // Outgoing packet should have been flushed to WebSocket instance
    expect(wsInstance.sentMessages.length).toBeGreaterThanOrEqual(1);
    const sentParsed = wsInstance.sentMessages.map((s) => JSON.parse(s));
    expect(sentParsed.some((m) => m.id === "out-1")).toBe(true);

    sink.destroy();
  });

  it("handles topic subscriptions and re-subscribes upon reconnect", async () => {
    const sink = new WebSocketTelemetrySink({
      url: "ws://localhost:8080/telemetry",
    });

    sink.subscribe("graph/nodes");
    expect(sink.subscriptions).toContain("graph/nodes");

    await sink.connect();
    const ws1 = MockWebSocket.instances[0];

    // Verify subscribe message was sent
    const subMessages = ws1.sentMessages
      .map((s) => JSON.parse(s))
      .filter((m) => m.action === "subscribe");
    expect(subMessages.length).toBe(1);
    expect(subMessages[0].topic).toBe("graph/nodes");

    sink.unsubscribe("graph/nodes");
    expect(sink.subscriptions).not.toContain("graph/nodes");

    sink.destroy();
  });

  it("automatically reconnects with backoff when socket abruptly closes", async () => {
    const sink = new WebSocketTelemetrySink({
      url: "ws://localhost:8080/telemetry",
      autoReconnect: true,
      backoff: { initialDelayMs: 10, jitter: "none" },
    });

    await sink.connect();
    const ws1 = MockWebSocket.instances[0];

    // Simulate unexpected server disconnect
    ws1.close(1006, "Abnormal closure");
    expect(sink.status).toBe("reconnecting");

    // Wait for backoff retry to open new socket
    await new Promise((r) => setTimeout(r, 120));

    expect(MockWebSocket.instances.length).toBe(2);
    expect(sink.status).toBe("connected");

    sink.destroy();
  });

  it("pauses and resumes incoming message dispatch", async () => {
    const sink = new WebSocketTelemetrySink({
      url: "ws://localhost:8080/telemetry",
    });

    await sink.connect();
    const ws = MockWebSocket.instances[0];

    const dispatched: TelemetryPacket[] = [];
    sink.onPacket((p) => dispatched.push(p));

    sink.pause();
    expect(sink.status).toBe("paused");

    ws.simulateMessage({ id: "p-paused-1", type: "custom", timestamp: Date.now(), payload: {} });
    expect(dispatched.length).toBe(0); // Queued

    sink.resume();
    expect(sink.status).toBe("connected");
    expect(dispatched.length).toBe(1);
    expect(dispatched[0].id).toBe("p-paused-1");

    sink.destroy();
  });

  it("flushes micro-batches to batch listeners", async () => {
    const sink = new WebSocketTelemetrySink({
      url: "ws://localhost:8080/telemetry",
      maxBatchSize: 2,
      batchIntervalMs: 20,
    });

    await sink.connect();
    const ws = MockWebSocket.instances[0];

    const batches: TelemetryPacket[][] = [];
    sink.onBatch((b) => batches.push(b));

    ws.simulateMessage({ id: "b1", type: "custom", timestamp: Date.now(), payload: {} });
    ws.simulateMessage({ id: "b2", type: "custom", timestamp: Date.now(), payload: {} });

    // Reached maxBatchSize = 2 -> flushed immediately
    expect(batches.length).toBe(1);
    expect(batches[0].length).toBe(2);

    sink.destroy();
  });
});
