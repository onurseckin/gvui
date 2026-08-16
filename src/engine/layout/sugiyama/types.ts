export interface SugiyamaNode {
  id: string;
  name?: string;
  width: number;
  height: number;
  rank?: number;
  order?: number;
  x?: number;
  y?: number;
  isVirtual?: boolean;
  originalEdgeId?: string;
  originalSource?: string;
  originalTarget?: string;
  group?: string;
  data?: unknown;
}

export interface SugiyamaEdge {
  id: string;
  source: string;
  target: string;
  weight?: number;
  minLen?: number;
  isReversed?: boolean;
  isCycle?: boolean;
  points?: Array<{ x: number; y: number }>;
  data?: unknown;
}

export interface SugiyamaOptions {
  rankSeparation?: number;
  nodeSeparation?: number;
  maxSweeps?: number;
  align?: "left" | "right" | "center" | "balanced";
  direction?: "TB" | "BT" | "LR" | "RL";
}

export interface SugiyamaResult {
  nodes: SugiyamaNode[];
  edges: SugiyamaEdge[];
  ranks: SugiyamaNode[][];
  crossings: number;
  width: number;
  height: number;
}
