import type { EdgeLayoutHint, Point, PortRef, Rect } from "../engine/layout/custom/types";

export interface NodeBadge {
  label: string;
  variant?: "success" | "info" | "amber" | "error" | "gray";
}

export interface NodeTool {
  name: string;
  type?: "generic" | "custom";
}

export interface NodeContext {
  repoPath?: string;
  previousOutputs?: Array<{ fromNode: string; summary: string }>;
  [key: string]: unknown;
}

export interface GraphNodeData {
  id: string;
  name: string;
  description?: string;
  type?: string;
  model?: string;
  harnessModel?: string;
  badges?: NodeBadge[];
  tools?: NodeTool[];
  context?: NodeContext;
  metadata?: Record<string, unknown>;
  /** Pins the node to a rank in the layout engine; passed through when present. */
  rank?: number;
  /** Reserved for future cluster support; passed through untouched. */
  group?: string;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  label?: string;
  directed?: boolean;
  isCycle?: boolean;
  /** Layout hint overriding automatic edge role classification. */
  layoutRole?: EdgeLayoutHint;
  /** Ranking and ordering priority; passed through to the layout engine when present. */
  weight?: number;
  /** Forces a minimum rank span; passed through to the layout engine when present. */
  minLen?: number;
}

export interface GraphDataset {
  id: string;
  title: string;
  directed?: boolean;
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

export interface PositionedNode extends GraphNodeData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedEdge extends GraphEdgeData {
  path: string;
  /**
   * Raw routed waypoints behind `path`, when the layout engine produced a route. Kept alongside
   * `path` so the renderer can rebuild `path` for a different `edgeStyle`/`cornerRadius` without
   * a re-layout — see `GraphCanvas`'s edge-style pass and `custom/edgePath.ts`.
   */
  points?: Point[];
  labelX?: number;
  labelY?: number;
  badgeRect?: Rect;
  anchorPoint?: Point;
  leaderPoints?: Point[];
  sourcePort?: PortRef;
  targetPort?: PortRef;
}
