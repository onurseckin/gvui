import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowGuide,
  IconArrowMerge,
  IconArrowsExchange,
  IconArrowsSplit2,
  IconCertificate,
  IconCircleDotted,
  IconFileText,
  IconGitBranch,
  IconGitMerge,
  IconLink,
  IconRefresh,
  IconRocket,
  IconRouteAltLeft,
  IconScale,
  IconSearch,
  IconShieldCheck,
  IconShieldSearch,
  IconStack2,
} from "@tabler/icons-react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { EDGE_KINDS, type EdgeKind, type KnownEdgeKind } from "../../../types/graphData";
import { hasPreset, stableAccent, vocabularyLabel } from "../../vocabulary";

/**
 * Anything a caller can hand us to identify an edge's kind: a bare kind name, or an edge-shaped
 * object. `kind` is widened to `string` so datasets written before a kind existed still resolve.
 */
export type EdgeKindInput =
  | { kind?: EdgeKind | string | undefined; isCycle?: boolean | undefined }
  | EdgeKind
  | string
  | null
  | undefined;

/**
 * The kind an edge resolves to. Open, like the producer's `EdgeKind`: a relationship this renderer
 * ships no preset for keeps its own name and gets a generated treatment, because collapsing it into
 * `sequence` would tell the reader it means something it does not.
 */
export type SemanticEdgeKind = EdgeKind;

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
  /** Severity register the edge reads in. A probe is `info`; only a real defect is `error`. */
  tone: "neutral" | "info" | "success" | "warning" | "error" | "excursion";
  badgeVariant: string;
  badgeBorder: string;
  badgeBg: string;
  badgeTextColor: string;
  /**
   * Arrowhead silhouette. `hollow` reads as a question rather than a verdict (probe), `heavy` as an
   * assertion (pushback), `terminal` as a full stop (signoff).
   */
  markerShape: "arrow" | "heavy" | "hollow" | "terminal";
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

/**
 * The preset relationship treatments. This is a table a dataset may extend or ignore: an edge kind
 * outside it is drawn from the same descriptor shape, generated from the kind's own name.
 */
export const EDGE_KIND_DESCRIPTORS: Readonly<Record<SemanticEdgeKind, EdgeKindDescriptor>> =
  Object.freeze({
    sequence: {
      kind: "sequence",
      label: "SEQUENCE",
      description: "Linear execution flow",
      accent: "#3f3f46",
      stroke: "#3f3f46",
      strokeWidth: 1.5,
      strokeDasharray: undefined,
      isDashed: false,
      animated: false,
      reverseAnimated: false,
      tone: "neutral",
      badgeVariant: "sequence",
      badgeBorder: "#3f3f46",
      badgeBg: "rgba(24, 24, 27, 0.85)",
      badgeTextColor: "#a1a1aa",
      iconName: undefined,
      icon: undefined,
      IconComponent: undefined,
      markerShape: "arrow",
      markerId: "edge-arrowhead-sequence",
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
      tone: "neutral",
      badgeVariant: "dependency",
      badgeBorder: "rgba(100, 116, 139, 0.6)",
      badgeBg: "rgba(100, 116, 139, 0.12)",
      badgeTextColor: "#94a3b8",
      iconName: "IconLink",
      icon: <IconLink size={12} />,
      IconComponent: IconLink,
      markerShape: "arrow",
      markerId: "edge-arrowhead-dependency",
    },
    join: {
      kind: "join",
      label: "JOIN",
      description: "Parallel branches converging on one successor",
      accent: "#2dd4bf",
      stroke: "#2dd4bf",
      strokeWidth: 2,
      strokeDasharray: undefined,
      isDashed: false,
      animated: false,
      reverseAnimated: false,
      tone: "neutral",
      badgeVariant: "join",
      badgeBorder: "rgba(45, 212, 191, 0.6)",
      badgeBg: "rgba(45, 212, 191, 0.12)",
      badgeTextColor: "#5eead4",
      iconName: "IconGitMerge",
      icon: <IconGitMerge size={12} />,
      IconComponent: IconGitMerge,
      markerShape: "arrow",
      markerId: "edge-arrowhead-join",
    },
    conditional: {
      kind: "conditional",
      label: "CONDITIONAL",
      description: "Taken only when a recorded condition held",
      accent: "#f59e0b",
      stroke: "#f59e0b",
      strokeWidth: 1.75,
      strokeDasharray: "10 3 2 3",
      isDashed: true,
      animated: false,
      reverseAnimated: false,
      tone: "warning",
      badgeVariant: "conditional",
      badgeBorder: "rgba(245, 158, 11, 0.6)",
      badgeBg: "rgba(245, 158, 11, 0.12)",
      badgeTextColor: "#fcd34d",
      iconName: "IconArrowsSplit2",
      icon: <IconArrowsSplit2 size={12} />,
      IconComponent: IconArrowsSplit2,
      markerShape: "arrow",
      markerId: "edge-arrowhead-conditional",
    },
    fallback: {
      kind: "fallback",
      label: "FALLBACK",
      description: "Alternate route taken after the primary one failed",
      accent: "#fb923c",
      stroke: "#fb923c",
      strokeWidth: 1.75,
      strokeDasharray: "4 4",
      isDashed: true,
      animated: false,
      reverseAnimated: false,
      tone: "warning",
      badgeVariant: "fallback",
      badgeBorder: "rgba(251, 146, 60, 0.6)",
      badgeBg: "rgba(251, 146, 60, 0.12)",
      badgeTextColor: "#fdba74",
      iconName: "IconRouteAltLeft",
      icon: <IconRouteAltLeft size={12} />,
      IconComponent: IconRouteAltLeft,
      markerShape: "arrow",
      markerId: "edge-arrowhead-fallback",
    },
    spawn: {
      kind: "spawn",
      label: "SPAWN",
      description: "A new agent was created for this work",
      accent: "#06b6d4",
      stroke: "#06b6d4",
      strokeWidth: 2,
      strokeDasharray: "6 4",
      isDashed: true,
      animated: true,
      reverseAnimated: false,
      tone: "info",
      badgeVariant: "spawn",
      badgeBorder: "rgba(6, 182, 212, 0.6)",
      badgeBg: "rgba(6, 182, 212, 0.12)",
      badgeTextColor: "#67e8f9",
      iconName: "IconRocket",
      icon: <IconRocket size={12} />,
      IconComponent: IconRocket,
      markerShape: "arrow",
      markerId: "edge-arrowhead-spawn",
    },
    dispatch: {
      kind: "dispatch",
      label: "DISPATCH",
      description: "A planned task was handed to an existing agent",
      accent: "#22d3ee",
      stroke: "#22d3ee",
      strokeWidth: 2,
      strokeDasharray: "2 5",
      isDashed: true,
      animated: true,
      reverseAnimated: false,
      tone: "info",
      badgeVariant: "dispatch",
      badgeBorder: "rgba(34, 211, 238, 0.6)",
      badgeBg: "rgba(34, 211, 238, 0.12)",
      badgeTextColor: "#a5f3fc",
      iconName: "IconArrowGuide",
      icon: <IconArrowGuide size={12} />,
      IconComponent: IconArrowGuide,
      markerShape: "arrow",
      markerId: "edge-arrowhead-dispatch",
    },
    data: {
      kind: "data",
      label: "DATA",
      description: "Artifact or data payload transfer",
      accent: "#6366f1",
      stroke: "#6366f1",
      strokeWidth: 2,
      strokeDasharray: undefined,
      isDashed: false,
      animated: false,
      reverseAnimated: false,
      tone: "neutral",
      badgeVariant: "data",
      badgeBorder: "rgba(99, 102, 241, 0.6)",
      badgeBg: "rgba(99, 102, 241, 0.12)",
      badgeTextColor: "#a5b4fc",
      iconName: "IconFileText",
      icon: <IconFileText size={12} />,
      IconComponent: IconFileText,
      markerShape: "arrow",
      markerId: "edge-arrowhead-data",
    },
    handoff: {
      kind: "handoff",
      label: "HANDOFF",
      description: "Ownership of the work passed to another agent",
      accent: "#8b5cf6",
      stroke: "#8b5cf6",
      strokeWidth: 2.25,
      strokeDasharray: undefined,
      isDashed: false,
      animated: false,
      reverseAnimated: false,
      tone: "neutral",
      badgeVariant: "handoff",
      badgeBorder: "rgba(139, 92, 246, 0.6)",
      badgeBg: "rgba(139, 92, 246, 0.12)",
      badgeTextColor: "#c4b5fd",
      iconName: "IconArrowsExchange",
      icon: <IconArrowsExchange size={12} />,
      IconComponent: IconArrowsExchange,
      markerShape: "arrow",
      markerId: "edge-arrowhead-handoff",
    },
    gate: {
      kind: "gate",
      label: "GATE",
      description: "A required check the work had to clear",
      accent: "#10b981",
      stroke: "#10b981",
      strokeWidth: 2,
      strokeDasharray: undefined,
      isDashed: false,
      animated: false,
      reverseAnimated: false,
      tone: "success",
      badgeVariant: "gate",
      badgeBorder: "rgba(16, 185, 129, 0.6)",
      badgeBg: "rgba(16, 185, 129, 0.12)",
      badgeTextColor: "#6ee7b7",
      iconName: "IconShieldCheck",
      icon: <IconShieldCheck size={12} />,
      IconComponent: IconShieldCheck,
      markerShape: "arrow",
      markerId: "edge-arrowhead-gate",
    },
    validation: {
      kind: "validation",
      label: "VALIDATION",
      description: "An independent validator reviewing the work",
      accent: "#34d399",
      stroke: "#34d399",
      strokeWidth: 2,
      strokeDasharray: "10 4",
      isDashed: true,
      animated: false,
      reverseAnimated: false,
      tone: "success",
      badgeVariant: "validation",
      badgeBorder: "rgba(52, 211, 153, 0.6)",
      badgeBg: "rgba(52, 211, 153, 0.12)",
      badgeTextColor: "#a7f3d0",
      iconName: "IconShieldSearch",
      icon: <IconShieldSearch size={12} />,
      IconComponent: IconShieldSearch,
      markerShape: "arrow",
      markerId: "edge-arrowhead-validation",
    },
    critic: {
      kind: "critic",
      label: "CRITIC",
      description: "Completeness critic weighing the run against the prompt",
      accent: "#818cf8",
      stroke: "#818cf8",
      strokeWidth: 2,
      strokeDasharray: "12 4 2 4",
      isDashed: true,
      animated: false,
      reverseAnimated: false,
      tone: "info",
      badgeVariant: "critic",
      badgeBorder: "rgba(129, 140, 248, 0.6)",
      badgeBg: "rgba(129, 140, 248, 0.12)",
      badgeTextColor: "#c7d2fe",
      iconName: "IconScale",
      icon: <IconScale size={12} />,
      IconComponent: IconScale,
      markerShape: "arrow",
      markerId: "edge-arrowhead-critic",
    },
    signoff: {
      kind: "signoff",
      label: "SIGNOFF",
      description: "Terminal approval — the work is sealed",
      accent: "#eab308",
      stroke: "#eab308",
      strokeWidth: 2.75,
      strokeDasharray: undefined,
      isDashed: false,
      animated: false,
      reverseAnimated: false,
      tone: "success",
      badgeVariant: "signoff",
      badgeBorder: "rgba(234, 179, 8, 0.75)",
      badgeBg: "rgba(234, 179, 8, 0.16)",
      badgeTextColor: "#fde047",
      iconName: "IconCertificate",
      icon: <IconCertificate size={12} />,
      IconComponent: IconCertificate,
      markerShape: "terminal",
      markerId: "edge-arrowhead-signoff",
    },
    probe: {
      kind: "probe",
      label: "PROBE",
      description: "Adversarial probe — a demand for proof, not a claim of a defect",
      accent: "#38bdf8",
      stroke: "#38bdf8",
      strokeWidth: 1.75,
      strokeDasharray: "3 3",
      isDashed: true,
      animated: false,
      reverseAnimated: false,
      tone: "info",
      badgeVariant: "probe",
      badgeBorder: "rgba(56, 189, 248, 0.6)",
      badgeBg: "rgba(56, 189, 248, 0.12)",
      badgeTextColor: "#7dd3fc",
      iconName: "IconSearch",
      icon: <IconSearch size={12} />,
      IconComponent: IconSearch,
      markerShape: "hollow",
      markerId: "edge-arrowhead-probe",
    },
    pushback: {
      kind: "pushback",
      label: "PUSHBACK",
      description: "A defect was asserted and the work was sent back",
      accent: "#f43f5e",
      stroke: "#f43f5e",
      strokeWidth: 2.5,
      strokeDasharray: undefined,
      isDashed: false,
      animated: false,
      reverseAnimated: true,
      tone: "error",
      badgeVariant: "pushback",
      badgeBorder: "rgba(244, 63, 94, 0.75)",
      badgeBg: "rgba(244, 63, 94, 0.16)",
      badgeTextColor: "#fda4af",
      iconName: "IconAlertTriangle",
      icon: <IconAlertTriangle size={12} />,
      IconComponent: IconAlertTriangle,
      markerShape: "heavy",
      markerId: "edge-arrowhead-pushback",
    },
    loop: {
      kind: "loop",
      label: "LOOP",
      description: "Repair iteration returning to an earlier step",
      accent: "#fb7185",
      stroke: "#fb7185",
      strokeWidth: 2,
      strokeDasharray: "6 4",
      isDashed: true,
      animated: true,
      reverseAnimated: true,
      tone: "warning",
      badgeVariant: "loop",
      badgeBorder: "rgba(251, 113, 133, 0.7)",
      badgeBg: "rgba(251, 113, 133, 0.14)",
      badgeTextColor: "#fecdd3",
      iconName: "IconRefresh",
      icon: <IconRefresh size={12} />,
      IconComponent: IconRefresh,
      markerShape: "arrow",
      markerId: "edge-arrowhead-loop",
    },
    branch: {
      kind: "branch",
      label: "BRANCH",
      description: "Execution-time excursion into sub-work",
      accent: "#d946ef",
      stroke: "#d946ef",
      strokeWidth: 2,
      strokeDasharray: "10 5",
      isDashed: true,
      animated: true,
      reverseAnimated: false,
      tone: "excursion",
      badgeVariant: "branch",
      badgeBorder: "rgba(217, 70, 239, 0.6)",
      badgeBg: "rgba(217, 70, 239, 0.12)",
      badgeTextColor: "#f0abfc",
      iconName: "IconGitBranch",
      icon: <IconGitBranch size={12} />,
      IconComponent: IconGitBranch,
      markerShape: "arrow",
      markerId: "edge-arrowhead-branch",
    },
    collect: {
      kind: "collect",
      label: "COLLECT",
      description: "Sub-work folded back into the parent task",
      accent: "#f0abfc",
      stroke: "#f0abfc",
      strokeWidth: 2.25,
      strokeDasharray: undefined,
      isDashed: false,
      animated: false,
      reverseAnimated: false,
      tone: "excursion",
      badgeVariant: "collect",
      badgeBorder: "rgba(240, 171, 252, 0.6)",
      badgeBg: "rgba(240, 171, 252, 0.12)",
      badgeTextColor: "#f5d0fe",
      iconName: "IconArrowMerge",
      icon: <IconArrowMerge size={12} />,
      IconComponent: IconArrowMerge,
      markerShape: "heavy",
      markerId: "edge-arrowhead-collect",
    },
    backtrack: {
      kind: "backtrack",
      label: "BACKTRACK",
      description: "Excursion abandoned — control returned upstream",
      accent: "#c084fc",
      stroke: "#c084fc",
      strokeWidth: 2,
      strokeDasharray: "2 6",
      isDashed: true,
      animated: true,
      reverseAnimated: true,
      tone: "excursion",
      badgeVariant: "backtrack",
      badgeBorder: "rgba(192, 132, 252, 0.6)",
      badgeBg: "rgba(192, 132, 252, 0.12)",
      badgeTextColor: "#e9d5ff",
      iconName: "IconArrowBackUp",
      icon: <IconArrowBackUp size={12} />,
      IconComponent: IconArrowBackUp,
      markerShape: "hollow",
      markerId: "edge-arrowhead-backtrack",
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
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowGuide,
  IconArrowMerge,
  IconArrowsExchange,
  IconArrowsSplit2,
  IconCertificate,
  IconCircleDotted,
  IconFileText,
  IconGitBranch,
  IconGitMerge,
  IconLink,
  IconRefresh,
  IconRocket,
  IconRouteAltLeft,
  IconScale,
  IconSearch,
  IconShieldCheck,
  IconShieldSearch,
  IconStack2,
});

export function getEdgeIconComponent(name?: string) {
  if (!name) return undefined;
  return EDGE_TABLER_ICONS[name];
}

/**
 * Aliases datasets have used for a kind over time. Only names that mean the *same* relationship
 * belong here — `pushback` is not an alias of `loop`, and `probe` is an alias of nothing.
 */
const EDGE_KIND_ALIASES: Readonly<Record<string, SemanticEdgeKind>> = Object.freeze({
  artifact: "data",
  certificate: "signoff",
  cycle: "loop",
  flow: "sequence",
  linear: "sequence",
  rejection: "pushback",
  requirement: "dependency",
  review: "validation",
  unlocked: "dependency",
});

const EDGE_KIND_SET = new Set<string>(EDGE_KINDS);

/** True for the kinds the preset table covers. Every other string is still a valid kind. */
export function isKnownEdgeKind(value: unknown): value is KnownEdgeKind {
  return typeof value === "string" && EDGE_KIND_SET.has(value);
}

/**
 * The arrowhead an unfamiliar kind draws. It takes its fill from the edge's own stroke, so a kind
 * with a generated accent gets an arrowhead in that accent without a marker per kind.
 */
export const GENERATED_EDGE_MARKER_ID = "edge-arrowhead-generated";

/**
 * Resolves an edge to its declared kind. `isCycle` only decides the kind when the dataset gave no
 * kind of its own: a declared `pushback` that happens to be a back-edge is still a pushback, and a
 * defect must not be dressed as a retry. A kind outside the preset table resolves to itself.
 */
export function resolveEdgeKind(edgeOrKind?: EdgeKindInput): SemanticEdgeKind {
  if (!edgeOrKind) return DEFAULT_EDGE_KIND;

  if (typeof edgeOrKind === "object") {
    if (edgeOrKind.kind) return resolveEdgeKind(edgeOrKind.kind);
    return edgeOrKind.isCycle ? "loop" : DEFAULT_EDGE_KIND;
  }

  const normalized = String(edgeOrKind).trim().toLowerCase();
  if (normalized.length === 0) return DEFAULT_EDGE_KIND;
  if (EDGE_KIND_SET.has(normalized)) return normalized;
  return EDGE_KIND_ALIASES[normalized] ?? normalized;
}

/**
 * The treatment for a kind with no preset: the kind's own name as the label, an accent derived from
 * that name so the same kind is the same colour everywhere, and a plain dashed line with a neutral
 * arrowhead — a silhouette that reads as "a relationship" without claiming which one.
 */
function generatedEdgeDescriptor(kind: SemanticEdgeKind): EdgeKindDescriptor {
  const accent = stableAccent(kind);
  return {
    kind,
    label: vocabularyLabel(kind),
    description: `Relationship recorded as "${kind}"`,
    accent,
    stroke: accent,
    strokeWidth: 1.75,
    strokeDasharray: "7 4",
    isDashed: true,
    animated: false,
    reverseAnimated: false,
    tone: "neutral",
    badgeVariant: "generated",
    badgeBorder: accent,
    badgeBg: "rgba(24, 24, 27, 0.85)",
    badgeTextColor: accent,
    iconName: "IconCircleDotted",
    icon: <IconCircleDotted size={12} />,
    IconComponent: IconCircleDotted,
    markerShape: "arrow",
    markerId: GENERATED_EDGE_MARKER_ID,
  };
}

/**
 * Returns the rich descriptor for a given edge or semantic kind. Never throws and never substitutes
 * one kind's treatment for another's.
 */
export function describeEdgeKind(edgeOrKind?: EdgeKindInput): EdgeKindDescriptor {
  const resolved = resolveEdgeKind(edgeOrKind);
  return hasPreset(EDGE_KIND_DESCRIPTORS, resolved)
    ? EDGE_KIND_DESCRIPTORS[resolved]
    : generatedEdgeDescriptor(resolved);
}

/**
 * The colour an edge draws itself in. A dataset-supplied `accent` wins; otherwise the kind decides.
 * Nothing here consults the source node, because an edge's colour must say what it means and not
 * where it came from.
 */
export function resolveEdgeAccent(
  edge?: {
    accent?: string | undefined;
    kind?: EdgeKind | string | undefined;
    isCycle?: boolean | undefined;
  } | null,
): string {
  if (edge?.accent) return edge.accent;
  return describeEdgeKind(edge).accent;
}

/**
 * The custom properties that carry a kind's treatment onto the DOM, so the stylesheet never holds a
 * second copy of the palette that can drift from the descriptor table.
 */
export function edgeKindStyleVars(descriptor: EdgeKindDescriptor, accent?: string): CSSProperties {
  return {
    "--edge-kind-stroke": accent ?? descriptor.stroke,
    "--edge-kind-width": `${descriptor.strokeWidth}px`,
    "--edge-kind-dash": descriptor.strokeDasharray ?? "none",
    "--edge-kind-text": descriptor.badgeTextColor,
    "--edge-kind-badge-bg": descriptor.badgeBg,
    "--edge-kind-badge-border": descriptor.badgeBorder,
  } as CSSProperties;
}
