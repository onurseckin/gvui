import type { ComponentType, ReactNode } from "react";
import {
  IconAlertCircle,
  IconArrowBackUp,
  IconBug,
  IconClipboardCheck,
  IconEye,
  IconGitBranch,
  IconHammer,
  IconListCheck,
  IconMapSearch,
  IconMicroscope,
  IconShieldLock,
  IconSitemap,
  IconTool,
  IconAlertTriangle,
  IconArrowRight,
  IconArrowsExchange,
  IconBan,
  IconBinary,
  IconCheck,
  IconCircleDotted,
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
import {
  NODE_ROLES,
  type GraphNodeData,
  type KnownNodeRole,
  type NodeKind,
  type NodeRole,
  type NodeStatus,
} from "../../../types/graphData";
import { UNKNOWN_LABEL } from "../../../state/graphSchema";
import {
  hasPreset,
  readDeclaredRole,
  readVocabularyMember,
  stableAccent,
  vocabularyLabel,
} from "../../vocabulary";

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

/**
 * The preset kind treatments. A dataset that uses none of these is not a broken dataset: every
 * member outside the table gets a generated treatment of the same shape.
 */
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

/**
 * The archetype a node draws itself as: its kind, refined by the role its agent held. Kind alone
 * cannot separate an implementer from the validator that reviewed it — both are `kind: "agent"` —
 * so the role decides whenever the run recorded one.
 */
export interface NodeArchetypeDescriptor extends NodeKindDescriptor {
  role?: NodeRole;
}

/**
 * The preset role treatments the orchestration producer speaks. This is a preset table, not the
 * schema: a foreign dataset may extend it, replace it, or name no roles at all. The five
 * `validator-*` domain roles are deliberately distinct from `validator` and from one another —
 * a security review and a UI-design review check different things with different evidence, so
 * they never collapse into a single generic "validator" treatment.
 */
export const NODE_ROLE_DESCRIPTORS: Readonly<Record<NodeRole, NodeArchetypeDescriptor>> =
  Object.freeze({
    coordinator: {
      role: "coordinator",
      label: "COORDINATOR",
      accent: "#3b82f6",
      icon: <IconHierarchy2 size={14} />,
      IconComponent: IconHierarchy2,
    },
    planner: {
      role: "planner",
      label: "PLANNER",
      accent: "#60a5fa",
      icon: <IconListCheck size={14} />,
      IconComponent: IconListCheck,
    },
    implementer: {
      role: "implementer",
      label: "IMPLEMENTER",
      accent: "#06b6d4",
      icon: <IconHammer size={14} />,
      IconComponent: IconHammer,
    },
    validator: {
      role: "validator",
      label: "VALIDATOR",
      accent: "#10b981",
      icon: <IconShieldCheck size={14} />,
      IconComponent: IconShieldCheck,
    },
    "plan-validator": {
      role: "plan-validator",
      label: "PLAN VALIDATOR",
      accent: "#14b8a6",
      icon: <IconMapSearch size={14} />,
      IconComponent: IconMapSearch,
    },
    repairer: {
      role: "repairer",
      label: "REPAIRER",
      accent: "#f59e0b",
      icon: <IconTool size={14} />,
      IconComponent: IconTool,
    },
    "completeness-critic": {
      role: "completeness-critic",
      label: "COMPLETENESS CRITIC",
      accent: "#818cf8",
      icon: <IconScale size={14} />,
      IconComponent: IconScale,
    },
    "sub-implementer": {
      role: "sub-implementer",
      label: "SUB-IMPLEMENTER",
      accent: "#22d3ee",
      icon: <IconGitBranch size={14} />,
      IconComponent: IconGitBranch,
    },
    "sub-validator": {
      role: "sub-validator",
      label: "SUB-VALIDATOR",
      accent: "#34d399",
      icon: <IconShieldSearch size={14} />,
      IconComponent: IconShieldSearch,
    },
    "sub-investigator": {
      role: "sub-investigator",
      label: "SUB-INVESTIGATOR",
      accent: "#d946ef",
      icon: <IconMicroscope size={14} />,
      IconComponent: IconMicroscope,
    },
    "validator-code-quality": {
      role: "validator-code-quality",
      label: "CODE QUALITY VALIDATOR",
      accent: "#84cc16",
      icon: <IconBug size={14} />,
      IconComponent: IconBug,
    },
    "validator-system-design": {
      role: "validator-system-design",
      label: "SYSTEM DESIGN VALIDATOR",
      accent: "#22c55e",
      icon: <IconSitemap size={14} />,
      IconComponent: IconSitemap,
    },
    "validator-security": {
      role: "validator-security",
      label: "SECURITY VALIDATOR",
      accent: "#e23653",
      icon: <IconShieldLock size={14} />,
      IconComponent: IconShieldLock,
    },
    "validator-product": {
      role: "validator-product",
      label: "PRODUCT VALIDATOR",
      accent: "#e236a9",
      icon: <IconClipboardCheck size={14} />,
      IconComponent: IconClipboardCheck,
    },
    "validator-ui-design": {
      role: "validator-ui-design",
      label: "UI DESIGN VALIDATOR",
      accent: "#9011d0",
      icon: <IconEye size={14} />,
      IconComponent: IconEye,
    },
  });

const NODE_ROLE_SET = new Set<string>(NODE_ROLES);

/** True for a role the shipped vocabulary names. Every other string is still a valid role. */
export function isKnownNodeRole(value: unknown): value is KnownNodeRole {
  return typeof value === "string" && NODE_ROLE_SET.has(value);
}

/**
 * The kind the node declared, verbatim. Reporting a kind the table has never seen as `agent` would
 * be a fabrication, so only a node that declared nothing at all gets the default.
 */
export function resolveNodeKind(node: Pick<GraphNodeData, "kind">): NodeKind {
  return readVocabularyMember(node.kind) ?? DEFAULT_NODE_KIND;
}

/**
 * The role the node declared, from `telemetry.role` or the producer's metadata, carrying the domain
 * the run recorded it against so a security review and a UI-design review are two roles here rather
 * than one. A role outside the preset table is still that node's role and keeps its own name.
 */
export function resolveNodeRole(
  node: Pick<GraphNodeData, "telemetry" | "metadata">,
): NodeRole | undefined {
  const metadata = node.metadata;
  return (
    readDeclaredRole(node.telemetry?.role, metadata) ?? readDeclaredRole(metadata?.role, metadata)
  );
}

/**
 * The treatment for a member with no preset: its own name as the label, an accent derived from that
 * name so it is stable and distinguishable, and a neutral silhouette that claims nothing.
 */
function generatedArchetype(member: string, role?: NodeRole): NodeArchetypeDescriptor {
  return {
    ...(role === undefined ? {} : { role }),
    label: vocabularyLabel(member),
    accent: stableAccent(member),
    icon: <IconCircleDotted size={14} />,
    IconComponent: IconCircleDotted,
  };
}

/**
 * The archetype a node draws itself as. A declared role wins over the kind because it is the more
 * specific statement about the node; either one may be a member this renderer has never seen, and
 * then the treatment is generated from the member's own name.
 */
export function describeNodeArchetype(
  node: Pick<GraphNodeData, "kind" | "telemetry" | "metadata">,
): NodeArchetypeDescriptor {
  const role = resolveNodeRole(node);
  if (role !== undefined) {
    return hasPreset(NODE_ROLE_DESCRIPTORS, role)
      ? NODE_ROLE_DESCRIPTORS[role]
      : generatedArchetype(role, role);
  }
  const kind = resolveNodeKind(node);
  return hasPreset(NODE_KIND_DESCRIPTORS, kind)
    ? NODE_KIND_DESCRIPTORS[kind]
    : generatedArchetype(kind);
}

/** The canvas-wide entry point; the descriptor it returns is the archetype, not the bare kind. */
export function describeNodeKind(
  node: Pick<GraphNodeData, "kind" | "telemetry" | "metadata">,
): NodeArchetypeDescriptor {
  return describeNodeArchetype(node);
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

/**
 * The lifecycle the node declared, verbatim. Status is an open vocabulary on the same terms as kind
 * and role: a state this renderer ships no preset for is still the truth about that node, and
 * redrawing it as `pending` would tell the reader something the dataset never said. Only a node
 * that declared no status at all falls through to what its badge or metadata recorded.
 */
export function resolveNodeStatus(node: GraphNodeData): NodeStatus {
  const declared = readVocabularyMember(node.status);
  if (declared !== undefined) return declared;
  const badgeVariant = node.badges?.find((badge) => badge.variant)?.variant;
  if (badgeVariant && hasPreset(LEGACY_BADGE_STATUS, badgeVariant)) {
    return LEGACY_BADGE_STATUS[badgeVariant];
  }
  const raw = String(node.metadata?.status ?? "").toLowerCase();
  if (raw.includes("complete") || raw.includes("success") || raw.includes("done")) return "success";
  if (raw.includes("error") || raw.includes("fail")) return "error";
  if (raw.includes("running") || raw.includes("progress")) return "running";
  if (raw.includes("skip")) return "skipped";
  if (raw.includes("cache")) return "cached";
  if (raw.includes("warn")) return "warning";
  return "pending";
}

/**
 * The treatment for a lifecycle with no preset: the state's own name in the same register as the
 * preset labels, an accent generated from that name so it is stable and told apart from its
 * neighbours, and a silhouette that claims nothing about what the state means.
 */
function generatedStatusDescriptor(status: NodeStatus): NodeStatusDescriptor {
  const words = vocabularyLabel(status).split(" ");
  return {
    label: words.map((word) => word.charAt(0) + word.slice(1).toLowerCase()).join(" "),
    color: stableAccent(status),
    IconComponent: IconCircleDotted,
  };
}

export function describeNodeStatus(node: GraphNodeData): NodeStatusDescriptor {
  const status = resolveNodeStatus(node);
  return hasPreset(NODE_STATUS_DESCRIPTORS, status)
    ? NODE_STATUS_DESCRIPTORS[status]
    : generatedStatusDescriptor(status);
}

export const MODEL_TIER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  xs: "XS",
  s: "S",
  m: "M",
  l: "L",
});

/**
 * Host-reported tier only. Deriving one from a model name would hardcode vendor names and render a
 * guess in the same chip as a measurement, so an unreported tier stays absent.
 */
export function resolveModelTier(node: GraphNodeData): string | undefined {
  const reported = node.telemetry?.modelTier?.value ?? node.hostAgent?.tier;
  if (typeof reported !== "string") return undefined;
  const trimmed = reported.trim();
  if (trimmed.length === 0 || trimmed === UNKNOWN_LABEL) return undefined;
  return trimmed;
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
  IconCircleDotted,
  IconX,
  IconClock,
  IconLoader2,
  IconArrowBackUp,
  IconGitBranch,
  IconHammer,
  IconListCheck,
  IconMicroscope,
  IconTool,
  IconBug,
  IconClipboardCheck,
  IconEye,
  IconShieldLock,
  IconSitemap,
  IconMapSearch,
};

export function getTablerIconComponent(name?: string) {
  if (!name) return undefined;
  return TABLER_ICON_REGISTRY[name];
}
