/**
 * Exponential Backoff Reconnect Engine with Jitter
 * 100% Zero-Any strict TypeScript.
 */

import { unrefTimer, type BackoffConfig, type JitterStrategy } from "./types";

export const DEFAULT_BACKOFF_CONFIG: Readonly<BackoffConfig> = Object.freeze({
  initialDelayMs: 500,
  maxDelayMs: 30000,
  multiplier: 2,
  jitter: "full",
  maxAttempts: Infinity,
  resetTimeoutMs: 5000,
});

/**
 * Calculates the next backoff delay given an attempt index and configuration.
 */
export function calculateBackoffDelay(
  attempt: number,
  config: Partial<BackoffConfig> = {},
  lastDelayMs?: number,
): number {
  const initial = Math.max(1, config.initialDelayMs ?? DEFAULT_BACKOFF_CONFIG.initialDelayMs);
  const maxDelay = Math.max(initial, config.maxDelayMs ?? DEFAULT_BACKOFF_CONFIG.maxDelayMs);
  const multiplier = Math.max(1, config.multiplier ?? DEFAULT_BACKOFF_CONFIG.multiplier);
  const jitter: JitterStrategy = config.jitter ?? DEFAULT_BACKOFF_CONFIG.jitter;

  const boundedAttempt = Math.max(0, Math.min(attempt, 30));
  const rawDelay = Math.min(maxDelay, initial * Math.pow(multiplier, boundedAttempt));

  let finalDelay: number;

  switch (jitter) {
    case "none":
      finalDelay = rawDelay;
      break;

    case "equal": {
      const half = rawDelay / 2;
      finalDelay = half + Math.random() * half;
      break;
    }

    case "decorrelated": {
      const previous = lastDelayMs !== undefined && lastDelayMs > 0 ? lastDelayMs : initial;
      const lower = initial;
      const upper = Math.min(maxDelay, Math.max(initial, previous * 3));
      finalDelay = lower + Math.random() * (upper - lower);
      break;
    }

    case "full":
    default:
      finalDelay = Math.random() * rawDelay;
      break;
  }

  return Math.min(maxDelay, Math.max(1, Math.round(finalDelay)));
}

export interface RetryExecutionResult {
  attempt: number;
  delayMs: number;
}

export class BackoffController {
  private config: BackoffConfig;
  private attempts = 0;
  private lastDelayMs = 0;
  private nextDelayMs: number | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private resetTimerId: ReturnType<typeof setTimeout> | null = null;
  private pendingReject: ((error: Error) => void) | null = null;
  private cancelled = false;

  constructor(config?: Partial<BackoffConfig>) {
    this.config = { ...DEFAULT_BACKOFF_CONFIG, ...config };
  }

  public updateConfig(updates: Partial<BackoffConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  public getConfig(): Readonly<BackoffConfig> {
    return this.config;
  }

  public getAttemptCount(): number {
    return this.attempts;
  }

  public getNextDelayMs(): number | null {
    return this.nextDelayMs;
  }

  public isMaxAttemptsReached(): boolean {
    return this.attempts >= this.config.maxAttempts;
  }

  public isPending(): boolean {
    return this.timerId !== null;
  }

  /**
   * Records a connection failure, computes the next delay and increments attempt count.
   * Returns null if max attempts reached.
   */
  public recordFailure(): number | null {
    this.cancelResetTimer();
    this.cancelled = false;

    if (this.isMaxAttemptsReached()) {
      this.nextDelayMs = null;
      return null;
    }

    const delay = calculateBackoffDelay(this.attempts, this.config, this.lastDelayMs);
    this.lastDelayMs = delay;
    this.nextDelayMs = delay;
    this.attempts += 1;
    return delay;
  }

  /**
   * Records a successful connection.
   * If resetTimeoutMs is provided, postpones attempt reset until connection proves stable.
   */
  public recordSuccess(immediate = false): void {
    this.cancelTimer();
    this.nextDelayMs = null;

    if (immediate || !this.config.resetTimeoutMs || this.config.resetTimeoutMs <= 0) {
      this.reset();
      return;
    }

    this.cancelResetTimer();
    this.resetTimerId = setTimeout(() => {
      this.reset();
    }, this.config.resetTimeoutMs);
    unrefTimer(this.resetTimerId);
  }

  /**
   * Resets attempt count and clears state.
   */
  public reset(): void {
    this.cancelTimer();
    this.cancelResetTimer();
    this.attempts = 0;
    this.lastDelayMs = 0;
    this.nextDelayMs = null;
    this.cancelled = false;
  }

  /**
   * Cancels any scheduled retry and marks the controller cancelled.
   */
  public cancel(): void {
    this.cancelled = true;
    this.cancelTimer();
    this.cancelResetTimer();
    if (this.pendingReject) {
      const reject = this.pendingReject;
      this.pendingReject = null;
      reject(new Error("Reconnection attempt was cancelled."));
    }
  }

  /**
   * Schedules a retry callback according to current backoff state.
   */
  public scheduleRetry(fn: () => void | Promise<void>): Promise<RetryExecutionResult> {
    this.cancelTimer();
    this.cancelled = false;

    const delay = this.recordFailure();
    if (delay === null) {
      return Promise.reject(
        new Error(`Max reconnection attempts (${this.config.maxAttempts}) exceeded.`),
      );
    }

    const currentAttempt = this.attempts;

    return new Promise<RetryExecutionResult>((resolve, reject) => {
      this.pendingReject = reject;

      this.timerId = setTimeout(async () => {
        this.timerId = null;
        this.pendingReject = null;

        if (this.cancelled) {
          reject(new Error("Reconnection attempt was cancelled."));
          return;
        }

        try {
          await fn();
          resolve({ attempt: currentAttempt, delayMs: delay });
        } catch (err: unknown) {
          const errorInstance =
            err instanceof Error
              ? err
              : new Error(typeof err === "string" ? err : "Retry execution failed");
          reject(errorInstance);
        }
      }, delay);
      unrefTimer(this.timerId);
    });
  }

  private cancelTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private cancelResetTimer(): void {
    if (this.resetTimerId !== null) {
      clearTimeout(this.resetTimerId);
      this.resetTimerId = null;
    }
  }
}
