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

/**
 * What a node *is* in an agentic run, as opposed to what it did.
 *
 * This is the one field that drives a node's whole visual identity — accent colour, icon, and card
 * density all key off it — so it is deliberately a small closed set rather than free text. The free
 * text slot is `type`, which still renders as a tag for anything this taxonomy does not capture.
 *
 * - `orchestrator` — plans the run and spawns other nodes (typically the largest model).
 * - `agent`        — a scoped worker doing one slice of the job.
 * - `tool`         — a deterministic call with no model behind it (Grep, Read, Bash, an MCP tool).
 * - `router`       — a branch: picks which downstream path is taken.
 * - `join`         — a fan-in: waits on several upstreams and reduces them to one result.
 * - `gate`         — a checkpoint needing human approval before the run continues.
 * - `terminal`     — a final result of the run, success or failure.
 * - `input`        — the trigger: the request, file, or event the run started from.
 */
export type NodeKind =
  | "orchestrator"
  | "agent"
  | "tool"
  | "router"
  | "join"
  | "gate"
  | "terminal"
  | "input";

/**
 * Execution state. Kept separate from `NodeKind` on purpose: kind is structural and fixed, status
 * changes as a run progresses, and the card gives them separate visual channels so a glance can
 * answer "what is this?" and "how did it go?" independently.
 */
export type NodeStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "warning"
  | "skipped"
  | "cached";

/**
 * Relative model size, independent of the model's name.
 *
 * The name is what gets displayed; the tier is what the card styles on, so a graph stays readable
 * when the underlying models are swapped out (custom models later, per the product direction).
 * Roughly: `xs`/`s` for fast cheap passes, `m` for scoped subagent work, `l` for orchestration.
 */
export type ModelTier = "xs" | "s" | "m" | "l";

/** Which direction a file reference moved, so the card can mark reads apart from writes. */
export type FileMode = "read" | "write" | "attach";

export interface FileRef {
  path: string;
  mode?: FileMode;
  /** Optional line range, rendered as `path:12-48` when present. */
  lines?: string;
}

/**
 * What kind of thing crossed a boundary into or out of a node.
 *
 * The distinction that matters in an agentic harness is *how much* context moved: handing a
 * subagent the full transcript is a different (and far more expensive) act than handing it a
 * summary or a single structured artifact, and that difference is invisible in a plain arrow.
 */
export type PayloadKind = "full-context" | "summary" | "artifact" | "decision" | "file" | "prompt";

export interface IoPort {
  /** Node id this came from (`inputs`) or goes to (`outputs`). Omitted for run-level I/O. */
  node?: string;
  kind: PayloadKind;
  label: string;
  /** Approximate size of the payload, used to weight the edge and shown in the drawer. */
  tokens?: number;
}

export interface NodeMetrics {
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  durationMs?: number;
  /** Attempts beyond the first. Non-zero renders a warning-toned chip. */
  retries?: number;
}

export interface GraphNodeData {
  id: string;
  name: string;
  description?: string;
  /** Free-text tag for anything `kind` does not capture; still rendered beside the title. */
  type?: string;
  /** Structural role. Drives accent colour, icon, and card density. */
  kind?: NodeKind;
  /** Execution state. Drives the status dot and any running/failed treatment. */
  status?: NodeStatus;
  model?: string;
  harnessModel?: string;
  /** Relative size of `model`, so styling survives a model rename. */
  tier?: ModelTier;
  badges?: NodeBadge[];
  tools?: NodeTool[];
  files?: FileRef[];
  metrics?: NodeMetrics;
  /** What crossed into and out of this node. Rendered in the detail drawer, not on the card. */
  io?: {
    inputs?: IoPort[];
    outputs?: IoPort[];
  };
  /** Long-form fields. Deliberately drawer-only — they must never inflate the card's size. */
  prompt?: string;
  output?: string;
  logs?: string;
  context?: NodeContext;
  metadata?: Record<string, unknown>;
  /** Pins the node to a rank in the layout engine; passed through when present. */
  rank?: number;
  /** Reserved for future cluster support; passed through untouched. */
  group?: string;
}

/**
 * Why one node follows another. Control flow and data flow are both edges here, distinguished by
 * `kind` rather than split into separate collections, so the layout engine keeps seeing one graph.
 */
export type EdgeKind = "sequence" | "spawn" | "conditional" | "loop" | "fallback" | "join" | "data";

export interface EdgeHandoff {
  kind: PayloadKind;
  /** One-line description of what moved, e.g. "failing test names + stack traces". */
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
  /** Relationship type. Drives stroke style: dashed loop-backs, dotted fallbacks, and so on. */
  kind?: EdgeKind;
  /** Predicate for a `conditional` edge, e.g. "tests failed". Rendered on the edge badge. */
  condition?: string;
  /** What context crossed this edge. The most load-bearing detail in an agentic trace. */
  handoff?: EdgeHandoff;
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
  /** One-line summary of the run, shown above the canvas. */
  description?: string;
  directed?: boolean;
  /**
   * Where the run starts. Explicit rather than inferred: a graph with cycles need not have any
   * node of in-degree zero, so topology alone cannot answer this.
   */
  entry?: string;
  /** Terminal nodes of the run. Same reasoning as `entry`. */
  exits?: string[];
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
