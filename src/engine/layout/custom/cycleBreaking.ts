import type { DetailedSCCResult } from "./stronglyConnectedComponents";
import type { ClassifiedEdge, EdgeRole, NormalizedGraph } from "./types";

export interface CycleBreakingResult {
  classifiedEdges: ClassifiedEdge[];
  edgeRoleMap: Map<string, EdgeRole>;
  isDAG: boolean;
}

export function classifyEdgeRoles(
  graph: NormalizedGraph,
  sccResult: DetailedSCCResult
): CycleBreakingResult {
  const edgeRoleMap = new Map<string, EdgeRole>();
  const reversedMap = new Map<string, boolean>();

  // 1. Process explicit self loops & explicit isCycle flags
  for (const edge of graph.edges) {
    if (edge.source === edge.target) {
      edgeRoleMap.set(edge.id, "self");
      reversedMap.set(edge.id, false);
    } else if (edge.isCycle) {
      edgeRoleMap.set(edge.id, "feedback");
      reversedMap.set(edge.id, true);
    }
  }

  // 2. Break cycles in cyclic SCCs using Eades-style greedy heuristic
  for (const compNodes of sccResult.components) {
    const compId = compNodes.join(",");
    if (!sccResult.cyclicComponentIds.has(compId) || compNodes.length <= 1) continue;

    // Build internal sub-graph adjacency for this SCC
    const nodesInSCC = new Set(compNodes);
    const sccEdges = graph.edges.filter(
      (e) => nodesInSCC.has(e.source) && nodesInSCC.has(e.target) && e.source !== e.target && !e.isCycle
    );

    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();
    const outEdges = new Map<string, string[]>();
    const inEdges = new Map<string, string[]>();

    for (const node of compNodes) {
      inDegree.set(node, 0);
      outDegree.set(node, 0);
      outEdges.set(node, []);
      inEdges.set(node, []);
    }

    for (const edge of sccEdges) {
      outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1);
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
      outEdges.get(edge.source)?.push(edge.target);
      inEdges.get(edge.target)?.push(edge.source);
    }

    const activeNodes = new Set(compNodes);
    const leftList: string[] = [];
    const rightList: string[] = [];

    while (activeNodes.size > 0) {
      // Find sinks (outDegree === 0)
      const sink = Array.from(activeNodes)
        .filter((n) => (outDegree.get(n) ?? 0) === 0)
        .sort((a, b) => a.localeCompare(b))[0];

      if (sink) {
        activeNodes.delete(sink);
        rightList.unshift(sink);
        // Remove sink from active nodes
        for (const u of inEdges.get(sink) ?? []) {
          if (activeNodes.has(u)) {
            outDegree.set(u, (outDegree.get(u) ?? 0) - 1);
          }
        }
        continue;
      }

      // Find sources (inDegree === 0)
      const source = Array.from(activeNodes)
        .filter((n) => (inDegree.get(n) ?? 0) === 0)
        .sort((a, b) => a.localeCompare(b))[0];

      if (source) {
        activeNodes.delete(source);
        leftList.push(source);
        // Remove source from active nodes
        for (const v of outEdges.get(source) ?? []) {
          if (activeNodes.has(v)) {
            inDegree.set(v, (inDegree.get(v) ?? 0) - 1);
          }
        }
        continue;
      }

      // Find node maximizing (outDegree - inDegree), tie-break by node ID
      const bestNode = Array.from(activeNodes).sort((a, b) => {
        const scoreA = (outDegree.get(a) ?? 0) - (inDegree.get(a) ?? 0);
        const scoreB = (outDegree.get(b) ?? 0) - (inDegree.get(b) ?? 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return a.localeCompare(b);
      })[0];

      activeNodes.delete(bestNode);
      leftList.push(bestNode);

      for (const v of outEdges.get(bestNode) ?? []) {
        if (activeNodes.has(v)) {
          inDegree.set(v, (inDegree.get(v) ?? 0) - 1);
        }
      }
      for (const u of inEdges.get(bestNode) ?? []) {
        if (activeNodes.has(u)) {
          outDegree.set(u, (outDegree.get(u) ?? 0) - 1);
        }
      }
    }

    const sccOrder = [...leftList, ...rightList];
    const posMap = new Map<string, number>();
    sccOrder.forEach((nodeId, idx) => posMap.set(nodeId, idx));

    for (const edge of sccEdges) {
      if (edgeRoleMap.has(edge.id)) continue;

      const srcPos = posMap.get(edge.source)!;
      const tgtPos = posMap.get(edge.target)!;

      if (srcPos < tgtPos) {
        edgeRoleMap.set(edge.id, "forward");
        reversedMap.set(edge.id, false);
      } else {
        edgeRoleMap.set(edge.id, "feedback");
        reversedMap.set(edge.id, true);
      }
    }
  }

  // 3. Mark remaining unclassified edges as forward
  for (const edge of graph.edges) {
    if (!edgeRoleMap.has(edge.id)) {
      edgeRoleMap.set(edge.id, "forward");
      reversedMap.set(edge.id, false);
    }
  }

  // 4. Verify DAG condition using Kahn's algorithm on forward edges
  const forwardInDegree = new Map<string, number>();
  const forwardAdj = new Map<string, string[]>();

  for (const node of graph.nodes) {
    forwardInDegree.set(node.id, 0);
    forwardAdj.set(node.id, []);
  }

  for (const edge of graph.edges) {
    if (edgeRoleMap.get(edge.id) === "forward") {
      forwardInDegree.set(edge.target, (forwardInDegree.get(edge.target) ?? 0) + 1);
      forwardAdj.get(edge.source)?.push(edge.target);
    }
  }

  const queue: string[] = Array.from(graph.nodes.map((n) => n.id))
    .filter((id) => (forwardInDegree.get(id) ?? 0) === 0)
    .sort((a, b) => a.localeCompare(b));

  let visitedCount = 0;
  while (queue.length > 0) {
    const curr = queue.shift()!;
    visitedCount++;

    const neighbors = forwardAdj.get(curr) ?? [];
    for (const neighbor of neighbors) {
      const nextDegree = (forwardInDegree.get(neighbor) ?? 0) - 1;
      forwardInDegree.set(neighbor, nextDegree);
      if (nextDegree === 0) {
        queue.push(neighbor);
        queue.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  const isDAG = visitedCount === graph.nodes.length;

  const classifiedEdges: ClassifiedEdge[] = graph.edges.map((edge) => ({
    ...edge,
    role: edgeRoleMap.get(edge.id) ?? "forward",
    reversed: reversedMap.get(edge.id) ?? false,
  }));

  return {
    classifiedEdges,
    edgeRoleMap,
    isDAG,
  };
}
