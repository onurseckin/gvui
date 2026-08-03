import { simplifyOrthogonalPath } from "./geometry";
import type { EdgeRole, Point } from "./types";

const ROLE_PRIORITY: Record<EdgeRole, number> = {
  forward: 4,
  cross: 3,
  feedback: 2,
  self: 1,
};

function roundNum(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  const abs = Math.abs(rounded);
  return abs < 0.0001 ? "0" : rounded.toString();
}

export function pointsToSvgPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 3) {
    return `M ${roundNum(points[0].x)} ${roundNum(points[0].y)} Q ${roundNum(points[1].x)} ${roundNum(points[1].y)} ${roundNum(points[2].x)} ${roundNum(points[2].y)}`;
  }
  const simplified = simplifyOrthogonalPath(points);
  if (simplified.length === 0) return "";
  if (simplified.length === 1) {
    return `M ${roundNum(simplified[0].x)} ${roundNum(simplified[0].y)}`;
  }

  const commands: string[] = [`M ${roundNum(simplified[0].x)} ${roundNum(simplified[0].y)}`];
  for (let i = 1; i < simplified.length; i++) {
    commands.push(`L ${roundNum(simplified[i].x)} ${roundNum(simplified[i].y)}`);
  }
  return commands.join(" ");
}

export function determineCrossingBridgeOwner(
  edgeA: { id: string; role?: EdgeRole },
  edgeB: { id: string; role?: EdgeRole },
): { straightEdgeId: string; bridgedEdgeId: string } {
  const roleA = edgeA.role ? (ROLE_PRIORITY[edgeA.role] ?? 0) : 0;
  const roleB = edgeB.role ? (ROLE_PRIORITY[edgeB.role] ?? 0) : 0;

  if (roleA !== roleB) {
    if (roleA > roleB) {
      return { straightEdgeId: edgeA.id, bridgedEdgeId: edgeB.id };
    } else {
      return { straightEdgeId: edgeB.id, bridgedEdgeId: edgeA.id };
    }
  }

  if (edgeA.id < edgeB.id) {
    return { straightEdgeId: edgeA.id, bridgedEdgeId: edgeB.id };
  } else {
    return { straightEdgeId: edgeB.id, bridgedEdgeId: edgeA.id };
  }
}

interface CrossingOnSegment {
  point: Point;
  distFromPathStart: number;
  segmentIndex: number;
}

export function renderPathWithCrossingBridges(
  points: Point[],
  crossings: Point[],
  bridgeRadius = 6,
  epsilon = 0.001,
): string {
  if (points.length <= 1 || crossings.length === 0) {
    return pointsToSvgPath(points);
  }

  const simplified = simplifyOrthogonalPath(points, epsilon);
  if (simplified.length <= 1) {
    return pointsToSvgPath(simplified);
  }

  const crossingsWithPos: CrossingOnSegment[] = [];
  let accumulatedLen = 0;

  for (let i = 0; i < simplified.length - 1; i++) {
    const a = simplified[i];
    const b = simplified[i + 1];
    const isHoriz = Math.abs(a.y - b.y) <= epsilon;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const segLen = isHoriz ? maxX - minX : maxY - minY;

    for (const c of crossings) {
      if (isHoriz) {
        if (Math.abs(c.y - a.y) <= epsilon && c.x > minX + epsilon && c.x < maxX - epsilon) {
          const distOnSeg = Math.abs(c.x - a.x);
          crossingsWithPos.push({
            point: c,
            distFromPathStart: accumulatedLen + distOnSeg,
            segmentIndex: i,
          });
        }
      } else {
        if (Math.abs(c.x - a.x) <= epsilon && c.y > minY + epsilon && c.y < maxY - epsilon) {
          const distOnSeg = Math.abs(c.y - a.y);
          crossingsWithPos.push({
            point: c,
            distFromPathStart: accumulatedLen + distOnSeg,
            segmentIndex: i,
          });
        }
      }
    }

    accumulatedLen += segLen;
  }

  if (crossingsWithPos.length === 0) {
    return pointsToSvgPath(simplified);
  }

  crossingsWithPos.sort((c1, c2) => c1.distFromPathStart - c2.distFromPathStart);

  const segmentCrossings = new Map<number, CrossingOnSegment[]>();
  for (const c of crossingsWithPos) {
    let list = segmentCrossings.get(c.segmentIndex);
    if (!list) {
      list = [];
      segmentCrossings.set(c.segmentIndex, list);
    }
    list.push(c);
  }

  const parts: string[] = [];
  parts.push(`M ${roundNum(simplified[0].x)} ${roundNum(simplified[0].y)}`);

  for (let i = 0; i < simplified.length - 1; i++) {
    const a = simplified[i];
    const b = simplified[i + 1];
    const list = segmentCrossings.get(i);

    if (!list || list.length === 0) {
      parts.push(`L ${roundNum(b.x)} ${roundNum(b.y)}`);
      continue;
    }

    const isHoriz = Math.abs(a.y - b.y) <= epsilon;
    const segLen = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const dx = segLen > 0 ? (b.x - a.x) / segLen : 0;
    const dy = segLen > 0 ? (b.y - a.y) / segLen : 0;

    let prevDist = 0;

    for (let k = 0; k < list.length; k++) {
      const cr = list[k];
      const distOnSeg = isHoriz ? Math.abs(cr.point.x - a.x) : Math.abs(cr.point.y - a.y);
      const nextDistOnSeg =
        k < list.length - 1
          ? isHoriz
            ? Math.abs(list[k + 1].point.x - a.x)
            : Math.abs(list[k + 1].point.y - a.y)
          : segLen;

      const availBefore = distOnSeg - prevDist;
      const availAfter = nextDistOnSeg - distOnSeg;
      const maxR = Math.max(1, Math.min(bridgeRadius, availBefore / 2, availAfter / 2));

      const pStart: Point = {
        x: cr.point.x - dx * maxR,
        y: cr.point.y - dy * maxR,
      };
      const pEnd: Point = {
        x: cr.point.x + dx * maxR,
        y: cr.point.y + dy * maxR,
      };

      parts.push(`L ${roundNum(pStart.x)} ${roundNum(pStart.y)}`);
      parts.push(
        `A ${roundNum(maxR)} ${roundNum(maxR)} 0 0 0 ${roundNum(pEnd.x)} ${roundNum(pEnd.y)}`,
      );

      prevDist = distOnSeg + maxR;
    }

    parts.push(`L ${roundNum(b.x)} ${roundNum(b.y)}`);
  }

  return parts.join(" ");
}
