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

  // 1. Process explicit roles according to role priority:
  // self > explicit feedback > explicit cross > explicit forward
  for (const edge of graph.edges) {
    if (edge.source === edge.target) {
      edgeRoleMap.set(edge.id, "self");
      reversedMap.set(edge.id, false);
    } else if (edge.isCycle || edge.layoutRole === "feedback") {
      edgeRoleMap.set(edge.id, "feedback");
      reversedMap.set(edge.id, true);
    } else if (edge.layoutRole === "cross") {
      edgeRoleMap.set(edge.id, "cross");
      reversedMap.set(edge.id, false);
    } else if (edge.layoutRole === "forward") {
      edgeRoleMap.set(edge.id, "forward");
      reversedMap.set(edge.id, false);
    }
  }

  // 2. Break cycles in cyclic SCCs using Eades-style greedy heuristic for unclassified (auto) edges
  for (const compNodes of sccResult.components) {
    const compId = compNodes.join(",");
    if (!sccResult.cyclicComponentIds.has(compId) || compNodes.length <= 1) continue;

    // Build internal sub-graph adjacency for this SCC
    const nodesInSCC = new Set(compNodes);
    const sccEdges = graph.edges.filter(
      (e) =>
        nodesInSCC.has(e.source) &&
        nodesInSCC.has(e.target) &&
        e.source !== e.target &&
        !edgeRoleMap.has(e.id)
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

  // 3. Mark remaining unclassified edges as forward (initially)
  for (const edge of graph.edges) {
    if (!edgeRoleMap.has(edge.id)) {
      edgeRoleMap.set(edge.id, "forward");
      reversedMap.set(edge.id, false);
    }
  }

  // 4. Infer auto cross edges for auto DAG edges in edge-ID order
  const autoCandidates = graph.edges
    .filter(
      (e) =>
        (!e.layoutRole || e.layoutRole === "auto") &&
        !e.isCycle &&
        e.source !== e.target &&
        edgeRoleMap.get(e.id) === "forward"
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  const activeForwardSet = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeRoleMap.get(edge.id) === "forward") {
      activeForwardSet.add(edge.id);
    }
  }

  function computeTempRanks(activeEdges: Set<string>): Map<string, number> {
    const inDeg = new Map<string, number>();
    const predsMap = new Map<string, string[]>();
    const succsMap = new Map<string, string[]>();

    for (const node of graph.nodes) {
      inDeg.set(node.id, 0);
      predsMap.set(node.id, []);
      succsMap.set(node.id, []);
    }

    for (const edge of graph.edges) {
      if (activeEdges.has(edge.id)) {
        inDeg.set(edge.target, (inDeg.get(edge.target) ?? 0) + 1);
        predsMap.get(edge.target)?.push(edge.source);
        succsMap.get(edge.source)?.push(edge.target);
      }
    }

    const q: string[] = graph.nodes
      .map((n) => n.id)
      .filter((id) => (inDeg.get(id) ?? 0) === 0)
      .sort((a, b) => a.localeCompare(b));

    const topo: string[] = [];
    while (q.length > 0) {
      const curr = q.shift()!;
      topo.push(curr);

      const succs = (succsMap.get(curr) ?? []).sort((a, b) => a.localeCompare(b));
      for (const s of succs) {
        const nextDeg = (inDeg.get(s) ?? 0) - 1;
        inDeg.set(s, nextDeg);
        if (nextDeg === 0) {
          q.push(s);
          q.sort((a, b) => a.localeCompare(b));
        }
      }
    }

    const nodeRank = new Map<string, number>();
    for (const id of topo) {
      const preds = predsMap.get(id) ?? [];
      if (preds.length === 0) {
        nodeRank.set(id, 0);
      } else {
        let maxPred = 0;
        for (const p of preds) {
          maxPred = Math.max(maxPred, nodeRank.get(p) ?? 0);
        }
        nodeRank.set(id, maxPred + 1);
      }
    }

    return nodeRank;
  }

  function getAncestors(targetId: string, activeEdges: Set<string>): Set<string> {
    const ancestors = new Set<string>();
    const q = [targetId];
    while (q.length > 0) {
      const curr = q.shift()!;
      for (const edge of graph.edges) {
        if (activeEdges.has(edge.id) && edge.target === curr && !ancestors.has(edge.source)) {
          ancestors.add(edge.source);
          q.push(edge.source);
        }
      }
    }
    return ancestors;
  }

  function getDescendants(sourceId: string, activeEdges: Set<string>): Set<string> {
    const descendants = new Set<string>();
    const q = [sourceId];
    while (q.length > 0) {
      const curr = q.shift()!;
      for (const edge of graph.edges) {
        if (activeEdges.has(edge.id) && edge.source === curr && !descendants.has(edge.target)) {
          descendants.add(edge.target);
          q.push(edge.target);
        }
      }
    }
    return descendants;
  }

  for (const candidate of autoCandidates) {
    const u = candidate.source;
    const v = candidate.target;

    activeForwardSet.delete(candidate.id);

    const tempRanks = computeTempRanks(activeForwardSet);
    const rankU = tempRanks.get(u);
    const rankV = tempRanks.get(v);

    const inDegV = graph.edges.filter(
      (e) => activeForwardSet.has(e.id) && e.target === v
    ).length;

    if (inDegV > 0 && rankU !== undefined && rankV !== undefined && rankU === rankV) {
      const ancestorsU = getAncestors(u, activeForwardSet);
      const ancestorsV = getAncestors(v, activeForwardSet);
      const descendantsU = getDescendants(u, activeForwardSet);
      const descendantsV = getDescendants(v, activeForwardSet);

      let shareAltPred = false;
      for (const p of ancestorsU) {
        if (p !== u && p !== v && ancestorsV.has(p)) {
          shareAltPred = true;
          break;
        }
      }

      let shareAltSucc = false;
      for (const s of descendantsU) {
        if (s !== u && s !== v && descendantsV.has(s)) {
          shareAltSucc = true;
          break;
        }
      }

      if (shareAltPred || shareAltSucc) {
        edgeRoleMap.set(candidate.id, "cross");
        reversedMap.set(candidate.id, false);
        continue;
      }
    }

    activeForwardSet.add(candidate.id);
  }

  // 5. Verify DAG condition using Kahn's algorithm on remaining forward edges
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
