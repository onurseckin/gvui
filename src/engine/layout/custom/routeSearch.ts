import type { CustomLayoutConfig } from "./config";
import {
  collinearOverlapLength,
  isOrthogonalSegment,
  segmentIntersectsRectInterior,
  segmentsCross,
} from "./geometry";
import { type RoutingGrid, vertexKey } from "./routingGrid";
import type {
  OccupancyRecord,
  Point,
  PortRef,
  Rect,
  RoutedPath,
  RouteSearchStats,
  Segment,
  SegmentDirection,
} from "./types";

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

class AStarMinHeap {
  private heap: AStarNode[] = [];
  private epsilon: number;
  private stateKeyFn: (n: AStarNode) => string;

  constructor(epsilon: number, stateKeyFn: (n: AStarNode) => string) {
    this.epsilon = epsilon;
    this.stateKeyFn = stateKeyFn;
  }

  public get size(): number {
    return this.heap.length;
  }

  public push(node: AStarNode): void {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }

  public pop(): AStarNode | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(idx: number): void {
    while (idx > 0) {
      const parentIdx = (idx - 1) >>> 1;
      if (compareNodes(this.heap[idx], this.heap[parentIdx], this.epsilon, this.stateKeyFn) < 0) {
        const tmp = this.heap[idx];
        this.heap[idx] = this.heap[parentIdx];
        this.heap[parentIdx] = tmp;
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  private bubbleDown(idx: number): void {
    const length = this.heap.length;
    while (true) {
      const leftIdx = (idx << 1) + 1;
      const rightIdx = leftIdx + 1;
      let smallest = idx;

      if (leftIdx < length && compareNodes(this.heap[leftIdx], this.heap[smallest], this.epsilon, this.stateKeyFn) < 0) {
        smallest = leftIdx;
      }
      if (rightIdx < length && compareNodes(this.heap[rightIdx], this.heap[smallest], this.epsilon, this.stateKeyFn) < 0) {
        smallest = rightIdx;
      }
      if (smallest !== idx) {
        const tmp = this.heap[idx];
        this.heap[idx] = this.heap[smallest];
        this.heap[smallest] = tmp;
        idx = smallest;
      } else {
        break;
      }
    }
  }
}

export class IndexedOccupancy {
  private horizMap = new Map<number, OccupancyRecord[]>();
  private vertMap = new Map<number, OccupancyRecord[]>();
  private horizYKeys: number[] = [];
  private vertXKeys: number[] = [];
  private otherRecords: OccupancyRecord[] = [];
  private epsilon: number;

  constructor(occupancy: OccupancyRecord[], epsilon = 0.001) {
    this.epsilon = epsilon;
    const precision = 1000;
    const roundCoord = (val: number) => Math.round(val * precision) / precision;

    for (const occ of occupancy) {
      const isHoriz = Math.abs(occ.segment.a.y - occ.segment.b.y) <= epsilon;
      const isVert = Math.abs(occ.segment.a.x - occ.segment.b.x) <= epsilon;

      if (isHoriz) {
        const yKey = roundCoord(occ.segment.a.y);
        let list = this.horizMap.get(yKey);
        if (!list) {
          list = [];
          this.horizMap.set(yKey, list);
        }
        list.push(occ);
      } else if (isVert) {
        const xKey = roundCoord(occ.segment.a.x);
        let list = this.vertMap.get(xKey);
        if (!list) {
          list = [];
          this.vertMap.set(xKey, list);
        }
        list.push(occ);
      } else {
        this.otherRecords.push(occ);
      }
    }

    this.horizYKeys = Array.from(this.horizMap.keys()).sort((a, b) => a - b);
    this.vertXKeys = Array.from(this.vertMap.keys()).sort((a, b) => a - b);
  }

  public checkSegmentConflict(
    seg: Segment,
    edgeId: string,
  ): { isCollinearOccupied: boolean; stepCrossings: number; queriesCount: number } {
    let queriesCount = 0;
    let isCollinearOccupied = false;
    let stepCrossings = 0;
    const precision = 1000;
    const roundCoord = (val: number) => Math.round(val * precision) / precision;

    const isHoriz = Math.abs(seg.a.y - seg.b.y) <= this.epsilon;
    const isVert = Math.abs(seg.a.x - seg.b.x) <= this.epsilon;

    if (isHoriz) {
      const yKey = roundCoord(seg.a.y);
      const minX = Math.min(seg.a.x, seg.b.x);
      const maxX = Math.max(seg.a.x, seg.b.x);

      const colList = this.horizMap.get(yKey);
      if (colList) {
        queriesCount++;
        for (const occ of colList) {
          if (occ.edgeId === edgeId) continue;
          if (collinearOverlapLength(seg, occ.segment, this.epsilon) > this.epsilon) {
            isCollinearOccupied = true;
            break;
          }
        }
      }

      if (!isCollinearOccupied) {
        for (const xKey of this.vertXKeys) {
          if (xKey < minX - this.epsilon) continue;
          if (xKey > maxX + this.epsilon) break;
          const vertList = this.vertMap.get(xKey)!;
          queriesCount++;
          for (const occ of vertList) {
            if (occ.edgeId === edgeId) continue;
            if (segmentsCross(seg, occ.segment, this.epsilon)) {
              stepCrossings++;
            }
          }
        }
      }
    } else if (isVert) {
      const xKey = roundCoord(seg.a.x);
      const minY = Math.min(seg.a.y, seg.b.y);
      const maxY = Math.max(seg.a.y, seg.b.y);

      const colList = this.vertMap.get(xKey);
      if (colList) {
        queriesCount++;
        for (const occ of colList) {
          if (occ.edgeId === edgeId) continue;
          if (collinearOverlapLength(seg, occ.segment, this.epsilon) > this.epsilon) {
            isCollinearOccupied = true;
            break;
          }
        }
      }

      if (!isCollinearOccupied) {
        for (const yKey of this.horizYKeys) {
          if (yKey < minY - this.epsilon) continue;
          if (yKey > maxY + this.epsilon) break;
          const horizList = this.horizMap.get(yKey)!;
          queriesCount++;
          for (const occ of horizList) {
            if (occ.edgeId === edgeId) continue;
            if (segmentsCross(seg, occ.segment, this.epsilon)) {
              stepCrossings++;
            }
          }
        }
      }
    }

    if (!isCollinearOccupied && this.otherRecords.length > 0) {
      queriesCount++;
      for (const occ of this.otherRecords) {
        if (occ.edgeId === edgeId) continue;
        if (collinearOverlapLength(seg, occ.segment, this.epsilon) > this.epsilon) {
          isCollinearOccupied = true;
          break;
        }
        if (segmentsCross(seg, occ.segment, this.epsilon)) {
          stepCrossings++;
        }
      }
    }

    return { isCollinearOccupied, stepCrossings, queriesCount };
  }
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

  const openHeap = new AStarMinHeap(config.epsilon, getNodeStateKey);
  openHeap.push(startNode);

  let bestGoalNode: AStarNode | null = null;
  const maxIterations = options?.maxIterations ?? config.maxAStarStatesPerRoute;
  let expandedStates = 0;
  let pushedStates = 1;
  let occupancyQueries = 0;
  let stopReason: "target_reached" | "queue_exhausted" | "max_iterations" = "queue_exhausted";

  const combinedOccupancy = options?.reservations
    ? [...occupancy, ...options.reservations]
    : occupancy;
  const indexedOcc = new IndexedOccupancy(combinedOccupancy, config.epsilon);
  const forbiddenRects = options?.forbiddenRects ?? [];

  while (openHeap.size > 0) {
    if (expandedStates >= maxIterations) {
      stopReason = "max_iterations";
      break;
    }

    const current = openHeap.pop()!;
    const currentKey = getNodeStateKey(current);
    const bestG = gCosts.get(currentKey);

    // Skip stale queue entries
    if (bestG && compareRouteCost(current.gCost, bestG, config.epsilon) > 0) {
      continue;
    }

    expandedStates++;

    if (current.vId === tgtStubId && current.visitedRequiredCorridor) {
      bestGoalNode = current;
      stopReason = "target_reached";
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

      // Check indexed occupancy conflict & perpendicular crossings
      const occResult = indexedOcc.checkSegmentConflict(seg, edgeId);
      occupancyQueries += occResult.queriesCount;
      if (occResult.isCollinearOccupied) continue;

      const stepCrossings = occResult.stepCrossings;
      const isBend = moveDir !== current.dir;
      const isHairpin =
        (current.previousDir !== null && OPPOSITE_DIR[current.previousDir] === moveDir) ||
        OPPOSITE_DIR[current.dir] === moveDir;

      // Precomputed near-obstacle penalty
      const stepNearObsPen = neighbor.edge.nearObstacle ? config.nearObstaclePenalty : 0;

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
        openHeap.push(nextNode);
        pushedStates++;
      }
    }
  }

  const stats: RouteSearchStats = {
    expandedStates,
    pushedStates,
    occupancyQueries,
    stopReason,
  };

  if (!bestGoalNode) {
    return null;
  }

  // Reconstruct path
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
        continue;
      }
    }

    simplifiedPoints.push(currPt);
  }

  return {
    edgeId,
    points: simplifiedPoints,
    sourcePort,
    targetPort,
    stats,
  };
}

