import type { GraphDataset, GraphNodeData, GraphEdgeData } from "../../../types/graphData";
import type { AnomalyFinding, AnomalyThresholds, AnomalyDetectorFn } from "../types";

/**
 * Finds all elementary cycles in a directed graph using DFS with recursion stack tracking.
 */
export function findGraphCycles(dataset: GraphDataset): {
  cycles: string[][];
  cycleEdgeIds: string[];
} {
  const nodes = dataset.nodes || [];
  const edges = dataset.edges || [];

  const adj = new Map<string, Array<{ target: string; edgeId: string; kind?: string }>>();
  for (const node of nodes) {
    adj.set(node.id, []);
  }

  for (const edge of edges) {
    const list = adj.get(edge.source);
    if (list) {
      list.push({ target: edge.target, edgeId: edge.id, kind: edge.kind });
    }
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];
  const pathEdges: string[] = [];
  const allCycles: string[][] = [];
  const cycleEdgeIds = new Set<string>();

  function dfs(u: string): void {
    visited.add(u);
    recStack.add(u);
    path.push(u);

    const neighbors = adj.get(u) || [];
    for (const { target: v, edgeId } of neighbors) {
      if (!visited.has(v)) {
        pathEdges.push(edgeId);
        dfs(v);
        pathEdges.pop();
      } else if (recStack.has(v)) {
        // Cycle detected from v to u
        const cycleStartIndex = path.indexOf(v);
        if (cycleStartIndex !== -1) {
          const cycleNodes = [...path.slice(cycleStartIndex), v];
          allCycles.push(cycleNodes);
          cycleEdgeIds.add(edgeId);
        }
      }
    }

    recStack.delete(u);
    path.pop();
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return {
    cycles: allCycles,
    cycleEdgeIds: Array.from(cycleEdgeIds),
  };
}

export const detectCycleDeadlocks: AnomalyDetectorFn = (
  dataset: GraphDataset,
  _thresholds: AnomalyThresholds,
): AnomalyFinding[] => {
  const findings: AnomalyFinding[] = [];
  const nodes = dataset.nodes || [];
  const edges = dataset.edges || [];

  const nodeMap = new Map<string, GraphNodeData>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // 1. Detect dangling edges referencing non-existent nodes
  for (const edge of edges) {
    const sourceExists = nodeMap.has(edge.source);
    const targetExists = nodeMap.has(edge.target);

    if (!sourceExists || !targetExists) {
      const missingId = !sourceExists ? edge.source : edge.target;
      findings.push({
        id: `anomaly-dangling-edge-${edge.id}`,
        type: "contract_violation",
        category: "topology",
        severity: "error",
        title: `Dangling Edge Reference on ${edge.id}`,
        description: `Edge "${edge.id}" references non-existent node ID "${missingId}" in ${!sourceExists ? "source" : "target"} position.`,
        nodeIds: [sourceExists ? edge.source : targetExists ? edge.target : ""].filter(Boolean),
        edgeIds: [edge.id],
        impactScore: 80,
        remediation: {
          action: "Prune Dangling Edge",
          suggestion: `Remove or reconnect edge "${edge.id}" to a valid existing graph node.`,
          autoFixable: true,
          quickFix: {
            type: "break_cycle",
            targetId: edge.id,
          },
        },
        evidence: {
          relatedEdges: [edge.id],
          metrics: {
            sourceExists,
            targetExists,
            missingNodeId: missingId,
          },
          confidence: 1.0,
        },
        timestamp: Date.now(),
      });
    }
  }

  // 2. Cycle Detection
  const { cycles, cycleEdgeIds } = findGraphCycles(dataset);

  if (cycles.length > 0) {
    for (let i = 0; i < cycles.length; i++) {
      const cycle = cycles[i];
      if (!cycle || cycle.length === 0) continue;

      // Check if edges along this cycle are explicit intended loop edges
      const isExplicitLoop = edges.some(
        (e) =>
          cycle.includes(e.source) &&
          cycle.includes(e.target) &&
          (e.kind === "loop" || e.isCycle === true),
      );

      const cycleNodeNames = cycle.map((id) => nodeMap.get(id)?.name || id).join(" ➔ ");

      // Check if nodes in cycle are stuck in pending/running (deadlock)
      const isDeadlocked = cycle.some((id) => {
        const n = nodeMap.get(id);
        return n?.status === "pending" || n?.status === "running";
      });

      const severity = !isExplicitLoop || isDeadlocked ? "critical" : "warning";
      const impactScore = !isExplicitLoop ? 100 : isDeadlocked ? 90 : 40;

      findings.push({
        id: `anomaly-cycle-${i}`,
        type: "circular_dependency_deadlock",
        category: "topology",
        severity,
        title: `${!isExplicitLoop ? "Circular Dependency Deadlock" : "Active Cyclic Feedback Loop"} (${cycle.length - 1} Nodes)`,
        description: `Directed dependency cycle detected: ${cycleNodeNames}.${
          !isExplicitLoop
            ? " This forms an illegal circular dependency preventing deterministic graph resolution."
            : " Monitored feedback cycle active."
        }`,
        nodeIds: Array.from(new Set(cycle)),
        edgeIds: cycleEdgeIds,
        impactScore,
        metricValue: cycle.length - 1,
        unit: "cycle length",
        remediation: {
          action: "Break Circular Dependency Edge",
          suggestion: `Remove or convert back-edge to an asynchronous dispatch port to restore Directed Acyclic Graph (DAG) invariants.`,
          autoFixable: true,
          quickFix: {
            type: "break_cycle",
            targetId: cycleEdgeIds[0],
          },
        },
        evidence: {
          cyclePath: cycle,
          relatedNodes: Array.from(new Set(cycle)),
          relatedEdges: cycleEdgeIds,
          confidence: 1.0,
        },
        timestamp: Date.now(),
      });
    }
  }

  // 3. Diamond Join Deadlock Detection
  // If a join node has all inputs from upstream, but at least one upstream failed and there's no fallback
  const inboundEdges = new Map<string, GraphEdgeData[]>();
  for (const edge of edges) {
    const list = inboundEdges.get(edge.target) || [];
    list.push(edge);
    inboundEdges.set(edge.target, list);
  }

  for (const node of nodes) {
    if (node.kind === "join" || (inboundEdges.get(node.id)?.length || 0) > 1) {
      const inEdges = inboundEdges.get(node.id) || [];
      const upstreamNodes = inEdges
        .map((e) => nodeMap.get(e.source))
        .filter((n): n is GraphNodeData => n !== undefined);

      const hasFailedUpstream = upstreamNodes.some((n) => n.status === "error");
      const hasSkippedUpstream = upstreamNodes.some((n) => n.status === "skipped");
      const isTargetPending = node.status === "pending" || node.status === undefined;

      if ((hasFailedUpstream || hasSkippedUpstream) && isTargetPending) {
        findings.push({
          id: `anomaly-join-deadlock-${node.id}`,
          type: "diamond_join_deadlock",
          category: "topology",
          severity: "critical",
          title: `Diamond Join Deadlock on Node ${node.name || node.id}`,
          description: `Join node "${node.name || node.id}" is waiting on upstream dependencies, but upstream task "${
            upstreamNodes.find((n) => n.status === "error" || n.status === "skipped")?.name ||
            "dependency"
          }" terminated in "${hasFailedUpstream ? "error" : "skipped"}" without satisfying the join barrier.`,
          nodeIds: [node.id, ...upstreamNodes.map((n) => n.id)],
          impactScore: 95,
          remediation: {
            action: "Configure Quorum or Bypass Failed Join Branch",
            suggestion: `Allow partial quorum on join node ${node.id} or route an alternate error handler bypass edge.`,
            autoFixable: true,
            quickFix: {
              type: "bypass_join",
              targetId: node.id,
            },
          },
          evidence: {
            relatedNodes: [node.id, ...upstreamNodes.map((n) => n.id)],
            metrics: {
              inboundEdgeCount: inEdges.length,
              upstreamFailedCount: upstreamNodes.filter((n) => n.status === "error").length,
              upstreamSkippedCount: upstreamNodes.filter((n) => n.status === "skipped").length,
            },
            confidence: 0.96,
          },
          timestamp: Date.now(),
        });
      }
    }
  }

  // 4. Orphaned Nodes (Unreachable nodes in multi-node graph)
  if (nodes.length > 2) {
    const reachable = new Set<string>();
    const entryId = dataset.entry || nodes[0]?.id;

    if (entryId && nodeMap.has(entryId)) {
      const q = [entryId];
      reachable.add(entryId);

      while (q.length > 0) {
        const curr = q.shift();
        if (!curr) continue;
        const outEdges = edges.filter((e) => e.source === curr);
        for (const e of outEdges) {
          if (!reachable.has(e.target) && nodeMap.has(e.target)) {
            reachable.add(e.target);
            q.push(e.target);
          }
        }
      }

      const orphanedNodes = nodes.filter(
        (n) =>
          !reachable.has(n.id) && n.id !== entryId && (inboundEdges.get(n.id)?.length || 0) === 0,
      );

      for (const orphan of orphanedNodes) {
        findings.push({
          id: `anomaly-orphan-${orphan.id}`,
          type: "orphaned_subgraph",
          category: "topology",
          severity: "warning",
          title: `Orphaned Unreachable Node ${orphan.name || orphan.id}`,
          description: `Node "${orphan.name || orphan.id}" is unreachable from entry node "${entryId}" and has no inbound edges.`,
          nodeIds: [orphan.id],
          impactScore: 35,
          remediation: {
            action: "Connect or Prune Orphaned Task",
            suggestion: `Link "${orphan.name || orphan.id}" into the orchestration DAG or prune unused node definition.`,
            autoFixable: false,
          },
          evidence: {
            relatedNodes: [orphan.id],
            metrics: {
              entryNode: entryId,
            },
            confidence: 0.9,
          },
          timestamp: Date.now(),
        });
      }
    }
  }

  return findings;
};
