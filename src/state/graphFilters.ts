import { readDeclaredRole } from "../primitives/vocabulary";
import type { GraphNodeData } from "../types/graphData";
import {
  canonicalRoleSpelling,
  resolveNodeRole,
  roleGroupOf,
  type NodeRole,
  type RoleGroup,
} from "./graphSchema";

/**
 * The quick-filter vocabulary, aligned with the run's role vocabulary rather than with node shapes.
 * `orchestrators` and `error` are the pre-realignment spellings of `coordination` and `errors`; they
 * stay so a stored filter or an older caller keeps working. `role:<id>` is not a fixed member of this
 * union — it is a family of filters, one per role this graph actually declared, built at render time
 * so a reader can single out one role (e.g. only the UI-design validators) as well as its group (every
 * validator). It is never a preset list: a graph that names a role this renderer has never shipped a
 * preset for is just as filterable by it as one that names a role from the shipped vocabulary.
 */
export type FilterCategory =
  | "all"
  | "coordination"
  | "orchestrators"
  | "implementers"
  | "validators"
  | "repairers"
  | "critics"
  | "sub-agents"
  | "errors"
  | "error"
  | "success"
  | "tools"
  | `role:${string}`;

const ROLE_GROUP_FILTERS: Readonly<Record<string, RoleGroup>> = {
  coordination: "coordination",
  orchestrators: "coordination",
  implementers: "implementer",
  validators: "validator",
  repairers: "repairer",
  critics: "critic",
  "sub-agents": "sub-agent",
};

const ROLE_FILTER_PREFIX = "role:";

/** The single-role filter for `roleId`, e.g. the UI-design validator role rather than every validator. */
export function roleFilterId(roleId: string): FilterCategory {
  return `${ROLE_FILTER_PREFIX}${roleId}`;
}

/** The role a `role:<id>` filter singles out, or `undefined` for any other filter category. */
export function roleIdFromFilter(filter: FilterCategory): string | undefined {
  return filter.startsWith(ROLE_FILTER_PREFIX)
    ? filter.slice(ROLE_FILTER_PREFIX.length)
    : undefined;
}

export function canonicalFilterCategory(filter: FilterCategory): FilterCategory {
  if (filter === "orchestrators") return "coordination";
  if (filter === "error") return "errors";
  return filter;
}

export interface FilterableRole {
  /** The role identity to filter and group by: the run's own recorded spelling when it named one,
   * even a role this renderer ships no preset for; the node-kind-implied role only when the node
   * named no role at all. */
  id: NodeRole;
  /** False when `id` came from the node's kind rather than something the run recorded. */
  declared: boolean;
  /** True when `id` is one this renderer ships a group/label for; false for the run's own words. */
  isPreset: boolean;
}

/**
 * The one place that decides what a node's role identity *is*, for both filtering and display, so
 * the two can never disagree about which nodes are "the UI-design validators". A role the run
 * recorded outside the preset vocabulary is kept under its own name rather than folded into
 * whatever the node's kind would otherwise imply.
 */
export function resolveFilterableRole(node: GraphNodeData): FilterableRole | undefined {
  const metadata = node.metadata;
  const raw =
    readDeclaredRole(node.telemetry?.role, metadata) ?? readDeclaredRole(metadata?.role, metadata);
  const resolved = resolveNodeRole(node);

  // The run's own most specific word wins whenever this renderer ships no member for it, so a
  // domain it has never seen is still that node's own role here and on its card, rather than the
  // two views disagreeing about which nodes are "the UI-design validators".
  if (raw !== undefined && canonicalRoleSpelling(raw) === undefined) {
    return { id: raw, declared: true, isPreset: false };
  }
  if (resolved !== undefined) {
    return { id: resolved.role, declared: resolved.declared, isPreset: true };
  }
  return undefined;
}

function statusText(node: GraphNodeData): string {
  const badgeVariant = node.badges?.find((badge) => badge.variant !== undefined)?.variant ?? "";
  const metadataStatus = node.metadata?.status;
  const metadataText = typeof metadataStatus === "string" ? metadataStatus : "";
  return `${node.status ?? ""} ${badgeVariant} ${metadataText}`.toLowerCase();
}

/**
 * The single predicate behind both the sidebar chips and the canvas dimming, so a filter can never
 * count one set of nodes and highlight another.
 */
export function matchesFilterCategory(node: GraphNodeData, filter: FilterCategory): boolean {
  if (filter === "all") return true;

  const roleId = roleIdFromFilter(filter);
  if (roleId !== undefined) {
    return resolveFilterableRole(node)?.id === roleId;
  }

  const roleGroup = ROLE_GROUP_FILTERS[filter];
  if (roleGroup !== undefined) {
    const resolved = resolveNodeRole(node);
    return resolved !== undefined && roleGroupOf(resolved.role) === roleGroup;
  }

  if (filter === "errors" || filter === "error") {
    const text = statusText(node);
    return text.includes("error") || text.includes("fail");
  }

  if (filter === "success") {
    const text = statusText(node);
    return text.includes("success") || text.includes("complete");
  }

  if (filter === "tools") {
    return node.kind === "tool" || (node.tools?.length ?? 0) > 0;
  }

  return true;
}
