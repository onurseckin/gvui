import type { FC } from "react";
import React, { useCallback, useMemo } from "react";
import type { GraphDataset, GraphNodeData } from "../../types/graphData";
import {
  roleGroupOf,
  ROLE_GROUP_LABELS,
  ROLE_GROUPS,
  ROLE_LABELS,
  UNKNOWN_LABEL,
  type NodeRole,
  type RoleGroup,
} from "../../state/graphSchema";
import {
  resolveFilterableRole,
  roleFilterId,
  roleIdFromFilter,
  type FilterCategory,
} from "../../state/graphFilters";
import { humanizeKey, stableAccent } from "../OpenSchema";
import { SidebarAccordion } from "./SidebarAccordion";

export interface SidebarRoleBreakdownProps {
  dataset: GraphDataset | null;
  defaultExpanded?: boolean;
  /** The graph's current single-role or role-group filter, if any. Absent chips render inert. */
  activeFilter?: FilterCategory;
  /** Called with the clicked role's own filter id when a role chip is selected, and with the same
   * id again to clear it — the caller owns the toggle-back-to-"all" behaviour, same as the group
   * quick-filters, so the two controls can never disagree about what "already active" means. */
  onFilterChange?: (filter: FilterCategory) => void;
}

/** A label to show in place of a preset chip's role name; falls back to the role's own spelling so
 * a role this dataset declared is never rendered as the literal word "undefined". */
function roleLabel(role: NodeRole): string {
  return ROLE_LABELS[role] ?? humanizeKey(role);
}

interface RoleGroupSummary {
  group: RoleGroup;
  label: string;
  count: number;
  /** How many of the nodes in the group carried a recorded role rather than an implied one. */
  declaredCount: number;
  roles: Array<{ role: NodeRole; count: number }>;
}

/** A role this dataset named for itself, outside the preset vocabulary. */
interface OtherRoleSummary {
  role: string;
  label: string;
  accent: string;
  count: number;
}

interface RoleBreakdown {
  groups: RoleGroupSummary[];
  otherRoles: OtherRoleSummary[];
  unroledCount: number;
  totalNodes: number;
}

function buildRoleBreakdown(nodes: readonly GraphNodeData[]): RoleBreakdown {
  const groups = new Map<
    RoleGroup,
    { count: number; declared: number; roles: Map<NodeRole, number> }
  >();
  const others = new Map<string, number>();
  let unroledCount = 0;

  for (const node of nodes) {
    const identity = resolveFilterableRole(node);

    if (identity === undefined) {
      unroledCount += 1;
      continue;
    }

    // A role the run declared but the preset table does not carry is that dataset's own role, not
    // an absent one. It keeps its own name here instead of collapsing into unknown.
    if (!identity.isPreset) {
      others.set(identity.id, (others.get(identity.id) ?? 0) + 1);
      continue;
    }

    const group = roleGroupOf(identity.id);
    const bucket = groups.get(group) ?? { count: 0, declared: 0, roles: new Map() };
    bucket.count += 1;
    if (identity.declared) bucket.declared += 1;
    bucket.roles.set(identity.id, (bucket.roles.get(identity.id) ?? 0) + 1);
    groups.set(group, bucket);
  }

  const summaries: RoleGroupSummary[] = [];
  for (const group of ROLE_GROUPS) {
    const bucket = groups.get(group);
    if (bucket === undefined) continue;
    summaries.push({
      group,
      label: ROLE_GROUP_LABELS[group],
      count: bucket.count,
      declaredCount: bucket.declared,
      roles: [...bucket.roles.entries()]
        .map(([role, count]) => ({ role, count }))
        .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role)),
    });
  }

  const otherRoles: OtherRoleSummary[] = [...others.entries()]
    .map(([role, count]) => ({ role, label: humanizeKey(role), accent: stableAccent(role), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return { groups: summaries, otherRoles, unroledCount, totalNodes: nodes.length };
}

/**
 * A graph-level answer to "who did the work". The drawer answers "what did this one node do", so
 * this deliberately carries counts and no per-node detail.
 */
export const SidebarRoleBreakdown: FC<SidebarRoleBreakdownProps> = React.memo(
  function SidebarRoleBreakdown({ dataset, defaultExpanded = true, activeFilter, onFilterChange }) {
    const breakdown = useMemo(() => buildRoleBreakdown(dataset?.nodes ?? []), [dataset]);
    const activeRoleId = activeFilter === undefined ? undefined : roleIdFromFilter(activeFilter);

    // Selecting the already-active role clears it, matching the group quick-filters' own toggle so
    // the two controls never disagree about what "already filtered to this" means.
    const handleRoleClick = useCallback(
      (roleId: string) => {
        if (onFilterChange === undefined) return;
        onFilterChange(activeRoleId === roleId ? "all" : roleFilterId(roleId));
      },
      [onFilterChange, activeRoleId],
    );

    const renderRoleChip = (
      roleId: string,
      label: string,
      count: number,
      className: string,
      style?: React.CSSProperties,
      title?: string,
    ) => {
      const isActive = activeRoleId === roleId;
      const sharedProps = {
        className: `${className}${isActive ? " is-active" : ""}`,
        "data-testid": `role-chip-${roleId}`,
        style,
        title,
      };
      const content = (
        <>
          {label}
          <span className="sidebar-role-chip-count">{count}</span>
        </>
      );
      // Rendered inert (a span) when the caller wired no filter, so a breakdown shown outside the
      // graph view — a report export, a test fixture — never offers a control that does nothing.
      if (onFilterChange === undefined) {
        return (
          <span key={roleId} {...sharedProps}>
            {content}
          </span>
        );
      }
      return (
        <button
          key={roleId}
          {...sharedProps}
          type="button"
          onClick={() => handleRoleClick(roleId)}
          aria-pressed={isActive}
        >
          {content}
        </button>
      );
    };

    if (breakdown.totalNodes === 0) {
      return (
        <div className="sidebar-section" data-testid="sidebar-role-breakdown">
          <div className="sidebar-section-header">
            <h4 className="sidebar-section-title">Roles</h4>
          </div>
          <p className="sidebar-empty-state">No nodes to group</p>
        </div>
      );
    }

    return (
      <SidebarAccordion
        testId="sidebar-role-breakdown"
        title="Roles"
        badge={`${breakdown.groups.length + breakdown.otherRoles.length} ${
          breakdown.groups.length + breakdown.otherRoles.length === 1 ? "group" : "groups"
        }`}
        defaultExpanded={defaultExpanded}
      >
        <div className="sidebar-role-list">
          {breakdown.groups.map((group) => (
            <div
              key={group.group}
              className={`sidebar-role-group role-${group.group}`}
              data-testid={`role-group-${group.group}`}
            >
              <div className="sidebar-role-group-header">
                <span className="sidebar-role-group-label">{group.label}</span>
                <span
                  className="sidebar-role-group-count"
                  data-testid={`role-group-count-${group.group}`}
                >
                  {group.count}
                </span>
              </div>
              <div className="sidebar-role-chips">
                {group.roles.map((entry) =>
                  renderRoleChip(
                    entry.role,
                    roleLabel(entry.role),
                    entry.count,
                    "sidebar-role-chip",
                  ),
                )}
              </div>
              {group.declaredCount < group.count ? (
                <p
                  className="sidebar-note is-derived"
                  data-testid={`role-group-derived-${group.group}`}
                >
                  {group.count - group.declaredCount} of {group.count} inferred from the node kind —
                  the run recorded no role for them.
                </p>
              ) : null}
            </div>
          ))}
        </div>
        {breakdown.otherRoles.length > 0 ? (
          <div className="sidebar-role-group role-other" data-testid="role-group-other">
            <div className="sidebar-role-group-header">
              <span className="sidebar-role-group-label">This graph&apos;s own roles</span>
              <span className="sidebar-role-group-count" data-testid="role-group-count-other">
                {breakdown.otherRoles.reduce((total, entry) => total + entry.count, 0)}
              </span>
            </div>
            <div className="sidebar-role-chips">
              {breakdown.otherRoles.map((entry) =>
                renderRoleChip(
                  entry.role,
                  entry.label,
                  entry.count,
                  "sidebar-role-chip is-custom",
                  { borderColor: entry.accent },
                  entry.role,
                ),
              )}
            </div>
          </div>
        ) : null}
        {breakdown.unroledCount > 0 ? (
          <div className="sidebar-role-group role-unknown" data-testid="role-group-unknown">
            <div className="sidebar-role-group-header">
              <span className="sidebar-role-group-label">{UNKNOWN_LABEL}</span>
              <span className="sidebar-role-group-count" data-testid="role-group-count-unknown">
                {breakdown.unroledCount}
              </span>
            </div>
            <p className="sidebar-note">Nodes with no role and no role-bearing kind.</p>
          </div>
        ) : null}
      </SidebarAccordion>
    );
  },
);

SidebarRoleBreakdown.displayName = "SidebarRoleBreakdown";
