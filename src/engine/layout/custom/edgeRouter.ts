import type { CustomLayoutConfig } from "./config";
import type { NodeLayoutResult } from "./nodeLayout";
import { assignPortSidesGlobally } from "./portAssignment";
import { generatePortCandidates, type PortCandidate } from "./portCandidates";
import { distributePorts } from "./portDistribution";
import { searchOrthogonalRoute } from "./routeSearch";
import { buildRoutingGrid } from "./routingGrid";
import { routeFeedbackCorridors, routeSelfLoop } from "./specialRoutes";
import type { NormalizedEdge, NormalizedNode, OccupancyRecord, Point, PortRef, RoutedPath, Side } from "./types";

export interface EdgeRouterResult {
  routes: RoutedPath[];
  status: "success" | "unresolved_soft_conflicts";
  occupancy: OccupancyRecord[];
}

export function routeAllEdges(
  nodeLayout: NodeLayoutResult,
  config: CustomLayoutConfig
): EdgeRouterResult {
  const { normalizedGraph, classifiedEdges, nodePositions, boundingBox } = nodeLayout;

  const selfEdges: NormalizedEdge[] = [];
  const feedbackEdges: NormalizedEdge[] = [];
  const normalEdges: NormalizedEdge[] = [];

  for (const edge of classifiedEdges) {
    if (edge.role === "self") {
      selfEdges.push(edge);
    } else if (edge.role === "feedback") {
      feedbackEdges.push(edge);
    } else {
      normalEdges.push(edge);
    }
  }

  const routes: RoutedPath[] = [];
  const occupancy: OccupancyRecord[] = [];

  const nodeMap = new Map<string, NormalizedNode & Point>();
  for (const n of normalizedGraph.nodes) {
    const pos = nodePositions.get(n.id) ?? { x: 0, y: 0 };
    nodeMap.set(n.id, { ...n, x: pos.x, y: pos.y });
  }

  // 1. Route self loops
  const selfLoopCounts = new Map<string, number>();
  for (const edge of selfEdges) {
    const node = nodeMap.get(edge.source);
    if (!node) continue;
    const idx = selfLoopCounts.get(node.id) ?? 0;
    selfLoopCounts.set(node.id, idx + 1);

    const r = routeSelfLoop(edge, node, config, idx);
    routes.push(r);

    for (let i = 0; i < r.points.length - 1; i++) {
      occupancy.push({ edgeId: edge.id, segment: { a: r.points[i], b: r.points[i + 1] } });
    }
  }

  // 2. Route feedback corridors
  const fbRoutes = routeFeedbackCorridors(feedbackEdges, nodeMap, boundingBox, config);
  for (const r of fbRoutes) {
    routes.push(r);
    for (let i = 0; i < r.points.length - 1; i++) {
      occupancy.push({ edgeId: r.edgeId, segment: { a: r.points[i], b: r.points[i + 1] } });
    }
  }

  // 3. Route normal forward/cross edges
  if (normalEdges.length > 0) {
    // Generate candidates & side assignments
    const candidatesMap = new Map<string, PortCandidate[]>();
    for (const edge of normalEdges) {
      const srcNode = nodeMap.get(edge.source);
      const tgtNode = nodeMap.get(edge.target);
      if (!srcNode || !tgtNode) continue;
      const role = classifiedEdges.find((e) => e.id === edge.id)?.role ?? "forward";

      candidatesMap.set(edge.id, generatePortCandidates(edge, srcNode, tgtNode, role, nodePositions, config));
    }

    const sideAssignmentResult = assignPortSidesGlobally(normalEdges, candidatesMap, config);

    const sideAssignmentsMap = new Map<string, { srcSide: Side; tgtSide: Side }>();
    for (const [eId, cand] of sideAssignmentResult.assignments.entries()) {
      sideAssignmentsMap.set(eId, { srcSide: cand.srcSide, tgtSide: cand.tgtSide });
    }

    const portDistributionResult = distributePorts(normalEdges, sideAssignmentsMap, nodeMap, config);

    // Collect all ports for routing grid construction
    const allPortRefs: PortRef[] = [];
    for (const ports of portDistributionResult.portsByEdge.values()) {
      allPortRefs.push(ports.sourcePort);
      allPortRefs.push(ports.targetPort);
    }

    let laneRings = config.initialLaneRings;
    let grid = buildRoutingGrid(Array.from(nodeMap.values()), allPortRefs, boundingBox, config, laneRings);

    let failedToRoute = false;

    for (const edge of normalEdges) {
      const ports = portDistributionResult.portsByEdge.get(edge.id);
      if (!ports) continue;

      let route = searchOrthogonalRoute(edge.id, ports.sourcePort, ports.targetPort, grid, occupancy, config);

      if (!route && laneRings < config.maxLaneRings) {
        laneRings++;
        grid = buildRoutingGrid(Array.from(nodeMap.values()), allPortRefs, boundingBox, config, laneRings);
        route = searchOrthogonalRoute(edge.id, ports.sourcePort, ports.targetPort, grid, occupancy, config);
      }

      if (route) {
        routes.push(route);
        for (let i = 0; i < route.points.length - 1; i++) {
          occupancy.push({ edgeId: edge.id, segment: { a: route.points[i], b: route.points[i + 1] } });
        }
      } else {
        failedToRoute = true;
      }
    }

    return {
      routes,
      status: failedToRoute ? "unresolved_soft_conflicts" : "success",
      occupancy,
    };
  }

  return {
    routes,
    status: "success",
    occupancy,
  };
}
