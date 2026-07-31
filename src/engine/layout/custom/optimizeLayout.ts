import { placeEdgeBadges, type BadgePlacementResult } from "./badgePlacement";
import { measureBadgeRects } from "./badgeMeasurement";
import { resolveCustomLayoutConfig, type CustomLayoutConfig } from "./config";
import { assignCoordinates } from "./coordinateAssignment";
import { routeAllEdges, type EdgeRouterResult } from "./edgeRouter";
import { simplifyOrthogonalPath } from "./geometry";
import {
  buildLayoutScore,
  compareLayoutScore,
  countPathHairpins,
} from "./layoutObjective";
import {
  validateCustomLayout,
  type ExtendedLayoutDiagnostic,
  type ExtendedLayoutValidationResult,
} from "./layoutValidator";
import { computeNodeLayout, type NodeLayoutResult } from "./nodeLayout";
import { enumeratePortAlternatives } from "./portAssignment";
import { generatePortCandidates, type PortCandidate } from "./portCandidates";
import {
  computeBadgeSpacingDemands,
  resolveEffectiveSpacingOverrides,
} from "./spacingDemand";
import type {
  BadgePlacement,
  ClassifiedEdge,
  CustomLayoutResult,
  LayoutScore,
  NormalizedEdge,
  NormalizedNode,
  OptimizationStats,
  Point,
  PortSideAssignment,
  RoutedPath,
  SpacingOverrides,
} from "./types";

export function hashLayoutState(
  nodes: (NormalizedNode & Point)[],
  edges: RoutedPath[],
  badges: BadgePlacement[],
): string {
  const sortedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const nodeStr = sortedNodes.map((n) => `${n.id}:${n.x.toFixed(2)},${n.y.toFixed(2)}`).join("|");

  const sortedEdges = [...edges].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
  const edgeStr = sortedEdges
    .map((e) => {
      const pts = e.points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(",");
      const sp = e.sourcePort
        ? `${e.sourcePort.side}:${e.sourcePort.index}:${e.sourcePort.point.x.toFixed(2)},${e.sourcePort.point.y.toFixed(2)}`
        : "";
      const tp = e.targetPort
        ? `${e.targetPort.side}:${e.targetPort.index}:${e.targetPort.point.x.toFixed(2)},${e.targetPort.point.y.toFixed(2)}`
        : "";
      return `${e.edgeId}:${sp}:${tp}:${pts}`;
    })
    .join("|");

  const sortedBadges = [...badges].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
  const badgeStr = sortedBadges
    .map((b) => {
      const lpts = b.leaderPoints
        ? b.leaderPoints.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(",")
        : "";
      return `${b.edgeId}:${b.rect.x.toFixed(2)},${b.rect.y.toFixed(2)},${b.rect.width.toFixed(2)},${b.rect.height.toFixed(2)}:${b.anchorPoint.x.toFixed(2)},${b.anchorPoint.y.toFixed(2)}:${lpts}`;
    })
    .join("|");

  return `N[${nodeStr}]E[${edgeStr}]B[${badgeStr}]`;
}

interface EvaluatedState {
  result: CustomLayoutResult;
  validation: ExtendedLayoutValidationResult;
  score: LayoutScore;
  stateHash: string;
  sideAssignments: Map<string, PortSideAssignment>;
}

function roundNodePositions(positions: Map<string, Point>): Map<string, Point> {
  const res = new Map<string, Point>();
  for (const [id, pos] of positions.entries()) {
    res.set(id, {
      x: Math.round(pos.x * 1000) / 1000,
      y: Math.round(pos.y * 1000) / 1000,
    });
  }
  return res;
}

function findDefectEdgeIds(
  routes: RoutedPath[],
  badges: BadgePlacement[],
  validation: ExtendedLayoutValidationResult,
  classifiedEdges: ClassifiedEdge[],
): string[] {
  const defectSet = new Set<string>();

  // 1. Perpendicular crossings
  for (const cross of validation.crossings) {
    defectSet.add(cross.edgeIdA);
    defectSet.add(cross.edgeIdB);
  }

  // 2. Ordinary leaders
  for (const b of badges) {
    if (b.leaderPoints && b.leaderPoints.length >= 2) {
      const classified = classifiedEdges.find((e) => e.id === b.edgeId);
      const role = classified?.role ?? "forward";
      if (role !== "feedback" && role !== "self") {
        defectSet.add(b.edgeId);
      }
    }
  }

  // 3. Hairpins
  for (const r of routes) {
    if (countPathHairpins(r.points) > 0) {
      defectSet.add(r.edgeId);
    }
  }

  // 4. High bend count (> 2 bends)
  for (const r of routes) {
    const bends = Math.max(0, simplifyOrthogonalPath(r.points).length - 2);
    if (bends > 2) {
      defectSet.add(r.edgeId);
    }
  }

  // 5. Diagnostic hard errors
  for (const diag of validation.diagnostics) {
    if (diag.severity === "error") {
      for (const id of diag.ids) {
        defectSet.add(id);
      }
    }
  }

  return Array.from(defectSet).sort();
}

function evaluateLayoutState(
  nodeLayout: NodeLayoutResult,
  config: CustomLayoutConfig,
  sideAssignments?: Map<string, PortSideAssignment>,
): EvaluatedState {
  const totalEdges = nodeLayout.classifiedEdges.length;

  const roundedPositions = roundNodePositions(nodeLayout.nodePositions);
  const roundedNodeLayout: NodeLayoutResult = {
    ...nodeLayout,
    nodePositions: roundedPositions,
  };

  const nodeMap = new Map<string, NormalizedNode & Point>();
  for (const n of roundedNodeLayout.normalizedGraph.nodes) {
    const pos = roundedNodeLayout.nodePositions.get(n.id) ?? { x: 0, y: 0 };
    nodeMap.set(n.id, { ...n, x: pos.x, y: pos.y });
  }
  const positionedNodes = Array.from(nodeMap.values());

  let routerResult: EdgeRouterResult = routeAllEdges(roundedNodeLayout, config, {
    sideAssignments,
  });

  if (routerResult.routes.length < totalEdges && config.initialLaneRings < config.maxLaneRings) {
    const expandedConfig: CustomLayoutConfig = {
      ...config,
      initialLaneRings: config.maxLaneRings,
    };
    const retryResult = routeAllEdges(roundedNodeLayout, expandedConfig, {
      sideAssignments,
    });
    if (retryResult.routes.length > routerResult.routes.length) {
      routerResult = retryResult;
    }
  }

  const currentRoutes = [...routerResult.routes];

  let badgeResult: BadgePlacementResult = placeEdgeBadges(
    currentRoutes,
    roundedNodeLayout,
    config,
  );

  const rawValidation = validateCustomLayout(
    {
      nodes: positionedNodes,
      edges: currentRoutes,
      badges: badgeResult.placements,
      classifiedEdges: roundedNodeLayout.classifiedEdges,
    },
    config,
  );

  const diagnostics: ExtendedLayoutDiagnostic[] = [...rawValidation.diagnostics];

  for (const edge of roundedNodeLayout.classifiedEdges) {
    if (!currentRoutes.some((r) => r.edgeId === edge.id)) {
      diagnostics.push({
        code: "MISSING_ROUTE",
        severity: "error",
        message: `Edge ${edge.id} could not be routed`,
        ids: [edge.id],
      });
    }
  }

  if (badgeResult.unresolvedEdgeIds && badgeResult.unresolvedEdgeIds.length > 0) {
    for (const id of badgeResult.unresolvedEdgeIds) {
      diagnostics.push({
        code: "UNRESOLVED_BADGE",
        severity: "error",
        message: `Badge for edge ${id} could not be legally placed`,
        ids: [id],
      });
    }
  }

  const isFullyValid = diagnostics.filter((d) => d.severity === "error").length === 0;

  const fullValidation: ExtendedLayoutValidationResult = {
    ...rawValidation,
    isValid: isFullyValid,
    diagnostics,
  };

  const status = isFullyValid
    ? routerResult.status === "success"
      ? "success"
      : "unresolved_soft_conflicts"
    : "invalid_hard_failure";

  const stateHash = hashLayoutState(positionedNodes, currentRoutes, badgeResult.placements);
  const score = buildLayoutScore(
    {
      nodes: positionedNodes,
      edges: currentRoutes,
      badges: badgeResult.placements,
      classifiedEdges: roundedNodeLayout.classifiedEdges,
    },
    fullValidation,
    roundedNodeLayout.classifiedEdges,
    stateHash,
  );

  const currentAssignments = new Map<string, PortSideAssignment>();
  for (const r of currentRoutes) {
    currentAssignments.set(r.edgeId, {
      srcSide: r.sourcePort.side,
      tgtSide: r.targetPort.side,
    });
  }

  return {
    result: {
      nodes: positionedNodes,
      edges: currentRoutes,
      badges: badgeResult.placements,
      crossings: fullValidation.crossings,
      validation: fullValidation,
      status,
    },
    validation: fullValidation,
    score,
    stateHash,
    sideAssignments: currentAssignments,
  };
}

export function optimizeLayout(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  configPartial?: Partial<CustomLayoutConfig>,
): CustomLayoutResult {
  const config = resolveCustomLayoutConfig(configPartial);

  const badgeMeasurements = measureBadgeRects(edges, config);
  const rawNodeLayout = computeNodeLayout(nodes, edges, config);

  const nodeRankMap = rawNodeLayout.rankAssignment.nodeRankMap;
  const spacingRequests = computeBadgeSpacingDemands(
    nodes,
    edges,
    badgeMeasurements,
    nodeRankMap,
    config,
  );
  let effectiveOverrides = resolveEffectiveSpacingOverrides(
    spacingRequests,
    config.nodeGap,
    config.rankGap,
  );

  let spacingOverrides: SpacingOverrides = {
    rankGaps: {},
    nodeGaps: {},
    ...effectiveOverrides,
  };
  let currentGraphPadding = config.graphPadding;

  let coordResult = assignCoordinates(
    rawNodeLayout.normalizedGraph,
    rawNodeLayout.layerGraph,
    rawNodeLayout.orderedLayers,
    config,
    spacingOverrides,
  );

  let currentNodeLayout: NodeLayoutResult = {
    ...rawNodeLayout,
    nodePositions: roundNodePositions(coordResult.nodePositions),
    rankBandMap: coordResult.rankBandMap,
    boundingBox: coordResult.boundingBox,
  };

  let bestEval = evaluateLayoutState(currentNodeLayout, config);
  let explicitPortOverrides = new Map<string, PortSideAssignment>();

  const maxPasses = Math.min(config.maxAestheticPasses, config.maxGlobalPasses);

  if (maxPasses <= 1) {
    return {
      ...bestEval.result,
      optimizationStats: {
        globalPasses: 1,
        evaluatedPortStates: 0,
        spacingExpansions: 0,
        repeatedStateStop: false,
      },
    };
  }

  const seenStateHashes = new Set<string>();
  seenStateHashes.add(bestEval.stateHash);

  let globalPasses = 0;
  let evaluatedPortStates = 0;
  let spacingExpansions = 0;
  let repeatedStateStop = false;

  const getRankGap = (r: number): number => {
    let val1: number | undefined;
    if (spacingOverrides.rankGapAfterRank instanceof Map) {
      val1 = spacingOverrides.rankGapAfterRank.get(r);
    }
    let val2 = spacingOverrides.rankGaps?.[r];
    return Math.max(config.rankGap, val1 ?? 0, val2 ?? 0);
  };

  const getNodeGap = (nodeId: string): number => {
    let val1: number | undefined;
    if (spacingOverrides.nodeGapAfterNodeId instanceof Map) {
      val1 = spacingOverrides.nodeGapAfterNodeId.get(nodeId);
    }
    let val2 = spacingOverrides.nodeGaps?.[nodeId];
    return Math.max(config.nodeGap, val1 ?? 0, val2 ?? 0);
  };

  for (let pass = 0; pass < maxPasses; pass++) {
    globalPasses++;

    if (
      bestEval.score.hardErrorCount === 0 &&
      bestEval.score.crossingCount === 0 &&
      bestEval.score.ordinaryLeaderCount === 0 &&
      bestEval.score.hairpinCount === 0
    ) {
      break;
    }

    const currentConfig: CustomLayoutConfig = {
      ...config,
      graphPadding: currentGraphPadding,
      maxLaneRings: Math.min(24, config.maxLaneRings + pass * 4),
    };

    const defectEdgeIds = findDefectEdgeIds(
      bestEval.result.edges,
      bestEval.result.badges,
      bestEval.validation,
      currentNodeLayout.classifiedEdges,
    );

    if (defectEdgeIds.length === 0 && bestEval.score.hardErrorCount === 0) {
      break;
    }

    const nodeMap = new Map<string, NormalizedNode & Point>();
    for (const n of currentNodeLayout.normalizedGraph.nodes) {
      const pos = currentNodeLayout.nodePositions.get(n.id) ?? { x: 0, y: 0 };
      nodeMap.set(n.id, { ...n, x: pos.x, y: pos.y });
    }
    const allNodesList = Array.from(nodeMap.values());

    const candidatesMap = new Map<string, PortCandidate[]>();
    for (const eId of defectEdgeIds) {
      const edge = edges.find((e) => e.id === eId);
      if (!edge || edge.source === edge.target) continue;

      const srcNode = nodeMap.get(edge.source);
      const tgtNode = nodeMap.get(edge.target);
      if (!srcNode || !tgtNode) continue;

      const classified = currentNodeLayout.classifiedEdges.find((e) => e.id === edge.id);
      const role = classified?.role ?? "forward";

      const cands = generatePortCandidates(
        edge,
        srcNode,
        tgtNode,
        role,
        currentNodeLayout.nodePositions,
        currentConfig,
        allNodesList,
      );
      candidatesMap.set(edge.id, cands);
    }

    const altPortStates: { eId: string; assignmentMap: Map<string, PortSideAssignment> }[] = [];
    for (const eId of defectEdgeIds) {
      const cands = candidatesMap.get(eId);
      if (!cands || cands.length === 0) continue;

      const currentAss = explicitPortOverrides.get(eId) ?? {
        srcSide: cands[0].srcSide,
        tgtSide: cands[0].tgtSide,
      };

      const alts = enumeratePortAlternatives(
        eId,
        currentAss,
        cands,
        currentConfig.maxPortAlternativesPerEdge,
      );

      for (const alt of alts) {
        const candidateMap = new Map<string, PortSideAssignment>(explicitPortOverrides);
        candidateMap.set(eId, alt);

        altPortStates.push({ eId, assignmentMap: candidateMap });
        if (altPortStates.length >= currentConfig.maxPortStatesPerPass) {
          break;
        }
      }
      if (altPortStates.length >= currentConfig.maxPortStatesPerPass) {
        break;
      }
    }

    let portImproved = false;
    for (const { eId, assignmentMap } of altPortStates) {
      evaluatedPortStates++;
      const candidateEval = evaluateLayoutState(currentNodeLayout, currentConfig, assignmentMap);

      if (seenStateHashes.has(candidateEval.stateHash)) {
        continue;
      }

      if (compareLayoutScore(candidateEval.score, bestEval.score) < 0) {
        bestEval = candidateEval;
        const newAlt = assignmentMap.get(eId);
        if (newAlt) {
          explicitPortOverrides.set(eId, newAlt);
        }
        seenStateHashes.add(candidateEval.stateHash);
        portImproved = true;
        break;
      }
    }

    if (!portImproved) {
      if (pass >= maxPasses - 1) {
        break;
      }

      spacingExpansions++;

      for (const eId of defectEdgeIds) {
        const edge = edges.find((e) => e.id === eId);
        if (!edge) continue;

        const srcRank = rawNodeLayout.rankAssignment.nodeRankMap.get(edge.source);
        const tgtRank = rawNodeLayout.rankAssignment.nodeRankMap.get(edge.target);

        if (srcRank !== undefined && tgtRank !== undefined && srcRank !== tgtRank) {
          const minRank = Math.min(srcRank, tgtRank);
          const curr = getRankGap(minRank);
          if (!(spacingOverrides.rankGapAfterRank instanceof Map)) {
            spacingOverrides.rankGapAfterRank = new Map();
          }
          (spacingOverrides.rankGapAfterRank as Map<number, number>).set(minRank, curr + 40);
        } else if (srcRank !== undefined && tgtRank !== undefined && srcRank === tgtRank) {
          const currSrc = getNodeGap(edge.source);
          const currTgt = getNodeGap(edge.target);
          if (!(spacingOverrides.nodeGapAfterNodeId instanceof Map)) {
            spacingOverrides.nodeGapAfterNodeId = new Map();
          }
          (spacingOverrides.nodeGapAfterNodeId as Map<string, number>).set(edge.source, currSrc + 30);
          (spacingOverrides.nodeGapAfterNodeId as Map<string, number>).set(edge.target, currTgt + 30);
        } else {
          currentGraphPadding += 30;
        }
      }

      const expandedConfig: CustomLayoutConfig = {
        ...currentConfig,
        graphPadding: currentGraphPadding,
      };

      coordResult = assignCoordinates(
        rawNodeLayout.normalizedGraph,
        rawNodeLayout.layerGraph,
        rawNodeLayout.orderedLayers,
        expandedConfig,
        spacingOverrides,
      );

      currentNodeLayout = {
        ...rawNodeLayout,
        nodePositions: roundNodePositions(coordResult.nodePositions),
        rankBandMap: coordResult.rankBandMap,
        boundingBox: coordResult.boundingBox,
      };

      const spacingEval = evaluateLayoutState(
        currentNodeLayout,
        expandedConfig,
        explicitPortOverrides,
      );

      if (seenStateHashes.has(spacingEval.stateHash)) {
        repeatedStateStop = true;
        break;
      }

      seenStateHashes.add(spacingEval.stateHash);

      if (compareLayoutScore(spacingEval.score, bestEval.score) < 0) {
        bestEval = spacingEval;
      } else {
        break;
      }
    }
  }

  const finalStats: OptimizationStats = {
    globalPasses,
    evaluatedPortStates,
    spacingExpansions,
    repeatedStateStop,
  };

  return {
    ...bestEval.result,
    optimizationStats: finalStats,
  };
}
