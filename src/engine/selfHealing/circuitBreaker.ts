/**
 * Tri-State Circuit Breaker & Circuit Breaker Manager
 * 100% Zero-Any Strict TypeScript
 */

import type { CircuitBreakerInfo, CircuitBreakerState } from "./types";

export class CircuitBreakerOpenError extends Error {
  public readonly breakerId: string;
  public readonly resetTimeoutMs: number;
  public readonly lastTrippedAt: number;

  constructor(breakerId: string, resetTimeoutMs: number, lastTrippedAt: number) {
    super(`Circuit breaker "${breakerId}" is OPEN. Requests are blocked.`);
    this.name = "CircuitBreakerOpenError";
    this.breakerId = breakerId;
    this.resetTimeoutMs = resetTimeoutMs;
    this.lastTrippedAt = lastTrippedAt;
  }
}

export interface CircuitBreakerOptions {
  id: string;
  failureThreshold?: number;
  resetTimeoutMs?: number;
  halfOpenSuccessThreshold?: number;
  onStateChange?: (
    from: CircuitBreakerState,
    to: CircuitBreakerState,
    breaker: CircuitBreaker,
  ) => void;
}

export type CircuitBreakerStateChangeListener = (
  from: CircuitBreakerState,
  to: CircuitBreakerState,
  breaker: CircuitBreaker,
) => void;

export class CircuitBreaker {
  public readonly id: string;
  public readonly failureThreshold: number;
  public readonly resetTimeoutMs: number;
  public readonly halfOpenSuccessThreshold: number;

  private state: CircuitBreakerState = "CLOSED";
  private failureCount: number = 0;
  private successCount: number = 0;
  private consecutiveSuccesses: number = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private lastTrippedAt?: number;
  private lastStateChange: number;
  private halfOpenTrials: number = 0;

  private listeners: Set<CircuitBreakerStateChangeListener> = new Set();

  constructor(options: CircuitBreakerOptions) {
    this.id = options.id;
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 5);
    this.resetTimeoutMs = Math.max(1, options.resetTimeoutMs ?? 10000);
    this.halfOpenSuccessThreshold = Math.max(1, options.halfOpenSuccessThreshold ?? 2);
    this.lastStateChange = Date.now();

    if (options.onStateChange) {
      this.listeners.add(options.onStateChange);
    }
  }

  public getState(): CircuitBreakerState {
    this.checkTimeoutTransition();
    return this.state;
  }

  public canExecute(): boolean {
    this.checkTimeoutTransition();

    if (this.state === "CLOSED" || this.state === "HALF_OPEN") {
      return true;
    }

    // state === "OPEN"
    return false;
  }

  public recordSuccess(): void {
    this.lastSuccessTime = Date.now();
    this.successCount += 1;

    if (this.state === "HALF_OPEN") {
      this.consecutiveSuccesses += 1;
      if (this.consecutiveSuccesses >= this.halfOpenSuccessThreshold) {
        this.transitionTo("CLOSED");
        this.failureCount = 0;
        this.consecutiveSuccesses = 0;
        this.halfOpenTrials = 0;
      }
    } else if (this.state === "CLOSED") {
      // In closed state, consecutive successes keep failure count suppressed
      this.failureCount = 0;
    }
  }

  public recordFailure(_error?: unknown): void {
    this.lastFailureTime = Date.now();
    this.failureCount += 1;

    if (this.state === "CLOSED") {
      if (this.failureCount >= this.failureThreshold) {
        this.trip();
      }
    } else if (this.state === "HALF_OPEN") {
      // Any failure in half-open trips back immediately
      this.trip();
    }
  }

  public trip(reason?: string): void {
    this.lastTrippedAt = Date.now();
    this.consecutiveSuccesses = 0;
    this.halfOpenTrials = 0;
    if (this.state !== "OPEN") {
      this.transitionTo("OPEN");
    }
    if (reason) {
      // reason noted internally
    }
  }

  public reset(): void {
    this.failureCount = 0;
    this.consecutiveSuccesses = 0;
    this.halfOpenTrials = 0;
    this.lastTrippedAt = undefined;
    if (this.state !== "CLOSED") {
      this.transitionTo("CLOSED");
    }
  }

  public async execute<T>(
    fn: () => Promise<T> | T,
    fallback?: (error?: Error) => Promise<T> | T,
  ): Promise<T> {
    if (!this.canExecute()) {
      const openErr = new CircuitBreakerOpenError(
        this.id,
        this.resetTimeoutMs,
        this.lastTrippedAt ?? Date.now(),
      );
      if (fallback) {
        return await fallback(openErr);
      }
      throw openErr;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err: unknown) {
      this.recordFailure(err);
      const castError = err instanceof Error ? err : new Error(String(err));
      if (fallback) {
        return await fallback(castError);
      }
      throw castError;
    }
  }

  public getInfo(): CircuitBreakerInfo {
    this.checkTimeoutTransition();
    return {
      id: this.id,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      lastTrippedAt: this.lastTrippedAt,
      lastStateChange: this.lastStateChange,
      halfOpenTrials: this.halfOpenTrials,
    };
  }

  public on(event: "stateChange", listener: CircuitBreakerStateChangeListener): () => void {
    if (event === "stateChange") {
      this.listeners.add(listener);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  public off(event: "stateChange", listener: CircuitBreakerStateChangeListener): void {
    if (event === "stateChange") {
      this.listeners.delete(listener);
    }
  }

  private checkTimeoutTransition(): void {
    if (this.state === "OPEN" && this.lastTrippedAt !== undefined) {
      const elapsed = Date.now() - this.lastTrippedAt;
      if (elapsed >= this.resetTimeoutMs) {
        this.halfOpenTrials = 0;
        this.consecutiveSuccesses = 0;
        this.transitionTo("HALF_OPEN");
      }
    }
  }

  private transitionTo(nextState: CircuitBreakerState): void {
    const prevState = this.state;
    if (prevState === nextState) return;

    this.state = nextState;
    this.lastStateChange = Date.now();

    for (const listener of this.listeners) {
      try {
        listener(prevState, nextState, this);
      } catch {
        // Listener errors should not break breaker state transition
      }
    }
  }
}

export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private defaultOptions: Partial<CircuitBreakerOptions>;
  private globalListeners: Set<
    (id: string, from: CircuitBreakerState, to: CircuitBreakerState) => void
  > = new Set();

  constructor(defaultOptions?: Partial<CircuitBreakerOptions>) {
    this.defaultOptions = defaultOptions ?? {};
  }

  public getOrCreate(id: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    const existing = this.breakers.get(id);
    if (existing) {
      return existing;
    }

    const mergedOptions: CircuitBreakerOptions = {
      ...this.defaultOptions,
      ...options,
      id,
      onStateChange: (from, to, breaker) => {
        if (options?.onStateChange) {
          options.onStateChange(from, to, breaker);
        }
        for (const listener of this.globalListeners) {
          try {
            listener(id, from, to);
          } catch {
            // Suppress listener error
          }
        }
      },
    };

    const breaker = new CircuitBreaker(mergedOptions);
    this.breakers.set(id, breaker);
    return breaker;
  }

  public getBreaker(id: string): CircuitBreaker | undefined {
    return this.breakers.get(id);
  }

  public hasBreaker(id: string): boolean {
    return this.breakers.has(id);
  }

  public getAllBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.breakers);
  }

  public getAllInfos(): Record<string, CircuitBreakerInfo> {
    const result: Record<string, CircuitBreakerInfo> = {};
    for (const [id, breaker] of this.breakers.entries()) {
      result[id] = breaker.getInfo();
    }
    return result;
  }

  public trip(id: string, reason?: string): void {
    const breaker = this.getOrCreate(id);
    breaker.trip(reason);
  }

  public reset(id: string): void {
    const breaker = this.breakers.get(id);
    if (breaker) {
      breaker.reset();
    }
  }

  public resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  public async execute<T>(
    id: string,
    fn: () => Promise<T> | T,
    fallback?: (error?: Error) => Promise<T> | T,
  ): Promise<T> {
    const breaker = this.getOrCreate(id);
    return breaker.execute(fn, fallback);
  }

  public onStateChange(
    listener: (id: string, from: CircuitBreakerState, to: CircuitBreakerState) => void,
  ): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  public clear(): void {
    this.breakers.clear();
    this.globalListeners.clear();
  }
}
