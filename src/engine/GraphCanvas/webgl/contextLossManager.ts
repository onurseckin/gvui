import type { WebGLContextState } from "./types";

export interface ContextLossConfig {
  maxConsecutiveLosses: number;
  lossResetIntervalMs: number;
}

export type StateChangeListener = (state: WebGLContextState) => void;
export type ContextLossListener = () => void;
export type ContextRestoredListener = () => void;
export type FallbackListener = () => void;

export class WebGLContextLossManager {
  private canvas: HTMLCanvasElement | null = null;
  private state: WebGLContextState = "uninitialized";
  private lossCount: number = 0;
  private lastLossTime: number = 0;
  private config: ContextLossConfig;

  private stateChangeListeners: Set<StateChangeListener> = new Set();
  private contextLostListeners: Set<ContextLossListener> = new Set();
  private contextRestoredListeners: Set<ContextRestoredListener> = new Set();
  private fallbackListeners: Set<FallbackListener> = new Set();

  private boundHandleContextLost: (event: Event) => void;
  private boundHandleContextRestored: (event: Event) => void;

  constructor(config?: Partial<ContextLossConfig>) {
    this.config = {
      maxConsecutiveLosses: config?.maxConsecutiveLosses ?? 3,
      lossResetIntervalMs: config?.lossResetIntervalMs ?? 10000,
    };

    this.boundHandleContextLost = (event: Event): void => this.handleContextLost(event);
    this.boundHandleContextRestored = (event: Event): void => this.handleContextRestored(event);
  }

  public attach(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas) return;
    this.detach();

    this.canvas = canvas;
    this.canvas.addEventListener("webglcontextlost", this.boundHandleContextLost, false);
    this.canvas.addEventListener("webglcontextrestored", this.boundHandleContextRestored, false);
    this.setState("ready");
  }

  public detach(): void {
    if (this.canvas) {
      this.canvas.removeEventListener("webglcontextlost", this.boundHandleContextLost, false);
      this.canvas.removeEventListener(
        "webglcontextrestored",
        this.boundHandleContextRestored,
        false,
      );
      this.canvas = null;
    }
  }

  public getState(): WebGLContextState {
    return this.state;
  }

  public isLost(): boolean {
    return this.state === "lost" || this.state === "fallback";
  }

  public isFallback(): boolean {
    return this.state === "fallback";
  }

  public handleContextLost(event?: Event): void {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    const now = Date.now();
    if (now - this.lastLossTime > this.config.lossResetIntervalMs) {
      this.lossCount = 1;
    } else {
      this.lossCount++;
    }
    this.lastLossTime = now;

    console.warn(
      `[WebGLContextLossManager] WebGL context lost (loss count: ${this.lossCount}/${this.config.maxConsecutiveLosses})`,
    );

    if (this.lossCount >= this.config.maxConsecutiveLosses) {
      console.error(
        `[WebGLContextLossManager] Context lost ${this.lossCount} times consecutively. Triggering permanent Canvas 2D fallback.`,
      );
      this.triggerFallback();
      return;
    }

    this.setState("lost");
    for (const listener of this.contextLostListeners) {
      listener();
    }
  }

  public handleContextRestored(_event?: Event): void {
    if (this.state === "fallback") {
      console.warn(
        "[WebGLContextLossManager] Context restored but renderer is in permanent fallback mode.",
      );
      return;
    }

    console.info("[WebGLContextLossManager] WebGL context restored. Recreating resources...");
    this.setState("restoring");

    for (const listener of this.contextRestoredListeners) {
      listener();
    }

    this.setState("ready");
  }

  public triggerFallback(): void {
    this.setState("fallback");
    for (const listener of this.fallbackListeners) {
      listener();
    }
  }

  public reset(): void {
    this.lossCount = 0;
    this.lastLossTime = 0;
    this.setState("ready");
  }

  private setState(nextState: WebGLContextState): void {
    if (this.state === nextState) return;
    this.state = nextState;
    for (const listener of this.stateChangeListeners) {
      listener(nextState);
    }
  }

  // Event Subscription APIs
  public onStateChange(listener: StateChangeListener): () => void {
    this.stateChangeListeners.add(listener);
    return () => this.stateChangeListeners.delete(listener);
  }

  public onContextLost(listener: ContextLossListener): () => void {
    this.contextLostListeners.add(listener);
    return () => this.contextLostListeners.delete(listener);
  }

  public onContextRestored(listener: ContextRestoredListener): () => void {
    this.contextRestoredListeners.add(listener);
    return () => this.contextRestoredListeners.delete(listener);
  }

  public onFallbackTriggered(listener: FallbackListener): () => void {
    this.fallbackListeners.add(listener);
    return () => this.fallbackListeners.delete(listener);
  }

  // Simulation helpers for unit testing & recovery validation
  public simulateContextLost(): void {
    const syntheticEvent = {
      preventDefault: () => {},
    } as unknown as Event;
    this.handleContextLost(syntheticEvent);
  }

  public simulateContextRestored(): void {
    this.handleContextRestored();
  }

  public dispose(): void {
    this.detach();
    this.stateChangeListeners.clear();
    this.contextLostListeners.clear();
    this.contextRestoredListeners.clear();
    this.fallbackListeners.clear();
  }
}
