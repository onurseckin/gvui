import type { ComponentType, ReactNode } from "react";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCertificate,
  IconFileText,
  IconLink,
  IconRocket,
  IconShieldCheck,
} from "@tabler/icons-react";
import type { EdgeKind, GraphEdgeData } from "../../../types/graphData";

export type SemanticEdgeKind =
  | "spawn"
  | "sequence"
  | "data"
  | "dependency"
  | "loop"
  | "gate"
  | "critic";

export interface EdgeKindDescriptor {
  kind: SemanticEdgeKind;
  label: string;
  description: string;
  accent: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  isDashed: boolean;
  animated: boolean;
  reverseAnimated: boolean;
  badgeVariant: string;
  badgeBorder: string;
  badgeBg: string;
  badgeTextColor: string;
  iconName?: string;
  icon?: ReactNode;
  IconComponent?: ComponentType<{
    size?: number | string;
    color?: string;
    className?: string;
    stroke?: number | string;
  }>;
  markerId: string;
}

export const EDGE_KIND_DESCRIPTORS: Readonly<Record<SemanticEdgeKind, EdgeKindDescriptor>> =
  Object.freeze({
    spawn: {
      kind: "spawn",
      label: "SPAWN / DISPATCH",
      description: "Worker dispatch or task spawning",
      accent: "#06b6d4",
      stroke: "#06b6d4",
      strokeWidth: 2,
      strokeDasharray: "6 4",
      isDashed: true,
      animated: true,
      reverseAnimated: false,
      badgeVariant: "spawn",
      badgeBorder: "rgba(6, 182, 212, 0.6)",
      badgeBg: "rgba(6, 182, 212, 0.12)",
      badgeTextColor: "#67e8f9",
      iconName: "IconRocket",
      icon: <IconRocket size={12} />,
      IconComponent: IconRocket,
      markerId: "edge-arrowhead-spawn",
    },
    sequence: {
      kind: "sequence",
      label: "SEQUENCE",
      description: "Linear execution flow (neutral dark-mode zinc)",
      accent: "#3f3f46",
      stroke: "#3f3f46",
      strokeWidth: 1.5,
      strokeDasharray: undefined,
      isDashed: false,
      animated: false,
      reverseAnimated: false,
      badgeVariant: "sequence",
      badgeBorder: "#3f3f46",
      badgeBg: "rgba(24, 24, 27, 0.85)",
      badgeTextColor: "#a1a1aa",
      iconName: undefined,
      icon: undefined,
      IconComponent: undefined,
      markerId: "edge-arrowhead-sequence",
    },
    data: {
      kind: "data",
      label: "DATA HANDOFF",
      description: "Artifact or data payload handoff",
      accent: "#6366f1",
      stroke: "#6366f1",
      strokeWidth: 2,
      strokeDasharray: undefined,
      isDashed: false,
      animated: false,
      reverseAnimated: false,
      badgeVariant: "data",
      badgeBorder: "rgba(99, 102, 241, 0.6)",
      badgeBg: "rgba(99, 102, 241, 0.12)",
      badgeTextColor: "#a5b4fc",
      iconName: "IconFileText",
      icon: <IconFileText size={12} />,
      IconComponent: IconFileText,
      markerId: "edge-arrowhead-data",
    },
    dependency: {
      kind: "dependency",
      label: "DEPENDENCY",
      description: "Unlocked requirement or dependency link",
      accent: "#64748b",
      stroke: "#64748b",
      strokeWidth: 1.5,
      strokeDasharray: "5 4",
      isDashed: true,
      animated: false,
      reverseAnimated: false,
      badgeVariant: "dependency",
      badgeBorder: "rgba(100, 116, 139, 0.6)",
      badgeBg: "rgba(100, 116, 139, 0.12)",
      badgeTextColor: "#94a3b8",
      iconName: "IconLink",
      icon: <IconLink size={12} />,
      IconComponent: IconLink,
      markerId: "edge-arrowhead-dependency",
    },
    loop: {
      kind: "loop",
      label: "LOOP / PUSHBACK",
      description: "Rejection cycle or feedback iteration loop",
      accent: "#f43f5e",
      stroke: "#f43f5e",
      strokeWidth: 2,
      strokeDasharray: "6 4",
      isDashed: true,
      animated: true,
      reverseAnimated: true,
      badgeVariant: "loop",
      badgeBorder: "rgba(244, 63, 94, 0.7)",
      badgeBg: "rgba(244, 63, 94, 0.14)",
      badgeTextColor: "#fda4af",
      iconName: "IconAlertTriangle",
      icon: <IconAlertTriangle size={12} />,
      IconComponent: IconAlertTriangle,
      markerId: "edge-arrowhead-loop",
    },
    gate: {
      kind: "gate",
      label: "VALIDATION GATE",
      description: "Verification pass or quality gate",
      accent: "#10b981",
      stroke: "#10b981",
      strokeWidth: 2,
      strokeDasharray: undefined,
      isDashed: false,
      animated: false,
      reverseAnimated: false,
      badgeVariant: "gate",
      badgeBorder: "rgba(16, 185, 129, 0.6)",
      badgeBg: "rgba(16, 185, 129, 0.12)",
      badgeTextColor: "#6ee7b7",
      iconName: "IconShieldCheck",
      icon: <IconShieldCheck size={12} />,
      IconComponent: IconShieldCheck,
      markerId: "edge-arrowhead-gate",
    },
    critic: {
      kind: "critic",
      label: "CRITIC SIGNOFF",
      description: "Critic evaluation and formal signoff",
      accent: "#eab308",
      stroke: "#eab308",
      strokeWidth: 2,
      strokeDasharray: undefined,
      isDashed: false,
      animated: false,
      reverseAnimated: false,
      badgeVariant: "critic",
      badgeBorder: "rgba(234, 179, 8, 0.7)",
      badgeBg: "rgba(234, 179, 8, 0.12)",
      badgeTextColor: "#fde047",
      iconName: "IconCertificate",
      icon: <IconCertificate size={12} />,
      IconComponent: IconCertificate,
      markerId: "edge-arrowhead-critic",
    },
  });

export const DEFAULT_EDGE_KIND: SemanticEdgeKind = "sequence";

export const EDGE_TABLER_ICONS: Readonly<
  Record<
    string,
    ComponentType<{
      size?: number | string;
      color?: string;
      className?: string;
      stroke?: number | string;
    }>
  >
> = Object.freeze({
  IconRocket,
  IconFileText,
  IconLink,
  IconAlertTriangle,
  IconAlertCircle,
  IconShieldCheck,
  IconCertificate,
});

export function getEdgeIconComponent(name?: string) {
  if (!name) return undefined;
  return EDGE_TABLER_ICONS[name];
}

/**
 * Resolves an edge to one of the 7 semantic edge types.
 * Neutral by default: standard structural edges default to "sequence" (#3f3f46).
 */
export function resolveEdgeKind(
  edgeOrKind?: Pick<GraphEdgeData, "kind" | "isCycle"> | EdgeKind | string | null,
): SemanticEdgeKind {
  if (!edgeOrKind) return DEFAULT_EDGE_KIND;

  if (typeof edgeOrKind === "object") {
    if (edgeOrKind.isCycle) return "loop";
    if (!edgeOrKind.kind) return DEFAULT_EDGE_KIND;
    return resolveEdgeKind(edgeOrKind.kind);
  }

  const normalized = String(edgeOrKind).trim().toLowerCase();
  switch (normalized) {
    case "spawn":
    case "dispatch":
      return "spawn";
    case "sequence":
    case "linear":
    case "flow":
      return "sequence";
    case "data":
    case "handoff":
    case "artifact":
      return "data";
    case "dependency":
    case "requirement":
    case "unlocked":
      return "dependency";
    case "loop":
    case "pushback":
    case "rejection":
    case "cycle":
    case "fallback":
      return "loop";
    case "gate":
    case "validation":
    case "review":
      return "gate";
    case "critic":
    case "signoff":
    case "certificate":
      return "critic";
    default:
      return DEFAULT_EDGE_KIND;
  }
}

/**
 * Returns the rich descriptor for a given edge or semantic kind.
 */
export function describeEdgeKind(
  edgeOrKind?: Pick<GraphEdgeData, "kind" | "isCycle"> | EdgeKind | string | null,
): EdgeKindDescriptor {
  const resolved = resolveEdgeKind(edgeOrKind);
  return EDGE_KIND_DESCRIPTORS[resolved];
}
