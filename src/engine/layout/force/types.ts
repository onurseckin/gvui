/**
 * Types for the Force-Directed simulation engine, Barnes-Hut quadtree,
 * and modular force definitions. Zero TypeScript any.
 */

export interface SimulationNode {
  id: string;
  index?: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number | null;
  fy?: number | null;
  width?: number;
  height?: number;
  radius?: number;
  mass?: number;
  charge?: number;
  rank?: number;
  group?: string;
  data?: unknown;
}

export interface SimulationLink {
  id?: string;
  source: string | SimulationNode;
  target: string | SimulationNode;
  distance?: number;
  strength?: number;
  weight?: number;
  data?: unknown;
}

export interface ResolvedSimulationLink {
  id?: string;
  source: SimulationNode;
  target: SimulationNode;
  distance: number;
  strength: number;
  weight: number;
  data?: unknown;
}

export interface Force {
  name: string;
  initialize: (nodes: SimulationNode[], random?: () => number) => void;
  apply: (alpha: number) => void;
}

export interface ForceSimulationOptions {
  alpha?: number;
  alphaMin?: number;
  alphaDecay?: number;
  alphaTarget?: number;
  velocityDecay?: number;
  energyThreshold?: number;
  maxIterations?: number;
  randomSeed?: number;
}

export interface BarnesHutOptions {
  theta?: number;
  charge?: number | ((node: SimulationNode) => number);
  distanceMin?: number;
  distanceMax?: number;
}

export interface LinkForceOptions {
  distance?: number | ((link: SimulationLink) => number);
  strength?: number | ((link: SimulationLink) => number);
  iterations?: number;
}

export interface CollisionForceOptions {
  radius?: number | ((node: SimulationNode) => number);
  padding?: number;
  strength?: number;
  iterations?: number;
  useBoundingBox?: boolean;
}

export interface CenterForceOptions {
  x?: number;
  y?: number;
  strength?: number;
}

export interface RankConstraintOptions {
  rankSeparation?: number;
  strength?: number;
  axis?: "x" | "y";
}

export interface SimulationTickEvent {
  alpha: number;
  energy: number;
  iteration: number;
  isConverged: boolean;
}
