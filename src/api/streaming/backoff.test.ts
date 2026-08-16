import { describe, expect, it } from "bun:test";
import { BackoffController, calculateBackoffDelay } from "./backoff";

describe("Backoff & Reconnect Engine", () => {
  describe("calculateBackoffDelay", () => {
    it("computes deterministic delay with jitter: none", () => {
      const config = {
        initialDelayMs: 100,
        multiplier: 2,
        maxDelayMs: 1000,
        jitter: "none" as const,
      };

      expect(calculateBackoffDelay(0, config)).toBe(100);
      expect(calculateBackoffDelay(1, config)).toBe(200);
      expect(calculateBackoffDelay(2, config)).toBe(400);
      expect(calculateBackoffDelay(3, config)).toBe(800);
      expect(calculateBackoffDelay(4, config)).toBe(1000); // capped at maxDelayMs
    });

    it("caps delay at maxDelayMs even for large attempt indices", () => {
      const config = {
        initialDelayMs: 500,
        multiplier: 2,
        maxDelayMs: 5000,
        jitter: "none" as const,
      };
      expect(calculateBackoffDelay(10, config)).toBe(5000);
      expect(calculateBackoffDelay(50, config)).toBe(5000);
    });

    it("produces delays within [0, rawDelay] for full jitter", () => {
      const config = {
        initialDelayMs: 200,
        multiplier: 2,
        maxDelayMs: 2000,
        jitter: "full" as const,
      };
      for (let i = 0; i < 20; i++) {
        const delay = calculateBackoffDelay(2, config);
        expect(delay).toBeGreaterThanOrEqual(1);
        expect(delay).toBeLessThanOrEqual(800);
      }
    });

    it("produces delays within [half, rawDelay] for equal jitter", () => {
      const config = {
        initialDelayMs: 200,
        multiplier: 2,
        maxDelayMs: 2000,
        jitter: "equal" as const,
      };
      for (let i = 0; i < 20; i++) {
        const delay = calculateBackoffDelay(2, config); // rawDelay = 800, half = 400
        expect(delay).toBeGreaterThanOrEqual(400);
        expect(delay).toBeLessThanOrEqual(800);
      }
    });

    it("supports decorrelated jitter within valid bounds", () => {
      const config = {
        initialDelayMs: 100,
        multiplier: 2,
        maxDelayMs: 1000,
        jitter: "decorrelated" as const,
      };
      const delay1 = calculateBackoffDelay(0, config, 100);
      expect(delay1).toBeGreaterThanOrEqual(100);
      expect(delay1).toBeLessThanOrEqual(1000);
    });
  });

  describe("BackoffController", () => {
    it("tracks attempt failures and computes increments", () => {
      const controller = new BackoffController({
        initialDelayMs: 50,
        multiplier: 2,
        maxDelayMs: 500,
        jitter: "none",
        maxAttempts: 3,
      });

      expect(controller.getAttemptCount()).toBe(0);
      expect(controller.isMaxAttemptsReached()).toBe(false);

      const delay1 = controller.recordFailure();
      expect(delay1).toBe(50);
      expect(controller.getAttemptCount()).toBe(1);

      const delay2 = controller.recordFailure();
      expect(delay2).toBe(100);
      expect(controller.getAttemptCount()).toBe(2);

      const delay3 = controller.recordFailure();
      expect(delay3).toBe(200);
      expect(controller.getAttemptCount()).toBe(3);
      expect(controller.isMaxAttemptsReached()).toBe(true);

      const delay4 = controller.recordFailure();
      expect(delay4).toBeNull();
    });

    it("resets state immediately on reset()", () => {
      const controller = new BackoffController({ initialDelayMs: 100, jitter: "none" });
      controller.recordFailure();
      controller.recordFailure();
      expect(controller.getAttemptCount()).toBe(2);

      controller.reset();
      expect(controller.getAttemptCount()).toBe(0);
      expect(controller.getNextDelayMs()).toBeNull();
    });

    it("executes scheduled retry callback successfully", async () => {
      const controller = new BackoffController({
        initialDelayMs: 10,
        multiplier: 2,
        jitter: "none",
        maxAttempts: 5,
      });

      let executed = false;
      const result = await controller.scheduleRetry(() => {
        executed = true;
      });

      expect(executed).toBe(true);
      expect(result.attempt).toBe(1);
      expect(result.delayMs).toBe(10);
    });

    it("rejects scheduled retry if cancelled", async () => {
      const controller = new BackoffController({
        initialDelayMs: 100,
        jitter: "none",
      });

      const promise = controller.scheduleRetry(() => {});
      controller.cancel();

      await expect(promise).rejects.toThrow("cancelled");
    });

    it("rejects scheduled retry if max attempts are exceeded", async () => {
      const controller = new BackoffController({
        initialDelayMs: 10,
        maxAttempts: 1,
        jitter: "none",
      });

      // 1st attempt
      await controller.scheduleRetry(() => {});

      // 2nd attempt should reject immediately
      await expect(controller.scheduleRetry(() => {})).rejects.toThrow("exceeded");
    });

    it("resets attempts after resetTimeoutMs on recordSuccess()", async () => {
      const controller = new BackoffController({
        initialDelayMs: 20,
        jitter: "none",
        resetTimeoutMs: 50,
      });

      controller.recordFailure();
      expect(controller.getAttemptCount()).toBe(1);

      controller.recordSuccess();
      // Should not be reset immediately
      expect(controller.getAttemptCount()).toBe(1);

      await new Promise((r) => setTimeout(r, 70));
      // Should be reset after timeout
      expect(controller.getAttemptCount()).toBe(0);
    });
  });
});
