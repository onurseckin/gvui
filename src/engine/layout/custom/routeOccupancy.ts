import { collinearOverlapLength, segmentIntersectsRectInterior } from "./geometry";
import type {
  OccupancyRecord,
  Point,
  PortRef,
  Rect,
  RouteConflict,
  RouteReservation,
  Segment,
} from "./types";

export interface RouteOccupancyLedgerOptions {
  gridXCoords?: number[];
  gridYCoords?: number[];
  epsilon?: number;
}

function pointEquals(p1: Point, p2: Point, epsilon = 0.001): boolean {
  return Math.abs(p1.x - p2.x) <= epsilon && Math.abs(p1.y - p2.y) <= epsilon;
}

function pointStrictlyInsideSegment(p: Point, seg: Segment, epsilon = 0.001): boolean {
  const isHoriz = Math.abs(seg.a.y - seg.b.y) <= epsilon;
  const isVert = Math.abs(seg.a.x - seg.b.x) <= epsilon;

  if (isHoriz) {
    if (Math.abs(p.y - seg.a.y) > epsilon) return false;
    const minX = Math.min(seg.a.x, seg.b.x);
    const maxX = Math.max(seg.a.x, seg.b.x);
    return p.x > minX + epsilon && p.x < maxX - epsilon;
  }

  if (isVert) {
    if (Math.abs(p.x - seg.a.x) > epsilon) return false;
    const minY = Math.min(seg.a.y, seg.b.y);
    const maxY = Math.max(seg.a.y, seg.b.y);
    return p.y > minY + epsilon && p.y < maxY - epsilon;
  }

  return false;
}

function segmentIntersectionPoint(s1: Segment, s2: Segment, epsilon = 0.001): Point | null {
  const s1Horiz = Math.abs(s1.a.y - s1.b.y) <= epsilon;
  const s1Vert = Math.abs(s1.a.x - s1.b.x) <= epsilon;
  const s2Horiz = Math.abs(s2.a.y - s2.b.y) <= epsilon;
  const s2Vert = Math.abs(s2.a.x - s2.b.x) <= epsilon;

  if (s1Horiz && s2Vert) {
    const pt = { x: s2.a.x, y: s1.a.y };
    const onS1 =
      pt.x >= Math.min(s1.a.x, s1.b.x) - epsilon && pt.x <= Math.max(s1.a.x, s1.b.x) + epsilon;
    const onS2 =
      pt.y >= Math.min(s2.a.y, s2.b.y) - epsilon && pt.y <= Math.max(s2.a.y, s2.b.y) + epsilon;
    return onS1 && onS2 ? pt : null;
  }

  if (s1Vert && s2Horiz) {
    const pt = { x: s1.a.x, y: s2.a.y };
    const onS1 =
      pt.y >= Math.min(s1.a.y, s1.b.y) - epsilon && pt.y <= Math.max(s1.a.y, s1.b.y) + epsilon;
    const onS2 =
      pt.x >= Math.min(s2.a.x, s2.b.x) - epsilon && pt.x <= Math.max(s2.a.x, s2.b.x) + epsilon;
    return onS1 && onS2 ? pt : null;
  }

  return null;
}

function splitSegmentAtPoints(seg: Segment, candidatePoints: Point[], epsilon = 0.001): Segment[] {
  const internalPoints: Point[] = [];

  for (const p of candidatePoints) {
    if (pointStrictlyInsideSegment(p, seg, epsilon)) {
      if (!internalPoints.some((existing) => pointEquals(existing, p, epsilon))) {
        internalPoints.push(p);
      }
    }
  }

  if (internalPoints.length === 0) {
    return [seg];
  }

  const isHoriz = Math.abs(seg.a.y - seg.b.y) <= epsilon;
  const forward = isHoriz ? seg.a.x <= seg.b.x : seg.a.y <= seg.b.y;

  internalPoints.sort((p1, p2) => {
    if (isHoriz) {
      return forward ? p1.x - p2.x : p2.x - p1.x;
    }
    return forward ? p1.y - p2.y : p2.y - p1.y;
  });

  const allPoints: Point[] = [seg.a, ...internalPoints, seg.b];
  const subSegments: Segment[] = [];

  for (let i = 0; i < allPoints.length - 1; i++) {
    subSegments.push({ a: allPoints[i], b: allPoints[i + 1] });
  }

  return subSegments;
}

export function sortRouteConflicts(conflicts: RouteConflict[]): RouteConflict[] {
  const uniqueMap = new Map<string, RouteConflict>();

  for (const c of conflicts) {
    const key = `${c.edgeIdA}::${c.edgeIdB}`;
    const existing = uniqueMap.get(key);
    if (!existing) {
      uniqueMap.set(key, c);
    } else if (existing.reason === "collinear_overlap" && c.reason === "endpoint_stub_conflict") {
      uniqueMap.set(key, c);
    }
  }

  return Array.from(uniqueMap.values()).sort((a, b) => {
    if (a.edgeIdA !== b.edgeIdA) return a.edgeIdA.localeCompare(b.edgeIdA);
    if (a.edgeIdB !== b.edgeIdB) return a.edgeIdB.localeCompare(b.edgeIdB);
    return a.reason.localeCompare(b.reason);
  });
}

export function preflightEndpointLeg(
  edgeId: string,
  nodeId: string,
  leg: Segment,
  obstacles: { nodeId: string; rect: Rect }[],
  ledgerReservations: RouteReservation[],
  epsilon = 0.001,
): RouteConflict[] {
  const conflicts: RouteConflict[] = [];

  // 1. Preflight against node obstacles
  for (const obs of obstacles) {
    if (obs.nodeId === nodeId) continue;
    if (segmentIntersectsRectInterior(leg, obs.rect, epsilon)) {
      conflicts.push({
        edgeIdA: edgeId,
        edgeIdB: obs.nodeId,
        reason: "node_penetration",
      });
    }
  }

  // 2. Preflight against current reservations
  for (const res of ledgerReservations) {
    if (res.edgeId === edgeId) continue;
    const overlap = collinearOverlapLength(leg, res.segment, epsilon);
    if (overlap > epsilon) {
      conflicts.push({
        edgeIdA: edgeId,
        edgeIdB: res.edgeId,
        reason: res.isEndpointLeg ? "endpoint_stub_conflict" : "collinear_overlap",
      });
    }
  }

  return sortRouteConflicts(conflicts);
}

function isLegForPort(seg: Segment, port: PortRef, epsilon = 0.001): boolean {
  return (
    (pointEquals(seg.a, port.point, epsilon) && pointEquals(seg.b, port.stub, epsilon)) ||
    (pointEquals(seg.a, port.stub, epsilon) && pointEquals(seg.b, port.point, epsilon))
  );
}

export class RouteOccupancyLedger {
  private reservations: RouteReservation[] = [];
  private gridXCoords: Set<number>;
  private gridYCoords: Set<number>;
  private epsilon: number;

  constructor(options: RouteOccupancyLedgerOptions = {}) {
    this.gridXCoords = new Set(options.gridXCoords ?? []);
    this.gridYCoords = new Set(options.gridYCoords ?? []);
    this.epsilon = options.epsilon ?? 0.001;
  }

  public setGridCoordinates(xCoords: number[], yCoords: number[]): void {
    this.gridXCoords = new Set(xCoords);
    this.gridYCoords = new Set(yCoords);
  }

  public commitRoute(
    edgeId: string,
    points: Point[],
    sourcePort?: PortRef,
    targetPort?: PortRef,
  ): void {
    const rawReservations: RouteReservation[] = [];

    // Include source point-to-stub leg if provided
    if (sourcePort) {
      const srcLeg: Segment = { a: sourcePort.point, b: sourcePort.stub };
      if (
        Math.abs(srcLeg.a.x - srcLeg.b.x) > this.epsilon ||
        Math.abs(srcLeg.a.y - srcLeg.b.y) > this.epsilon
      ) {
        rawReservations.push({ edgeId, segment: srcLeg, isEndpointLeg: true });
      }
    }

    for (let i = 0; i < points.length - 1; i++) {
      const seg: Segment = { a: points[i], b: points[i + 1] };
      const isSrcStubLeg = sourcePort && isLegForPort(seg, sourcePort, this.epsilon);
      const isTgtStubLeg = targetPort && isLegForPort(seg, targetPort, this.epsilon);

      const isEndpointLeg = Boolean(isSrcStubLeg || isTgtStubLeg);

      if (
        isSrcStubLeg &&
        rawReservations.some(
          (r) => r.isEndpointLeg && isLegForPort(r.segment, sourcePort, this.epsilon),
        )
      ) {
        continue;
      }

      rawReservations.push({ edgeId, segment: seg, isEndpointLeg });
    }

    // Include target point-to-stub leg if provided
    if (targetPort) {
      const tgtLeg: Segment = { a: targetPort.stub, b: targetPort.point };
      if (
        Math.abs(tgtLeg.a.x - tgtLeg.b.x) > this.epsilon ||
        Math.abs(tgtLeg.a.y - tgtLeg.b.y) > this.epsilon
      ) {
        const exists = rawReservations.some(
          (r) => r.isEndpointLeg && isLegForPort(r.segment, targetPort, this.epsilon),
        );
        if (!exists) {
          rawReservations.push({ edgeId, segment: tgtLeg, isEndpointLeg: true });
        }
      }
    }

    this.commitReservations(rawReservations);
  }

  public commitReservations(rawReservations: RouteReservation[]): void {
    // Collect all candidate split points
    const splitPoints: Point[] = [];

    // Add grid coordinates as split points
    for (const x of this.gridXCoords) {
      for (const res of rawReservations) {
        if (Math.abs(res.segment.a.y - res.segment.b.y) <= this.epsilon) {
          splitPoints.push({ x, y: res.segment.a.y });
        }
      }
    }
    for (const y of this.gridYCoords) {
      for (const res of rawReservations) {
        if (Math.abs(res.segment.a.x - res.segment.b.x) <= this.epsilon) {
          splitPoints.push({ x: res.segment.a.x, y });
        }
      }
    }

    // Add endpoints and intersections of existing reservations
    for (const existing of this.reservations) {
      splitPoints.push(existing.segment.a);
      splitPoints.push(existing.segment.b);
    }

    // Add endpoints and intersections of new reservations
    for (const raw of rawReservations) {
      splitPoints.push(raw.segment.a);
      splitPoints.push(raw.segment.b);

      for (const existing of this.reservations) {
        const intersection = segmentIntersectionPoint(raw.segment, existing.segment, this.epsilon);
        if (intersection) {
          splitPoints.push(intersection);
        }
      }
    }

    // Split existing reservations in ledger at any new split points
    const updatedExistingReservations: RouteReservation[] = [];
    for (const existing of this.reservations) {
      const subSegs = splitSegmentAtPoints(existing.segment, splitPoints, this.epsilon);
      for (const sub of subSegs) {
        updatedExistingReservations.push({
          edgeId: existing.edgeId,
          segment: sub,
          isEndpointLeg: existing.isEndpointLeg,
        });
      }
    }
    this.reservations = updatedExistingReservations;

    // Split and add new reservations
    for (const raw of rawReservations) {
      const subSegs = splitSegmentAtPoints(raw.segment, splitPoints, this.epsilon);
      for (const sub of subSegs) {
        this.reservations.push({
          edgeId: raw.edgeId,
          segment: sub,
          isEndpointLeg: raw.isEndpointLeg,
        });
      }
    }
  }

  public queryConflicts(candidates: RouteReservation[]): RouteConflict[] {
    const conflicts: RouteConflict[] = [];

    for (const cand of candidates) {
      for (const res of this.reservations) {
        if (cand.edgeId === res.edgeId) continue;

        const overlap = collinearOverlapLength(cand.segment, res.segment, this.epsilon);
        if (overlap > this.epsilon) {
          const reason =
            cand.isEndpointLeg || res.isEndpointLeg
              ? "endpoint_stub_conflict"
              : "collinear_overlap";
          conflicts.push({
            edgeIdA: cand.edgeId,
            edgeIdB: res.edgeId,
            reason,
          });
        }
      }
    }

    return sortRouteConflicts(conflicts);
  }

  public release(edgeId: string): void {
    this.reservations = this.reservations.filter((r) => r.edgeId !== edgeId);
  }

  public getReservations(): RouteReservation[] {
    return [...this.reservations].sort((a, b) => {
      if (a.edgeId !== b.edgeId) return a.edgeId.localeCompare(b.edgeId);
      if (Math.abs(a.segment.a.x - b.segment.a.x) > this.epsilon)
        return a.segment.a.x - b.segment.a.x;
      if (Math.abs(a.segment.a.y - b.segment.a.y) > this.epsilon)
        return a.segment.a.y - b.segment.a.y;
      if (Math.abs(a.segment.b.x - b.segment.b.x) > this.epsilon)
        return a.segment.b.x - b.segment.b.x;
      return a.segment.b.y - b.segment.b.y;
    });
  }

  public toOccupancyRecords(): OccupancyRecord[] {
    return this.getReservations().map((r) => ({
      edgeId: r.edgeId,
      segment: r.segment,
    }));
  }
}
