import type { CustomLayoutConfig } from "./config";
import { simplifyOrthogonalPath } from "./geometry";
import { searchOrthogonalRoute } from "./routeSearch";
import { buildRoutingGrid } from "./routingGrid";
import type { NormalizedEdge, NormalizedNode, OccupancyRecord, Point, PortRef, Rect, RoutedPath } from "./types";

export function routeSelfLoop(
  edge: NormalizedEdge,
  node: NormalizedNode & Point,
  config: CustomLayoutConfig,
  loopIndex = 0
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

export function routeFeedbackCorridors(
  feedbackEdges: NormalizedEdge[],
  nodeMap: Map<string, NormalizedNode & Point>,
  boundingBox: Rect,
  config: CustomLayoutConfig,
  initialOccupancy: OccupancyRecord[] = []
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

    const primaryLeft = idx % 2 === 0;

    const sidesToTry: boolean[] = [primaryLeft, !primaryLeft];

    let foundRoute: RoutedPath | null = null;

    for (const useLeftCorridor of sidesToTry) {
      if (foundRoute) break;

      const sourcePort: PortRef = useLeftCorridor
        ? {
            nodeId: srcNode.id,
            side: "left",
            index: idx,
            point: { x: srcNode.x, y: srcNode.y + srcNode.height / 2 },
            stub: { x: srcNode.x - config.portStubLength, y: srcNode.y + srcNode.height / 2 },
          }
        : {
            nodeId: srcNode.id,
            side: "right",
            index: idx,
            point: { x: srcNode.x + srcNode.width, y: srcNode.y + srcNode.height / 2 },
            stub: { x: srcNode.x + srcNode.width + config.portStubLength, y: srcNode.y + srcNode.height / 2 },
          };

      const targetPort: PortRef = useLeftCorridor
        ? {
            nodeId: tgtNode.id,
            side: "left",
            index: idx,
            point: { x: tgtNode.x, y: tgtNode.y + tgtNode.height / 2 },
            stub: { x: tgtNode.x - config.portStubLength, y: tgtNode.y + tgtNode.height / 2 },
          }
        : {
            nodeId: tgtNode.id,
            side: "right",
            index: idx,
            point: { x: tgtNode.x + tgtNode.width, y: tgtNode.y + tgtNode.height / 2 },
            stub: { x: tgtNode.x + tgtNode.width + config.portStubLength, y: tgtNode.y + tgtNode.height / 2 },
          };

      for (let r = 1; r <= config.maxLaneRings; r++) {
        const corridorX = useLeftCorridor
          ? minNodeX - config.obstacleClearance - r * config.laneSpacing
          : maxNodeX + config.obstacleClearance + r * config.laneSpacing;

        const grid = buildRoutingGrid(allNodes, [sourcePort, targetPort], boundingBox, config, r);

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
          }
        );

        if (route) {
          foundRoute = route;
          break;
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

