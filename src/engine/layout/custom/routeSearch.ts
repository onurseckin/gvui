import type { CustomLayoutConfig } from "./config";
import {
  collinearOverlapLength,
  isOrthogonalSegment,
  pointOnRectBoundary,
  segmentIntersectsRectInterior,
  segmentsCross,
} from "./geometry";
import { type RoutingGrid, vertexKey } from "./routingGrid";
import type { OccupancyRecord, Point, PortRef, Rect, RoutedPath, Segment, SegmentDirection } from "./types";

export interface RouteCost {
  crossings: number;
  hairpins: number;
  bends: number;
  directionDeviation: number;
  length: number;
  nearObstaclePenalty: number;
}

export function compareRouteCost(a: RouteCost, b: RouteCost, epsilon = 0.001): number {
  if (Math.abs(a.crossings - b.crossings) > epsilon) {
    return a.crossings - b.crossings;
  }
  if (Math.abs(a.hairpins - b.hairpins) > epsilon) {
    return a.hairpins - b.hairpins;
  }
  if (Math.abs(a.bends - b.bends) > epsilon) {
    return a.bends - b.bends;
  }
  if (Math.abs(a.directionDeviation - b.directionDeviation) > epsilon) {
    return a.directionDeviation - b.directionDeviation;
  }
  if (Math.abs(a.length - b.length) > epsilon) {
    return a.length - b.length;
  }
  if (Math.abs(a.nearObstaclePenalty - b.nearObstaclePenalty) > epsilon) {
    return a.nearObstaclePenalty - b.nearObstaclePenalty;
  }
  return 0;
}

interface AStarNode {
  vId: string;
  dir: SegmentDirection;
  previousDir: SegmentDirection | null;
  visitedRequiredCorridor: boolean;
  gCost: RouteCost;
  hLength: number;
  fCost: RouteCost;
  parent: AStarNode | null;
}

function sideToOutwardDir(side: "top" | "bottom" | "left" | "right"): SegmentDirection {
  switch (side) {
    case "top":
      return "up";
    case "bottom":
      return "down";
    case "left":
      return "left";
    case "right":
      return "right";
  }
}

function sideToInwardDir(side: "top" | "bottom" | "left" | "right"): SegmentDirection {
  switch (side) {
    case "top":
      return "down";
    case "bottom":
      return "up";
    case "left":
      return "right";
    case "right":
      return "left";
  }
}

const OPPOSITE_DIR: Record<SegmentDirection, SegmentDirection> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

function getSegmentDirection(a: Point, b: Point): SegmentDirection {
  if (Math.abs(a.x - b.x) > 0.001) {
    return b.x > a.x ? "right" : "left";
  }
  return b.y > a.y ? "down" : "up";
}

export interface RouteSearchOptions {
  role?: "feedback" | "forward" | "self";
  requiredCorridorX?: number;
  requiredXCorridor?: number;
  forbiddenRects?: Rect[];
  reservations?: OccupancyRecord[];
  maxIterations?: number;
}

function compareNodes(a: AStarNode, b: AStarNode, epsilon: number, stateKeyFn: (n: AStarNode) => string): number {
  const costCmp = compareRouteCost(a.fCost, b.fCost, epsilon);
  if (costCmp !== 0) return costCmp;

  if (Math.abs(a.hLength - b.hLength) > epsilon) {
    return a.hLength - b.hLength;
  }

  const keyA = stateKeyFn(a);
  const keyB = stateKeyFn(b);
  const keyCmp = keyA.localeCompare(keyB);
  if (keyCmp !== 0) return keyCmp;

  return a.vId.localeCompare(b.vId);
}

function insertSortedNode(list: AStarNode[], node: AStarNode, epsilon: number, stateKeyFn: (n: AStarNode) => string) {
  let low = 0;
  let high = list.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (compareNodes(list[mid], node, epsilon, stateKeyFn) <= 0) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  list.splice(low, 0, node);
}

export function searchOrthogonalRoute(
  edgeId: string,
  sourcePort: PortRef,
  targetPort: PortRef,
  grid: RoutingGrid,
  occupancy: OccupancyRecord[],
  config: CustomLayoutConfig,
  options?: RouteSearchOptions,
): RoutedPath | null {
  const srcStubId = vertexKey(sourcePort.stub);
  const tgtStubId = vertexKey(targetPort.stub);

  if (!grid.vertices.has(srcStubId) || !grid.vertices.has(tgtStubId)) {
    return null;
  }

  const initialDir = sideToOutwardDir(sourcePort.side);
  const targetInwardDir = sideToInwardDir(targetPort.side);

  const reqX = options?.requiredXCorridor ?? options?.requiredCorridorX;
  const hasReqX = reqX !== undefined;
  const srcStubPt = grid.vertices.get(srcStubId)!;
  const tgtStubPt = grid.vertices.get(tgtStubId)!;

  const startVisited = hasReqX ? Math.abs(srcStubPt.x - reqX) <= config.epsilon : true;

  const manhattanH = (p: Point, visited: boolean): number => {
    let dist = Math.abs(p.x - tgtStubPt.x) + Math.abs(p.y - tgtStubPt.y);
    if (hasReqX && !visited) {
      dist += Math.abs(p.x - reqX) * 2;
    }
    return dist;
  };

  const initialHLength = manhattanH(srcStubPt, startVisited);

  const initialGCost: RouteCost = {
    crossings: 0,
    hairpins: 0,
    bends: 0,
    directionDeviation: 0,
    length: config.portStubLength * 2,
    nearObstaclePenalty: 0,
  };

  const initialFCost: RouteCost = {
    ...initialGCost,
    length: initialGCost.length + initialHLength,
  };

  const startNode: AStarNode = {
    vId: srcStubId,
    dir: initialDir,
    previousDir: null,
    visitedRequiredCorridor: startVisited,
    gCost: initialGCost,
    hLength: initialHLength,
    fCost: initialFCost,
    parent: null,
  };

  const gCosts = new Map<string, RouteCost>();

  const stateKey = (
    vId: string,
    dir: SegmentDirection,
    previousDir: SegmentDirection | null,
    visitedCorridor: boolean,
  ) =>
    hasReqX
      ? `${vId}:${dir}:${previousDir ?? "none"}:${visitedCorridor}`
      : `${vId}:${dir}:${previousDir ?? "none"}`;

  const getNodeStateKey = (n: AStarNode) =>
    stateKey(n.vId, n.dir, n.previousDir, n.visitedRequiredCorridor);

  gCosts.set(getNodeStateKey(startNode), initialGCost);

  const openList: AStarNode[] = [];
  insertSortedNode(openList, startNode, config.epsilon, getNodeStateKey);

  let bestGoalNode: AStarNode | null = null;
  const maxIterations = options?.maxIterations ?? 50000;
  let iterations = 0;

  const combinedOccupancy = options?.reservations
    ? [...occupancy, ...options.reservations]
    : occupancy;

  const forbiddenRects = options?.forbiddenRects ?? [];

  while (openList.length > 0 && iterations++ < maxIterations) {
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

      // Check collinear occupancy conflict & perpendicular crossings
      let isCollinearOccupied = false;
      let stepCrossings = 0;

      for (const occ of combinedOccupancy) {
        if (occ.edgeId === edgeId) continue;
        if (collinearOverlapLength(seg, occ.segment, config.epsilon) > config.epsilon) {
          isCollinearOccupied = true;
          break;
        }
        if (segmentsCross(seg, occ.segment, config.epsilon)) {
          stepCrossings += 1;
        }
      }

      if (isCollinearOccupied) continue;

      const isBend = moveDir !== current.dir;
      const isHairpin =
        (current.previousDir !== null && OPPOSITE_DIR[current.previousDir] === moveDir) ||
        OPPOSITE_DIR[current.dir] === moveDir;

      // Near obstacle penalty
      let stepNearObsPen = 0;
      for (const obs of grid.obstacles) {
        if (
          pointOnRectBoundary(currentPt, obs, config.epsilon) ||
          pointOnRectBoundary(nextPt, obs, config.epsilon)
        ) {
          stepNearObsPen += config.nearObstaclePenalty;
        }
      }

      // Direction penalties
      let stepDirDev = 0;
      if (current.vId === srcStubId && moveDir !== initialDir) {
        stepDirDev += config.directionPenalty;
      }
      if (neighbor.targetId === tgtStubId && moveDir !== targetInwardDir) {
        stepDirDev += config.directionPenalty;
      }

      const nextVisited =
        current.visitedRequiredCorridor || (hasReqX && Math.abs(nextPt.x - reqX) <= config.epsilon);

      const newGCost: RouteCost = {
        crossings: current.gCost.crossings + stepCrossings,
        hairpins: current.gCost.hairpins + (isHairpin ? 1 : 0),
        bends: current.gCost.bends + (isBend ? 1 : 0),
        directionDeviation: current.gCost.directionDeviation + stepDirDev,
        length: current.gCost.length + neighbor.edge.weight,
        nearObstaclePenalty: current.gCost.nearObstaclePenalty + stepNearObsPen,
      };

      const newHLength = manhattanH(nextPt, nextVisited);
      const newFCost: RouteCost = {
        ...newGCost,
        length: newGCost.length + newHLength,
      };

      const nextKey = stateKey(neighbor.targetId, moveDir, current.dir, nextVisited);
      const existingG = gCosts.get(nextKey);

      if (existingG === undefined || compareRouteCost(newGCost, existingG, config.epsilon) < 0) {
        gCosts.set(nextKey, newGCost);
        const nextNode: AStarNode = {
          vId: neighbor.targetId,
          dir: moveDir,
          previousDir: current.dir,
          visitedRequiredCorridor: nextVisited,
          gCost: newGCost,
          hLength: newHLength,
          fCost: newFCost,
          parent: current,
        };
        insertSortedNode(openList, nextNode, config.epsilon, getNodeStateKey);
      }
    }
  }

  if (!bestGoalNode) {
    return null;
  }

  // Reconstruct path: sourcePort.point -> sourcePort.stub -> A* path -> targetPort.stub -> targetPort.point
  const gridPoints: Point[] = [];
  let curr: AStarNode | null = bestGoalNode;

  while (curr !== null) {
    gridPoints.push(grid.vertices.get(curr.vId)!);
    curr = curr.parent;
  }

  gridPoints.reverse();

  // Deduplicate consecutive points
  const rawPoints: Point[] = [sourcePort.point, ...gridPoints, targetPort.point];
  const points: Point[] = [];

  for (const pt of rawPoints) {
    const last = points[points.length - 1];
    if (!last || Math.abs(last.x - pt.x) > config.epsilon || Math.abs(last.y - pt.y) > config.epsilon) {
      points.push(pt);
    }
  }

  // Simplify collinear intermediate points
  const simplifiedPoints: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i === 0 || i === points.length - 1) {
      simplifiedPoints.push(points[i]);
      continue;
    }

    const prev = simplifiedPoints[simplifiedPoints.length - 1];
    const currPt = points[i];
    const next = points[i + 1];

    if (isOrthogonalSegment({ a: prev, b: next }, config.epsilon)) {
      const dir1 = getSegmentDirection(prev, currPt);
      const dir2 = getSegmentDirection(currPt, next);
      if (dir1 === dir2) {
        continue; // Skip collinear point
      }
    }

    simplifiedPoints.push(currPt);
  }

  return {
    edgeId,
    points: simplifiedPoints,
    sourcePort,
    targetPort,
  };
}
