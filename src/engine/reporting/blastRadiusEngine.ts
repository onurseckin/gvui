import type { GraphDataset, GraphNodeData } from "../../types/graphData";
import type { BlastRadiusMatrix, FailureCascadeNode, NodeBlastImpact, RiskLevel } from "./types";

/**
 * Computes downstream blast radius, cascade depth, and risk classification for all nodes in a dataset.
 */
export function computeBlastRadiusMatrix(
  dataset: GraphDataset | null | undefined,
): BlastRadiusMatrix {
  if (!dataset || !Array.isArray(dataset.nodes) || dataset.nodes.length === 0) {
    return {
      items: [],
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      maxGraphDepth: 0,
      overallFragilityIndex: 0,
      topRiskNodeId: null,
    };
  }

  const nodeMap = new Map<string, GraphNodeData>();
  for (const node of dataset.nodes) {
    if (node && node.id) {
      nodeMap.set(node.id, node);
    }
  }

  const totalNodes = nodeMap.size;
  if (totalNodes === 0) {
    return {
      items: [],
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      maxGraphDepth: 0,
      overallFragilityIndex: 0,
      topRiskNodeId: null,
    };
  }

  // Build forward adjacency list
  const adj = new Map<string, string[]>();
  const outDegree = new Map<string, number>();

  for (const id of nodeMap.keys()) {
    adj.set(id, []);
    outDegree.set(id, 0);
  }

  if (Array.isArray(dataset.edges)) {
    for (const edge of dataset.edges) {
      if (!edge || !edge.source || !edge.target) continue;
      if (nodeMap.has(edge.source) && nodeMap.has(edge.target) && edge.source !== edge.target) {
        const list = adj.get(edge.source) ?? [];
        if (!list.includes(edge.target)) {
          list.push(edge.target);
          adj.set(edge.source, list);
          outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1);
        }
      }
    }
  }

  // Terminal nodes (nodes that do not point to any other node)
  const terminalNodeIds = new Set<string>();
  for (const [id, deg] of outDegree.entries()) {
    if (deg === 0) {
      terminalNodeIds.add(id);
    }
  }

  // Calculate max graph depth across all paths
  let maxGraphDepth = 1;

  // Function to traverse downstream nodes for a given source node
  function getDownstreamImpact(startId: string): {
    affectedIds: string[];
    maxDepth: number;
    terminalsAffected: number;
    cascadeTree: FailureCascadeNode[];
    costAtRisk: number | undefined;
  } {
    const visited = new Map<string, number>(); // id -> depth
    const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
    visited.set(startId, 0);

    const cascadeTree: FailureCascadeNode[] = [];
    let maxDepth = 0;
    let terminalsAffected = 0;
    // Recorded dollars only, so an unpriced cascade puts no dollar figure at risk.
    const startCost = nodeMap.get(startId)?.metrics?.costUsd;
    let costAtRisk: number | undefined = typeof startCost === "number" ? startCost : undefined;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;

      const children = adj.get(current.id) ?? [];
      for (const childId of children) {
        if (!visited.has(childId)) {
          const childDepth = current.depth + 1;
          visited.set(childId, childDepth);
          if (childDepth > maxDepth) {
            maxDepth = childDepth;
          }
          if (childDepth > maxGraphDepth) {
            maxGraphDepth = childDepth;
          }

          if (terminalNodeIds.has(childId)) {
            terminalsAffected++;
          }

          const childNode = nodeMap.get(childId);
          const childCost = childNode?.metrics?.costUsd;
          if (typeof childCost === "number") costAtRisk = (costAtRisk ?? 0) + childCost;

          cascadeTree.push({
            nodeId: childId,
            nodeName: childNode?.name || childId,
            kind: childNode?.kind,
            depth: childDepth,
            impactWeight: Math.max(1, 10 - childDepth),
            reason: `Cascade successor via ${current.id}`,
          });

          queue.push({ id: childId, depth: childDepth });
        }
      }
    }

    const affectedIds = Array.from(visited.keys()).filter((id) => id !== startId);

    return {
      affectedIds,
      maxDepth,
      terminalsAffected,
      cascadeTree,
      costAtRisk,
    };
  }

  const items: NodeBlastImpact[] = [];
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  for (const node of dataset.nodes) {
    if (!node || !node.id) continue;

    const directChildren = adj.get(node.id) ?? [];
    const directDownstreamCount = directChildren.length;
    const impact = getDownstreamImpact(node.id);
    const transitiveDownstreamCount = impact.affectedIds.length;

    // Critical path or critical kind heuristic
    const isOrchestrator =
      node.kind === "orchestrator" || node.kind === "router" || node.kind === "gate";
    const hasPriorFailure =
      node.status === "error" ||
      node.status === "warning" ||
      Number(node.metrics?.retries ?? 0) > 0;
    const isOnCriticalPath = directDownstreamCount > 2 || isOrchestrator;

    // Blast radius score computation (0 - 100)
    const downstreamRatio = totalNodes > 1 ? transitiveDownstreamCount / (totalNodes - 1) : 0;
    let score = Math.round(downstreamRatio * 50); // Up to 50 points from downstream reach

    if (impact.maxDepth >= 3) {
      score += 15;
    } else if (impact.maxDepth >= 1) {
      score += 8;
    }

    if (impact.terminalsAffected > 0) {
      score += Math.min(15, impact.terminalsAffected * 5);
    }

    if (isOnCriticalPath) {
      score += 15;
    }

    if (hasPriorFailure) {
      score += 10;
    }

    const blastRadiusScore = Math.max(0, Math.min(100, score));

    let riskLevel: RiskLevel;
    if (blastRadiusScore >= 70) {
      riskLevel = "critical";
      criticalCount++;
    } else if (blastRadiusScore >= 45) {
      riskLevel = "high";
      highCount++;
    } else if (blastRadiusScore >= 20) {
      riskLevel = "medium";
      mediumCount++;
    } else {
      riskLevel = "low";
      lowCount++;
    }

    // Generate recommendation
    let remediationRecommendation = "Standard execution monitoring.";
    if (riskLevel === "critical") {
      remediationRecommendation = `High downstream dependency (${transitiveDownstreamCount} nodes affected, depth ${impact.maxDepth}). Require checkpointing, fallback routes, and isolated retry bounds.`;
    } else if (riskLevel === "high") {
      remediationRecommendation = `Significant cascade blast radius affecting ${impact.terminalsAffected} exit terminals. Implement circuit-breaker or validation gate before dispatch.`;
    } else if (riskLevel === "medium") {
      remediationRecommendation = `Moderate blast radius affecting ${transitiveDownstreamCount} nodes. Monitor timeout budgets and retry policies.`;
    }

    items.push({
      nodeId: node.id,
      nodeName: node.name || node.id,
      kind: node.kind,
      status: node.status,
      directDownstreamCount,
      transitiveDownstreamCount,
      affectedNodeIds: impact.affectedIds,
      affectedTerminalCount: impact.terminalsAffected,
      maxCascadeDepth: impact.maxDepth,
      blastRadiusScore,
      riskLevel,
      isOnCriticalPath,
      cascadeTree: impact.cascadeTree,
      estimatedCostAtRiskUsd:
        impact.costAtRisk === undefined ? undefined : Math.round(impact.costAtRisk * 10000) / 10000,
      remediationRecommendation,
    });
  }

  // Sort items: critical -> high -> medium -> low, then by blast score descending
  items.sort((a, b) => b.blastRadiusScore - a.blastRadiusScore);

  const topRiskNodeId = items.length > 0 && items[0].blastRadiusScore > 0 ? items[0].nodeId : null;

  // Fragility Index: weighted average of risk scores
  const sumScores = items.reduce((acc, it) => acc + it.blastRadiusScore, 0);
  const overallFragilityIndex = items.length > 0 ? Math.round(sumScores / items.length) : 0;

  return {
    items,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    maxGraphDepth,
    overallFragilityIndex,
    topRiskNodeId,
  };
}

/**
 * Simulates the hypothetical failure of a specific node and reports immediate downstream consequences.
 */
export function simulateNodeFailure(
  dataset: GraphDataset | null | undefined,
  failedNodeId: string,
): {
  affectedNodes: string[];
  cascadeDepth: number;
  terminalsAffected: string[];
  /** Recorded dollars on the affected nodes. Absent when none of them reported a cost. */
  totalCostAtRisk?: number;
} {
  const matrix = computeBlastRadiusMatrix(dataset);
  const item = matrix.items.find((it) => it.nodeId === failedNodeId);

  if (!item) {
    return {
      affectedNodes: [],
      cascadeDepth: 0,
      terminalsAffected: [],
    };
  }

  const terminalNodes =
    dataset?.nodes
      ?.filter(
        (n) =>
          item.affectedNodeIds.includes(n.id) &&
          !(dataset?.edges ?? []).some((e) => e?.source === n.id),
      )
      ?.map((n) => n.id) ?? [];

  return {
    affectedNodes: item.affectedNodeIds,
    cascadeDepth: item.maxCascadeDepth,
    terminalsAffected: terminalNodes,
    totalCostAtRisk: item.estimatedCostAtRiskUsd,
  };
}
