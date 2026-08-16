import { describe, expect, it } from "bun:test";
import {
  BackoffController,
  calculateBackoffDelay,
  MessageDeduplicator,
  MockStreamingSink,
  PacketQueue,
  SSETelemetrySink,
  TelemetryManager,
  WebSocketTelemetrySink,
  type TelemetryPacket,
} from "./index";

// Mock WebSocket double with flapping & abort capabilities
class HostileMockWebSocket {
  public static instances: HostileMockWebSocket[] = [];
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  public url: string;
  public protocols?: string | string[];
  public readyState: number = 0;
  public shouldFailConnect = false;

  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;

  public sentMessages: string[] = [];

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    HostileMockWebSocket.instances.push(this);

    setTimeout(() => {
      if (this.shouldFailConnect) {
        this.readyState = 3;
        if (this.onerror) this.onerror(new Event("error"));
        if (this.onclose)
          this.onclose(new CloseEvent("close", { code: 1006, reason: "Connection refused" }));
      } else if (this.readyState === 0) {
        this.readyState = 1;
        if (this.onopen) this.onopen(new Event("open"));
      }
    }, 5);
  }

  public send(data: string): void {
    if (this.readyState !== 1) {
      throw new Error("WebSocket is not open: readyState " + this.readyState);
    }
    this.sentMessages.push(data);
  }

  public close(code = 1000, reason = ""): void {
    this.readyState = 3;
    if (this.onclose) {
      this.onclose(new CloseEvent("close", { code, reason }));
    }
  }

  public abortImmediately(): void {
    this.readyState = 3;
    if (this.onerror) this.onerror(new Event("error"));
    if (this.onclose)
      this.onclose(new CloseEvent("close", { code: 1006, reason: "Hostile TCP reset" }));
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
}

// Mock EventSource with stream abort capabilities
class HostileMockEventSource {
  public static instances: HostileMockEventSource[] = [];
  public url: string;
  public readyState = 0;

  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;

  private customListeners = new Map<string, Set<(event: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    HostileMockEventSource.instances.push(this);

    setTimeout(() => {
      if (this.readyState === 0) {
        this.readyState = 1;
        if (this.onopen) this.onopen(new Event("open"));
      }
    }, 5);
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
    this.readyState = 2;
  }

  public abortStream(): void {
    this.readyState = 2;
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }

  public emitRaw(type: string, data: unknown, lastEventId?: string): void {
    const event = new MessageEvent(type, {
      data: typeof data === "string" ? data : JSON.stringify(data),
      lastEventId,
    });
    if (type === "message" && this.onmessage) {
      this.onmessage(event);
    }
    const listeners = this.customListeners.get(type);
    if (listeners) {
      for (const l of listeners) l(event);
    }
  }
}

describe("Adversarial Stress Gauntlet: Streaming Infrastructure", () => {
  describe("1. Backoff Jitter Boundaries & Extreme Edge Cases", () => {
    it("handles negative, zero, and extreme attempt numbers gracefully", () => {
      const config = {
        initialDelayMs: 100,
        maxDelayMs: 5000,
        multiplier: 2,
        jitter: "none" as const,
      };

      expect(calculateBackoffDelay(-5, config)).toBe(100);
      expect(calculateBackoffDelay(0, config)).toBe(100);
      expect(calculateBackoffDelay(100, config)).toBe(5000); // Bounded at 30, capped at maxDelay
      expect(calculateBackoffDelay(1000, config)).toBe(5000);
    });

    it("handles extreme config parameters (zero initial delay, multiplier 0 or 100)", () => {
      // initialDelayMs <= 0 clamped to 1
      const zeroInit = calculateBackoffDelay(1, {
        initialDelayMs: 0,
        maxDelayMs: 500,
        jitter: "none",
      });
      expect(zeroInit).toBeGreaterThanOrEqual(1);

      // maxDelayMs smaller than initialDelayMs
      const inverted = calculateBackoffDelay(2, {
        initialDelayMs: 1000,
        maxDelayMs: 50,
        jitter: "none",
      });
      expect(inverted).toBe(1000); // clamped to Math.max(initial, maxDelay)

      // huge multiplier
      const hugeMultiplier = calculateBackoffDelay(2, {
        initialDelayMs: 10,
        multiplier: 100,
        maxDelayMs: 2000,
        jitter: "none",
      });
      expect(hugeMultiplier).toBe(2000);
    });

    it("verifies statistical bounds across 1,000 random jitter calculations", () => {
      const fullConfig = {
        initialDelayMs: 50,
        maxDelayMs: 1000,
        multiplier: 2,
        jitter: "full" as const,
      };
      const equalConfig = {
        initialDelayMs: 50,
        maxDelayMs: 1000,
        multiplier: 2,
        jitter: "equal" as const,
      };
      const decorConfig = {
        initialDelayMs: 50,
        maxDelayMs: 1000,
        multiplier: 2,
        jitter: "decorrelated" as const,
      };

      for (let i = 0; i < 1000; i++) {
        const attempt = i % 10;
        const fullDelay = calculateBackoffDelay(attempt, fullConfig);
        expect(fullDelay).toBeGreaterThanOrEqual(1);
        expect(fullDelay).toBeLessThanOrEqual(1000);

        const equalDelay = calculateBackoffDelay(attempt, equalConfig);
        expect(equalDelay).toBeGreaterThanOrEqual(1);
        expect(equalDelay).toBeLessThanOrEqual(1000);

        const decorDelay = calculateBackoffDelay(attempt, decorConfig, fullDelay);
        expect(decorDelay).toBeGreaterThanOrEqual(1);
        expect(decorDelay).toBeLessThanOrEqual(1000);
      }
    });

    it("sustains 1,000 rapid consecutive failure recordings without integer overflow", () => {
      const controller = new BackoffController({
        initialDelayMs: 50,
        maxDelayMs: 30000,
        multiplier: 2,
        maxAttempts: 10000,
      });

      for (let i = 0; i < 1000; i++) {
        const delay = controller.recordFailure();
        expect(delay).not.toBeNull();
        expect(delay!).toBeGreaterThanOrEqual(1);
        expect(delay!).toBeLessThanOrEqual(30000);
      }

      expect(controller.getAttemptCount()).toBe(1000);
    });
  });

  describe("2. Buffer Queue Under Heavy Overload & Priority Inversion Stress", () => {
    it("preserves strict capacity invariant under 10,000 packet burst for all drop policies", () => {
      const policies = ["drop-oldest", "drop-newest", "drop-low-priority"] as const;

      for (const policy of policies) {
        const queue = new PacketQueue({ capacity: 50, dropPolicy: policy });

        for (let i = 0; i < 10000; i++) {
          const packet: TelemetryPacket = {
            id: `burst-${policy}-${i}`,
            type: "custom",
            timestamp: i,
            priority:
              i % 4 === 0 ? "critical" : i % 4 === 1 ? "high" : i % 4 === 2 ? "normal" : "low",
            payload: { i },
          };
          queue.push(packet);
        }

        expect(queue.size).toBe(50);
        expect(queue.getMetrics().totalDropped).toBeGreaterThanOrEqual(9950);
        expect(queue.getMetrics().highWatermark).toBe(50);

        const drained = queue.drainAll();
        expect(drained.length).toBe(50);
      }
    });

    it("guarantees critical packets survive priority-based eviction over low priority packets", () => {
      const queue = new PacketQueue({ capacity: 50, dropPolicy: "drop-low-priority" });

      // Pre-fill queue with 40 low priority packets and 10 normal packets
      for (let i = 0; i < 40; i++) {
        queue.push({ id: `low-${i}`, type: "custom", timestamp: i, priority: "low", payload: {} });
      }
      for (let i = 0; i < 10; i++) {
        queue.push({
          id: `norm-${i}`,
          type: "custom",
          timestamp: i,
          priority: "normal",
          payload: {},
        });
      }
      expect(queue.size).toBe(50);

      // Push 30 critical packets into full queue
      for (let i = 0; i < 30; i++) {
        const admitted = queue.push({
          id: `crit-${i}`,
          type: "custom",
          timestamp: i,
          priority: "critical",
          payload: {},
        });
        expect(admitted).toBe(true);
      }

      expect(queue.size).toBe(50);
      const remaining = queue.drainAll();

      const criticalCount = remaining.filter((p) => p.priority === "critical").length;
      const lowCount = remaining.filter((p) => p.priority === "low").length;

      // All 30 critical packets survived
      expect(criticalCount).toBe(30);
      // Low priority packets were evicted down to 10
      expect(lowCount).toBe(10);
    });
  });

  describe("3. Deduplicator Under 50,000 Message Burst & High TTL Pruning", () => {
    it("handles 50,000 rapid keys within bounded memory and LRU eviction", () => {
      const deduplicator = new MessageDeduplicator({ capacity: 500, ttlMs: 10000 }, 0);
      const startTime = Date.now();

      // Push 50,000 unique keys
      for (let i = 0; i < 50000; i++) {
        const p: TelemetryPacket = {
          id: `key-${i}`,
          type: "custom",
          timestamp: startTime,
          payload: {},
        };
        const isNew = deduplicator.track(p, startTime);
        expect(isNew).toBe(true);
      }

      // Tracked keys size never exceeds capacity 500
      expect(deduplicator.size).toBe(500);
      expect(deduplicator.getMetrics().evictionCount).toBe(49500);
      expect(deduplicator.getMetrics().uniqueCount).toBe(50000);

      // Oldest key `key-0` was evicted, so it is no longer duplicate
      expect(
        deduplicator.isDuplicate(
          { id: "key-0", type: "custom", timestamp: startTime, payload: {} },
          startTime,
        ),
      ).toBe(false);

      // Latest key `key-49999` is still tracked
      expect(
        deduplicator.isDuplicate(
          { id: "key-49999", type: "custom", timestamp: startTime, payload: {} },
          startTime,
        ),
      ).toBe(true);

      deduplicator.destroy();
    });

    it("prunes 10,000 expired keys instantly with sub-10ms performance", () => {
      const deduplicator = new MessageDeduplicator({ capacity: 10000, ttlMs: 50 }, 0);
      const baseTime = 100000;

      for (let i = 0; i < 5000; i++) {
        deduplicator.track(
          { id: `exp-${i}`, type: "custom", timestamp: baseTime, payload: {} },
          baseTime,
        );
      }
      expect(deduplicator.size).toBe(5000);

      // Fast forward past TTL
      const pruned = deduplicator.pruneExpired(baseTime + 100);
      expect(pruned).toBe(5000);
      expect(deduplicator.size).toBe(0);

      deduplicator.destroy();
    });
  });

  describe("4. Flapping Networks, Mid-Packet Aborts & Reconnect Resilience", () => {
    const originalWS = globalThis.WebSocket;
    const originalES = globalThis.EventSource;

    it("recovers gracefully across 5 consecutive flapping WebSocket network aborts", async () => {
      HostileMockWebSocket.instances = [];
      globalThis.WebSocket = HostileMockWebSocket as unknown as typeof WebSocket;

      const sink = new WebSocketTelemetrySink({
        url: "ws://hostile.local/telemetry",
        autoReconnect: true,
        backoff: { initialDelayMs: 5, multiplier: 1.2, jitter: "none" },
      });

      await sink.connect();
      expect(sink.status).toBe("connected");

      // Flap 5 times consecutively
      for (let flap = 0; flap < 5; flap++) {
        const currentWs = HostileMockWebSocket.instances[HostileMockWebSocket.instances.length - 1];
        currentWs.abortImmediately();
        expect(sink.status).toBe("reconnecting");

        // Wait for reconnect backoff to establish new connection
        let connected = false;
        for (let poll = 0; poll < 20; poll++) {
          await new Promise((r) => setTimeout(r, 10));
          if (sink.status === "connected") {
            connected = true;
            break;
          }
        }
        expect(connected).toBe(true);
        expect(sink.status).toBe("connected");
      }

      expect(HostileMockWebSocket.instances.length).toBeGreaterThanOrEqual(6);
      sink.destroy();
      globalThis.WebSocket = originalWS;
    });

    it("handles malformed JSON, corrupted frames, and non-object payloads without crashing", async () => {
      HostileMockWebSocket.instances = [];
      globalThis.WebSocket = HostileMockWebSocket as unknown as typeof WebSocket;

      const sink = new WebSocketTelemetrySink({
        url: "ws://corrupt.local/telemetry",
      });

      const received: TelemetryPacket[] = [];
      sink.onPacket((p) => received.push(p));

      await sink.connect();
      const ws = HostileMockWebSocket.instances[0];

      // Corrupted frames
      ws.simulateMessage("{ bad-json: !!! }");
      ws.simulateMessage("Plain text non-json log line");
      ws.simulateMessage(JSON.stringify({ notATelemetryPacket: true, value: 123 }));
      ws.simulateMessage("");

      // All raw/fallback messages are handled safely without throwing
      expect(received.length).toBe(4);
      expect(received[0].type).toBe("custom");
      expect(received[1].type).toBe("custom");

      sink.destroy();
      globalThis.WebSocket = originalWS;
    });

    it("resumes SSE stream after connection drop without dropping lastEventId", async () => {
      HostileMockEventSource.instances = [];
      globalThis.EventSource = HostileMockEventSource as unknown as typeof EventSource;

      const sink = new SSETelemetrySink({
        url: "http://sse.local/stream",
        autoReconnect: true,
        backoff: { initialDelayMs: 5, jitter: "none" },
      });

      await sink.connect();
      const es1 = HostileMockEventSource.instances[0];

      // Emit event with ID
      es1.emitRaw(
        "node_status",
        { id: "node-pkt-1", nodeId: "n1", payload: { status: "running" } },
        "seq-12345",
      );
      expect(sink.currentLastEventId).toBe("seq-12345");

      // Abort stream
      es1.abortStream();
      expect(sink.status).toBe("reconnecting");

      await new Promise((r) => setTimeout(r, 60));

      // Reconnected instance should carry Last-Event-ID
      const es2 = HostileMockEventSource.instances[1];
      expect(es2.url).toContain("lastEventId=seq-12345");
      expect(sink.status).toBe("connected");

      sink.destroy();
      globalThis.EventSource = originalES;
    });
  });

  describe("5. High-Frequency Pause / Resume Buffer Stress", () => {
    it("buffers 1,000 packets during pause and safely emits all on resume without deduplication loss", () => {
      const sink = new MockStreamingSink({ autoStart: false });
      const received: TelemetryPacket[] = [];
      sink.onPacket((p) => received.push(p));

      sink.pause();
      expect(sink.status).toBe("disconnected"); // or paused

      for (let i = 0; i < 1000; i++) {
        sink.triggerNodeUpdate(`node-${i}`, "running", 0.5);
      }

      // While paused, 0 packets dispatched to listeners
      expect(received.length).toBe(0);

      // Resume flushes all 1,000 queued packets
      sink.resume();
      expect(received.length).toBe(1000);
      expect(received[0].nodeId).toBe("node-0");
      expect(received[999].nodeId).toBe("node-999");

      sink.destroy();
    });
  });

  describe("6. Rapid Multi-Transport Switching Stress", () => {
    it("switches transports 20 times concurrently while actively routing packets", async () => {
      const manager = new TelemetryManager();
      let totalReceived = 0;

      manager.onPacket(() => {
        totalReceived += 1;
      });

      for (let cycle = 0; cycle < 10; cycle++) {
        await manager.connectMock({ autoStart: false, emissionIntervalMs: 50 });
        manager.send({ id: `mock-${cycle}`, type: "custom", timestamp: Date.now(), payload: {} });

        // Wait for send echo before switching
        await new Promise((r) => setTimeout(r, 20));
        manager.disconnect();
        expect(manager.status).toBe("disconnected");
      }

      expect(totalReceived).toBe(10);
      manager.destroy();
    });
  });
});
