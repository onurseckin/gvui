import type { CycleBreakingResult } from "./cycleBreaking";
import type { NormalizedGraph } from "./types";

export interface RankAssignmentResult {
  nodeRankMap: Map<string, number>;
  rankNodesMap: Map<number, string[]>;
  maxRank: number;
  edgeRankSpanMap: Map<string, number>;
}

export function assignRanks(
  graph: NormalizedGraph,
  cycleBreaking: CycleBreakingResult,
): RankAssignmentResult {
  const forwardInDegree = new Map<string, number>();
  const forwardPredecessors = new Map<string, string[]>();
  const forwardSuccessors = new Map<string, string[]>();

  for (const node of graph.nodes) {
    forwardInDegree.set(node.id, 0);
    forwardPredecessors.set(node.id, []);
    forwardSuccessors.set(node.id, []);
  }

  for (const edge of graph.edges) {
    const role = cycleBreaking.edgeRoleMap.get(edge.id);
    if (role === "forward") {
      forwardInDegree.set(edge.target, (forwardInDegree.get(edge.target) ?? 0) + 1);
      forwardPredecessors.get(edge.target)?.push(edge.source);
      forwardSuccessors.get(edge.source)?.push(edge.target);
    }
  }

  // Topological sort via Kahn's algorithm
  const queue: string[] = graph.nodes
    .map((n) => n.id)
    .filter((id) => (forwardInDegree.get(id) ?? 0) === 0)
    .sort((a, b) => a.localeCompare(b));

  const topoOrder: string[] = [];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoOrder.push(curr);

    const successors = (forwardSuccessors.get(curr) ?? []).sort((a, b) => a.localeCompare(b));
    for (const succ of successors) {
      const nextDegree = (forwardInDegree.get(succ) ?? 0) - 1;
      forwardInDegree.set(succ, nextDegree);
      if (nextDegree === 0) {
        queue.push(succ);
        queue.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  // Longest path rank assignment
  const nodeRankMap = new Map<string, number>();
  let maxRank = 0;

  for (const nodeId of topoOrder) {
    const preds = forwardPredecessors.get(nodeId) ?? [];
    if (preds.length === 0) {
      nodeRankMap.set(nodeId, 0);
    } else {
      let maxPredRank = 0;
      for (const p of preds) {
        maxPredRank = Math.max(maxPredRank, nodeRankMap.get(p) ?? 0);
      }
      const rank = maxPredRank + 1;
      nodeRankMap.set(nodeId, rank);
      maxRank = Math.max(maxRank, rank);
    }
  }

  // Group nodes by rank
  const rankNodesMap = new Map<number, string[]>();
  for (let r = 0; r <= maxRank; r++) {
    rankNodesMap.set(r, []);
  }

  for (const node of graph.nodes) {
    const rank = nodeRankMap.get(node.id) ?? 0;
    rankNodesMap.get(rank)?.push(node.id);
  }

  for (const [, nodes] of rankNodesMap) {
    nodes.sort((a, b) => a.localeCompare(b));
  }

  // Compute edge rank spans
  const edgeRankSpanMap = new Map<string, number>();
  for (const edge of graph.edges) {
    const srcRank = nodeRankMap.get(edge.source) ?? 0;
    const tgtRank = nodeRankMap.get(edge.target) ?? 0;
    edgeRankSpanMap.set(edge.id, tgtRank - srcRank);
  }

  return {
    nodeRankMap,
    rankNodesMap,
    maxRank,
    edgeRankSpanMap,
  };
}
