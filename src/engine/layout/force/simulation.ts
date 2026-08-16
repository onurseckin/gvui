import type { Force, ForceSimulationOptions, SimulationNode, SimulationTickEvent } from "./types";

/**
 * Deterministic Pseudo-Random Number Generator (Mulberry32)
 */
export function createSeededRandom(seed: number = 42): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ForceSimulation {
  private _nodes: SimulationNode[] = [];
  private readonly _forces: Map<string, Force> = new Map();
  private _alpha: number = 1.0;
  private _alphaMin: number = 0.001;
  private _alphaDecay: number = 1 - Math.pow(0.001, 1 / 300);
  private _alphaTarget: number = 0;
  private _velocityDecay: number = 0.6;
  private _energyThreshold: number = 1e-4;
  private _maxIterations: number = 300;
  private _iteration: number = 0;
  private _isConverged: boolean = false;
  private _energy: number = 0;
  private readonly _tickListeners: Array<(event: SimulationTickEvent) => void> = [];
  private readonly _endListeners: Array<(event: SimulationTickEvent) => void> = [];
  private readonly _random: () => number;

  constructor(nodes: SimulationNode[] = [], options: ForceSimulationOptions = {}) {
    this._random =
      options.randomSeed !== undefined ? createSeededRandom(options.randomSeed) : Math.random;

    if (options.alpha !== undefined) this._alpha = options.alpha;
    if (options.alphaMin !== undefined) this._alphaMin = options.alphaMin;
    if (options.alphaDecay !== undefined) this._alphaDecay = options.alphaDecay;
    if (options.alphaTarget !== undefined) this._alphaTarget = options.alphaTarget;
    if (options.velocityDecay !== undefined) this._velocityDecay = options.velocityDecay;
    if (options.energyThreshold !== undefined) this._energyThreshold = options.energyThreshold;
    if (options.maxIterations !== undefined) this._maxIterations = options.maxIterations;

    this.nodes(nodes);
  }

  public nodes(newNodes?: SimulationNode[]): SimulationNode[] | this {
    if (newNodes === undefined) return this._nodes;
    this._nodes = newNodes;

    // Assign indices and initial positions if missing
    const initialRadius = Math.max(10, Math.sqrt(this._nodes.length) * 40);
    for (let i = 0; i < this._nodes.length; i++) {
      const node = this._nodes[i];
      if (!node) continue;
      node.index = i;
      if (isNaN(node.x) || (node.x === 0 && node.y === 0 && this._nodes.length > 1)) {
        const angle = i * (Math.PI * (3 - Math.sqrt(5)) || 0.1);
        const r = Math.sqrt(i + 0.5) * (initialRadius / Math.sqrt(this._nodes.length));
        node.x = r * Math.cos(angle);
        node.y = r * Math.sin(angle);
      }
      if (isNaN(node.vx)) node.vx = 0;
      if (isNaN(node.vy)) node.vy = 0;
    }

    for (const force of this._forces.values()) {
      force.initialize(this._nodes, this._random);
    }
    return this;
  }

  public force(name: string, force?: Force | null): Force | undefined | this {
    if (force === undefined) {
      return this._forces.get(name);
    }
    if (force === null) {
      this._forces.delete(name);
      return this;
    }
    this._forces.set(name, force);
    force.initialize(this._nodes, this._random);
    return this;
  }

  public tick(): this {
    if (this._isConverged) return this;

    this._alpha += (this._alphaTarget - this._alpha) * this._alphaDecay;

    // Apply all registered forces
    for (const force of this._forces.values()) {
      force.apply(this._alpha);
    }

    // Integrate velocities and positions
    let totalKineticEnergy = 0;
    for (let i = 0; i < this._nodes.length; i++) {
      const node = this._nodes[i];
      if (!node) continue;

      if (node.fx != null) {
        node.x = node.fx;
        node.vx = 0;
      } else {
        node.vx *= this._velocityDecay;
        node.x += node.vx;
      }

      if (node.fy != null) {
        node.y = node.fy;
        node.vy = 0;
      } else {
        node.vy *= this._velocityDecay;
        node.y += node.vy;
      }

      totalKineticEnergy += node.vx * node.vx + node.vy * node.vy;
    }

    this._energy = totalKineticEnergy;
    this._iteration++;

    // Check convergence criteria
    if (
      this._alpha < this._alphaMin ||
      (this._iteration >= 10 && this._energy < this._energyThreshold) ||
      this._iteration >= this._maxIterations
    ) {
      this._isConverged = true;
      this._alpha = 0;
      this.emitEnd();
    }

    this.emitTick();
    return this;
  }

  public step(count: number = 1): this {
    for (let i = 0; i < count && !this._isConverged; i++) {
      this.tick();
    }
    return this;
  }

  public run(maxIterations: number = this._maxIterations): this {
    let count = 0;
    while (!this._isConverged && count < maxIterations) {
      this.tick();
      count++;
    }
    return this;
  }

  public restart(): this {
    this._alpha = 1.0;
    this._isConverged = false;
    this._iteration = 0;
    return this;
  }

  public stop(): this {
    this._alpha = 0;
    this._alphaTarget = 0;
    this._isConverged = true;
    return this;
  }

  public on(event: "tick" | "end", listener: (e: SimulationTickEvent) => void): this {
    if (event === "tick") this._tickListeners.push(listener);
    if (event === "end") this._endListeners.push(listener);
    return this;
  }

  public off(event: "tick" | "end", listener: (e: SimulationTickEvent) => void): this {
    if (event === "tick") {
      const idx = this._tickListeners.indexOf(listener);
      if (idx >= 0) this._tickListeners.splice(idx, 1);
    }
    if (event === "end") {
      const idx = this._endListeners.indexOf(listener);
      if (idx >= 0) this._endListeners.splice(idx, 1);
    }
    return this;
  }

  private emitTick(): void {
    const event: SimulationTickEvent = {
      alpha: this._alpha,
      energy: this._energy,
      iteration: this._iteration,
      isConverged: this._isConverged,
    };
    for (const listener of this._tickListeners) {
      listener(event);
    }
  }

  private emitEnd(): void {
    const event: SimulationTickEvent = {
      alpha: this._alpha,
      energy: this._energy,
      iteration: this._iteration,
      isConverged: this._isConverged,
    };
    for (const listener of this._endListeners) {
      listener(event);
    }
  }

  // Getters and setters
  public alpha(a?: number): number | this {
    if (a === undefined) return this._alpha;
    this._alpha = a;
    this._isConverged = false;
    return this;
  }

  public alphaMin(m?: number): number | this {
    if (m === undefined) return this._alphaMin;
    this._alphaMin = m;
    return this;
  }

  public alphaDecay(d?: number): number | this {
    if (d === undefined) return this._alphaDecay;
    this._alphaDecay = d;
    return this;
  }

  public alphaTarget(t?: number): number | this {
    if (t === undefined) return this._alphaTarget;
    this._alphaTarget = t;
    return this;
  }

  public velocityDecay(v?: number): number | this {
    if (v === undefined) return this._velocityDecay;
    this._velocityDecay = v;
    return this;
  }

  public energyThreshold(e?: number): number | this {
    if (e === undefined) return this._energyThreshold;
    this._energyThreshold = e;
    return this;
  }

  public maxIterations(m?: number): number | this {
    if (m === undefined) return this._maxIterations;
    this._maxIterations = m;
    return this;
  }

  public isConverged(): boolean {
    return this._isConverged;
  }

  public energy(): number {
    return this._energy;
  }

  public iteration(): number {
    return this._iteration;
  }
}
