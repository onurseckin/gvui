import {
  IconAlertTriangle,
  IconArrowRight,
  IconMaximize,
  IconMinimize,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import type { FC } from "react";
import { memo, useCallback, useMemo, useState } from "react";
import { describeNodeKind, describeNodeStatus } from "../../../primitives/nodes/NodeCard/nodeKinds";
import { useGraphStore } from "../../../state/useGraphStore";
import type {
  GraphDataset,
  GraphEdgeData,
  GraphNodeData,
  NodeKind,
  NodeStatus,
} from "../../../types/graphData";

export interface DependencyEdgeInfo {
  id: string;
  source: string;
  target: string;
  kind?: string;
  label?: string;
  stepNumber?: number | string;
  condition?: string;
  tokens?: number;
  payloadSummary?: string;
  isCycle?: boolean;
}

export interface DependencyNodeItem {
  id: string;
  name: string;
  kind?: NodeKind;
  status?: NodeStatus;
  step?: number;
  model?: string;
  tier?: string;
  hopDistance: number; // 1 for direct, 2+ for transitive downstream, -1, -2 for upstream, 0 for focus
  direction: "upstream" | "downstream" | "focus";
  edge?: DependencyEdgeInfo;
  isBlocker?: boolean;
  failureReason?: string;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
  costUsd?: number;
  node: GraphNodeData;
}

export interface BlockerChainItem {
  nodeId: string;
  nodeName: string;
  kind?: NodeKind;
  status: NodeStatus;
  step?: number;
  isRootCause: boolean;
  failureReason?: string;
  exitCode?: number;
  findingsCount?: number;
}

export interface BlastRadiusMetrics {
  totalAffectedNodes: number;
  maxDepth: number;
  severity: "isolated" | "low" | "medium" | "high" | "critical";
  statusBreakdown: Record<string, number>;
  kindBreakdown: Record<string, number>;
  affectedTokens: number;
  affectedDurationMs: number;
  affectedCostUsd: number;
}

export interface GraphAnalysisResult {
  focusNode: GraphNodeData;
  directPrerequisites: DependencyNodeItem[];
  directDependents: DependencyNodeItem[];
  transitivePrerequisites: DependencyNodeItem[];
  transitiveDependents: DependencyNodeItem[];
  allNodes: DependencyNodeItem[];
  topologicalDepth: number;
  topologicalHeight: number;
  isCriticalPath: boolean;
  criticalPath: string[];
  blockerChain: BlockerChainItem[];
  hasBlocker: boolean;
  blastRadius: BlastRadiusMetrics;
  hasCycle: boolean;
  cycles: string[][];
  fanIn: number;
  fanOut: number;
}

/**
 * Extracts and normalizes failure reason from a node if it is failing.
 */
export function extractNodeFailureReason(node: GraphNodeData): string | undefined {
  const metadata = node.metadata;
  const commands = metadata?.commands as
    | Array<{ exitCode?: number; stderrSnippet?: string; stderrTail?: string }>
    | undefined;
  if (Array.isArray(commands) && commands.length > 0) {
    const failedCmd = commands.find((c) => typeof c.exitCode === "number" && c.exitCode !== 0);
    if (failedCmd) {
      return `Exit code ${failedCmd.exitCode}${failedCmd.stderrSnippet ? `: ${failedCmd.stderrSnippet.slice(0, 80)}` : ""}`;
    }
  }

  const findings = metadata?.findings as
    | Array<{ severity?: string; observation?: string; status?: string }>
    | undefined;
  if (Array.isArray(findings) && findings.length > 0) {
    const openFinding = findings.find((f) => f.status === "open" || f.severity === "critical");
    if (openFinding && openFinding.observation) {
      return openFinding.observation.slice(0, 100);
    }
  }

  if (node.status === "error") {
    return "Node terminated with status error";
  }
  if (node.status === "warning") {
    return "Node produced validation warnings";
  }

  return undefined;
}

/**
 * Detects cycles in a directed graph using DFS and recursion tracking.
 */
export function detectGraphCycles(
  adjacency: Map<string, string[]>,
  startNodeId?: string,
): string[][] {
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];
  const detectedCycles: string[][] = [];

  function dfs(curr: string) {
    visited.add(curr);
    recStack.add(curr);
    path.push(curr);

    const neighbors = adjacency.get(curr) ?? [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        dfs(next);
      } else if (recStack.has(next)) {
        // Cycle detected
        const cycleStartIndex = path.indexOf(next);
        if (cycleStartIndex !== -1) {
          const cyclePath = [...path.slice(cycleStartIndex), next];
          detectedCycles.push(cyclePath);
        }
      }
    }

    path.pop();
    recStack.delete(curr);
  }

  if (startNodeId && adjacency.has(startNodeId)) {
    dfs(startNodeId);
  } else {
    for (const nodeId of adjacency.keys()) {
      if (!visited.has(nodeId)) {
        dfs(nodeId);
      }
    }
  }

  return detectedCycles;
}

/**
 * Calculates topological depth (longest path from any root to node)
 * and topological height (longest path from node to any leaf).
 */
export function calculateTopologicalLevels(
  nodeId: string,
  nodes: GraphNodeData[],
  forwardAdj: Map<string, string[]>,
  backwardAdj: Map<string, string[]>,
): { depth: number; height: number; isCritical: boolean; criticalPath: string[] } {
  const depthMemo = new Map<string, number>();
  const heightMemo = new Map<string, number>();
  const visiting = new Set<string>();

  function getDepth(curr: string): number {
    if (depthMemo.has(curr)) return depthMemo.get(curr) ?? 0;
    if (visiting.has(curr)) return 0; // Guard against cycle
    visiting.add(curr);

    const parents = backwardAdj.get(curr) ?? [];
    let maxParentDepth = 0;
    for (const p of parents) {
      const d = 1 + getDepth(p);
      if (d > maxParentDepth) maxParentDepth = d;
    }

    visiting.delete(curr);
    depthMemo.set(curr, maxParentDepth);
    return maxParentDepth;
  }

  function getHeight(curr: string): number {
    if (heightMemo.has(curr)) return heightMemo.get(curr) ?? 0;
    if (visiting.has(curr)) return 0; // Guard against cycle
    visiting.add(curr);

    const children = forwardAdj.get(curr) ?? [];
    let maxChildHeight = 0;
    for (const c of children) {
      const h = 1 + getHeight(c);
      if (h > maxChildHeight) maxChildHeight = h;
    }

    visiting.delete(curr);
    heightMemo.set(curr, maxChildHeight);
    return maxChildHeight;
  }

  const depth = getDepth(nodeId);
  const height = getHeight(nodeId);

  // Compute graph critical path (longest overall path in DAG)
  let maxTotalSpan = 0;
  const criticalPath: string[] = [];
  for (const n of nodes) {
    const d = getDepth(n.id);
    const h = getHeight(n.id);
    if (d + h > maxTotalSpan) {
      maxTotalSpan = d + h;
    }
  }

  const isCritical = depth + height === maxTotalSpan && maxTotalSpan > 0;

  return { depth, height, isCritical, criticalPath };
}

/**
 * Performs full topological, dependency, blocker, and blast radius analysis on a node.
 */
export function analyzeNodeDependencies(
  focusNode: GraphNodeData,
  dataset?: GraphDataset | null,
): GraphAnalysisResult {
  const allNodesList = dataset?.nodes && dataset.nodes.length > 0 ? dataset.nodes : [focusNode];
  const nodeMap = new Map<string, GraphNodeData>();
  for (const n of allNodesList) {
    nodeMap.set(n.id, n);
  }
  if (!nodeMap.has(focusNode.id)) {
    nodeMap.set(focusNode.id, focusNode);
  }

  const edges = dataset?.edges ?? [];
  const forwardAdj = new Map<string, string[]>();
  const backwardAdj = new Map<string, string[]>();
  const edgeMap = new Map<string, GraphEdgeData>();

  for (const n of nodeMap.values()) {
    forwardAdj.set(n.id, []);
    backwardAdj.set(n.id, []);
  }

  for (const e of edges) {
    if (!e.source || !e.target) continue;
    edgeMap.set(`${e.source}->${e.target}`, e);
    if (!forwardAdj.has(e.source)) forwardAdj.set(e.source, []);
    if (!backwardAdj.has(e.target)) backwardAdj.set(e.target, []);
    forwardAdj.get(e.source)?.push(e.target);
    backwardAdj.get(e.target)?.push(e.source);
  }

  // Also include io.inputs / outputs if explicit edges were missing
  if (focusNode.io?.inputs) {
    for (const inp of focusNode.io.inputs) {
      if (inp.node && !backwardAdj.get(focusNode.id)?.includes(inp.node)) {
        backwardAdj.get(focusNode.id)?.push(inp.node);
        if (!forwardAdj.has(inp.node)) forwardAdj.set(inp.node, []);
        forwardAdj.get(inp.node)?.push(focusNode.id);
      }
    }
  }
  if (focusNode.io?.outputs) {
    for (const out of focusNode.io.outputs) {
      if (out.node && !forwardAdj.get(focusNode.id)?.includes(out.node)) {
        forwardAdj.get(focusNode.id)?.push(out.node);
        if (!backwardAdj.has(out.node)) backwardAdj.set(out.node, []);
        backwardAdj.get(out.node)?.push(focusNode.id);
      }
    }
  }

  // Cycle detection
  const cycles = detectGraphCycles(forwardAdj, focusNode.id);
  const hasCycle = cycles.length > 0;

  // Topological levels
  const { depth, height, isCritical, criticalPath } = calculateTopologicalLevels(
    focusNode.id,
    Array.from(nodeMap.values()),
    forwardAdj,
    backwardAdj,
  );

  // Traverse upstream (Prerequisites)
  const directPrerequisites: DependencyNodeItem[] = [];
  const transitivePrerequisites: DependencyNodeItem[] = [];
  const visitedUpstream = new Set<string>([focusNode.id]);
  const upstreamQueue: Array<{ id: string; depth: number }> = [];

  const directParents = backwardAdj.get(focusNode.id) ?? [];
  for (const pId of directParents) {
    upstreamQueue.push({ id: pId, depth: 1 });
    visitedUpstream.add(pId);
  }

  while (upstreamQueue.length > 0) {
    const item = upstreamQueue.shift();
    if (!item) break;

    const n = nodeMap.get(item.id) ?? {
      id: item.id,
      name: item.id,
      kind: "agent" as NodeKind,
      status: "pending" as NodeStatus,
    };

    const edgeData =
      edgeMap.get(`${item.id}->${focusNode.id}`) ?? edgeMap.get(`${item.id}->${item.id}`);
    const failureReason = extractNodeFailureReason(n);
    const isBlocker = Boolean(failureReason) || n.status === "error" || n.status === "warning";

    const depItem: DependencyNodeItem = {
      id: n.id,
      name: n.name ?? n.id,
      kind: n.kind,
      status: n.status,
      step: n.step,
      model: n.model ?? n.harnessModel,
      tier: n.tier,
      hopDistance: -item.depth,
      direction: "upstream",
      isBlocker,
      failureReason,
      tokensIn: n.metrics?.tokensIn,
      tokensOut: n.metrics?.tokensOut,
      durationMs: n.metrics?.durationMs,
      costUsd: n.metrics?.costUsd,
      node: n,
      edge: edgeData
        ? {
            id: edgeData.id,
            source: edgeData.source,
            target: edgeData.target,
            kind: edgeData.kind,
            label: edgeData.label,
            stepNumber: edgeData.stepNumber,
            condition: edgeData.condition,
            tokens: edgeData.tokens ?? edgeData.handoff?.tokens,
            payloadSummary: edgeData.handoff?.summary ?? edgeData.description,
            isCycle: edgeData.isCycle,
          }
        : undefined,
    };

    if (item.depth === 1) {
      directPrerequisites.push(depItem);
    }
    transitivePrerequisites.push(depItem);

    // Expand upstream
    const nextParents = backwardAdj.get(item.id) ?? [];
    for (const nextP of nextParents) {
      if (!visitedUpstream.has(nextP)) {
        visitedUpstream.add(nextP);
        upstreamQueue.push({ id: nextP, depth: item.depth + 1 });
      }
    }
  }

  // Traverse downstream (Blast Radius)
  const directDependents: DependencyNodeItem[] = [];
  const transitiveDependents: DependencyNodeItem[] = [];
  const visitedDownstream = new Set<string>([focusNode.id]);
  const downstreamQueue: Array<{ id: string; depth: number }> = [];

  const directChildren = forwardAdj.get(focusNode.id) ?? [];
  for (const cId of directChildren) {
    downstreamQueue.push({ id: cId, depth: 1 });
    visitedDownstream.add(cId);
  }

  let affectedTokens = 0;
  let affectedDurationMs = 0;
  let affectedCostUsd = 0;
  const statusBreakdown: Record<string, number> = {};
  const kindBreakdown: Record<string, number> = {};
  let maxDownstreamDepth = 0;

  while (downstreamQueue.length > 0) {
    const item = downstreamQueue.shift();
    if (!item) break;

    if (item.depth > maxDownstreamDepth) {
      maxDownstreamDepth = item.depth;
    }

    const n = nodeMap.get(item.id) ?? {
      id: item.id,
      name: item.id,
      kind: "agent" as NodeKind,
      status: "pending" as NodeStatus,
    };

    const edgeData =
      edgeMap.get(`${focusNode.id}->${item.id}`) ?? edgeMap.get(`${item.id}->${item.id}`);
    const failureReason = extractNodeFailureReason(n);

    const depItem: DependencyNodeItem = {
      id: n.id,
      name: n.name ?? n.id,
      kind: n.kind,
      status: n.status,
      step: n.step,
      model: n.model ?? n.harnessModel,
      tier: n.tier,
      hopDistance: item.depth,
      direction: "downstream",
      failureReason,
      tokensIn: n.metrics?.tokensIn,
      tokensOut: n.metrics?.tokensOut,
      durationMs: n.metrics?.durationMs,
      costUsd: n.metrics?.costUsd,
      node: n,
      edge: edgeData
        ? {
            id: edgeData.id,
            source: edgeData.source,
            target: edgeData.target,
            kind: edgeData.kind,
            label: edgeData.label,
            stepNumber: edgeData.stepNumber,
            condition: edgeData.condition,
            tokens: edgeData.tokens ?? edgeData.handoff?.tokens,
            payloadSummary: edgeData.handoff?.summary ?? edgeData.description,
            isCycle: edgeData.isCycle,
          }
        : undefined,
    };

    if (item.depth === 1) {
      directDependents.push(depItem);
    }
    transitiveDependents.push(depItem);

    // Aggregate metrics
    const tIn = n.metrics?.tokensIn ?? 0;
    const tOut = n.metrics?.tokensOut ?? 0;
    affectedTokens += tIn + tOut;
    affectedDurationMs += n.metrics?.durationMs ?? 0;
    affectedCostUsd += n.metrics?.costUsd ?? 0;

    const st = String(n.status ?? "pending").toLowerCase();
    statusBreakdown[st] = (statusBreakdown[st] ?? 0) + 1;

    const kd = String(n.kind ?? "agent").toLowerCase();
    kindBreakdown[kd] = (kindBreakdown[kd] ?? 0) + 1;

    // Expand downstream
    const nextChildren = forwardAdj.get(item.id) ?? [];
    for (const nextC of nextChildren) {
      if (!visitedDownstream.has(nextC)) {
        visitedDownstream.add(nextC);
        downstreamQueue.push({ id: nextC, depth: item.depth + 1 });
      }
    }
  }

  // Determine blast radius severity
  const totalCount = transitiveDependents.length;
  let severity: BlastRadiusMetrics["severity"] = "isolated";
  if (totalCount === 0) {
    severity = "isolated";
  } else if (totalCount <= 2) {
    severity = "low";
  } else if (totalCount <= 5) {
    severity = "medium";
  } else if (totalCount <= 10) {
    severity = "high";
  } else {
    severity = "critical";
  }

  // If blast radius impacts terminal or gate nodes, escalate severity
  if (
    totalCount > 0 &&
    transitiveDependents.some((d) => d.kind === "terminal" || d.kind === "gate")
  ) {
    if (severity === "low") severity = "medium";
    else if (severity === "medium") severity = "high";
  }

  const blastRadius: BlastRadiusMetrics = {
    totalAffectedNodes: totalCount,
    maxDepth: maxDownstreamDepth,
    severity,
    statusBreakdown,
    kindBreakdown,
    affectedTokens,
    affectedDurationMs,
    affectedCostUsd,
  };

  // Blocker chain construction
  const blockerChain: BlockerChainItem[] = [];
  const blockers = transitivePrerequisites.filter((p) => p.isBlocker);
  if (blockers.length > 0) {
    // Sort blockers by step / depth to place root cause first
    blockers.sort(
      (a, b) => (a.step ?? 0) - (b.step ?? 0) || Math.abs(b.hopDistance) - Math.abs(a.hopDistance),
    );

    for (let i = 0; i < blockers.length; i++) {
      const b = blockers[i];
      blockerChain.push({
        nodeId: b.id,
        nodeName: b.name,
        kind: b.kind,
        status: (b.status ?? "error") as NodeStatus,
        step: b.step,
        isRootCause: i === 0,
        failureReason: b.failureReason,
      });
    }

    // Add current node to end of blocker chain to show full impact path
    blockerChain.push({
      nodeId: focusNode.id,
      nodeName: focusNode.name,
      kind: focusNode.kind,
      status: (focusNode.status ?? "pending") as NodeStatus,
      step: focusNode.step,
      isRootCause: false,
      failureReason: extractNodeFailureReason(focusNode),
    });
  }

  const focusItem: DependencyNodeItem = {
    id: focusNode.id,
    name: focusNode.name,
    kind: focusNode.kind,
    status: focusNode.status,
    step: focusNode.step,
    model: focusNode.model ?? focusNode.harnessModel,
    tier: focusNode.tier,
    hopDistance: 0,
    direction: "focus",
    failureReason: extractNodeFailureReason(focusNode),
    tokensIn: focusNode.metrics?.tokensIn,
    tokensOut: focusNode.metrics?.tokensOut,
    durationMs: focusNode.metrics?.durationMs,
    costUsd: focusNode.metrics?.costUsd,
    node: focusNode,
  };

  const allNodes = [...transitivePrerequisites, focusItem, ...transitiveDependents];

  return {
    focusNode,
    directPrerequisites,
    directDependents,
    transitivePrerequisites,
    transitiveDependents,
    allNodes,
    topologicalDepth: depth,
    topologicalHeight: height,
    isCriticalPath: isCritical,
    criticalPath,
    blockerChain,
    hasBlocker: blockerChain.length > 0,
    blastRadius,
    hasCycle,
    cycles,
    fanIn: directPrerequisites.length,
    fanOut: directDependents.length,
  };
}

export interface ImpactGraphProps {
  currentNode: GraphNodeData;
  dataset?: GraphDataset | null;
  onSelectNode?: (nodeId: string) => void;
  selectedNodeId?: string | null;
  className?: string;
  showControls?: boolean;
}

/**
 * Interactive SVG/Canvas-style visual local dependency & blast radius impact graph.
 * Displays upstream prerequisites on the left, current focus node in the center,
 * and downstream dependents on the right with directional arrows and blocker indicators.
 */
export const ImpactGraph: FC<ImpactGraphProps> = memo(function ImpactGraph({
  currentNode,
  dataset,
  onSelectNode,
  className = "",
  showControls = true,
}) {
  const setSelectedNodeIdStore = useGraphStore((state) => state.setSelectedNodeId);
  const [viewMode, setViewMode] = useState<"direct" | "transitive">("direct");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCompact, setIsCompact] = useState(false);

  const handleSelectNode = useCallback(
    (nodeId: string) => {
      if (onSelectNode) {
        onSelectNode(nodeId);
      } else {
        setSelectedNodeIdStore(nodeId);
      }
    },
    [onSelectNode, setSelectedNodeIdStore],
  );

  const analysis = useMemo(
    () => analyzeNodeDependencies(currentNode, dataset),
    [currentNode, dataset],
  );

  const upstreamNodes = useMemo(() => {
    const list =
      viewMode === "direct" ? analysis.directPrerequisites : analysis.transitivePrerequisites;
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q) ||
        String(n.kind ?? "").includes(q),
    );
  }, [analysis, viewMode, searchQuery]);

  const downstreamNodes = useMemo(() => {
    const list = viewMode === "direct" ? analysis.directDependents : analysis.transitiveDependents;
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q) ||
        String(n.kind ?? "").includes(q),
    );
  }, [analysis, viewMode, searchQuery]);

  const focusKind = describeNodeKind(currentNode);
  const focusStatus = describeNodeStatus(currentNode);
  const FocusIcon = focusKind.IconComponent;

  const totalConnected = upstreamNodes.length + downstreamNodes.length;

  if (totalConnected === 0 && !analysis.hasCycle) {
    return (
      <div
        className={`drawer-impact-graph-wrap ${className}`}
        role="region"
        aria-label="Local Impact Graph"
      >
        <div className="drawer-empty-state">
          <span>Isolated node with no upstream prerequisites or downstream dependents.</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`drawer-impact-graph-wrap ${isCompact ? "is-compact" : ""} ${className}`}
      role="region"
      aria-label="Local Impact Graph"
    >
      {showControls && (
        <div className="drawer-impact-controls">
          <div className="drawer-impact-mode-toggles">
            <button
              type="button"
              className={`drawer-tab-pill ${viewMode === "direct" ? "is-active" : ""}`}
              onClick={() => setViewMode("direct")}
              aria-label="Direct 1-Hop Impact View"
            >
              Direct (1-Hop)
            </button>
            <button
              type="button"
              className={`drawer-tab-pill ${viewMode === "transitive" ? "is-active" : ""}`}
              onClick={() => setViewMode("transitive")}
              aria-label="Transitive Blast Radius View"
            >
              Transitive ({analysis.blastRadius.totalAffectedNodes})
            </button>
          </div>

          <div className="drawer-impact-search-box">
            <IconSearch size={12} className="drawer-impact-search-icon" />
            <input
              type="text"
              className="drawer-impact-search-input"
              placeholder="Filter graph..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filter impact graph nodes"
            />
            {searchQuery && (
              <button
                type="button"
                className="drawer-impact-clear-btn"
                onClick={() => setSearchQuery("")}
                aria-label="Clear filter"
              >
                <IconX size={10} />
              </button>
            )}
          </div>

          <button
            type="button"
            className="drawer-impact-icon-btn"
            onClick={() => setIsCompact((prev) => !prev)}
            title={isCompact ? "Expanded View" : "Compact View"}
            aria-label={isCompact ? "Expanded View" : "Compact View"}
          >
            {isCompact ? <IconMaximize size={13} /> : <IconMinimize size={13} />}
          </button>
        </div>
      )}

      {analysis.hasCycle && (
        <div className="drawer-impact-cycle-banner" role="alert">
          <IconAlertTriangle size={14} className="drawer-impact-cycle-icon" />
          <span>
            <strong>Cycle Detected:</strong> Circular dependency path:{" "}
            {analysis.cycles[0]?.join(" ➔ ")}
          </span>
        </div>
      )}

      <div className="drawer-impact-flow-container">
        {/* Upstream Column */}
        <div className="drawer-impact-column drawer-impact-column--upstream">
          <div className="drawer-impact-column-header">
            <span className="drawer-impact-column-title">Prerequisites</span>
            <span className="drawer-impact-badge">{upstreamNodes.length}</span>
          </div>
          <div className="drawer-impact-nodes-list">
            {upstreamNodes.length === 0 ? (
              <div className="drawer-impact-empty-col">No upstream prerequisites</div>
            ) : (
              upstreamNodes.map((item) => {
                const k = describeNodeKind(item.node);
                const s = describeNodeStatus(item.node);
                const KIcon = k.IconComponent;
                return (
                  <button
                    key={`up-${item.id}`}
                    type="button"
                    className={`drawer-impact-node-card ${item.isBlocker ? "is-blocker" : ""}`}
                    onClick={() => handleSelectNode(item.id)}
                    title={`Jump to prerequisite: ${item.name} (${item.id})`}
                    aria-label={`Jump to prerequisite: ${item.name}`}
                  >
                    <div className="drawer-impact-card-top">
                      <span className="drawer-impact-kind-icon" style={{ color: k.accent }}>
                        <KIcon size={12} />
                      </span>
                      <span className="drawer-impact-node-name">{item.name}</span>
                      <span
                        className="drawer-impact-status-dot"
                        style={{ backgroundColor: s.color }}
                      />
                    </div>
                    <div className="drawer-impact-card-meta">
                      <span className="drawer-impact-hop-pill">
                        {Math.abs(item.hopDistance)} hop
                      </span>
                      {item.step !== undefined && (
                        <span className="drawer-impact-step">Step {item.step}</span>
                      )}
                      {item.isBlocker && (
                        <span className="drawer-impact-blocker-pill">BLOCKER</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Center Connecting Arrow */}
        <div className="drawer-impact-connector">
          <IconArrowRight size={16} className="drawer-impact-arrow" />
        </div>

        {/* Center Focus Node */}
        <div className="drawer-impact-column drawer-impact-column--focus">
          <div className="drawer-impact-column-header">
            <span className="drawer-impact-column-title">Focus Node</span>
          </div>
          <div className="drawer-impact-focus-card" style={{ borderColor: focusKind.accent }}>
            <div className="drawer-impact-focus-header">
              <span className="drawer-impact-kind-icon" style={{ color: focusKind.accent }}>
                <FocusIcon size={16} />
              </span>
              <span className="drawer-impact-focus-name">{currentNode.name}</span>
            </div>
            <div className="drawer-impact-focus-meta">
              <span className="drawer-status-pill" style={{ color: focusStatus.color }}>
                {focusStatus.label}
              </span>
              <span className="drawer-kind-label">{focusKind.label}</span>
              {currentNode.step !== undefined && (
                <span className="drawer-step-chip">Step {currentNode.step}</span>
              )}
            </div>
            <div className="drawer-impact-focus-depths">
              <span>Depth: {analysis.topologicalDepth}</span>
              <span>Height: {analysis.topologicalHeight}</span>
              {analysis.isCriticalPath && (
                <span className="drawer-impact-critical-badge">Critical Path</span>
              )}
            </div>
          </div>
        </div>

        {/* Downstream Connecting Arrow */}
        <div className="drawer-impact-connector">
          <IconArrowRight size={16} className="drawer-impact-arrow" />
        </div>

        {/* Downstream Column (Blast Radius) */}
        <div className="drawer-impact-column drawer-impact-column--downstream">
          <div className="drawer-impact-column-header">
            <span className="drawer-impact-column-title">Blast Radius</span>
            <span
              className={`drawer-impact-badge drawer-impact-badge--${analysis.blastRadius.severity}`}
            >
              {downstreamNodes.length}
            </span>
          </div>
          <div className="drawer-impact-nodes-list">
            {downstreamNodes.length === 0 ? (
              <div className="drawer-impact-empty-col">No downstream dependents</div>
            ) : (
              downstreamNodes.map((item) => {
                const k = describeNodeKind(item.node);
                const s = describeNodeStatus(item.node);
                const KIcon = k.IconComponent;
                return (
                  <button
                    key={`down-${item.id}`}
                    type="button"
                    className="drawer-impact-node-card drawer-impact-node-card--downstream"
                    onClick={() => handleSelectNode(item.id)}
                    title={`Jump to dependent: ${item.name} (${item.id})`}
                    aria-label={`Jump to dependent: ${item.name}`}
                  >
                    <div className="drawer-impact-card-top">
                      <span className="drawer-impact-kind-icon" style={{ color: k.accent }}>
                        <KIcon size={12} />
                      </span>
                      <span className="drawer-impact-node-name">{item.name}</span>
                      <span
                        className="drawer-impact-status-dot"
                        style={{ backgroundColor: s.color }}
                      />
                    </div>
                    <div className="drawer-impact-card-meta">
                      <span className="drawer-impact-hop-pill">+{item.hopDistance} hop</span>
                      {item.step !== undefined && (
                        <span className="drawer-impact-step">Step {item.step}</span>
                      )}
                      {item.edge?.kind && (
                        <span className="drawer-impact-edge-pill">{item.edge.kind}</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default ImpactGraph;
