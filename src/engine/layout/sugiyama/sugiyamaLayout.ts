import { decycleGraph } from "./decycle";
import { assignRanksAndDummyNodes } from "./ranking";
import { reduceCrossings } from "./crossingReduction";
import { assignCoordinates } from "./coordinateAssignment";
import type { SugiyamaEdge, SugiyamaNode, SugiyamaOptions, SugiyamaResult } from "./types";

/**
 * 4-Phase Hierarchical Sugiyama DAG Layout Engine.
 */
export function computeSugiyamaLayout(
  nodes: SugiyamaNode[],
  edges: SugiyamaEdge[],
  options: SugiyamaOptions = {},
): SugiyamaResult {
  if (nodes.length === 0) {
    return {
      nodes: [],
      edges: [],
      ranks: [],
      crossings: 0,
      width: 0,
      height: 0,
    };
  }

  // Phase 1: Decycle
  const decycle = decycleGraph(nodes, edges);

  // Phase 2: Layer / Rank Assignment & Dummy Insertion
  const ranking = assignRanksAndDummyNodes(nodes, decycle.edges);

  // Phase 3: Crossing Reduction
  const reduced = reduceCrossings(ranking.ranks, ranking.segmentEdges, options.maxSweeps ?? 16);

  // Phase 4: Coordinate Assignment
  const layout = assignCoordinates(reduced.ranks, ranking.segmentEdges, decycle.edges, options);

  // Restore original edge directions
  const finalEdges = decycle.restore(layout.edges);

  return {
    nodes: layout.nodes,
    edges: finalEdges,
    ranks: reduced.ranks,
    crossings: reduced.crossings,
    width: layout.width,
    height: layout.height,
  };
}
