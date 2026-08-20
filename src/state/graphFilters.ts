import type { GraphNodeData } from "../types/graphData";
import { resolveNodeRole, roleGroupOf, type RoleGroup } from "./graphSchema";

/**
 * The quick-filter vocabulary, aligned with the run's role vocabulary rather than with node shapes.
 * `orchestrators` and `error` are the pre-realignment spellings of `coordination` and `errors`; they
 * stay so a stored filter or an older caller keeps working.
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
  | "tools";

const ROLE_GROUP_FILTERS: Readonly<Record<string, RoleGroup>> = {
  coordination: "coordination",
  orchestrators: "coordination",
  implementers: "implementer",
  validators: "validator",
  repairers: "repairer",
  critics: "critic",
  "sub-agents": "sub-agent",
};

export function canonicalFilterCategory(filter: FilterCategory): FilterCategory {
  if (filter === "orchestrators") return "coordination";
  if (filter === "error") return "errors";
  return filter;
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
