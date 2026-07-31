import { measureBadgeRect } from "./badgeMeasurement";
import type { CustomLayoutConfig } from "./config";
import { compareLayoutScores, validateCustomLayout } from "./layoutValidator";
import type { NodeLayoutResult } from "./nodeLayout";
import { assignPortSidesGlobally } from "./portAssignment";
import { generatePortCandidates, type PortCandidate } from "./portCandidates";
import { distributePorts } from "./portDistribution";
import { RouteOccupancyLedger } from "./routeOccupancy";
import { searchOrthogonalRoute } from "./routeSearch";
import { buildRoutingGrid } from "./routingGrid";
import { routeSelfLoop } from "./specialRoutes";
import type {
  NormalizedEdge,
  NormalizedNode,
  OccupancyRecord,
  Point,
  PortRef,
  RoutedPath,
  Side,
} from "./types";

export interface EdgeRouterResult {
  routes: RoutedPath[];
  status: "success" | "unresolved_soft_conflicts";
  occupancy: OccupancyRecord[];
}

interface EdgeSortMeta {
  edge: NormalizedEdge;
  isFeedback: boolean;
  rankSpan: number;
  regret: number;
  badgeArea: number;
}

function compareEdgeMetas(a: EdgeSortMeta, b: EdgeSortMeta, epsilon: number): number {
  // 1. Feedback constraint (feedback edges first)
  if (a.isFeedback !== b.isFeedback) {
    return a.isFeedback ? -1 : 1;
  }
  // 2. Rank span (larger span first)
  if (Math.abs(b.rankSpan - a.rankSpan) > epsilon) {
    return b.rankSpan - a.rankSpan;
  }
  // 3. Candidate regret (higher regret first)
  if (Math.abs(b.regret - a.regret) > epsilon) {
    return b.regret - a.regret;
  }
  // 4. Badge area (larger badge area first)
  if (Math.abs(b.badgeArea - a.badgeArea) > epsilon) {
    return b.badgeArea - a.badgeArea;
  }
  // 5. Edge ID (alphabetical ascending)
  return a.edge.id.localeCompare(b.edge.id);
}

export function routeAllEdges(
  nodeLayout: NodeLayoutResult,
  config: CustomLayoutConfig
): EdgeRouterResult {
  const { normalizedGraph, classifiedEdges, nodePositions, rankAssignment, boundingBox } = nodeLayout;

  const selfEdges: NormalizedEdge[] = [];
  const nonSelfEdges: NormalizedEdge[] = [];

  for (const edge of classifiedEdges) {
    if (edge.role === "self") {
      selfEdges.push(edge);
    } else {
      nonSelfEdges.push(edge);
    }
  }

  const routesMap = new Map<string, RoutedPath>();

  const nodeMap = new Map<string, NormalizedNode & Point>();
  for (const n of normalizedGraph.nodes) {
    const pos = nodePositions.get(n.id) ?? { x: 0, y: 0 };
    nodeMap.set(n.id, { ...n, x: pos.x, y: pos.y });
  }

  const allNodesList = Array.from(nodeMap.values());

  const ledger = new RouteOccupancyLedger({ epsilon: config.epsilon });

  // 1. Route self loops
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

  // 2. Process non-self edges (forward, cross, and feedback edges in one unified pass)
  if (nonSelfEdges.length > 0) {
    const candidatesMap = new Map<string, PortCandidate[]>();
    const edgeMetaMap = new Map<string, EdgeSortMeta>();

    for (const edge of nonSelfEdges) {
      const srcNode = nodeMap.get(edge.source);
      const tgtNode = nodeMap.get(edge.target);
      if (!srcNode || !tgtNode) continue;

      const classified = classifiedEdges.find((e) => e.id === edge.id);
      const role = classified?.role ?? "forward";
      const isFeedback = role === "feedback" || Boolean(edge.isCycle);

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
      const bestCost = sortedCands[0]?.baseCost ?? 0;
      const secondCost = sortedCands[1]?.baseCost ?? bestCost;
      const regret = secondCost - bestCost;

      const srcRank = rankAssignment.nodeRankMap.get(edge.source) ?? 0;
      const tgtRank = rankAssignment.nodeRankMap.get(edge.target) ?? 0;
      const rankSpan = Math.abs(tgtRank - srcRank);

      const badgeRect = measureBadgeRect(edge.label ?? "", config, edge.isCycle);
      const badgeArea = badgeRect.width * badgeRect.height;

      edgeMetaMap.set(edge.id, {
        edge,
        isFeedback,
        rankSpan,
        regret,
        badgeArea,
      });
    }

    // Unified Side Assignment & Distribution
    const metaMapForAssignment = new Map<string, { isFeedback?: boolean; rankSpan?: number; badgeArea?: number }>();
    for (const [id, meta] of edgeMetaMap.entries()) {
      metaMapForAssignment.set(id, {
        isFeedback: meta.isFeedback,
        rankSpan: meta.rankSpan,
        badgeArea: meta.badgeArea,
      });
    }

    const sideAssignmentResult = assignPortSidesGlobally(
      nonSelfEdges,
      candidatesMap,
      config,
      metaMapForAssignment
    );

    const sideAssignmentsMap = new Map<string, { srcSide: Side; tgtSide: Side }>();
    for (const [eId, cand] of sideAssignmentResult.assignments.entries()) {
      sideAssignmentsMap.set(eId, { srcSide: cand.srcSide, tgtSide: cand.tgtSide });
    }

    const portDistributionResult = distributePorts(
      nonSelfEdges,
      sideAssignmentsMap,
      nodeMap,
      config
    );

    // Collect all ports for grid construction
    const allPortRefs: PortRef[] = [];
    for (const ports of portDistributionResult.portsByEdge.values()) {
      allPortRefs.push(ports.sourcePort);
      allPortRefs.push(ports.targetPort);
    }

    let laneRings = config.initialLaneRings;
    let grid = buildRoutingGrid(allNodesList, allPortRefs, boundingBox, config, laneRings);

    function syncLedgerGrid(g: typeof grid) {
      const xCoords = Array.from(new Set(Array.from(g.vertices.values()).map((p) => p.x)));
      const yCoords = Array.from(new Set(Array.from(g.vertices.values()).map((p) => p.y)));
      ledger.setGridCoordinates(xCoords, yCoords);
    }

    syncLedgerGrid(grid);

    // Sort non-self edges by: feedback constraint, rank span, candidate regret, badge area, then edge ID
    const sortedEdges = [...nonSelfEdges].sort((a, b) => {
      const metaA = edgeMetaMap.get(a.id);
      const metaB = edgeMetaMap.get(b.id);
      if (metaA && metaB) {
        return compareEdgeMetas(metaA, metaB, config.epsilon);
      }
      return a.id.localeCompare(b.id);
    });

    // Initial Routing Pass
    const unroutedEdges = new Set<string>();

    for (const edge of sortedEdges) {
      const ports = portDistributionResult.portsByEdge.get(edge.id);
      if (!ports) continue;

      const occupancy = ledger.toOccupancyRecords();
      let route = searchOrthogonalRoute(
        edge.id,
        ports.sourcePort,
        ports.targetPort,
        grid,
        occupancy,
        config
      );

      if (!route && laneRings < config.maxLaneRings) {
        laneRings = config.maxLaneRings;
        grid = buildRoutingGrid(allNodesList, allPortRefs, boundingBox, config, laneRings);
        syncLedgerGrid(grid);
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
      } else {
        unroutedEdges.add(edge.id);
      }
    }

    // Rip-Up & Reroute Loop
    const seenStateSignatures = new Set<string>();

    function getRoutesSignature(): string {
      return Array.from(routesMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([id, r]) => `${id}:${r.points.map((p) => `${p.x},${p.y}`).join("->")}`)
        .join(";");
    }

    function evaluateCurrentValidation() {
      return validateCustomLayout(
        {
          nodes: allNodesList,
          edges: Array.from(routesMap.values()),
          badges: [],
        },
        config
      );
    }

    let bestValidation = evaluateCurrentValidation();
    let bestRoutesMap = new Map(routesMap);

    for (let pass = 0; pass < config.maxRipUpPasses; pass++) {
      const stateSig = getRoutesSignature();
      if (seenStateSignatures.has(stateSig)) {
        break; // Repeated state stop condition
      }
      seenStateSignatures.add(stateSig);

      // Check current reservations for conflicts
      const reservations = ledger.getReservations();
      const conflicts = ledger.queryConflicts(reservations);

      if (unroutedEdges.size === 0 && conflicts.length === 0 && bestValidation.isValid) {
        break; // Success stop condition
      }

      // Build Conflict Set
      const conflictSet = new Set<string>(unroutedEdges);
      for (const c of conflicts) {
        conflictSet.add(c.edgeIdA);
        conflictSet.add(c.edgeIdB);
      }

      if (conflictSet.size === 0) {
        break;
      }

      // Release ONLY conflict-set routes from ledger and active routes
      for (const eId of conflictSet) {
        ledger.release(eId);
        routesMap.delete(eId);
      }

      // Sort conflict-set edges (hardest edge first)
      const edgesToReroute = nonSelfEdges
        .filter((e) => conflictSet.has(e.id))
        .sort((a, b) => {
          const metaA = edgeMetaMap.get(a.id);
          const metaB = edgeMetaMap.get(b.id);
          if (metaA && metaB) {
            return compareEdgeMetas(metaA, metaB, config.epsilon);
          }
          return a.id.localeCompare(b.id);
        });

      unroutedEdges.clear();

      // Reroute hardest edge first
      for (const edge of edgesToReroute) {
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
          syncLedgerGrid(grid);
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
        } else {
          unroutedEdges.add(edge.id);
        }
      }

      const currValidation = evaluateCurrentValidation();
      const scoreDiff = compareLayoutScores(currValidation, bestValidation);

      if (scoreDiff < 0) {
        bestValidation = currValidation;
        bestRoutesMap = new Map(routesMap);
      } else if (scoreDiff > 0 && pass > 0) {
        // No score improvement stop condition
        break;
      }
    }

    // Restore best routes if rip-up ended with a better historical pass
    if (compareLayoutScores(bestValidation, evaluateCurrentValidation()) < 0) {
      routesMap.clear();
      for (const [id, r] of bestRoutesMap.entries()) {
        routesMap.set(id, r);
      }
    }
  }

  const finalRoutes = Array.from(routesMap.values());
  const finalValidation = validateCustomLayout(
    {
      nodes: allNodesList,
      edges: finalRoutes,
      badges: [],
    },
    config
  );

  const status = finalValidation.isValid ? "success" : "unresolved_soft_conflicts";

  return {
    routes: finalRoutes,
    status,
    occupancy: ledger.toOccupancyRecords(),
  };
}

