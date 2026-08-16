import {
  IconAlertTriangle,
  IconArrowRight,
  IconBrain,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconFileCode,
  IconFilter,
  IconHierarchy2,
  IconPlayerPlay,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import type { FC, MouseEvent } from "react";
import { memo, useCallback, useMemo, useState } from "react";
import { useGraphStore } from "../../../state/useGraphStore";
import type { GraphDataset, GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { formatDuration, formatTokens } from "../streamUtils";

export type AgentRole =
  | "coordinator"
  | "orchestrator"
  | "subagent"
  | "agent"
  | "implementer"
  | "validator"
  | "critic"
  | "worker"
  | "tool"
  | "router"
  | "join"
  | string;

export type SubagentStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "warning"
  | "skipped"
  | "leased"
  | "validating"
  | "satisfied"
  | "rejected"
  | "repaired"
  | string;

export interface SubagentLineageNode {
  id: string;
  nodeId?: string;
  name: string;
  role?: AgentRole;
  status?: SubagentStatus;
  depth?: number;
  model?: string;
  tier?: string;
  durationMs?: number;
  tokens?: number;
  costUsd?: number;
  task?: string;
  taskId?: string;
  leaseToken?: string;
  writeScope?: string[];
  repairRounds?: number;
  retries?: number;
  summary?: string;
  children?: SubagentLineageNode[];
  [key: string]: unknown;
}

export interface SubagentLineageTreeProps {
  node: GraphNodeData;
  dataset?: GraphDataset | null;
  onSelectNode?: (nodeId: string) => void;
  selectedNodeId?: string | null;
  className?: string;
  hideIfEmpty?: boolean;
}

export interface RoleDescriptor {
  label: string;
  badgeClass: string;
  color: string;
  bg: string;
  border: string;
  roleType: "coordinator" | "subagent" | "implementer" | "validator" | "tool" | "other";
}

export interface StatusDescriptor {
  label: string;
  statusClass: string;
  color: string;
  bg: string;
  border: string;
  animated: boolean;
}

/**
 * Normalizes an agent role into a standardized descriptor with label, styling tokens, and role archetype.
 */
export function normalizeRole(role?: unknown): RoleDescriptor {
  const r = String(role ?? "")
    .toLowerCase()
    .trim();
  if (
    r === "coordinator" ||
    r === "orchestrator" ||
    r === "lead" ||
    r === "parent" ||
    r === "planner" ||
    r === "meta-orchestrator"
  ) {
    return {
      label: "COORDINATOR",
      badgeClass: "drawer-role-badge drawer-role-badge--coordinator",
      color: "#818cf8",
      bg: "rgba(129, 140, 248, 0.15)",
      border: "rgba(129, 140, 248, 0.35)",
      roleType: "coordinator",
    };
  }
  if (
    r === "implementer" ||
    r === "impl" ||
    r === "builder" ||
    r === "developer" ||
    r === "coder" ||
    r === "author"
  ) {
    return {
      label: "IMPLEMENTER",
      badgeClass: "drawer-role-badge drawer-role-badge--implementer",
      color: "#c084fc",
      bg: "rgba(192, 132, 252, 0.15)",
      border: "rgba(192, 132, 252, 0.35)",
      roleType: "implementer",
    };
  }
  if (
    r === "validator" ||
    r === "val" ||
    r === "critic" ||
    r === "reviewer" ||
    r === "auditor" ||
    r === "verifier" ||
    r === "gate"
  ) {
    return {
      label: "VALIDATOR",
      badgeClass: "drawer-role-badge drawer-role-badge--validator",
      color: "#fbbf24",
      bg: "rgba(251, 191, 36, 0.15)",
      border: "rgba(251, 191, 36, 0.35)",
      roleType: "validator",
    };
  }
  if (r === "tool" || r === "runner" || r === "action" || r === "executor" || r === "terminal") {
    return {
      label: "TOOL",
      badgeClass: "drawer-role-badge drawer-role-badge--tool",
      color: "#94a3b8",
      bg: "rgba(148, 163, 184, 0.15)",
      border: "rgba(148, 163, 184, 0.3)",
      roleType: "tool",
    };
  }
  if (r === "subagent" || r === "agent" || r === "worker" || r === "lane" || r === "child") {
    return {
      label: "SUBAGENT",
      badgeClass: "drawer-role-badge drawer-role-badge--subagent",
      color: "#38bdf8",
      bg: "rgba(56, 189, 248, 0.15)",
      border: "rgba(56, 189, 248, 0.35)",
      roleType: "subagent",
    };
  }
  return {
    label: role ? String(role).toUpperCase() : "AGENT",
    badgeClass: "drawer-role-badge drawer-role-badge--other",
    color: "#a1a1aa",
    bg: "rgba(161, 161, 170, 0.12)",
    border: "rgba(161, 161, 170, 0.25)",
    roleType: "other",
  };
}

/**
 * Normalizes execution and lifecycle status into colors, labels, and animation flags.
 */
export function describeLineageStatus(status?: unknown): StatusDescriptor {
  const s = String(status ?? "")
    .toLowerCase()
    .trim();
  switch (s) {
    case "success":
    case "satisfied":
    case "passed":
    case "completed":
    case "approved":
    case "resolved":
      return {
        label: "Success",
        statusClass: "drawer-lineage-status is-success",
        color: "#34d399",
        bg: "rgba(52, 211, 153, 0.12)",
        border: "rgba(52, 211, 153, 0.35)",
        animated: false,
      };
    case "running":
    case "validating":
    case "validating_gate":
    case "in_progress":
    case "leased":
    case "active":
      return {
        label:
          s === "validating" || s === "validating_gate"
            ? "Validating"
            : s === "leased"
              ? "Leased"
              : "Running",
        statusClass: "drawer-lineage-status is-running",
        color: "#38bdf8",
        bg: "rgba(56, 189, 248, 0.15)",
        border: "rgba(56, 189, 248, 0.4)",
        animated: true,
      };
    case "error":
    case "rejected":
    case "failed":
    case "pushback":
      return {
        label: s === "rejected" || s === "pushback" ? "Rejected" : "Failed",
        statusClass: "drawer-lineage-status is-error",
        color: "#f87171",
        bg: "rgba(248, 113, 113, 0.15)",
        border: "rgba(248, 113, 113, 0.4)",
        animated: false,
      };
    case "warning":
    case "repaired":
    case "retry":
      return {
        label: s === "repaired" ? "Repaired" : "Warning",
        statusClass: "drawer-lineage-status is-warning",
        color: "#fbbf24",
        bg: "rgba(251, 191, 36, 0.15)",
        border: "rgba(251, 191, 36, 0.35)",
        animated: false,
      };
    case "pending":
    case "queued":
    case "ready":
    case "waiting":
      return {
        label: "Pending",
        statusClass: "drawer-lineage-status is-pending",
        color: "#94a3b8",
        bg: "rgba(148, 163, 184, 0.12)",
        border: "rgba(148, 163, 184, 0.25)",
        animated: false,
      };
    case "skipped":
    case "cancelled":
      return {
        label: "Skipped",
        statusClass: "drawer-lineage-status is-skipped",
        color: "#71717a",
        bg: "rgba(113, 113, 122, 0.12)",
        border: "rgba(113, 113, 122, 0.25)",
        animated: false,
      };
    default:
      return {
        label: status ? String(status).toUpperCase() : "READY",
        statusClass: "drawer-lineage-status is-neutral",
        color: "#d4d4d8",
        bg: "rgba(255, 255, 255, 0.06)",
        border: "#27272a",
        animated: false,
      };
  }
}

/**
 * Normalizes a raw tree node record into a clean SubagentLineageNode structure.
 */
function normalizeRawNode(raw: unknown, defaultDepth = 0): SubagentLineageNode | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const id = String(
    obj.id ??
      obj.nodeId ??
      obj.taskId ??
      obj.name ??
      `agent-${Math.random().toString(36).slice(2, 7)}`,
  );
  const name = String(obj.name ?? obj.label ?? obj.title ?? obj.id ?? "Subagent");
  const role = (obj.role ??
    obj.kind ??
    obj.agentRole ??
    (obj.children ? "coordinator" : "subagent")) as AgentRole;
  const status = (obj.status ?? obj.state ?? "pending") as SubagentStatus;
  const model = obj.model ? String(obj.model) : undefined;
  const tier = obj.tier ? String(obj.tier) : undefined;
  const depth = typeof obj.depth === "number" ? obj.depth : defaultDepth;
  const durationMs = typeof obj.durationMs === "number" ? obj.durationMs : undefined;
  const tokens =
    typeof obj.tokens === "number"
      ? obj.tokens
      : typeof obj.tokensIn === "number"
        ? obj.tokensIn
        : undefined;
  const costUsd = typeof obj.costUsd === "number" ? obj.costUsd : undefined;
  const task = obj.task ? String(obj.task) : undefined;
  const taskId = obj.taskId ? String(obj.taskId) : undefined;
  const leaseToken = obj.leaseToken ? String(obj.leaseToken) : undefined;
  const summary = obj.summary
    ? String(obj.summary)
    : obj.description
      ? String(obj.description)
      : undefined;
  const repairRounds = typeof obj.repairRounds === "number" ? obj.repairRounds : undefined;
  const retries = typeof obj.retries === "number" ? obj.retries : undefined;
  const writeScope = Array.isArray(obj.writeScope)
    ? (obj.writeScope.map((s) => String(s)) as string[])
    : Array.isArray(obj.write_scope)
      ? (obj.write_scope.map((s) => String(s)) as string[])
      : undefined;

  const rawChildren = (obj.children ?? obj.subagents ?? obj.delegations ?? obj.workers) as
    | unknown[]
    | undefined;
  const children: SubagentLineageNode[] = [];
  if (Array.isArray(rawChildren)) {
    for (const child of rawChildren) {
      const normalizedChild = normalizeRawNode(child, depth + 1);
      if (normalizedChild) children.push(normalizedChild);
    }
  }

  return {
    id,
    nodeId: obj.nodeId ? String(obj.nodeId) : id,
    name,
    role,
    status,
    depth,
    model,
    tier,
    durationMs,
    tokens,
    costUsd,
    task,
    taskId,
    leaseToken,
    writeScope,
    repairRounds,
    retries,
    summary,
    children: children.length > 0 ? children : undefined,
  };
}

/**
 * Traverses graph dataset starting from the given node to build an execution call tree.
 */
function buildTreeFromDataset(node: GraphNodeData, dataset: GraphDataset): SubagentLineageNode {
  const visited = new Set<string>([node.id]);

  function buildSubtree(currentNode: GraphNodeData, currentDepth: number): SubagentLineageNode {
    const outgoingEdges = dataset.edges.filter((e) => e.source === currentNode.id);
    const children: SubagentLineageNode[] = [];

    for (const edge of outgoingEdges) {
      const targetId = edge.target;
      if (visited.has(targetId)) continue;
      const targetNode = dataset.nodes.find((n) => n.id === targetId);
      if (!targetNode) continue;
      visited.add(targetId);

      const targetSubtree = buildSubtree(targetNode, currentDepth + 1);
      children.push({
        ...targetSubtree,
        role:
          targetNode.kind ??
          (edge.kind === "spawn"
            ? "subagent"
            : edge.kind === "validation"
              ? "validator"
              : "subagent"),
      });
    }

    const duration =
      currentNode.metrics?.durationMs ?? (currentNode.metadata?.durationMs as number | undefined);
    const tokens = currentNode.metrics?.tokensIn ?? currentNode.metrics?.tokensOut;

    return {
      id: currentNode.id,
      nodeId: currentNode.id,
      name: currentNode.name,
      role: currentNode.kind ?? (children.length > 0 ? "coordinator" : "subagent"),
      status: currentNode.status ?? "pending",
      depth: currentDepth,
      model: currentNode.model,
      tier: currentNode.tier,
      durationMs: duration,
      tokens: typeof tokens === "number" ? tokens : undefined,
      costUsd: currentNode.metrics?.costUsd,
      task: currentNode.description,
      writeScope:
        (currentNode.metadata?.writeScope as string[]) ??
        (currentNode.files?.map((f) => f.path) as string[]),
      children: children.length > 0 ? children : undefined,
    };
  }

  return buildSubtree(node, 0);
}

/**
 * Extracts and synthesizes the full subagent lineage tree from node metadata, provenance, or graph dataset.
 */
export function extractLineageTree(
  node: GraphNodeData,
  dataset?: GraphDataset | null,
): SubagentLineageNode[] {
  const metadata = node.metadata as Record<string, unknown> | undefined;

  // 1. Direct metadata subagent tree
  const directTree =
    metadata?.subagentTree ??
    metadata?.callTree ??
    metadata?.lineage ??
    metadata?.subagents ??
    metadata?.delegations ??
    (node as { subagentTree?: unknown }).subagentTree ??
    (node as { callTree?: unknown }).callTree ??
    (node as { lineage?: unknown }).lineage ??
    (node as { subagents?: unknown }).subagents;

  if (directTree) {
    if (Array.isArray(directTree)) {
      const result: SubagentLineageNode[] = [];
      for (const item of directTree) {
        const norm = normalizeRawNode(item, 0);
        if (norm) result.push(norm);
      }
      if (result.length > 0) return result;
    } else if (typeof directTree === "object") {
      const norm = normalizeRawNode(directTree, 0);
      if (norm) return [norm];
    }
  }

  // 2. Graph dataset edges & nodes traversal
  if (dataset && dataset.nodes && dataset.edges) {
    const hasOutgoing = dataset.edges.some((e) => e.source === node.id);
    if (hasOutgoing) {
      const tree = buildTreeFromDataset(node, dataset);
      if (tree.children && tree.children.length > 0) {
        return [tree];
      }
    }
  }

  // 3. Synthesize from provenance chain of custody if present
  const custodyRaw =
    metadata?.chainOfCustody ?? node.provenance?.chainOfCustody ?? node.chainOfCustody;
  if (custodyRaw) {
    const records = Array.isArray(custodyRaw) ? custodyRaw : [custodyRaw];
    const validRecords = records.filter(
      (r): r is Record<string, unknown> => typeof r === "object" && r !== null,
    );
    if (validRecords.length > 0) {
      const children: SubagentLineageNode[] = validRecords.map((r, idx) => {
        const actorId = String(r.actorId ?? r.actor ?? r.agent ?? `worker-${idx + 1}`);
        const role = String(r.role ?? (actorId.includes("val") ? "validator" : "implementer"));
        const status = String(r.status ?? "satisfied");
        const leaseToken = r.leaseToken ? String(r.leaseToken) : undefined;
        return {
          id: `custody-${actorId}-${idx}`,
          nodeId: actorId,
          name: actorId,
          role,
          status,
          depth: 1,
          leaseToken,
          durationMs: typeof r.durationMs === "number" ? r.durationMs : undefined,
        };
      });

      return [
        {
          id: node.id,
          nodeId: node.id,
          name: node.name,
          role: node.kind ?? "coordinator",
          status: node.status ?? "success",
          depth: 0,
          model: node.model,
          children,
        },
      ];
    }
  }

  return [];
}

export interface FlattenedTreeNode extends SubagentLineageNode {
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  childCount: number;
}

/**
 * Flattens a recursive lineage tree into an ordered array of visible rows based on branch expansion state.
 */
export function flattenLineageTree(
  nodes: SubagentLineageNode[],
  expandedIds: Set<string>,
  depth = 0,
): FlattenedTreeNode[] {
  const result: FlattenedTreeNode[] = [];

  for (const item of nodes) {
    const hasChildren = Boolean(item.children && item.children.length > 0);
    const isExpanded = hasChildren ? expandedIds.has(item.id) : false;
    const childCount = item.children ? item.children.length : 0;
    const currentDepth = typeof item.depth === "number" ? item.depth : depth;

    result.push({
      ...item,
      depth: currentDepth,
      hasChildren,
      isExpanded,
      childCount,
    });

    if (hasChildren && isExpanded && item.children) {
      const childRows = flattenLineageTree(item.children, expandedIds, currentDepth + 1);
      result.push(...childRows);
    }
  }

  return result;
}

/**
 * Recursively collects all node IDs in a lineage tree for bulk expand/collapse.
 */
export function collectAllNodeIds(nodes: SubagentLineageNode[]): string[] {
  const ids: string[] = [];
  function recurse(list: SubagentLineageNode[]) {
    for (const n of list) {
      if (n.children && n.children.length > 0) {
        ids.push(n.id);
        recurse(n.children);
      }
    }
  }
  recurse(nodes);
  return ids;
}

/**
 * Calculates aggregate telemetry across the subagent hierarchy.
 */
export function calculateLineageMetrics(nodes: SubagentLineageNode[]) {
  let total = 0;
  let coordinators = 0;
  let subagents = 0;
  let implementers = 0;
  let validators = 0;
  let tools = 0;
  let successful = 0;
  let running = 0;
  let failed = 0;
  let totalTokens = 0;
  let totalDurationMs = 0;
  let maxDepth = 0;

  function recurse(list: SubagentLineageNode[], depth: number) {
    if (depth > maxDepth) maxDepth = depth;
    for (const item of list) {
      total += 1;
      const role = normalizeRole(item.role).roleType;
      if (role === "coordinator") coordinators += 1;
      else if (role === "implementer") implementers += 1;
      else if (role === "validator") validators += 1;
      else if (role === "tool") tools += 1;
      else subagents += 1;

      const status = describeLineageStatus(item.status);
      if (status.statusClass.includes("is-success")) successful += 1;
      else if (status.statusClass.includes("is-running")) running += 1;
      else if (status.statusClass.includes("is-error")) failed += 1;

      if (typeof item.tokens === "number") totalTokens += item.tokens;
      if (typeof item.durationMs === "number") totalDurationMs += item.durationMs;

      if (item.children && item.children.length > 0) {
        recurse(item.children, depth + 1);
      }
    }
  }

  recurse(nodes, 0);

  return {
    total,
    coordinators,
    subagents,
    implementers,
    validators,
    tools,
    successful,
    running,
    failed,
    totalTokens,
    totalDurationMs,
    maxDepth,
  };
}

/**
 * Interactive Subagent Lineage & Hierarchical Execution Call Tree component.
 * Displays multi-level parent coordinator -> subagent -> implementer/validator trees
 * with role badges, status chips, depth indentation, branch collapsing, search filtering,
 * and click-to-jump node selection.
 */
export const SubagentLineageTree: FC<SubagentLineageTreeProps> = memo(function SubagentLineageTree({
  node,
  dataset: propDataset,
  onSelectNode,
  selectedNodeId: propSelectedNodeId,
  className = "",
  hideIfEmpty = false,
}) {
  const storeDataset = useGraphStore((state) => state.dataset);
  const storeSelectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);

  const dataset = propDataset !== undefined ? propDataset : storeDataset;
  const currentSelectedId =
    propSelectedNodeId !== undefined ? propSelectedNodeId : storeSelectedNodeId;

  const rawTree = useMemo(() => extractLineageTree(node, dataset), [node, dataset]);
  const allExpandableIds = useMemo(() => collectAllNodeIds(rawTree), [rawTree]);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(allExpandableIds));
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const metrics = useMemo(() => calculateLineageMetrics(rawTree), [rawTree]);

  const toggleNode = useCallback((id: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedIds(new Set(allExpandableIds));
  }, [allExpandableIds]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const handleNodeClick = useCallback(
    (targetId?: string) => {
      if (!targetId) return;
      if (onSelectNode) {
        onSelectNode(targetId);
      } else {
        setSelectedNodeId(targetId);
      }
    },
    [onSelectNode, setSelectedNodeId],
  );

  const flatRows = useMemo(() => flattenLineageTree(rawTree, expandedIds), [rawTree, expandedIds]);

  const filteredRows = useMemo(() => {
    let rows = flatRows;
    const q = searchQuery.toLowerCase().trim();

    if (q) {
      rows = rows.filter((r) => {
        const matchName = r.name.toLowerCase().includes(q);
        const matchId =
          r.id.toLowerCase().includes(q) || (r.nodeId && r.nodeId.toLowerCase().includes(q));
        const matchRole = r.role ? String(r.role).toLowerCase().includes(q) : false;
        const matchTask = r.task ? r.task.toLowerCase().includes(q) : false;
        const matchTaskId = r.taskId ? r.taskId.toLowerCase().includes(q) : false;
        const matchModel = r.model ? r.model.toLowerCase().includes(q) : false;
        const matchSummary = r.summary ? r.summary.toLowerCase().includes(q) : false;
        const matchScope = r.writeScope
          ? r.writeScope.some((s) => s.toLowerCase().includes(q))
          : false;
        return (
          matchName ||
          matchId ||
          matchRole ||
          matchTask ||
          matchTaskId ||
          matchModel ||
          matchSummary ||
          matchScope
        );
      });
    }

    if (roleFilter !== "all") {
      rows = rows.filter((r) => normalizeRole(r.role).roleType === roleFilter);
    }

    if (statusFilter !== "all") {
      rows = rows.filter((r) => {
        const status = describeLineageStatus(r.status);
        if (statusFilter === "success") return status.statusClass.includes("is-success");
        if (statusFilter === "running") return status.statusClass.includes("is-running");
        if (statusFilter === "error") return status.statusClass.includes("is-error");
        return true;
      });
    }

    return rows;
  }, [flatRows, searchQuery, roleFilter, statusFilter]);

  if (rawTree.length === 0) {
    if (hideIfEmpty) return null;
    return (
      <DrawerSection title="Subagent Lineage & Call Tree">
        <div className="drawer-empty-state" data-testid="lineage-empty-state">
          No subagent lineage or hierarchical call tree recorded for this node.
        </div>
      </DrawerSection>
    );
  }

  return (
    <div className={`drawer-subagent-lineage-container ${className}`}>
      <DrawerSection title="Subagent Lineage & Call Tree" count={metrics.total}>
        {/* Header Controls & Filter Bar */}
        <div className="drawer-lineage-toolbar">
          <div className="drawer-lineage-search-wrap">
            <IconSearch size={13} className="drawer-lineage-search-icon" />
            <input
              type="text"
              className="drawer-lineage-search-input"
              placeholder="Search subagent name, role, task, model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filter subagents"
            />
            {searchQuery && (
              <button
                type="button"
                className="drawer-lineage-clear-btn"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                <IconX size={12} />
              </button>
            )}
          </div>

          <div className="drawer-lineage-btn-group">
            <button
              type="button"
              className="drawer-lineage-action-btn"
              onClick={handleExpandAll}
              title="Expand All Branches"
            >
              Expand All
            </button>
            <button
              type="button"
              className="drawer-lineage-action-btn"
              onClick={handleCollapseAll}
              title="Collapse All Branches"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Quick Filters */}
        <div className="drawer-lineage-filters-row">
          <span className="drawer-lineage-filter-label">
            <IconFilter size={11} /> Filter:
          </span>
          <button
            type="button"
            className={`drawer-lineage-pill-btn ${roleFilter === "all" ? "is-active" : ""}`}
            onClick={() => setRoleFilter("all")}
          >
            {`All Roles (${metrics.total})`}
          </button>
          {metrics.coordinators > 0 && (
            <button
              type="button"
              className={`drawer-lineage-pill-btn ${roleFilter === "coordinator" ? "is-active" : ""}`}
              onClick={() => setRoleFilter("coordinator")}
            >
              {`Coordinators (${metrics.coordinators})`}
            </button>
          )}
          {metrics.subagents > 0 && (
            <button
              type="button"
              className={`drawer-lineage-pill-btn ${roleFilter === "subagent" ? "is-active" : ""}`}
              onClick={() => setRoleFilter("subagent")}
            >
              {`Subagents (${metrics.subagents})`}
            </button>
          )}
          {metrics.implementers > 0 && (
            <button
              type="button"
              className={`drawer-lineage-pill-btn ${roleFilter === "implementer" ? "is-active" : ""}`}
              onClick={() => setRoleFilter("implementer")}
            >
              {`Implementers (${metrics.implementers})`}
            </button>
          )}
          {metrics.validators > 0 && (
            <button
              type="button"
              className={`drawer-lineage-pill-btn ${roleFilter === "validator" ? "is-active" : ""}`}
              onClick={() => setRoleFilter("validator")}
            >
              {`Validators (${metrics.validators})`}
            </button>
          )}

          {/* Status Filter Pills */}
          <button
            type="button"
            className={`drawer-lineage-pill-btn ${statusFilter === "all" ? "is-active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            All Statuses
          </button>
          {metrics.successful > 0 && (
            <button
              type="button"
              className={`drawer-lineage-pill-btn ${statusFilter === "success" ? "is-active" : ""}`}
              onClick={() => setStatusFilter("success")}
            >
              {`Success (${metrics.successful})`}
            </button>
          )}
          {metrics.running > 0 && (
            <button
              type="button"
              className={`drawer-lineage-pill-btn ${statusFilter === "running" ? "is-active" : ""}`}
              onClick={() => setStatusFilter("running")}
            >
              {`Active (${metrics.running})`}
            </button>
          )}
          {metrics.failed > 0 && (
            <button
              type="button"
              className={`drawer-lineage-pill-btn ${statusFilter === "error" ? "is-active" : ""}`}
              onClick={() => setStatusFilter("error")}
            >
              {`Failed (${metrics.failed})`}
            </button>
          )}
        </div>

        {/* Telemetry Summary Stats */}
        <div className="drawer-metric-grid" style={{ marginBottom: "12px" }}>
          <div className="drawer-metric">
            <span className="drawer-metric-label">
              <IconHierarchy2 size={11} style={{ display: "inline", marginRight: 3 }} />
              Total Hierarchy
            </span>
            <span className="drawer-metric-value">{`${metrics.total} agents`}</span>
          </div>
          {metrics.running > 0 && (
            <div className="drawer-metric drawer-metric--thinking">
              <span className="drawer-metric-label">
                <IconPlayerPlay size={11} style={{ display: "inline", marginRight: 3 }} />
                Active / Leased
              </span>
              <span className="drawer-metric-value" style={{ color: "#38bdf8" }}>
                {metrics.running}
              </span>
            </div>
          )}
          {metrics.failed > 0 && (
            <div className="drawer-metric drawer-metric--warn">
              <span className="drawer-metric-label">
                <IconAlertTriangle size={11} style={{ display: "inline", marginRight: 3 }} />
                Rejected / Failed
              </span>
              <span className="drawer-metric-value" style={{ color: "#f87171" }}>
                {metrics.failed}
              </span>
            </div>
          )}
          {metrics.totalTokens > 0 && (
            <div className="drawer-metric">
              <span className="drawer-metric-label">
                <IconBrain size={11} style={{ display: "inline", marginRight: 3 }} />
                Total Tokens
              </span>
              <span className="drawer-metric-value">{formatTokens(metrics.totalTokens)}</span>
            </div>
          )}
          {metrics.totalDurationMs > 0 && (
            <div className="drawer-metric">
              <span className="drawer-metric-label">
                <IconClock size={11} style={{ display: "inline", marginRight: 3 }} />
                Total Duration
              </span>
              <span className="drawer-metric-value">{formatDuration(metrics.totalDurationMs)}</span>
            </div>
          )}
        </div>

        {/* Tree Rows List */}
        {filteredRows.length === 0 ? (
          <div className="drawer-lineage-empty-filter">
            {`No subagent nodes match the current filter "${searchQuery}".`}
          </div>
        ) : (
          <div
            className="drawer-lineage-tree"
            role="tree"
            aria-label="Subagent Execution Call Tree"
          >
            {filteredRows.map((row) => {
              const roleInfo = normalizeRole(row.role);
              const statusInfo = describeLineageStatus(row.status);
              const isCurrentNode =
                row.nodeId === node.id || row.id === node.id || row.nodeId === currentSelectedId;
              const indentPadding = row.depth * 22 + 8;

              return (
                <div
                  key={`${row.id}-${row.depth}`}
                  className={`drawer-lineage-row ${isCurrentNode ? "is-selected-node" : ""}`}
                  style={{ paddingLeft: `${indentPadding}px` }}
                  role="treeitem"
                  aria-expanded={row.hasChildren ? row.isExpanded : undefined}
                  aria-selected={isCurrentNode}
                  data-testid={`lineage-node-${row.id}`}
                >
                  {/* Visual branch guide line */}
                  {row.depth > 0 && (
                    <span
                      className="drawer-lineage-guide-line"
                      style={{ left: `${(row.depth - 1) * 22 + 16}px` }}
                      aria-hidden="true"
                    />
                  )}

                  {/* Expand/Collapse Chevron Button */}
                  <div className="drawer-lineage-toggle-slot">
                    {row.hasChildren ? (
                      <button
                        type="button"
                        className="drawer-lineage-toggle-btn"
                        onClick={(e) => toggleNode(row.id, e)}
                        aria-label={row.isExpanded ? `Collapse ${row.name}` : `Expand ${row.name}`}
                        title={row.isExpanded ? "Collapse" : "Expand"}
                      >
                        {row.isExpanded ? (
                          <IconChevronDown size={14} />
                        ) : (
                          <IconChevronRight size={14} />
                        )}
                      </button>
                    ) : (
                      <span className="drawer-lineage-leaf-dot" aria-hidden="true" />
                    )}
                  </div>

                  {/* Main Row Content & Interactive Selection */}
                  <div className="drawer-lineage-content">
                    <div className="drawer-lineage-primary-line">
                      {/* Agent Role Badge */}
                      <span
                        className={roleInfo.badgeClass}
                        style={{
                          color: roleInfo.color,
                          backgroundColor: roleInfo.bg,
                          borderColor: roleInfo.border,
                        }}
                      >
                        {roleInfo.label}
                      </span>

                      {/* Name / Jump button */}
                      <button
                        type="button"
                        className="drawer-lineage-name-btn"
                        onClick={() => handleNodeClick(row.nodeId ?? row.id)}
                        title={`Select ${row.name} in graph`}
                      >
                        <span className="drawer-lineage-name">{row.name}</span>
                        <IconArrowRight size={12} className="drawer-lineage-jump-icon" />
                      </button>

                      {/* Current Node Badge */}
                      {isCurrentNode && (
                        <span className="drawer-lineage-current-badge">(Current Node)</span>
                      )}

                      {/* Status Chip */}
                      <span
                        className={statusInfo.statusClass}
                        style={{
                          color: statusInfo.color,
                          backgroundColor: statusInfo.bg,
                          borderColor: statusInfo.border,
                        }}
                      >
                        {statusInfo.animated && <span className="drawer-lineage-pulse-dot" />}
                        {statusInfo.label}
                      </span>

                      {/* Child subagent count */}
                      {row.hasChildren && (
                        <span className="drawer-lineage-child-count">
                          {`${row.childCount} ${row.childCount === 1 ? "child" : "children"}`}
                        </span>
                      )}
                    </div>

                    {/* Secondary Meta Row */}
                    <div className="drawer-lineage-meta-line">
                      {row.taskId && (
                        <span className="drawer-lineage-task-chip">
                          Task: <code>{row.taskId}</code>
                        </span>
                      )}
                      {row.model && <code className="drawer-lineage-model-chip">{row.model}</code>}
                      {row.tier && (
                        <span className={`drawer-tier-pill tier-${String(row.tier).toLowerCase()}`}>
                          {`Tier ${String(row.tier).toUpperCase()}`}
                        </span>
                      )}
                      {typeof row.durationMs === "number" && (
                        <span className="drawer-lineage-metric-chip">
                          ⏱️ {formatDuration(row.durationMs)}
                        </span>
                      )}
                      {typeof row.tokens === "number" && (
                        <span className="drawer-lineage-metric-chip">
                          🧠 {formatTokens(row.tokens)}
                        </span>
                      )}
                      {row.repairRounds !== undefined && row.repairRounds > 0 && (
                        <span className="drawer-lineage-metric-chip drawer-lineage-metric-chip--warn">
                          {`⚠️ ${row.repairRounds} repair ${row.repairRounds === 1 ? "round" : "rounds"}`}
                        </span>
                      )}
                      {row.writeScope && row.writeScope.length > 0 && (
                        <span
                          className="drawer-lineage-scope-chip"
                          title={row.writeScope.join(", ")}
                        >
                          <IconFileCode size={11} style={{ display: "inline", marginRight: 2 }} />
                          {`${row.writeScope.length} ${row.writeScope.length === 1 ? "file" : "files"}`}
                        </span>
                      )}
                    </div>

                    {/* Summary / Task description */}
                    {row.summary && <div className="drawer-lineage-summary">{row.summary}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DrawerSection>

      {/* Embedded Scoped Styles */}
      <style>{`
          .drawer-subagent-lineage-container {
            display: flex;
            flex-direction: column;
            width: 100%;
          }
          .drawer-lineage-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 8px;
            flex-wrap: wrap;
          }
          .drawer-lineage-search-wrap {
            position: relative;
            display: flex;
            align-items: center;
            flex: 1;
            min-width: 180px;
          }
          .drawer-lineage-search-icon {
            position: absolute;
            left: 8px;
            color: #71717a;
            pointer-events: none;
          }
          .drawer-lineage-search-input {
            width: 100%;
            background: #121215;
            border: 1px solid #27272a;
            border-radius: var(--radius-sm);
            padding: 4px 24px 4px 26px;
            color: #fafafa;
            font-family: var(--font-sans);
            font-size: 11.5px;
            outline: none;
            transition: border-color 0.15s ease;
          }
          .drawer-lineage-search-input:focus {
            border-color: #6366f1;
          }
          .drawer-lineage-clear-btn {
            position: absolute;
            right: 6px;
            background: transparent;
            border: none;
            color: #71717a;
            cursor: pointer;
            display: flex;
            align-items: center;
            padding: 2px;
          }
          .drawer-lineage-clear-btn:hover {
            color: #fafafa;
          }
          .drawer-lineage-btn-group {
            display: flex;
            gap: 4px;
          }
          .drawer-lineage-action-btn {
            background: #18181b;
            border: 1px solid #27272a;
            border-radius: var(--radius-sm);
            padding: 3px 8px;
            color: #a1a1aa;
            font-family: var(--font-sans);
            font-size: 10.5px;
            cursor: pointer;
            transition: all 0.12s ease;
          }
          .drawer-lineage-action-btn:hover {
            background: #27272a;
            color: #fafafa;
          }
          .drawer-lineage-filters-row {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 10px;
            flex-wrap: wrap;
            font-size: 11px;
          }
          .drawer-lineage-filter-label {
            display: inline-flex;
            align-items: center;
            gap: 3px;
            color: #71717a;
            font-family: var(--font-sans);
            font-size: 10.5px;
          }
          .drawer-lineage-pill-btn {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid #27272a;
            border-radius: 9999px;
            padding: 1px 7px;
            color: #a1a1aa;
            font-family: var(--font-sans);
            font-size: 10.5px;
            cursor: pointer;
            transition: all 0.12s ease;
          }
          .drawer-lineage-pill-btn:hover {
            border-color: #3f3f46;
            color: #fafafa;
          }
          .drawer-lineage-pill-btn.is-active {
            background: rgba(99, 102, 241, 0.18);
            border-color: rgba(99, 102, 241, 0.4);
            color: #c7d2fe;
            font-weight: 600;
          }
          .drawer-lineage-tree {
            display: flex;
            flex-direction: column;
            gap: 6px;
            border: 1px solid #27272a;
            border-radius: var(--radius-md);
            background-color: #0c0c0e;
            padding: 8px 6px;
          }
          .drawer-lineage-row {
            position: relative;
            display: flex;
            align-items: flex-start;
            gap: 8px;
            padding-top: 6px;
            padding-bottom: 6px;
            padding-right: 8px;
            border-radius: var(--radius-sm);
            background-color: #121215;
            border: 1px solid #222226;
            transition: all 0.15s ease;
          }
          .drawer-lineage-row:hover {
            background-color: #18181c;
            border-color: #383842;
          }
          .drawer-lineage-row.is-selected-node {
            background-color: rgba(99, 102, 241, 0.1);
            border-color: rgba(99, 102, 241, 0.45);
          }
          .drawer-lineage-guide-line {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 1px;
            background: #27272a;
            pointer-events: none;
          }
          .drawer-lineage-toggle-slot {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 22px;
            flex-shrink: 0;
          }
          .drawer-lineage-toggle-btn {
            background: transparent;
            border: none;
            color: #a1a1aa;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2px;
            border-radius: var(--radius-sm);
            transition: color 0.12s ease;
          }
          .drawer-lineage-toggle-btn:hover {
            color: #fafafa;
            background: rgba(255, 255, 255, 0.08);
          }
          .drawer-lineage-leaf-dot {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background-color: #52525b;
          }
          .drawer-lineage-content {
            display: flex;
            flex-direction: column;
            gap: 3px;
            min-width: 0;
            flex: 1;
          }
          .drawer-lineage-primary-line {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
          }
          .drawer-role-badge {
            font-family: var(--font-mono);
            font-size: 9.5px;
            font-weight: 700;
            letter-spacing: 0.04em;
            padding: 1px 5px;
            border-radius: var(--radius-sm);
            border: 1px solid transparent;
            text-transform: uppercase;
          }
          .drawer-lineage-name-btn {
            background: transparent;
            border: none;
            padding: 0;
            margin: 0;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            cursor: pointer;
            color: #fafafa;
            font-family: var(--font-sans);
            font-size: 12px;
            font-weight: 600;
            text-align: left;
            transition: color 0.12s ease;
          }
          .drawer-lineage-name-btn:hover {
            color: #818cf8;
          }
          .drawer-lineage-jump-icon {
            opacity: 0;
            color: #818cf8;
            transition: opacity 0.12s ease;
          }
          .drawer-lineage-row:hover .drawer-lineage-jump-icon {
            opacity: 1;
          }
          .drawer-lineage-current-badge {
            font-family: var(--font-mono);
            font-size: 10px;
            color: #a5b4fc;
            background: rgba(99, 102, 241, 0.2);
            border: 1px solid rgba(99, 102, 241, 0.4);
            padding: 0 4px;
            border-radius: var(--radius-sm);
          }
          .drawer-lineage-status {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            font-family: var(--font-mono);
            font-size: 10px;
            font-weight: 600;
            padding: 1px 6px;
            border-radius: 9999px;
            border: 1px solid transparent;
          }
          .drawer-lineage-pulse-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background-color: currentColor;
            animation: pulse-ring 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
          @keyframes pulse-ring {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.85); }
          }
          .drawer-lineage-child-count {
            font-family: var(--font-mono);
            font-size: 10px;
            color: #71717a;
          }
          .drawer-lineage-meta-line {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
            font-size: 10.5px;
          }
          .drawer-lineage-task-chip code {
            font-family: var(--font-mono);
            color: #e4e4e7;
            background: rgba(255, 255, 255, 0.06);
            padding: 0 4px;
            border-radius: var(--radius-sm);
          }
          .drawer-lineage-model-chip {
            font-family: var(--font-mono);
            color: #c7d2fe;
            background: rgba(99, 102, 241, 0.1);
            padding: 0 4px;
            border-radius: var(--radius-sm);
          }
          .drawer-lineage-metric-chip {
            font-family: var(--font-mono);
            color: #a1a1aa;
            font-size: 10px;
          }
          .drawer-lineage-metric-chip--warn {
            color: #fbbf24;
          }
          .drawer-lineage-scope-chip {
            display: inline-flex;
            align-items: center;
            font-family: var(--font-sans);
            font-size: 10px;
            color: #a1a1aa;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid #27272a;
            padding: 0 4px;
            border-radius: var(--radius-sm);
          }
          .drawer-lineage-summary {
            font-family: var(--font-sans);
            font-size: 11px;
            color: #a1a1aa;
            margin-top: 2px;
            line-height: 1.4;
          }
          .drawer-lineage-empty-filter {
            padding: 16px;
            text-align: center;
            color: #71717a;
            font-family: var(--font-sans);
            font-size: 11.5px;
            font-style: italic;
            background: #121215;
            border: 1px dashed #27272a;
            border-radius: var(--radius-md);
          }
        `}</style>
    </div>
  );
});

export default SubagentLineageTree;
