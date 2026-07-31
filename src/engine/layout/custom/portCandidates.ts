import type { CustomLayoutConfig } from "./config";
import { segmentIntersectsRectInterior } from "./geometry";
import type { EdgeRole, NormalizedEdge, NormalizedNode, Point, Rect, Segment, Side } from "./types";

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
  stubLen: number,
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

export function getSideNormal(side: Side): Point {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "right":
      return { x: 1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
  }
}

export function generatePortCandidates(
  edge: NormalizedEdge,
  srcNode: NormalizedNode & Point,
  tgtNode: NormalizedNode & Point,
  role: EdgeRole,
  _nodePositions: Map<string, Point>,
  config: CustomLayoutConfig,
  allNodes?: (NormalizedNode & Point)[],
): PortCandidate[] {
  const sides: Side[] = ["top", "right", "bottom", "left"];
  const allCandidates: PortCandidate[] = [];
  const validCandidates: PortCandidate[] = [];

  const srcCenter: Point = {
    x: srcNode.x + srcNode.width / 2,
    y: srcNode.y + srcNode.height / 2,
  };
  const tgtCenter: Point = {
    x: tgtNode.x + tgtNode.width / 2,
    y: tgtNode.y + tgtNode.height / 2,
  };

  const dxCenter = tgtCenter.x - srcCenter.x;
  const dyCenter = tgtCenter.y - srcCenter.y;
  const distCenter = Math.hypot(dxCenter, dyCenter);

  const srcRemoteUnit: Point =
    distCenter > config.epsilon
      ? { x: dxCenter / distCenter, y: dyCenter / distCenter }
      : { x: 0, y: 0 };

  const tgtRemoteUnit: Point = {
    x: -srcRemoteUnit.x,
    y: -srcRemoteUnit.y,
  };

  for (const srcSide of sides) {
    const srcInfo = getSideCenterAndStub(
      srcNode,
      srcNode.width,
      srcNode.height,
      srcSide,
      config.portStubLength,
    );

    const srcNormal = getSideNormal(srcSide);
    const srcDot = srcRemoteUnit.x * srcNormal.x + srcRemoteUnit.y * srcNormal.y;
    const srcDev = 1 - Math.max(-1, Math.min(1, srcDot));

    for (const tgtSide of sides) {
      const tgtInfo = getSideCenterAndStub(
        tgtNode,
        tgtNode.width,
        tgtNode.height,
        tgtSide,
        config.portStubLength,
      );

      const tgtNormal = getSideNormal(tgtSide);
      const tgtDot = tgtRemoteUnit.x * tgtNormal.x + tgtRemoteUnit.y * tgtNormal.y;
      const tgtDev = 1 - Math.max(-1, Math.min(1, tgtDot));

      const dx = Math.abs(tgtInfo.stub.x - srcInfo.stub.x);
      const dy = Math.abs(tgtInfo.stub.y - srcInfo.stub.y);
      const estimatedLength = dx + dy;

      let bendEstimate = 2;
      if (dx < config.epsilon || dy < config.epsilon) {
        bendEstimate = 0;
      } else if (
        (srcSide === "right" &&
          tgtSide === "top" &&
          tgtInfo.stub.x >= srcInfo.stub.x &&
          tgtInfo.stub.y >= srcInfo.stub.y) ||
        (srcSide === "bottom" &&
          tgtSide === "left" &&
          tgtInfo.stub.x >= srcInfo.stub.x &&
          tgtInfo.stub.y >= srcInfo.stub.y) ||
        (srcSide === "bottom" &&
          tgtSide === "right" &&
          tgtInfo.stub.x <= srcInfo.stub.x &&
          tgtInfo.stub.y >= srcInfo.stub.y)
      ) {
        bendEstimate = 1;
      }

      let angularPenalty = (srcDev + tgtDev) * config.directionPenalty;

      // Upward feedback edge preference discount: prefer leaving right/left and entering top/right/left
      const isUpwardFeedback =
        (role === "feedback" || Boolean(edge.isCycle)) &&
        tgtCenter.y < srcCenter.y - config.nodeGap;
      if (isUpwardFeedback) {
        if (
          (srcSide === "right" || srcSide === "left") &&
          (tgtSide === "top" || tgtSide === "right" || tgtSide === "left")
        ) {
          angularPenalty *= 0.1; // heavily discount side-looping candidate for feedback edge
        }
      }

      const baseCost = estimatedLength + bendEstimate * config.bendPenalty + angularPenalty;

      const candidate: PortCandidate = {
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
      };

      allCandidates.push(candidate);

      const srcLeg: Segment = { a: srcInfo.point, b: srcInfo.stub };
      const tgtLeg: Segment = { a: tgtInfo.point, b: tgtInfo.stub };

      let hasLegConflict = false;
      if (allNodes) {
        for (const n of allNodes) {
          const rect: Rect = { x: n.x, y: n.y, width: n.width, height: n.height };
          if (n.id !== srcNode.id && segmentIntersectsRectInterior(srcLeg, rect, config.epsilon)) {
            hasLegConflict = true;
            break;
          }
          if (n.id !== tgtNode.id && segmentIntersectsRectInterior(tgtLeg, rect, config.epsilon)) {
            hasLegConflict = true;
            break;
          }
        }
      }

      if (!hasLegConflict) {
        validCandidates.push(candidate);
      }
    }
  }

  return validCandidates.length > 0 ? validCandidates : allCandidates;
}
