import type { CustomLayoutConfig } from "./config";
import {
  collinearOverlapLength,
  pointOnRectBoundary,
  segmentIntersectsRectInterior,
  segmentsCross,
  simplifyOrthogonalPath,
} from "./geometry";
import { vertexKey, type RoutingGrid } from "./routingGrid";
import type { OccupancyRecord, Point, PortRef, Rect, RoutedPath, Segment, SegmentDirection } from "./types";

export function sideToOutwardDir(side: string): SegmentDirection {
  switch (side) {
    case "top":
      return "up";
    case "bottom":
      return "down";
    case "left":
      return "left";
    case "right":
      return "right";
    default:
      return "down";
  }
}

export function sideToInwardDir(side: string): SegmentDirection {
  switch (side) {
    case "top":
      return "down";
    case "bottom":
      return "up";
    case "left":
      return "right";
    case "right":
      return "left";
    default:
      return "up";
  }
}

function getSegmentDirection(a: Point, b: Point): SegmentDirection {
  if (Math.abs(b.x - a.x) > Math.abs(b.y - a.y)) {
    return b.x > a.x ? "right" : "left";
  }
  return b.y > a.y ? "down" : "up";
}

export interface RouteSearchOptions {
  role?: string;
  reservations?: OccupancyRecord[];
  forbiddenRects?: Rect[];
  requiredCorridorX?: number;
}

interface AStarNode {
  vId: string;
  dir: SegmentDirection;
  visitedRequiredCorridor: boolean;
  g: number;
  h: number;
  f: number;
  bends: number;
  parent: AStarNode | null;
}

export function searchOrthogonalRoute(
  edgeId: string,
  sourcePort: PortRef,
  targetPort: PortRef,
  grid: RoutingGrid,
  occupancy: OccupancyRecord[],
  config: CustomLayoutConfig,
  options?: RouteSearchOptions
): RoutedPath | null {
  const srcStubId = vertexKey(sourcePort.stub);
  const tgtStubId = vertexKey(targetPort.stub);

  if (!grid.vertices.has(srcStubId) || !grid.vertices.has(tgtStubId)) {
    return null;
  }

  const tgtStubPt = grid.vertices.get(tgtStubId)!;
  const reqX = options?.requiredCorridorX;
  const hasReqX = reqX !== undefined;

  function manhattanH(p: Point, visitedCorridor: boolean): number {
    if (!hasReqX || visitedCorridor) {
      return Math.abs(tgtStubPt.x - p.x) + Math.abs(tgtStubPt.y - p.y);
    }
    return Math.abs(reqX - p.x) + Math.abs(tgtStubPt.x - reqX) + Math.abs(tgtStubPt.y - p.y);
  }

  const initialDir = sideToOutwardDir(sourcePort.side);
  const targetInwardDir = sideToInwardDir(targetPort.side);
  const startPt = grid.vertices.get(srcStubId)!;
  const startVisited = hasReqX ? Math.abs(startPt.x - reqX) <= config.epsilon : true;

  const openList: AStarNode[] = [
    {
      vId: srcStubId,
      dir: initialDir,
      visitedRequiredCorridor: startVisited,
      g: 0,
      h: manhattanH(startPt, startVisited),
      f: manhattanH(startPt, startVisited),
      bends: 0,
      parent: null,
    },
  ];

  const gCosts = new Map<string, number>();
  const stateKey = (vId: string, dir: SegmentDirection, visitedCorridor: boolean) =>
    hasReqX ? `${vId}:${dir}:${visitedCorridor}` : `${vId}:${dir}`;
  gCosts.set(stateKey(srcStubId, initialDir, startVisited), 0);

  let bestGoalNode: AStarNode | null = null;
  const maxIterations = 10000;
  let iterations = 0;

  const combinedOccupancy = options?.reservations
    ? [...occupancy, ...options.reservations]
    : occupancy;

  const forbiddenRects = options?.forbiddenRects ?? [];

  while (openList.length > 0 && iterations++ < maxIterations) {
    // Priority queue sort: lowest f = g + h, then lowest h, then fewest bends, then state key
    openList.sort((a, b) => {
      if (Math.abs(a.f - b.f) > config.epsilon) return a.f - b.f;
      if (Math.abs(a.h - b.h) > config.epsilon) return a.h - b.h;
      if (a.bends !== b.bends) return a.bends - b.bends;
      return stateKey(a.vId, a.dir, a.visitedRequiredCorridor).localeCompare(
        stateKey(b.vId, b.dir, b.visitedRequiredCorridor)
      );
    });

    const current = openList.shift()!;

    if (current.vId === tgtStubId && current.visitedRequiredCorridor) {
      bestGoalNode = current;
      break;
    }

    const neighbors = grid.adj.get(current.vId) ?? [];
    const currentPt = grid.vertices.get(current.vId)!;

    for (const neighbor of neighbors) {
      const nextPt = grid.vertices.get(neighbor.targetId)!;
      const seg: Segment = { a: currentPt, b: nextPt };
      const moveDir = getSegmentDirection(currentPt, nextPt);

      // Check forbidden rectangles
      let isForbidden = false;
      for (const rect of forbiddenRects) {
        if (segmentIntersectsRectInterior(seg, rect, config.epsilon)) {
          isForbidden = true;
          break;
        }
      }
      if (isForbidden) continue;

      // Check collinear occupancy conflict (forbidden)
      let isCollinearOccupied = false;
      let crossingPen = 0;

      for (const occ of combinedOccupancy) {
        if (occ.edgeId === edgeId) continue;
        if (collinearOverlapLength(seg, occ.segment, config.epsilon) > config.epsilon) {
          isCollinearOccupied = true;
          break;
        }
        if (segmentsCross(seg, occ.segment, config.epsilon)) {
          crossingPen += config.crossingPenalty;
        }
      }

      if (isCollinearOccupied) continue;

      const isBend = moveDir !== current.dir;
      const bendCost = isBend ? config.bendPenalty : 0;

      // Near obstacle penalty
      let nearObsPen = 0;
      for (const obs of grid.obstacles) {
        if (pointOnRectBoundary(currentPt, obs, config.epsilon) || pointOnRectBoundary(nextPt, obs, config.epsilon)) {
          nearObsPen += config.nearObstaclePenalty;
        }
      }

      // Direction penalties
      let dirPen = 0;
      if (current.vId === srcStubId && moveDir !== initialDir) {
        dirPen += config.directionPenalty;
      }
      if (neighbor.targetId === tgtStubId && moveDir !== targetInwardDir) {
        dirPen += config.directionPenalty;
      }

      const edgeCost = neighbor.edge.weight + bendCost + crossingPen + nearObsPen + dirPen;

      const nextVisited =
        current.visitedRequiredCorridor || (hasReqX && Math.abs(nextPt.x - reqX) <= config.epsilon);
      const newG = current.g + edgeCost;
      const newBends = current.bends + (isBend ? 1 : 0);
      const newH = manhattanH(nextPt, nextVisited);
      const newF = newG + newH;

      const nextKey = stateKey(neighbor.targetId, moveDir, nextVisited);
      const existingG = gCosts.get(nextKey);

      if (existingG === undefined || newG < existingG - config.epsilon) {
        gCosts.set(nextKey, newG);
        openList.push({
          vId: neighbor.targetId,
          dir: moveDir,
          visitedRequiredCorridor: nextVisited,
          g: newG,
          h: newH,
          f: newF,
          bends: newBends,
          parent: current,
        });
      }
    }
  }

  if (!bestGoalNode) {
    return null;
  }

  // Reconstruct path
  const gridPathPoints: Point[] = [];
  let curr: AStarNode | null = bestGoalNode;
  while (curr) {
    const pt = grid.vertices.get(curr.vId);
    if (pt) gridPathPoints.unshift(pt);
    curr = curr.parent;
  }

  const rawPoints: Point[] = [
    sourcePort.point,
    sourcePort.stub,
    ...gridPathPoints,
    targetPort.stub,
    targetPort.point,
  ];

  const points = simplifyOrthogonalPath(rawPoints, config.epsilon);

  return {
    edgeId,
    points,
    sourcePort,
    targetPort,
  };
}


