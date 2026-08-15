import type { EdgeLayoutHint, Point, PortRef, Rect } from "../engine/layout/custom/types";

export interface NodeBadge {
  label: string;
  variant?: "success" | "info" | "amber" | "error" | "gray";
}

export interface BadgeDetail {
  text: string;
  variant?: "info" | "warning" | "error" | "success" | "neutral";
  icon?: string;
  clickable?: boolean;
  targetTab?: "overview" | "io" | "files" | "commands" | "feedback" | string;
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
export type EdgeKind =
  | "sequence"
  | "spawn"
  | "dispatch"
  | "data"
  | "handoff"
  | "dependency"
  | "loop"
  | "pushback"
  | "gate"
  | "validation"
  | "critic"
  | "signoff"
  | "conditional"
  | "fallback"
  | "join";
export type PayloadKind = "full-context" | "summary" | "artifact" | "decision" | "file" | "prompt";

export interface FileRef {
  path: string;
  mode?: FileMode;
  lines?: string;
  diff?: string;
  additions?: number;
  deletions?: number;
}

export interface IoPort {
  node?: string;
  kind: PayloadKind;
  label: string;
  tokens?: number;
  preview?: string;
  dataRef?: string;
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
  stdoutSnippet?: string;
  stderrSnippet?: string;
  stdoutTail?: string;
  stderrTail?: string;
  logPath?: string;
}

export interface FindingDetail {
  id: string;
  requirementId?: string;
  severity: "critical" | "important" | "suggestion";
  observation: string;
  remediation?: string;
  status: "open" | "resolved";
  revalidationProof?: { method: string; evidence: string[] };
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
  durationMs?: number;
  [key: string]: unknown;
}

export interface GraphNodeData {
  id: string;
  name: string;
  description?: string;
  type?: string;
  kind?: NodeKind;
  status?: NodeStatus;
  step?: number;
  stepLabel?: string;
  badge?: BadgeDetail;
  badges?: NodeBadge[];
  model?: string;
  harnessModel?: string;
  tier?: ModelTier;
  sectionId?: string;
  tools?: NodeTool[];
  files?: FileRef[];
  metrics?: NodeMetrics;
  io?: { inputs?: IoPort[]; outputs?: IoPort[] };
  prompt?: string;
  output?: string;
  logs?: string;
  context?: NodeContext;
  metadata?: NodeMetadata;
  rank?: number;
  group?: string;
}

export interface EdgeHandoff {
  kind: PayloadKind;
  summary?: string;
  tokens?: number;
}

export interface EdgeContainerDetail {
  stepBadge?: string;
  title?: string;
  detail?: string;
  variant?:
    | "info"
    | "warning"
    | "error"
    | "success"
    | "neutral"
    | "cyan"
    | "indigo"
    | "slate"
    | "amber"
    | "emerald"
    | "critic"
    | "spawn"
    | "sequence"
    | "data"
    | "dependency"
    | "loop"
    | "gate"
    | "signoff"
    | string;
  icon?: string;
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
  stepNumber?: number | string;
  badge?: BadgeDetail;
  container?: EdgeContainerDetail;
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
