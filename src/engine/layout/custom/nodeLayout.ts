import { resolveCustomLayoutConfig, type CustomLayoutConfig } from "./config";
import { assignCoordinates, type RankBand } from "./coordinateAssignment";
import { minimizeCrossings } from "./crossingMinimization";
import { classifyEdgeRoles } from "./cycleBreaking";
import { buildLayerGraph, type ExpandedLayerGraph } from "./layerGraph";
import { normalizeGraph, type NormalizedGraphResult } from "./normalizeGraph";
import { assignRanks, type RankAssignmentResult } from "./rankAssignment";
import { detectStronglyConnectedComponents, type DetailedSCCResult } from "./stronglyConnectedComponents";
import type { ClassifiedEdge, LayerNode, NormalizedEdge, NormalizedNode, Point, Rect } from "./types";

export interface NodeLayoutResult {
  normalizedGraph: NormalizedGraphResult;
  sccResult: DetailedSCCResult;
  classifiedEdges: ClassifiedEdge[];
  rankAssignment: RankAssignmentResult;
  layerGraph: ExpandedLayerGraph;
  orderedLayers: LayerNode[][];
  nodePositions: Map<string, Point>;
  rankBandMap: Map<number, RankBand>;
  boundingBox: Rect;
}

export function computeNodeLayout(
  inputNodes: NormalizedNode[],
  inputEdges: NormalizedEdge[],
  userConfig?: Partial<CustomLayoutConfig>
): NodeLayoutResult {
  const config = resolveCustomLayoutConfig(userConfig);

  const normalizedGraph = normalizeGraph(inputNodes, inputEdges);
  const sccResult = detectStronglyConnectedComponents(normalizedGraph);
  const cycleBreaking = classifyEdgeRoles(normalizedGraph, sccResult);
  const rankAssignment = assignRanks(normalizedGraph, cycleBreaking);
  const layerGraph = buildLayerGraph(normalizedGraph, cycleBreaking, rankAssignment);
  const minimized = minimizeCrossings(layerGraph, config.maxCrossingSweeps);
  const coordResult = assignCoordinates(normalizedGraph, layerGraph, minimized.orderedLayers, config);

  return {
    normalizedGraph,
    sccResult,
    classifiedEdges: cycleBreaking.classifiedEdges,
    rankAssignment,
    layerGraph,
    orderedLayers: minimized.orderedLayers,
    nodePositions: coordResult.nodePositions,
    rankBandMap: coordResult.rankBandMap,
    boundingBox: coordResult.boundingBox,
  };
}
