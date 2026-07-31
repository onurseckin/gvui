import type { CustomLayoutConfig } from "./config";
import { pathManhattanLength, segmentIntersectsRectInterior, simplifyOrthogonalPath } from "./geometry";
import { searchOrthogonalRoute } from "./routeSearch";
import { buildRoutingGrid } from "./routingGrid";
import type {
  NormalizedEdge,
  NormalizedNode,
  OccupancyRecord,
  Point,
  PortRef,
  Rect,
  RoutedPath,
  Side,
} from "./types";

export function routeSelfLoop(
  edge: NormalizedEdge,
  node: NormalizedNode & Point,
  config: CustomLayoutConfig,
  loopIndex = 0,
): RoutedPath {
  const loopOffset = config.portStubLength + loopIndex * config.laneSpacing;

  const sourcePort: PortRef = {
    nodeId: node.id,
    side: "top",
    index: loopIndex,
    point: { x: node.x + node.width * 0.75, y: node.y },
    stub: { x: node.x + node.width * 0.75, y: node.y - loopOffset },
  };

  const targetPort: PortRef = {
    nodeId: node.id,
    side: "right",
    index: loopIndex,
    point: { x: node.x + node.width, y: node.y + node.height * 0.25 },
    stub: { x: node.x + node.width + loopOffset, y: node.y + node.height * 0.25 },
  };

  const cornerPoint: Point = {
    x: targetPort.stub.x,
    y: sourcePort.stub.y,
  };

  const rawPoints: Point[] = [
    sourcePort.point,
    sourcePort.stub,
    cornerPoint,
    targetPort.stub,
    targetPort.point,
  ];

  const points = simplifyOrthogonalPath(rawPoints, config.epsilon);

  return {
    edgeId: edge.id,
    points,
    sourcePort,
    targetPort,
  };
}

function getPortRef(
  node: NormalizedNode & Point,
  side: Side,
  index: number,
  config: CustomLayoutConfig,
): PortRef {
  let point: Point;
  let stub: Point;
  switch (side) {
    case "top":
      point = { x: node.x + node.width / 2, y: node.y };
      stub = { x: point.x, y: point.y - config.portStubLength };
      break;
    case "bottom":
      point = { x: node.x + node.width / 2, y: node.y + node.height };
      stub = { x: point.x, y: point.y + config.portStubLength };
      break;
    case "left":
      point = { x: node.x, y: node.y + node.height / 2 };
      stub = { x: point.x - config.portStubLength, y: point.y };
      break;
    case "right":
      point = { x: node.x + node.width, y: node.y + node.height / 2 };
      stub = { x: point.x + config.portStubLength, y: point.y };
      break;
  }
  return {
    nodeId: node.id,
    side,
    index,
    point,
    stub,
  };
}

export function routeFeedbackCorridors(
  feedbackEdges: NormalizedEdge[],
  nodeMap: Map<string, NormalizedNode & Point>,
  boundingBox: Rect,
  config: CustomLayoutConfig,
  initialOccupancy: OccupancyRecord[] = [],
): RoutedPath[] {
  const sortedEdges = [...feedbackEdges].sort((a, b) => {
    const srcA = nodeMap.get(a.source);
    const srcB = nodeMap.get(b.source);
    const yA = srcA ? srcA.y : 0;
    const yB = srcB ? srcB.y : 0;
    if (Math.abs(yB - yA) > config.epsilon) return yB - yA;
    return a.id.localeCompare(b.id);
  });

  const routes: RoutedPath[] = [];
  const currentOccupancy: OccupancyRecord[] = [...initialOccupancy];

  const allNodes = Array.from(nodeMap.values());
  if (allNodes.length === 0) return routes;

  const minNodeX = Math.min(...allNodes.map((n) => n.x));
  const maxNodeX = Math.max(...allNodes.map((n) => n.x + n.width));

  sortedEdges.forEach((edge, idx) => {
    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);
    if (!srcNode || !tgtNode) return;

    let foundRoute: RoutedPath | null = null;

    // 1. Try short direct routes first
    const sidePairs: [Side, Side][] = [
      ["top", "bottom"],
      ["left", "left"],
      ["right", "right"],
      ["top", "left"],
      ["top", "right"],
      ["left", "bottom"],
      ["right", "bottom"],
      ["bottom", "top"],
    ];

    let bestShortRoute: RoutedPath | null = null;
    let minShortLength = Infinity;

    for (const [srcSide, tgtSide] of sidePairs) {
      const sourcePort = getPortRef(srcNode, srcSide, idx, config);
      const targetPort = getPortRef(tgtNode, tgtSide, idx, config);

      for (let r = 1; r <= config.initialLaneRings; r++) {
        const grid = buildRoutingGrid(allNodes, [sourcePort, targetPort], boundingBox, config, r);
        const route = searchOrthogonalRoute(
          edge.id,
          sourcePort,
          targetPort,
          grid,
          currentOccupancy,
          config,
          { role: "feedback" },
        );

        if (route) {
          // Check node penetration
          let penetrates = false;
          for (let i = 0; i < route.points.length - 1; i++) {
            const seg = { a: route.points[i], b: route.points[i + 1] };
            for (const n of allNodes) {
              const rect: Rect = { x: n.x, y: n.y, width: n.width, height: n.height };
              if (segmentIntersectsRectInterior(seg, rect, config.epsilon)) {
                penetrates = true;
                break;
              }
            }
            if (penetrates) break;
          }

          if (!penetrates) {
            const len = pathManhattanLength(route.points);
            if (len < minShortLength) {
              minShortLength = len;
              bestShortRoute = route;
            }
          }
        }
      }
    }

    if (bestShortRoute) {
      foundRoute = bestShortRoute;
    }

    // 2. If no valid short route, try outer corridor detours
    if (!foundRoute) {
      const primaryLeft = idx % 2 === 0;
      const sidesToTry: boolean[] = [primaryLeft, !primaryLeft];

      for (const useLeftCorridor of sidesToTry) {
        if (foundRoute) break;

        const sourcePort = getPortRef(srcNode, useLeftCorridor ? "left" : "right", idx, config);
        const targetPort = getPortRef(tgtNode, useLeftCorridor ? "left" : "right", idx, config);

        for (let r = 1; r <= config.maxLaneRings; r++) {
          const corridorX = useLeftCorridor
            ? minNodeX - config.obstacleClearance - r * config.laneSpacing
            : maxNodeX + config.obstacleClearance + r * config.laneSpacing;

          const grid = buildRoutingGrid(
            allNodes,
            [sourcePort, targetPort],
            boundingBox,
            config,
            r,
          );

          const route = searchOrthogonalRoute(
            edge.id,
            sourcePort,
            targetPort,
            grid,
            currentOccupancy,
            config,
            {
              role: "feedback",
              requiredCorridorX: corridorX,
            },
          );

          if (route) {
            foundRoute = route;
            break;
          }
        }
      }
    }

    if (foundRoute) {
      routes.push(foundRoute);
      for (let i = 0; i < foundRoute.points.length - 1; i++) {
        currentOccupancy.push({
          edgeId: edge.id,
          segment: { a: foundRoute.points[i], b: foundRoute.points[i + 1] },
        });
      }
    }
  });

  return routes;
}
