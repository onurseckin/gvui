import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { SSETelemetrySink } from "./sseSink";
import type { TelemetryPacket } from "./types";

// Mock EventSource implementation for test verification
class MockEventSource {
  public static instances: MockEventSource[] = [];
  public url: string;
  public withCredentials = false;
  public readyState = 0; // CONNECTING

  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;

  private customListeners = new Map<string, Set<(event: MessageEvent) => void>>();

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    MockEventSource.instances.push(this);

    setTimeout(() => {
      if (this.readyState === 0) {
        this.readyState = 1; // OPEN
        if (this.onopen) {
          this.onopen(new Event("open"));
        }
      }
    }, 10);
  }

  public addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    let set = this.customListeners.get(type);
    if (!set) {
      set = new Set();
      this.customListeners.set(type, set);
    }
    set.add(listener);
  }

  public removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.customListeners.get(type)?.delete(listener);
  }

  public close(): void {
    this.readyState = 2; // CLOSED
  }

  public simulateEvent(type: string, data: unknown, lastEventId?: string): void {
    const event = new MessageEvent(type, {
      data: typeof data === "string" ? data : JSON.stringify(data),
      lastEventId,
    });

    if (type === "message" && this.onmessage) {
      this.onmessage(event);
    }

    const listeners = this.customListeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }
  }

  public simulateError(): void {
    this.readyState = 2;
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }
}

describe("SSETelemetrySink", () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    MockEventSource.instances = [];
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
  });

  it("connects to SSE endpoint and establishes connection", async () => {
    const sink = new SSETelemetrySink({
      url: "http://localhost:8080/events",
      autoReconnect: false,
    });

    expect(sink.status).toBe("disconnected");

    const connectPromise = sink.connect();
    expect(sink.status).toBe("connecting");

    await connectPromise;
    expect(sink.status).toBe("connected");
    expect(MockEventSource.instances.length).toBe(1);

    sink.destroy();
  });

  it("receives and parses standard and custom typed SSE events", async () => {
    const sink = new SSETelemetrySink({
      url: "http://localhost:8080/events",
    });

    await sink.connect();
    const es = MockEventSource.instances[0];

    const received: TelemetryPacket[] = [];
    sink.onPacket((p) => received.push(p));

    // Emit standard message
    es.simulateEvent("message", {
      id: "sse-1",
      type: "metric_update",
      timestamp: Date.now(),
      payload: { val: 42 },
    });
    expect(received.length).toBe(1);
    expect(received[0].id).toBe("sse-1");

    // Emit custom event type "node_status" with lastEventId
    es.simulateEvent(
      "node_status",
      { id: "sse-2", type: "node_status", nodeId: "n1", payload: { status: "success" } },
      "evt-seq-999",
    );
    expect(received.length).toBe(2);
    expect(received[1].id).toBe("sse-2");
    expect(sink.currentLastEventId).toBe("evt-seq-999");

    sink.destroy();
  });

  it("appends Last-Event-ID and topics to URL on reconnect", async () => {
    const sink = new SSETelemetrySink({
      url: "http://localhost:8080/events",
      lastEventId: "initial-id-1",
      autoReconnect: true,
      backoff: { initialDelayMs: 10, jitter: "none" },
    });

    sink.subscribe("graph-telemetry");

    await sink.connect();
    const es1 = MockEventSource.instances[0];
    expect(es1.url).toContain("lastEventId=initial-id-1");
    expect(es1.url).toContain("topics=graph-telemetry");

    // Simulate disconnect error
    es1.simulateError();
    expect(sink.status).toBe("reconnecting");

    await new Promise((r) => setTimeout(r, 100));

    expect(MockEventSource.instances.length).toBe(2);
    expect(sink.status).toBe("connected");

    sink.destroy();
  });

  it("buffers incoming packets when paused and flushes upon resume", async () => {
    const sink = new SSETelemetrySink({
      url: "http://localhost:8080/events",
    });

    await sink.connect();
    const es = MockEventSource.instances[0];

    const received: TelemetryPacket[] = [];
    sink.onPacket((p) => received.push(p));

    sink.pause();
    expect(sink.status).toBe("paused");

    es.simulateEvent("message", { id: "paused-sse", type: "custom", payload: "ok" });
    expect(received.length).toBe(0);

    sink.resume();
    expect(sink.status).toBe("connected");
    expect(received.length).toBe(1);
    expect(received[0].id).toBe("paused-sse");

    sink.destroy();
  });
});
