/**
 * The visual identity of every node kind and status, in one place.
 *
 * Kind and status are kept on separate visual channels and never encode each other: the accent bar
 * and icon answer "what is this node?", the status dot answers "how did it go?". A card that used
 * one colour for both would be unreadable the moment a successful tool call and a running
 * orchestrator had to sit side by side.
 *
 * Every accent is a Tailwind-400-weight hue, so eight categorical colours share one lightness and
 * read as a single system against the near-black canvas rather than as a rainbow. Colour is always
 * reinforced by an icon and a label, so it is never the only channel carrying the distinction.
 *
 * Exports here are plain data, not components: mixing the two in one module costs React Fast
 * Refresh for every consumer — the same reasoning as `LayoutSelectDropdown.types`.
 */
import type { ReactNode } from "react";
import type { GraphNodeData, NodeKind, NodeStatus } from "../../../types/graphData";

export interface NodeKindDescriptor {
  label: string;
  /** Accent for the left bar and the kind icon. */
  accent: string;
  /** Bare `<path>`/`<circle>` children for a `0 0 24 24` stroke icon, so callers pick the size. */
  icon: ReactNode;
}

const ICON_ORCHESTRATOR: ReactNode = (
  <>
    <circle cx="12" cy="5" r="2.5" />
    <circle cx="5" cy="19" r="2.5" />
    <circle cx="19" cy="19" r="2.5" />
    <path d="M12 7.5v3.5M12 11H5v5.5M12 11h7v5.5" />
  </>
);

const ICON_AGENT: ReactNode = (
  <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
);

const ICON_TOOL: ReactNode = (
  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
);

const ICON_ROUTER: ReactNode = <path d="M12 3v6M12 9l-6 6v6M12 9l6 6v6" />;

const ICON_JOIN: ReactNode = <path d="M12 21v-6M12 15L6 9V3M12 15l6-6V3" />;

const ICON_GATE: ReactNode = (
  <>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </>
);

const ICON_TERMINAL: ReactNode = <path d="M4 21V4M4 4h13l-2.5 4L17 12H4" />;

const ICON_INPUT: ReactNode = (
  <>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <path d="M10 17l5-5-5-5M15 12H3" />
  </>
);

const ICON_CRITIC: ReactNode = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 0 0 5 0" />
  </>
);

export const NODE_KIND_DESCRIPTORS: Readonly<Record<NodeKind, NodeKindDescriptor>> = Object.freeze({
  orchestrator: { label: "Orchestrator", accent: "#818cf8", icon: ICON_ORCHESTRATOR },
  agent: { label: "Agent", accent: "#a78bfa", icon: ICON_AGENT },
  tool: { label: "Tool", accent: "#94a3b8", icon: ICON_TOOL },
  router: { label: "Router", accent: "#fbbf24", icon: ICON_ROUTER },
  join: { label: "Join", accent: "#2dd4bf", icon: ICON_JOIN },
  gate: { label: "Gate", accent: "#fb923c", icon: ICON_GATE },
  terminal: { label: "Terminal", accent: "#34d399", icon: ICON_TERMINAL },
  input: { label: "Input", accent: "#38bdf8", icon: ICON_INPUT },
  critic: { label: "Critic", accent: "#ec4899", icon: ICON_CRITIC },
});

/** Nodes predating `kind` fall back to `agent`, the least surprising default for a harness graph. */
export const DEFAULT_NODE_KIND: NodeKind = "agent";

export function resolveNodeKind(node: Pick<GraphNodeData, "kind">): NodeKind {
  return node.kind && node.kind in NODE_KIND_DESCRIPTORS ? node.kind : DEFAULT_NODE_KIND;
}

export function describeNodeKind(node: Pick<GraphNodeData, "kind">): NodeKindDescriptor {
  return NODE_KIND_DESCRIPTORS[resolveNodeKind(node)];
}

export interface NodeStatusDescriptor {
  label: string;
  color: string;
  /** Drives the pulsing treatment; only an in-flight node earns motion on the canvas. */
  animated?: boolean;
}

/** Traffic-light semantics, deliberately unlike the categorical kind accents. */
export const NODE_STATUS_DESCRIPTORS: Readonly<Record<NodeStatus, NodeStatusDescriptor>> =
  Object.freeze({
    pending: { label: "Pending", color: "#52525b" },
    running: { label: "Running", color: "#fbbf24", animated: true },
    success: { label: "Success", color: "#34d399" },
    error: { label: "Error", color: "#f87171" },
    warning: { label: "Warning", color: "#fb923c" },
    skipped: { label: "Skipped", color: "#3f3f46" },
    cached: { label: "Cached", color: "#2dd4bf" },
  });

const LEGACY_BADGE_STATUS: Readonly<Record<string, NodeStatus>> = Object.freeze({
  success: "success",
  error: "error",
  amber: "warning",
  info: "pending",
  gray: "skipped",
});

/**
 * Resolves a node's status, falling back through the pre-`status` conventions.
 *
 * Datasets written before `status` existed encoded it either as the variant of the first badge or
 * as a free-text `metadata.status`. Both are still honoured so old graphs keep rendering, but new
 * data should set `status` directly.
 */
export function resolveNodeStatus(node: GraphNodeData): NodeStatus {
  if (node.status && node.status in NODE_STATUS_DESCRIPTORS) {
    return node.status;
  }

  const badgeVariant = node.badges?.find((badge) => badge.variant)?.variant;
  if (badgeVariant && badgeVariant in LEGACY_BADGE_STATUS) {
    return LEGACY_BADGE_STATUS[badgeVariant];
  }

  const raw = String(node.metadata?.status ?? "").toLowerCase();
  if (raw.includes("complete") || raw.includes("success") || raw.includes("done")) return "success";
  if (raw.includes("error") || raw.includes("fail")) return "error";
  if (raw.includes("running") || raw.includes("progress")) return "running";
  if (raw.includes("skip")) return "skipped";
  if (raw.includes("cache")) return "cached";
  if (raw.includes("warn")) return "warning";
  if (raw.includes("pending") || raw.includes("queued")) return "pending";

  return "pending";
}

export function describeNodeStatus(node: GraphNodeData): NodeStatusDescriptor {
  return NODE_STATUS_DESCRIPTORS[resolveNodeStatus(node)];
}

/**
 * Tier drives how heavy the model chip reads, so the eye can rank orchestrators above cheap passes
 * without parsing model names. Inferred from the name when a dataset omits it.
 */
export const MODEL_TIER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  xs: "XS",
  s: "S",
  m: "M",
  l: "L",
});

export function resolveModelTier(node: GraphNodeData): string | undefined {
  if (node.tier) return node.tier;
  const model = node.model?.toLowerCase() ?? "";
  if (!model) return undefined;
  if (model.includes("opus")) return "l";
  if (model.includes("sonnet")) return "m";
  if (model.includes("haiku")) return "s";
  return undefined;
}
