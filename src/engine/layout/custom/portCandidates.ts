import type { CustomLayoutConfig } from "./config";
import type { EdgeRole, NormalizedEdge, NormalizedNode, Point, Side } from "./types";

export interface PortCandidate {
  edgeId: string;
  srcSide: Side;
  tgtSide: Side;
  srcPoint: Point;
  srcStub: Point;
  tgtPoint: Point;
  tgtStub: Point;
  estimatedLength: number;
  bendEstimate: number;
  baseCost: number;
}

export function getSideCenterAndStub(
  nodePos: Point,
  width: number,
  height: number,
  side: Side,
  stubLen: number
): { point: Point; stub: Point } {
  const { x, y } = nodePos;
  switch (side) {
    case "top":
      return {
        point: { x: x + width / 2, y },
        stub: { x: x + width / 2, y: y - stubLen },
      };
    case "right":
      return {
        point: { x: x + width, y: y + height / 2 },
        stub: { x: x + width + stubLen, y: y + height / 2 },
      };
    case "bottom":
      return {
        point: { x: x + width / 2, y: y + height },
        stub: { x: x + width / 2, y: y + height + stubLen },
      };
    case "left":
      return {
        point: { x, y: y + height / 2 },
        stub: { x: x - stubLen, y: y + height / 2 },
      };
  }
}

export function generatePortCandidates(
  edge: NormalizedEdge,
  srcNode: NormalizedNode & Point,
  tgtNode: NormalizedNode & Point,
  role: EdgeRole,
  _nodePositions: Map<string, Point>,
  config: CustomLayoutConfig
): PortCandidate[] {
  const sides: Side[] = ["top", "right", "bottom", "left"];
  const candidates: PortCandidate[] = [];

  for (const srcSide of sides) {
    const srcInfo = getSideCenterAndStub(srcNode, srcNode.width, srcNode.height, srcSide, config.portStubLength);

    for (const tgtSide of sides) {
      const tgtInfo = getSideCenterAndStub(tgtNode, tgtNode.width, tgtNode.height, tgtSide, config.portStubLength);

      const dx = Math.abs(tgtInfo.stub.x - srcInfo.stub.x);
      const dy = Math.abs(tgtInfo.stub.y - srcInfo.stub.y);
      const estimatedLength = dx + dy;

      let bendEstimate = 2;
      if (dx < config.epsilon || dy < config.epsilon) {
        bendEstimate = 0;
      } else if (
        (srcSide === "right" && tgtSide === "top" && tgtInfo.stub.x >= srcInfo.stub.x && tgtInfo.stub.y >= srcInfo.stub.y) ||
        (srcSide === "bottom" && tgtSide === "left" && tgtInfo.stub.x >= srcInfo.stub.x && tgtInfo.stub.y >= srcInfo.stub.y) ||
        (srcSide === "bottom" && tgtSide === "right" && tgtInfo.stub.x <= srcInfo.stub.x && tgtInfo.stub.y >= srcInfo.stub.y)
      ) {
        bendEstimate = 1;
      }

      let directionPen = 0;
      if (role === "forward") {
        if (srcSide === "top") directionPen += config.directionPenalty;
        if (tgtSide === "bottom") directionPen += config.directionPenalty;
        if (srcSide === "bottom" && tgtSide === "top") directionPen = 0;
      } else if (role === "feedback") {
        if ((srcSide === "left" && tgtSide === "left") || (srcSide === "right" && tgtSide === "right")) {
          directionPen = 0;
        } else {
          directionPen += config.directionPenalty;
        }
      } else if (role === "cross") {
        if ((srcSide === "right" && tgtSide === "left") || (srcSide === "left" && tgtSide === "right")) {
          directionPen = 0;
        } else {
          directionPen += config.directionPenalty * 0.5;
        }
      }

      const baseCost = estimatedLength + bendEstimate * config.bendPenalty + directionPen;

      candidates.push({
        edgeId: edge.id,
        srcSide,
        tgtSide,
        srcPoint: srcInfo.point,
        srcStub: srcInfo.stub,
        tgtPoint: tgtInfo.point,
        tgtStub: tgtInfo.stub,
        estimatedLength,
        bendEstimate,
        baseCost,
      });
    }
  }

  return candidates;
}
