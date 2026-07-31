import { measureBadgeRect } from "./badgeMeasurement";
import type { CustomLayoutConfig } from "./config";
import {
  compareLayoutScores,
  type ExtendedLayoutValidationResult,
  validateCustomLayout,
} from "./layoutValidator";
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
  PortSideAssignment,
  RoutedPath,
  Side,
} from "./types";

export interface EdgeRouterResult {
  routes: RoutedPath[];
  status: "success" | "unresolved_soft_conflicts";
  occupancy: OccupancyRecord[];
}

export interface EdgeRouterOptions {
  sideAssignments?: Map<string, PortSideAssignment>;
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

export function generatePermutations<T>(items: T[], maxPermutations = 32): T[][] {
  const results: T[][] = [];

  function permute(arr: T[], memo: T[] = []) {
    if (results.length >= maxPermutations) return;
    if (arr.length === 0) {
      results.push(memo);
      return;
    }
    for (let i = 0; i < arr.length; i++) {
      const curr = arr.slice();
      const next = curr.splice(i, 1);
      permute(curr, memo.concat(next));
    }
  }

  permute(items);
  return results;
}

export function routeAllEdges(
  nodeLayout: NodeLayoutResult,
  config: CustomLayoutConfig,
  options?: EdgeRouterOptions,
): EdgeRouterResult {
  const { normalizedGraph, classifiedEdges, nodePositions, rankAssignment, boundingBox } =
    nodeLayout;

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

  // Candidates and Metadata computation for non-self edges
  const candidatesMap = new Map<string, PortCandidate[]>();
  const edgeMetaMap = new Map<string, EdgeSortMeta>();

  if (nonSelfEdges.length > 0) {
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
        allNodesList,
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
  }

  // Side Assignment & Distribution
  const sideAssignmentsMap = new Map<string, { srcSide: Side; tgtSide: Side }>();

  if (options?.sideAssignments) {
    for (const [eId, assignment] of options.sideAssignments.entries()) {
      sideAssignmentsMap.set(eId, { srcSide: assignment.srcSide, tgtSide: assignment.tgtSide });
    }
  }

  const unassignedEdges = nonSelfEdges.filter((e) => !sideAssignmentsMap.has(e.id));
  if (unassignedEdges.length > 0) {
    const metaMapForAssignment = new Map<
      string,
      { isFeedback?: boolean; rankSpan?: number; badgeArea?: number }
    >();
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
      metaMapForAssignment,
    );

    for (const [eId, cand] of sideAssignmentResult.assignments.entries()) {
      if (!sideAssignmentsMap.has(eId)) {
        sideAssignmentsMap.set(eId, { srcSide: cand.srcSide, tgtSide: cand.tgtSide });
      }
    }
  }

  const portDistributionResult = distributePorts(
    nonSelfEdges,
    sideAssignmentsMap,
    nodeMap,
    config,
  );

  // Collect all ports for grid construction
  const allPortRefs: PortRef[] = [];
  for (const ports of portDistributionResult.portsByEdge.values()) {
    allPortRefs.push(ports.sourcePort);
    allPortRefs.push(ports.targetPort);
  }

  // Build Order Variants
  const hardestFirst = [...nonSelfEdges].sort((a, b) => {
    const metaA = edgeMetaMap.get(a.id);
    const metaB = edgeMetaMap.get(b.id);
    if (metaA && metaB) {
      return compareEdgeMetas(metaA, metaB, config.epsilon);
    }
    return a.id.localeCompare(b.id);
  });

  const reverseHardestFirst = [...hardestFirst].reverse();

  const badgeAreaDesc = [...nonSelfEdges].sort((a, b) => {
    const metaA = edgeMetaMap.get(a.id);
    const metaB = edgeMetaMap.get(b.id);
    if (metaA && metaB) {
      if (Math.abs(metaB.badgeArea - metaA.badgeArea) > config.epsilon) {
        return metaB.badgeArea - metaA.badgeArea;
      }
      if (Math.abs(metaB.rankSpan - metaA.rankSpan) > config.epsilon) {
        return metaB.rankSpan - metaA.rankSpan;
      }
    }
    return a.id.localeCompare(b.id);
  });

  const sourceNodeIdAndPortIndex = [...nonSelfEdges].sort((a, b) => {
    const portsA = portDistributionResult.portsByEdge.get(a.id);
    const portsB = portDistributionResult.portsByEdge.get(b.id);
    const srcA = a.source;
    const srcB = b.source;
    if (srcA !== srcB) return srcA.localeCompare(srcB);

    const idxA = portsA?.sourcePort.index ?? 0;
    const idxB = portsB?.sourcePort.index ?? 0;
    if (idxA !== idxB) return idxA - idxB;

    const tgtA = a.target;
    const tgtB = b.target;
    if (tgtA !== tgtB) return tgtA.localeCompare(tgtB);

    return a.id.localeCompare(b.id);
  });

  const rankSpanAscending = [...nonSelfEdges].sort((a, b) => {
    const metaA = edgeMetaMap.get(a.id);
    const metaB = edgeMetaMap.get(b.id);
    if (metaA && metaB) {
      if (Math.abs(metaA.rankSpan - metaB.rankSpan) > config.epsilon) {
        return metaA.rankSpan - metaB.rankSpan;
      }
    }
    return a.id.localeCompare(b.id);
  });

  const edgeIdAscending = [...nonSelfEdges].sort((a, b) => a.id.localeCompare(b.id));

  const orderCandidates = [
    hardestFirst,
    reverseHardestFirst,
    badgeAreaDesc,
    sourceNodeIdAndPortIndex,
    rankSpanAscending,
    edgeIdAscending,
  ];

  const orderVariants: NormalizedEdge[][] = [];
  const seenSignatures = new Set<string>();

  for (const cand of orderCandidates) {
    const sig = cand.map((e) => e.id).join(",");
    if (!seenSignatures.has(sig)) {
      seenSignatures.add(sig);
      orderVariants.push(cand);
      if (orderVariants.length >= config.maxRouteOrderVariants) {
        break;
      }
    }
  }

  // Execute Routing for each Order Variant and pick the best result
  let globalBestRoutesMap = new Map<string, RoutedPath>();
  let globalBestValidation: ExtendedLayoutValidationResult | null = null;
  let globalBestOccupancy: OccupancyRecord[] = [];

  for (const variantEdges of orderVariants) {
    const ledger = new RouteOccupancyLedger({ epsilon: config.epsilon });
    const routesMap = new Map<string, RoutedPath>();

    // Route self loops
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

    const laneRings = config.initialLaneRings;
    const grid = buildRoutingGrid(allNodesList, allPortRefs, boundingBox, config, laneRings);

    function syncLedgerGrid(g: typeof grid) {
      const xCoords = Array.from(new Set(Array.from(g.vertices.values()).map((p) => p.x)));
      const yCoords = Array.from(new Set(Array.from(g.vertices.values()).map((p) => p.y)));
      ledger.setGridCoordinates(xCoords, yCoords);
    }

    syncLedgerGrid(grid);

    // Initial Routing Pass for this variant
    const unroutedEdges = new Set<string>();

    for (const edge of variantEdges) {
      const ports = portDistributionResult.portsByEdge.get(edge.id);
      if (!ports) continue;

      const meta = edgeMetaMap.get(edge.id);
      const isFeedback = meta?.isFeedback ?? Boolean(edge.isCycle);

      const route = searchOrthogonalRoute(
        edge.id,
        ports.sourcePort,
        ports.targetPort,
        grid,
        ledger.toOccupancyRecords(),
        config,
        { role: isFeedback ? "feedback" : undefined },
      );

      if (route) {
        routesMap.set(edge.id, route);
        ledger.commitRoute(edge.id, route.points, ports.sourcePort, ports.targetPort);
      } else {
        unroutedEdges.add(edge.id);
      }
    }

    // Rip-Up & Conflict-Directed Reroute Loop (including perpendicular crossings)
    function evaluateCurrentValidation() {
      return validateCustomLayout(
        {
          nodes: allNodesList,
          edges: Array.from(routesMap.values()),
          badges: [],
          classifiedEdges,
        },
        config,
      );
    }

    let currValidation = evaluateCurrentValidation();
    let variantBestValidation = currValidation;
    let variantBestRoutesMap = new Map(routesMap);
    let variantBestOccupancy = ledger.toOccupancyRecords();

    const seenStateSignatures = new Set<string>();
    const seenConflictSignatures = new Set<string>();

    function getRoutesSignature(): string {
      return Array.from(routesMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([id, r]) => `${id}:${r.points.map((p) => `${p.x},${p.y}`).join("->")}`)
        .join(";");
    }

    let noImprovementCount = 0;
    const maxPasses = config.maxRipUpPasses;

    for (let pass = 0; pass < maxPasses; pass++) {
      const stateSig = getRoutesSignature();
      if (seenStateSignatures.has(stateSig)) {
        break;
      }
      seenStateSignatures.add(stateSig);

      const reservations = ledger.getReservations();
      const conflicts = ledger.queryConflicts(reservations);
      const crossings = currValidation.crossings;

      if (
        unroutedEdges.size === 0 &&
        conflicts.length === 0 &&
        crossings.length === 0 &&
        currValidation.isValid
      ) {
        break; // Zero conflicts & zero crossings
      }

      // Build Conflict Set (unrouted + hard ledger conflicts + perpendicular crossings)
      const conflictSet = new Set<string>(unroutedEdges);
      for (const c of conflicts) {
        conflictSet.add(c.edgeIdA);
        conflictSet.add(c.edgeIdB);
      }
      for (const cross of crossings) {
        conflictSet.add(cross.edgeIdA);
        conflictSet.add(cross.edgeIdB);
      }

      if (conflictSet.size === 0) {
        break;
      }

      const conflictSig = Array.from(conflictSet).sort().join(",");
      if (seenConflictSignatures.has(conflictSig)) {
        break; // Repeated conflict set stop condition
      }
      seenConflictSignatures.add(conflictSig);

      const conflictEdgeList = nonSelfEdges.filter((e) => conflictSet.has(e.id));

      if (
        conflictEdgeList.length > 1 &&
        conflictEdgeList.length <= config.maxConflictPermutationSize
      ) {
        // Conflict-directed permutation search over small conflict component
        const perms = generatePermutations(conflictEdgeList, config.maxConflictPermutations);
        let bestPermRoutes: Map<string, RoutedPath> | null = null;
        let bestPermValidation: ExtendedLayoutValidationResult | null = null;
        let bestPermLedgerOcc: OccupancyRecord[] | null = null;

        for (const perm of perms) {
          // Clone ledger & routes for trial permutation
          const trialLedger = new RouteOccupancyLedger({ epsilon: config.epsilon });
          const trialRoutesMap = new Map(routesMap);

          for (const eId of conflictSet) {
            trialRoutesMap.delete(eId);
          }

          // Re-commit non-conflict routes into trial ledger
          for (const [eId, r] of trialRoutesMap.entries()) {
            const ports = portDistributionResult.portsByEdge.get(eId);
            trialLedger.commitRoute(eId, r.points, ports?.sourcePort, ports?.targetPort);
          }

          for (const edge of perm) {
            const ports = portDistributionResult.portsByEdge.get(edge.id);
            if (!ports) continue;
            const meta = edgeMetaMap.get(edge.id);
            const isFeedback = meta?.isFeedback ?? Boolean(edge.isCycle);

            const route = searchOrthogonalRoute(
              edge.id,
              ports.sourcePort,
              ports.targetPort,
              grid,
              trialLedger.toOccupancyRecords(),
              config,
              { role: isFeedback ? "feedback" : undefined },
            );

            if (route) {
              trialRoutesMap.set(edge.id, route);
              trialLedger.commitRoute(edge.id, route.points, ports.sourcePort, ports.targetPort);
            }
          }

          const trialVal = validateCustomLayout(
            {
              nodes: allNodesList,
              edges: Array.from(trialRoutesMap.values()),
              badges: [],
              classifiedEdges,
            },
            config,
          );

          if (!bestPermValidation || compareLayoutScores(trialVal, bestPermValidation) < 0) {
            bestPermValidation = trialVal;
            bestPermRoutes = trialRoutesMap;
            bestPermLedgerOcc = trialLedger.toOccupancyRecords();
          }

          if (trialVal.isValid && trialVal.crossings.length === 0) {
            break; // Stop perm search early if clean zero crossings achieved
          }
        }

        if (bestPermRoutes && bestPermValidation && bestPermLedgerOcc) {
          routesMap.clear();
          for (const [k, v] of bestPermRoutes.entries()) {
            routesMap.set(k, v);
          }
          ledger.release(Array.from(conflictSet).join(","));
          for (const [eId, r] of routesMap.entries()) {
            const ports = portDistributionResult.portsByEdge.get(eId);
            ledger.commitRoute(eId, r.points, ports?.sourcePort, ports?.targetPort);
          }
          currValidation = bestPermValidation;
        }
      } else {
        // Fallback: standard greedy rip-up by hardest-first metadata order
        for (const eId of conflictSet) {
          ledger.release(eId);
          routesMap.delete(eId);
        }

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

        for (const edge of edgesToReroute) {
          const ports = portDistributionResult.portsByEdge.get(edge.id);
          if (!ports) continue;

          const meta = edgeMetaMap.get(edge.id);
          const isFeedback = meta?.isFeedback ?? Boolean(edge.isCycle);

          const route = searchOrthogonalRoute(
            edge.id,
            ports.sourcePort,
            ports.targetPort,
            grid,
            ledger.toOccupancyRecords(),
            config,
            { role: isFeedback ? "feedback" : undefined },
          );

          if (route) {
            routesMap.set(edge.id, route);
            ledger.commitRoute(edge.id, route.points, ports.sourcePort, ports.targetPort);
          } else {
            unroutedEdges.add(edge.id);
          }
        }
        currValidation = evaluateCurrentValidation();
      }

      const scoreDiff = compareLayoutScores(currValidation, variantBestValidation);

      if (scoreDiff < 0) {
        variantBestValidation = currValidation;
        variantBestRoutesMap = new Map(routesMap);
        variantBestOccupancy = ledger.toOccupancyRecords();
        noImprovementCount = 0;
      } else {
        noImprovementCount++;
        if (noImprovementCount >= 2 && pass > 0) {
          break; // Stop rip-up loop if no score improvement for 2 consecutive passes
        }
      }
    }

    if (!globalBestValidation || compareLayoutScores(variantBestValidation, globalBestValidation) < 0) {
      globalBestValidation = variantBestValidation;
      globalBestRoutesMap = new Map(variantBestRoutesMap);
      globalBestOccupancy = variantBestOccupancy;
    }

    if (
      globalBestValidation.isValid &&
      globalBestValidation.metrics.edgeNodePenetrations === 0 &&
      globalBestValidation.metrics.sharedEdgeSegmentLength === 0 &&
      globalBestValidation.metrics.crossingCount === 0
    ) {
      break; // Valid layout with zero hard errors and zero crossings achieved
    }
  }

  const finalRoutes = Array.from(globalBestRoutesMap.values());
  const status =
    globalBestValidation && globalBestValidation.isValid
      ? "success"
      : "unresolved_soft_conflicts";

  return {
    routes: finalRoutes,
    status,
    occupancy: globalBestOccupancy,
  };
}
