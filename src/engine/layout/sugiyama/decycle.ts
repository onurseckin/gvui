import type { SugiyamaEdge, SugiyamaNode } from "./types";

export interface DecycleResult {
  edges: SugiyamaEdge[];
  reversedEdgeIds: Set<string>;
  restore: (edges: SugiyamaEdge[]) => SugiyamaEdge[];
}

/**
 * Phase 1: Detect and temporarily reverse feedback/cycle edges using DFS 3-coloring.
 */
export function decycleGraph(nodes: SugiyamaNode[], edges: SugiyamaEdge[]): DecycleResult {
  const nodeMap = new Map<string, SugiyamaNode>(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, SugiyamaEdge[]>();
  for (const n of nodes) {
    adj.set(n.id, []);
  }

  const edgeList: SugiyamaEdge[] = edges.map((e) => ({ ...e }));
  for (const e of edgeList) {
    const list = adj.get(e.source);
    if (list) list.push(e);
  }

  // 0: Unvisited, 1: Visiting (in call stack), 2: Visited
  const state = new Map<string, number>();
  const reversedEdgeIds = new Set<string>();

  function dfs(nodeId: string): void {
    state.set(nodeId, 1);
    const neighbors = adj.get(nodeId) || [];

    for (const edge of neighbors) {
      if (!nodeMap.has(edge.target)) continue;

      const targetState = state.get(edge.target) ?? 0;
      if (targetState === 1) {
        // Back edge detected!
        reversedEdgeIds.add(edge.id);
        edge.isReversed = true;
        edge.isCycle = true;
        // Swap endpoints
        const temp = edge.source;
        edge.source = edge.target;
        edge.target = temp;
      } else if (targetState === 0) {
        dfs(edge.target);
      }
    }

    state.set(nodeId, 2);
  }

  for (const node of nodes) {
    if ((state.get(node.id) ?? 0) === 0) {
      dfs(node.id);
    }
  }

  function restore(routedEdges: SugiyamaEdge[]): SugiyamaEdge[] {
    return routedEdges.map((e) => {
      if (reversedEdgeIds.has(e.id) || e.isReversed) {
        return {
          ...e,
          source: e.target,
          target: e.source,
          isReversed: false,
          isCycle: true,
          points: e.points ? [...e.points].reverse() : undefined,
        };
      }
      return e;
    });
  }

  return {
    edges: edgeList,
    reversedEdgeIds,
    restore,
  };
}
