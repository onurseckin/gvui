import type { CustomLayoutConfig } from "./config";
import { simplifyOrthogonalPath } from "./geometry";
import type { NormalizedEdge, NormalizedNode, Point, PortRef, Rect, RoutedPath } from "./types";

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
  _boundingBox: Rect,
  config: CustomLayoutConfig
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

  sortedEdges.forEach((edge, idx) => {
    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);
    if (!srcNode || !tgtNode) return;

    const useLeftCorridor = idx % 2 === 0;
    const laneOffset = config.obstacleClearance + Math.floor(idx / 2 + 1) * config.laneSpacing;

    if (useLeftCorridor) {
      const corridorX = Math.min(srcNode.x, tgtNode.x) - laneOffset;

      const sourcePort: PortRef = {
        nodeId: srcNode.id,
        side: "left",
        index: idx,
        point: { x: srcNode.x, y: srcNode.y + srcNode.height / 2 },
        stub: { x: srcNode.x - config.portStubLength, y: srcNode.y + srcNode.height / 2 },
      };

      const targetPort: PortRef = {
        nodeId: tgtNode.id,
        side: "left",
        index: idx,
        point: { x: tgtNode.x, y: tgtNode.y + tgtNode.height / 2 },
        stub: { x: tgtNode.x - config.portStubLength, y: tgtNode.y + tgtNode.height / 2 },
      };

      const rawPoints: Point[] = [
        sourcePort.point,
        sourcePort.stub,
        { x: corridorX, y: sourcePort.stub.y },
        { x: corridorX, y: targetPort.stub.y },
        targetPort.stub,
        targetPort.point,
      ];

      routes.push({
        edgeId: edge.id,
        points: simplifyOrthogonalPath(rawPoints, config.epsilon),
        sourcePort,
        targetPort,
      });
    } else {
      const corridorX = Math.max(srcNode.x + srcNode.width, tgtNode.x + tgtNode.width) + laneOffset;

      const sourcePort: PortRef = {
        nodeId: srcNode.id,
        side: "right",
        index: idx,
        point: { x: srcNode.x + srcNode.width, y: srcNode.y + srcNode.height / 2 },
        stub: { x: srcNode.x + srcNode.width + config.portStubLength, y: srcNode.y + srcNode.height / 2 },
      };

      const targetPort: PortRef = {
        nodeId: tgtNode.id,
        side: "right",
        index: idx,
        point: { x: tgtNode.x + tgtNode.width, y: tgtNode.y + tgtNode.height / 2 },
        stub: { x: tgtNode.x + tgtNode.width + config.portStubLength, y: tgtNode.y + tgtNode.height / 2 },
      };

      const rawPoints: Point[] = [
        sourcePort.point,
        sourcePort.stub,
        { x: corridorX, y: sourcePort.stub.y },
        { x: corridorX, y: targetPort.stub.y },
        targetPort.stub,
        targetPort.point,
      ];

      routes.push({
        edgeId: edge.id,
        points: simplifyOrthogonalPath(rawPoints, config.epsilon),
        sourcePort,
        targetPort,
      });
    }
  });

  return routes;
}
