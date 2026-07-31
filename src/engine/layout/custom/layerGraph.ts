import type { CycleBreakingResult } from "./cycleBreaking";
import type { RankAssignmentResult } from "./rankAssignment";
import type { LayerNode, NormalizedGraph } from "./types";

export interface ExpandedLayerGraph {
  layers: LayerNode[][];
  realNodes: LayerNode[];
  virtualNodes: LayerNode[];
  itemMap: Map<string, LayerNode>;
  predecessorsMap: Map<string, string[]>;
  successorsMap: Map<string, string[]>;
}

export function buildLayerGraph(
  graph: NormalizedGraph,
  cycleBreaking: CycleBreakingResult,
  rankAssignment: RankAssignmentResult
): ExpandedLayerGraph {
  const itemMap = new Map<string, LayerNode>();
  const realNodes: LayerNode[] = [];
  const virtualNodes: LayerNode[] = [];

  const layers: LayerNode[][] = [];
  for (let r = 0; r <= rankAssignment.maxRank; r++) {
    layers.push([]);
  }

  // 1. Create real LayerNodes
  for (const node of graph.nodes) {
    const rank = rankAssignment.nodeRankMap.get(node.id) ?? 0;
    const item: LayerNode = {
      id: node.id,
      isVirtual: false,
      originalNodeId: node.id,
      rank,
      width: node.width,
      height: node.height,
    };
    itemMap.set(node.id, item);
    realNodes.push(item);
    layers[rank].push(item);
  }

  const predecessorsMap = new Map<string, string[]>();
  const successorsMap = new Map<string, string[]>();

  function addEdge(u: string, v: string) {
    if (!successorsMap.has(u)) successorsMap.set(u, []);
    if (!predecessorsMap.has(v)) predecessorsMap.set(v, []);
    successorsMap.get(u)?.push(v);
    predecessorsMap.get(v)?.push(u);
  }

  // 2. Process forward edges to expand long edges with virtual nodes
  for (const edge of graph.edges) {
    const role = cycleBreaking.edgeRoleMap.get(edge.id);
    if (role !== "forward") continue;

    const srcRank = rankAssignment.nodeRankMap.get(edge.source) ?? 0;
    const tgtRank = rankAssignment.nodeRankMap.get(edge.target) ?? 0;
    const span = tgtRank - srcRank;

    if (span <= 1) {
      addEdge(edge.source, edge.target);
    } else {
      let prevId = edge.source;
      for (let r = srcRank + 1; r < tgtRank; r++) {
        const vId = `virtual__${edge.id}__rank_${r}`;
        if (!itemMap.has(vId)) {
          const vItem: LayerNode = {
            id: vId,
            isVirtual: true,
            sourceEdgeId: edge.id,
            rank: r,
            width: 0,
            height: 0,
          };
          itemMap.set(vId, vItem);
          virtualNodes.push(vItem);
          layers[r].push(vItem);
        }
        addEdge(prevId, vId);
        prevId = vId;
      }
      addEdge(prevId, edge.target);
    }
  }

  // Sort items in each layer deterministically by ID initially
  for (const layer of layers) {
    layer.sort((a, b) => a.id.localeCompare(b.id));
  }

  return {
    layers,
    realNodes,
    virtualNodes,
    itemMap,
    predecessorsMap,
    successorsMap,
  };
}
