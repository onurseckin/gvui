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

export type NodeKind =
  | "orchestrator"
  | "agent"
  | "tool"
  | "router"
  | "join"
  | "gate"
  | "terminal"
  | "input"
  | "critic";

export type NodeStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "warning"
  | "skipped"
  | "cached";

export type ModelTier = "xs" | "s" | "m" | "l";
export type FileMode = "read" | "write" | "attach";

export interface FileRef {
  path: string;
  mode?: FileMode;
  lines?: string;
  diff?: string;
}

export type PayloadKind = "full-context" | "summary" | "artifact" | "decision" | "file" | "prompt";

export interface IoPort {
  node?: string;
  kind: PayloadKind;
  label: string;
  tokens?: number;
}

export interface NodeMetrics {
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  durationMs?: number;
  retries?: number;
}

export interface CommandExecutionDetail {
  id: string;
  argv: readonly string[];
  cwd: string;
  exitCode: number;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  logPath?: string;
}

export interface FindingDetail {
  id: string;
  requirementId?: string;
  severity: "critical" | "important" | "suggestion";
  observation: string;
  remediation?: string;
  status: "open" | "resolved";
}

export interface GraphSection {
  id: string;
  title: string;
  description?: string;
  nodeIds: string[];
}

export interface NodeMetadata {
  commands?: CommandExecutionDetail[];
  findings?: FindingDetail[];
  writeScope?: string[];
  leaseAgent?: string;
  repairRounds?: number;
  [key: string]: unknown;
}

export interface GraphNodeData {
  id: string;
  name: string;
  description?: string;
  type?: string;
  kind?: NodeKind;
  status?: NodeStatus;
  model?: string;
  harnessModel?: string;
  tier?: ModelTier;
  sectionId?: string;
  badges?: NodeBadge[];
  tools?: NodeTool[];
  files?: FileRef[];
  metrics?: NodeMetrics;
  io?: {
    inputs?: IoPort[];
    outputs?: IoPort[];
  };
  prompt?: string;
  output?: string;
  logs?: string;
  context?: NodeContext;
  metadata?: NodeMetadata;
  rank?: number;
  group?: string;
}

export type EdgeKind = "sequence" | "spawn" | "conditional" | "loop" | "fallback" | "join" | "data";

export interface EdgeHandoff {
  kind: PayloadKind;
  summary?: string;
  tokens?: number;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  label?: string;
  directed?: boolean;
  isCycle?: boolean;
  kind?: EdgeKind;
  condition?: string;
  handoff?: EdgeHandoff;
  layoutRole?: EdgeLayoutHint;
  weight?: number;
  minLen?: number;
}

export interface GraphDataset {
  id: string;
  title: string;
  description?: string;
  directed?: boolean;
  entry?: string;
  exits?: string[];
  sections?: GraphSection[];
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
  points?: Point[];
  labelX?: number;
  labelY?: number;
  badgeRect?: Rect;
  anchorPoint?: Point;
  leaderPoints?: Point[];
  sourcePort?: PortRef;
  targetPort?: PortRef;
}
