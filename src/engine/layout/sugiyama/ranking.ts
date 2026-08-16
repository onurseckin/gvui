import type { SugiyamaEdge, SugiyamaNode } from "./types";

export interface RankingResult {
  ranks: SugiyamaNode[][];
  allNodes: SugiyamaNode[];
  segmentEdges: SugiyamaEdge[];
  dummyNodes: SugiyamaNode[];
}

/**
 * Phase 2: Assign nodes to discrete integer ranks and insert dummy/virtual nodes for long edges.
 */
export function assignRanksAndDummyNodes(
  nodes: SugiyamaNode[],
  edges: SugiyamaEdge[],
): RankingResult {
  const nodeMap = new Map<string, SugiyamaNode>(nodes.map((n) => [n.id, { ...n }]));
  const incoming = new Map<string, SugiyamaEdge[]>();
  const outgoing = new Map<string, SugiyamaEdge[]>();

  for (const n of nodes) {
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
  }

  for (const e of edges) {
    if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
      outgoing.get(e.source)?.push(e);
      incoming.get(e.target)?.push(e);
    }
  }

  // 1. Compute in-degrees and topological order (Kahn's algorithm)
  const inDegree = new Map<string, number>();
  for (const n of nodes) {
    inDegree.set(n.id, incoming.get(n.id)?.length ?? 0);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    topoOrder.push(curr);
    for (const edge of outgoing.get(curr) || []) {
      const nextDeg = (inDegree.get(edge.target) ?? 1) - 1;
      inDegree.set(edge.target, nextDeg);
      if (nextDeg === 0) {
        queue.push(edge.target);
      }
    }
  }

  // If there are unvisited nodes (e.g. disconnected cycle fragments), add remaining nodes
  for (const n of nodes) {
    if (!topoOrder.includes(n.id)) {
      topoOrder.push(n.id);
    }
  }

  // 2. Assign Longest-Path ranks
  const ranksMap = new Map<string, number>();

  for (const nodeId of topoOrder) {
    const node = nodeMap.get(nodeId);
    let maxParentRank = -1;

    for (const inEdge of incoming.get(nodeId) || []) {
      const parentRank = ranksMap.get(inEdge.source) ?? 0;
      const minLen = inEdge.minLen ?? 1;
      if (parentRank + minLen > maxParentRank) {
        maxParentRank = parentRank + minLen;
      }
    }

    const calculatedRank = maxParentRank === -1 ? 0 : maxParentRank;
    const explicitRank = node?.rank;
    const finalRank =
      explicitRank !== undefined ? Math.max(explicitRank, calculatedRank) : calculatedRank;
    ranksMap.set(nodeId, finalRank);
  }

  // Normalize ranks to start at 0
  let minRank = Infinity;
  for (const r of ranksMap.values()) {
    if (r < minRank) minRank = r;
  }
  if (minRank === Infinity) minRank = 0;

  for (const [id, r] of ranksMap.entries()) {
    const normalized = r - minRank;
    ranksMap.set(id, normalized);
    const n = nodeMap.get(id);
    if (n) n.rank = normalized;
  }

  // 3. Insert dummy nodes for edges spanning multiple ranks
  const allNodes: SugiyamaNode[] = Array.from(nodeMap.values());
  const dummyNodes: SugiyamaNode[] = [];
  const segmentEdges: SugiyamaEdge[] = [];
  let dummyCounter = 0;

  for (const edge of edges) {
    const srcRank = ranksMap.get(edge.source) ?? 0;
    const tgtRank = ranksMap.get(edge.target) ?? 0;
    const span = tgtRank - srcRank;

    if (span <= 1) {
      segmentEdges.push({ ...edge });
    } else {
      // Create dummy chain
      let prevId = edge.source;
      for (let r = srcRank + 1; r < tgtRank; r++) {
        const dummyId = `__dummy_${edge.id}_${r}_${dummyCounter++}`;
        const dummyNode: SugiyamaNode = {
          id: dummyId,
          width: 0,
          height: 0,
          rank: r,
          isVirtual: true,
          originalEdgeId: edge.id,
          originalSource: edge.source,
          originalTarget: edge.target,
        };
        allNodes.push(dummyNode);
        dummyNodes.push(dummyNode);

        segmentEdges.push({
          id: `seg_${prevId}_${dummyId}`,
          source: prevId,
          target: dummyId,
          weight: (edge.weight ?? 1) * 2, // higher weight to straighten dummy edges
          isReversed: edge.isReversed,
          isCycle: edge.isCycle,
        });
        prevId = dummyId;
      }

      segmentEdges.push({
        id: `seg_${prevId}_${edge.target}`,
        source: prevId,
        target: edge.target,
        weight: (edge.weight ?? 1) * 2,
        isReversed: edge.isReversed,
        isCycle: edge.isCycle,
      });
    }
  }

  // Group nodes by rank
  let maxRank = 0;
  for (const n of allNodes) {
    if ((n.rank ?? 0) > maxRank) maxRank = n.rank ?? 0;
  }

  const ranks: SugiyamaNode[][] = Array.from({ length: maxRank + 1 }, () => []);
  for (const n of allNodes) {
    const r = n.rank ?? 0;
    ranks[r]?.push(n);
  }

  return {
    ranks,
    allNodes,
    segmentEdges,
    dummyNodes,
  };
}
