import { placeEdgeBadges, type BadgePlacementResult } from "./badgePlacement";
import { resolveCustomLayoutConfig, type CustomLayoutConfig } from "./config";
import { assignCoordinates } from "./coordinateAssignment";
import { routeAllEdges, type EdgeRouterResult } from "./edgeRouter";
import {
  compareLayoutScores,
  validateCustomLayout,
  type ExtendedLayoutDiagnostic,
  type ExtendedLayoutValidationResult,
} from "./layoutValidator";
import { computeNodeLayout, type NodeLayoutResult } from "./nodeLayout";
import { generatePortCandidates, type PortCandidate } from "./portCandidates";
import { distributePorts } from "./portDistribution";
import { RouteOccupancyLedger } from "./routeOccupancy";
import { searchOrthogonalRoute } from "./routeSearch";
import { buildRoutingGrid } from "./routingGrid";
import { routeSelfLoop } from "./specialRoutes";
import type {
  BadgePlacement,
  CustomLayoutResult,
  NormalizedEdge,
  NormalizedNode,
  Point,
  PortRef,
  RoutedPath,
  Side,
  SpacingOverrides,
} from "./types";

export function hashLayoutState(
  nodes: (NormalizedNode & Point)[],
  edges: RoutedPath[],
  badges: BadgePlacement[]
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

function routeEdgesWithOffsets(
  nodeLayout: NodeLayoutResult,
  config: CustomLayoutConfig,
  portCandidateOffsets: Map<string, number>
): EdgeRouterResult {
  if (portCandidateOffsets.size === 0) {
    return routeAllEdges(nodeLayout, config);
  }

  const { normalizedGraph, classifiedEdges, nodePositions, boundingBox } = nodeLayout;
  const selfEdges: NormalizedEdge[] = [];
  const nonSelfEdges: NormalizedEdge[] = [];

  for (const edge of classifiedEdges) {
    if (edge.role === "self") {
      selfEdges.push(edge);
    } else {
      nonSelfEdges.push(edge);
    }
  }

  const nodeMap = new Map<string, NormalizedNode & Point>();
  for (const n of normalizedGraph.nodes) {
    const pos = nodePositions.get(n.id) ?? { x: 0, y: 0 };
    nodeMap.set(n.id, { ...n, x: pos.x, y: pos.y });
  }
  const allNodesList = Array.from(nodeMap.values());

  const candidatesMap = new Map<string, PortCandidate[]>();
  const sideAssignmentsMap = new Map<string, { srcSide: Side; tgtSide: Side }>();

  for (const edge of nonSelfEdges) {
    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);
    if (!srcNode || !tgtNode) continue;

    const classified = classifiedEdges.find((e) => e.id === edge.id);
    const role = classified?.role ?? "forward";

    const cands = generatePortCandidates(
      edge,
      srcNode,
      tgtNode,
      role,
      nodePositions,
      config,
      allNodesList
    );
    candidatesMap.set(edge.id, cands);

    const sortedCands = [...cands].sort((a, b) => a.baseCost - b.baseCost);
    const offset = portCandidateOffsets.get(edge.id) ?? 0;
    const chosenCand = sortedCands[offset % sortedCands.length] ?? sortedCands[0];

    if (chosenCand) {
      sideAssignmentsMap.set(edge.id, { srcSide: chosenCand.srcSide, tgtSide: chosenCand.tgtSide });
    }
  }

  const portDistributionResult = distributePorts(
    nonSelfEdges,
    sideAssignmentsMap,
    nodeMap,
    config
  );

  const allPortRefs: PortRef[] = [];
  for (const ports of portDistributionResult.portsByEdge.values()) {
    allPortRefs.push(ports.sourcePort);
    allPortRefs.push(ports.targetPort);
  }

  const ledger = new RouteOccupancyLedger({ epsilon: config.epsilon });
  const routesMap = new Map<string, RoutedPath>();

  const selfLoopCounts = new Map<string, number>();
  for (const edge of selfEdges) {
    const node = nodeMap.get(edge.source);
    if (!node) continue;
    const idx = selfLoopCounts.get(node.id) ?? 0;
    selfLoopCounts.set(node.id, idx + 1);

    const r = routeSelfLoop(edge, node, config, idx);
    routesMap.set(edge.id, r);
    ledger.commitRoute(r.edgeId, r.points);
  }

  let laneRings = config.initialLaneRings;
  let grid = buildRoutingGrid(allNodesList, allPortRefs, boundingBox, config, laneRings);

  const xCoords = Array.from(new Set(Array.from(grid.vertices.values()).map((p) => p.x)));
  const yCoords = Array.from(new Set(Array.from(grid.vertices.values()).map((p) => p.y)));
  ledger.setGridCoordinates(xCoords, yCoords);

  for (const edge of nonSelfEdges) {
    const ports = portDistributionResult.portsByEdge.get(edge.id);
    if (!ports) continue;

    let route = searchOrthogonalRoute(
      edge.id,
      ports.sourcePort,
      ports.targetPort,
      grid,
      ledger.toOccupancyRecords(),
      config
    );

    if (!route && laneRings < config.maxLaneRings) {
      laneRings = config.maxLaneRings;
      grid = buildRoutingGrid(allNodesList, allPortRefs, boundingBox, config, laneRings);
      const xC = Array.from(new Set(Array.from(grid.vertices.values()).map((p) => p.x)));
      const yC = Array.from(new Set(Array.from(grid.vertices.values()).map((p) => p.y)));
      ledger.setGridCoordinates(xC, yC);

      route = searchOrthogonalRoute(
        edge.id,
        ports.sourcePort,
        ports.targetPort,
        grid,
        ledger.toOccupancyRecords(),
        config
      );
    }

    if (route) {
      routesMap.set(edge.id, route);
      ledger.commitRoute(edge.id, route.points, ports.sourcePort, ports.targetPort);
    }
  }

  const finalRoutes = Array.from(routesMap.values());
  const finalValidation = validateCustomLayout(
    { nodes: allNodesList, edges: finalRoutes, badges: [] },
    config
  );

  return {
    routes: finalRoutes,
    status: finalValidation.isValid ? "success" : "unresolved_soft_conflicts",
    occupancy: ledger.toOccupancyRecords(),
  };
}

function hasSpacingOrPortProgress(
  curr: ExtendedLayoutValidationResult,
  prev: ExtendedLayoutValidationResult
): boolean {
  const currErrors = curr.diagnostics.filter((d) => d.severity === "error").length;
  const prevErrors = prev.diagnostics.filter((d) => d.severity === "error").length;
  return currErrors < prevErrors;
}

export function optimizeLayout(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  configPartial?: Partial<CustomLayoutConfig>
): CustomLayoutResult {
  const config = resolveCustomLayoutConfig(configPartial);
  const initialNodeLayout = computeNodeLayout(nodes, edges, config);

  const spacingOverrides: SpacingOverrides = {
    rankGaps: {},
    nodeGaps: {},
  };
  let currentGraphPadding = config.graphPadding;

  const portCandidateOffsets = new Map<string, number>();
  const seenStateHashes = new Set<string>();

  let bestResult: CustomLayoutResult | null = null;
  let previousValidation: ExtendedLayoutValidationResult | null = null;

  for (let pass = 0; pass < config.maxGlobalPasses; pass++) {
    const currentConfig: CustomLayoutConfig = {
      ...config,
      graphPadding: currentGraphPadding,
    };

    const coordResult = assignCoordinates(
      initialNodeLayout.normalizedGraph,
      initialNodeLayout.layerGraph,
      initialNodeLayout.orderedLayers,
      currentConfig,
      spacingOverrides
    );

    const currentNodeLayout: NodeLayoutResult = {
      ...initialNodeLayout,
      nodePositions: coordResult.nodePositions,
      rankBandMap: coordResult.rankBandMap,
      boundingBox: coordResult.boundingBox,
    };

    const positionedNodes: (NormalizedNode & Point)[] = currentNodeLayout.normalizedGraph.nodes.map((n) => {
      const pos = currentNodeLayout.nodePositions.get(n.id) ?? { x: 0, y: 0 };
      return {
        ...n,
        x: pos.x,
        y: pos.y,
      };
    });

    const routerResult: EdgeRouterResult = routeEdgesWithOffsets(
      currentNodeLayout,
      currentConfig,
      portCandidateOffsets
    );
    const currentRoutes = [...routerResult.routes];

    let badgeResult: BadgePlacementResult = placeEdgeBadges(
      currentRoutes,
      currentNodeLayout,
      currentConfig
    );

    const tempFullVal = validateCustomLayout(
      {
        nodes: positionedNodes,
        edges: currentRoutes,
        badges: badgeResult.placements,
      },
      currentConfig
    );

    const badgeHardErrorCount = tempFullVal.diagnostics.filter(
      (d) =>
        d.severity === "error" &&
        (d.code.startsWith("BADGE_") || d.code === "LEADER_COLLISION")
    ).length;

    if (
      (badgeResult.unresolvedEdgeIds && badgeResult.unresolvedEdgeIds.length > 0) ||
      badgeHardErrorCount > 0
    ) {
      const retryConfig: CustomLayoutConfig = {
        ...currentConfig,
        maxBadgeBacktrackSteps: currentConfig.maxBadgeBacktrackSteps * 4,
        maxBadgeCandidatesPerEdge: currentConfig.maxBadgeCandidatesPerEdge * 2,
      };
      const retryBadgeResult = placeEdgeBadges(currentRoutes, currentNodeLayout, retryConfig);

      const retryFullVal = validateCustomLayout(
        {
          nodes: positionedNodes,
          edges: currentRoutes,
          badges: retryBadgeResult.placements,
        },
        retryConfig
      );

      if (compareLayoutScores(retryFullVal, tempFullVal) < 0) {
        badgeResult = retryBadgeResult;
      }
    }

    const rawValidation = validateCustomLayout(
      {
        nodes: positionedNodes,
        edges: currentRoutes,
        badges: badgeResult.placements,
      },
      currentConfig
    );

    const diagnostics: ExtendedLayoutDiagnostic[] = [...rawValidation.diagnostics];
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

    const currentResult: CustomLayoutResult = {
      nodes: positionedNodes,
      edges: currentRoutes,
      badges: badgeResult.placements,
      crossings: fullValidation.crossings,
      validation: fullValidation,
      status,
    };

    if (bestResult === null || compareLayoutScores(fullValidation, bestResult.validation) < 0) {
      bestResult = currentResult;
    }

    if (isFullyValid) {
      return bestResult;
    }

    const stateHash = hashLayoutState(positionedNodes, currentRoutes, badgeResult.placements);
    if (seenStateHashes.has(stateHash)) {
      return bestResult;
    }
    seenStateHashes.add(stateHash);

    if (pass > 0 && previousValidation !== null) {
      const scoreDiff = compareLayoutScores(fullValidation, previousValidation);
      if (scoreDiff > 0 && !hasSpacingOrPortProgress(fullValidation, previousValidation)) {
        return bestResult;
      }
    }
    previousValidation = fullValidation;

    const routeConflicts = new Set<string>();
    const badgeConflicts = new Set<string>();

    for (const diag of fullValidation.diagnostics) {
      if (diag.severity !== "error") continue;
      if (
        diag.code === "EDGE_NODE_PENETRATION" ||
        diag.code === "SHARED_EDGE_SEGMENT" ||
        diag.code === "ENDPOINT_OFF_BOUNDARY" ||
        diag.code === "WRONG_DEPARTURE_DIRECTION" ||
        diag.code === "WRONG_ENTRY_DIRECTION" ||
        diag.code === "ZERO_LENGTH_ARROW_SEGMENT" ||
        diag.code === "MISSING_ROUTE"
      ) {
        for (const id of diag.ids) {
          if (edges.some((e) => e.id === id)) {
            routeConflicts.add(id);
          }
        }
      } else if (
        diag.code === "BADGE_NODE_OVERLAP" ||
        diag.code === "BADGE_BADGE_OVERLAP" ||
        diag.code === "BADGE_UNRELATED_EDGE_OVERLAP" ||
        diag.code === "LEADER_COLLISION" ||
        diag.code === "UNRESOLVED_BADGE"
      ) {
        for (const id of diag.ids) {
          if (edges.some((e) => e.id === id)) {
            badgeConflicts.add(id);
          }
        }
      }
    }

    const allConflicts = new Set<string>([...routeConflicts, ...badgeConflicts]);
    if (allConflicts.size === 0) {
      return bestResult;
    }

    for (const edgeId of routeConflicts) {
      const currentOffset = portCandidateOffsets.get(edgeId) ?? 0;
      portCandidateOffsets.set(edgeId, currentOffset + 1);
    }

    for (const edgeId of badgeConflicts) {
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) continue;

      const srcRank = initialNodeLayout.rankAssignment.nodeRankMap.get(edge.source);
      const tgtRank = initialNodeLayout.rankAssignment.nodeRankMap.get(edge.target);

      if (srcRank !== undefined && tgtRank !== undefined && srcRank !== tgtRank) {
        const minRank = Math.min(srcRank, tgtRank);
        const currentRankGap = spacingOverrides.rankGaps?.[minRank] ?? config.rankGap;
        spacingOverrides.rankGaps = {
          ...spacingOverrides.rankGaps,
          [minRank]: currentRankGap + 40,
        };
      } else if (srcRank !== undefined && tgtRank !== undefined && srcRank === tgtRank) {
        const currentSrcGap = spacingOverrides.nodeGaps?.[edge.source] ?? config.nodeGap;
        const currentTgtGap = spacingOverrides.nodeGaps?.[edge.target] ?? config.nodeGap;
        spacingOverrides.nodeGaps = {
          ...spacingOverrides.nodeGaps,
          [edge.source]: currentSrcGap + 30,
          [edge.target]: currentTgtGap + 30,
        };
      } else {
        currentGraphPadding += 30;
      }
    }
  }

  return (
    bestResult ?? {
      nodes: initialNodeLayout.normalizedGraph.nodes.map((n) => {
        const pos = initialNodeLayout.nodePositions.get(n.id) ?? { x: 0, y: 0 };
        return { ...n, x: pos.x, y: pos.y };
      }),
      edges: [],
      badges: [],
      crossings: [],
      validation: validateCustomLayout({ nodes: [], edges: [], badges: [] }, config),
      status: "invalid_hard_failure",
    }
  );
}
