import type { ComponentType, ReactNode } from "react";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowRight,
  IconArrowsExchange,
  IconBan,
  IconBinary,
  IconCheck,
  IconClock,
  IconCode,
  IconFileText,
  IconFiles,
  IconFlagCheck,
  IconGitFork,
  IconGitMerge,
  IconHierarchy2,
  IconInfoCircle,
  IconLoader2,
  IconRefresh,
  IconRobot,
  IconRocket,
  IconScale,
  IconShieldCheck,
  IconShieldSearch,
  IconTerminal,
  IconTerminal2,
  IconX,
} from "@tabler/icons-react";
import type { GraphNodeData, NodeKind, NodeStatus } from "../../../types/graphData";

export interface NodeKindDescriptor {
  label: string;
  accent: string;
  icon: ReactNode;
  IconComponent: ComponentType<{
    size?: number | string;
    color?: string;
    className?: string;
    stroke?: number | string;
  }>;
}

export const NODE_KIND_DESCRIPTORS: Readonly<Record<NodeKind, NodeKindDescriptor>> = Object.freeze({
  input: {
    label: "USER PROMPT",
    accent: "#8b5cf6",
    icon: <IconTerminal2 size={14} />,
    IconComponent: IconTerminal2,
  },
  orchestrator: {
    label: "COORDINATOR",
    accent: "#3b82f6",
    icon: <IconHierarchy2 size={14} />,
    IconComponent: IconHierarchy2,
  },
  agent: {
    label: "WORKER",
    accent: "#06b6d4",
    icon: <IconRobot size={14} />,
    IconComponent: IconRobot,
  },
  tool: {
    label: "CLI COMMAND",
    accent: "#71717a",
    icon: <IconCode size={14} />,
    IconComponent: IconCode,
  },
  gate: {
    label: "VALIDATOR GATE",
    accent: "#10b981",
    icon: <IconShieldCheck size={14} />,
    IconComponent: IconShieldCheck,
  },
  critic: {
    label: "COMPLETENESS CRITIC",
    accent: "#818cf8",
    icon: <IconScale size={14} />,
    IconComponent: IconScale,
  },
  terminal: {
    label: "SEALED OUTCOME",
    accent: "#10b981",
    icon: <IconFlagCheck size={14} />,
    IconComponent: IconFlagCheck,
  },
  router: {
    label: "ROUTER",
    accent: "#f59e0b",
    icon: <IconGitFork size={14} />,
    IconComponent: IconGitFork,
  },
  join: {
    label: "JOIN",
    accent: "#2dd4bf",
    icon: <IconGitMerge size={14} />,
    IconComponent: IconGitMerge,
  },
});

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
  animated?: boolean;
  IconComponent: ComponentType<{ size?: number | string; color?: string; className?: string }>;
}

export const NODE_STATUS_DESCRIPTORS: Readonly<Record<NodeStatus, NodeStatusDescriptor>> =
  Object.freeze({
    pending: { label: "Pending", color: "#64748b", IconComponent: IconClock },
    running: { label: "Running", color: "#fbbf24", animated: true, IconComponent: IconLoader2 },
    success: { label: "Success", color: "#34d399", IconComponent: IconCheck },
    error: { label: "Error", color: "#f87171", IconComponent: IconX },
    warning: { label: "Warning", color: "#fb923c", IconComponent: IconAlertTriangle },
    skipped: { label: "Skipped", color: "#71717a", IconComponent: IconBan },
    cached: { label: "Cached", color: "#2dd4bf", IconComponent: IconRefresh },
  });

const LEGACY_BADGE_STATUS: Readonly<Record<string, NodeStatus>> = Object.freeze({
  success: "success",
  error: "error",
  amber: "warning",
  info: "pending",
  gray: "skipped",
});

export function resolveNodeStatus(node: GraphNodeData): NodeStatus {
  if (node.status && node.status in NODE_STATUS_DESCRIPTORS) return node.status;
  const badgeVariant = node.badges?.find((badge) => badge.variant)?.variant;
  if (badgeVariant && badgeVariant in LEGACY_BADGE_STATUS) return LEGACY_BADGE_STATUS[badgeVariant];
  const raw = String(node.metadata?.status ?? "").toLowerCase();
  if (raw.includes("complete") || raw.includes("success") || raw.includes("done")) return "success";
  if (raw.includes("error") || raw.includes("fail")) return "error";
  if (raw.includes("running") || raw.includes("progress")) return "running";
  if (raw.includes("skip")) return "skipped";
  if (raw.includes("cache")) return "cached";
  if (raw.includes("warn")) return "warning";
  return "pending";
}

export function describeNodeStatus(node: GraphNodeData): NodeStatusDescriptor {
  return NODE_STATUS_DESCRIPTORS[resolveNodeStatus(node)];
}

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

const TABLER_ICON_REGISTRY: Record<
  string,
  ComponentType<{
    size?: number | string;
    color?: string;
    className?: string;
    stroke?: number | string;
  }>
> = {
  IconTerminal2,
  IconHierarchy2,
  IconRobot,
  IconCode,
  IconShieldCheck,
  IconScale,
  IconFlagCheck,
  IconGitFork,
  IconGitMerge,
  IconRocket,
  IconArrowRight,
  IconAlertCircle,
  IconAlertTriangle,
  IconFileText,
  IconFiles,
  IconInfoCircle,
  IconArrowsExchange,
  IconTerminal,
  IconShieldSearch,
  IconBinary,
  IconCheck,
  IconX,
  IconClock,
  IconLoader2,
};

export function getTablerIconComponent(name?: string) {
  if (!name) return undefined;
  return TABLER_ICON_REGISTRY[name];
}
