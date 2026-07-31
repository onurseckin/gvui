import { hasBadge, measureBadgeRect } from "./badgeMeasurement";
import type { CustomLayoutConfig } from "./config";
import {
  expandRect,
  pathManhattanLength,
  pointAtPathRatio,
  rectsOverlapStrict,
  segmentIntersectsRectInterior,
  simplifyOrthogonalPath,
} from "./geometry";
import type { NodeLayoutResult } from "./nodeLayout";
import type { BadgeCandidate, BadgePlacement, Point, Rect, RoutedPath, Segment } from "./types";

export interface BadgePlacementResult {
  placements: BadgePlacement[];
  placementsMap: Map<string, BadgePlacement>;
}

export function generateBadgeCandidates(
  route: RoutedPath,
  label: string,
  isCycle: boolean,
  nodeRects: Rect[],
  placedBadgeRects: Rect[],
  unrelatedSegments: Segment[],
  graphEnvelope: Rect,
  config: CustomLayoutConfig
): BadgeCandidate[] {
  const badgeDim = measureBadgeRect(label, config, isCycle);
  if (badgeDim.width <= 0 || badgeDim.height <= 0) return [];

  const candidates: BadgeCandidate[] = [];

  // Helper to check leader legality
  const getLegalLeader = (shape1: Point[], shape2: Point[]): Point[] | null => {
    const isLegal = (points: Point[]): boolean => {
      for (let i = 0; i < points.length - 1; i++) {
        const seg: Segment = { a: points[i], b: points[i + 1] };
        for (const nRect of nodeRects) {
          if (segmentIntersectsRectInterior(seg, nRect, config.epsilon)) return false;
        }
        for (const pRect of placedBadgeRects) {
          if (segmentIntersectsRectInterior(seg, pRect, config.epsilon)) return false;
        }
      }
      return true;
    };

    const legal1 = isLegal(shape1);
    const legal2 = isLegal(shape2);

    if (legal1 && legal2) {
      return pathManhattanLength(shape1) <= pathManhattanLength(shape2) ? shape1 : shape2;
    }
    if (legal1) return shape1;
    if (legal2) return shape2;
    return null;
  };

  // Helper to test and push a candidate
  const tryAddCandidate = (
    anchor: Point,
    center: Point,
    ring: number,
    ratioPenalty: number,
    isExterior: boolean
  ): void => {
    const bRect: Rect = {
      x: center.x - badgeDim.width / 2,
      y: center.y - badgeDim.height / 2,
      width: badgeDim.width,
      height: badgeDim.height,
    };

    // Reject if bRect overlaps node rects
    for (const nRect of nodeRects) {
      if (rectsOverlapStrict(bRect, nRect, config.epsilon)) return;
    }

    // Reject if bRect overlaps placed badges
    for (const pRect of placedBadgeRects) {
      if (rectsOverlapStrict(bRect, pRect, config.epsilon)) return;
    }

    // Reject if bRect intersects unrelated edge segments
    for (const uSeg of unrelatedSegments) {
      if (segmentIntersectsRectInterior(uSeg, bRect, config.epsilon)) return;
    }

    let leaderPoints: Point[] | undefined = undefined;
    const isOffset = Math.abs(anchor.x - center.x) > config.epsilon || Math.abs(anchor.y - center.y) > config.epsilon;

    if (isOffset) {
      const shape1 = simplifyOrthogonalPath([anchor, { x: center.x, y: anchor.y }, center], config.epsilon);
      const shape2 = simplifyOrthogonalPath([anchor, { x: anchor.x, y: center.y }, center], config.epsilon);
      const legalLeader = getLegalLeader(shape1, shape2);
      if (!legalLeader) return; // Discard if no legal leader shape
      leaderPoints = legalLeader;
    }

    let score = ring * 100 + ratioPenalty * 50;
    if (isOffset && leaderPoints) {
      score += pathManhattanLength(leaderPoints) * 0.1;
    }
    if (isExterior) {
      score += 500;
    }

    candidates.push({
      point: anchor,
      rect: bRect,
      score,
      leaderPoints,
    });
  };

  // Collect candidate anchor points along route
  interface AnchorSpec {
    anchor: Point;
    orientation: "horizontal" | "vertical";
    ratioPenalty: number;
  }
  const anchorSpecs: AnchorSpec[] = [];

  // Ratios: 0.5, 0.35, 0.65, 0.2, 0.8
  const ratios = [0.5, 0.35, 0.65, 0.2, 0.8];
  for (const r of ratios) {
    const pt = pointAtPathRatio(route.points, r);
    // Find orientation of segment containing pt
    let orientation: "horizontal" | "vertical" = "horizontal";
    for (let i = 0; i < route.points.length - 1; i++) {
      const a = route.points[i];
      const b = route.points[i + 1];
      const minX = Math.min(a.x, b.x) - config.epsilon;
      const maxX = Math.max(a.x, b.x) + config.epsilon;
      const minY = Math.min(a.y, b.y) - config.epsilon;
      const maxY = Math.max(a.y, b.y) + config.epsilon;

      if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
        if (Math.abs(a.x - b.x) <= config.epsilon) {
          orientation = "vertical";
        } else {
          orientation = "horizontal";
        }
        break;
      }
    }
    anchorSpecs.push({
      anchor: pt,
      orientation,
      ratioPenalty: Math.abs(r - 0.5),
    });
  }

  // Segment centers
  for (let i = 0; i < route.points.length - 1; i++) {
    const a = route.points[i];
    const b = route.points[i + 1];
    const segLen = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (segLen <= config.epsilon) continue;

    const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const orientation: "horizontal" | "vertical" = Math.abs(a.x - b.x) <= config.epsilon ? "vertical" : "horizontal";

    anchorSpecs.push({
      anchor: mid,
      orientation,
      ratioPenalty: 0.1,
    });
  }

  const maxRings = Math.min(4, config.maxLaneRings);

  for (const spec of anchorSpecs) {
    const { anchor, orientation, ratioPenalty } = spec;

    // Ring 0: On-path
    tryAddCandidate(anchor, anchor, 0, ratioPenalty, false);

    // Perpendicular rings
    const perpDirs: Point[] =
      orientation === "horizontal"
        ? [
            { x: 0, y: -1 },
            { x: 0, y: 1 },
          ]
        : [
            { x: -1, y: 0 },
            { x: 1, y: 0 },
          ];

    const halfPerpSize = orientation === "horizontal" ? badgeDim.height / 2 : badgeDim.width / 2;
    const baseDist = halfPerpSize + config.badgeClearance;

    for (let ring = 1; ring <= maxRings; ring++) {
      const dist = baseDist + (ring - 1) * config.laneSpacing;
      for (const dir of perpDirs) {
        const center: Point = {
          x: anchor.x + dir.x * dist,
          y: anchor.y + dir.y * dist,
        };
        tryAddCandidate(anchor, center, ring, ratioPenalty, false);
      }
    }

    // Deterministic exterior candidates beyond graph envelope
    const envMinX = graphEnvelope.x;
    const envMaxX = graphEnvelope.x + graphEnvelope.width;
    const envMinY = graphEnvelope.y;
    const envMaxY = graphEnvelope.y + graphEnvelope.height;

    const exteriorCenters: Point[] = [
      { x: anchor.x, y: envMinY - badgeDim.height / 2 - config.badgeClearance },
      { x: anchor.x, y: envMaxY + badgeDim.height / 2 + config.badgeClearance },
      { x: envMinX - badgeDim.width / 2 - config.badgeClearance, y: anchor.y },
      { x: envMaxX + badgeDim.width / 2 + config.badgeClearance, y: anchor.y },
    ];

    for (const extCenter of exteriorCenters) {
      tryAddCandidate(anchor, extCenter, maxRings + 1, ratioPenalty, true);
    }
  }

  return candidates;
}

export function placeEdgeBadges(
  routes: RoutedPath[],
  nodeLayout: NodeLayoutResult,
  config: CustomLayoutConfig
): BadgePlacementResult {
  const { normalizedGraph, nodePositions } = nodeLayout;

  const nodeRects: Rect[] = normalizedGraph.nodes.map((n) => {
    const pos = nodePositions.get(n.id) ?? { x: 0, y: 0 };
    return expandRect({ x: pos.x, y: pos.y, width: n.width, height: n.height }, config.badgeClearance);
  });

  // Calculate graph envelope from node positions and route points
  let envMinX = Infinity;
  let envMinY = Infinity;
  let envMaxX = -Infinity;
  let envMaxY = -Infinity;

  for (const n of normalizedGraph.nodes) {
    const pos = nodePositions.get(n.id) ?? { x: 0, y: 0 };
    envMinX = Math.min(envMinX, pos.x);
    envMinY = Math.min(envMinY, pos.y);
    envMaxX = Math.max(envMaxX, pos.x + n.width);
    envMaxY = Math.max(envMaxY, pos.y + n.height);
  }

  for (const r of routes) {
    for (const p of r.points) {
      envMinX = Math.min(envMinX, p.x);
      envMinY = Math.min(envMinY, p.y);
      envMaxX = Math.max(envMaxX, p.x);
      envMaxY = Math.max(envMaxY, p.y);
    }
  }

  if (!Number.isFinite(envMinX)) {
    envMinX = 0;
    envMinY = 0;
    envMaxX = 800;
    envMaxY = 600;
  }

  const graphEnvelope: Rect = {
    x: envMinX - config.graphPadding,
    y: envMinY - config.graphPadding,
    width: envMaxX - envMinX + config.graphPadding * 2,
    height: envMaxY - envMinY + config.graphPadding * 2,
  };

  // Collect all route segments grouped by edgeId
  const routeSegmentsMap = new Map<string, Segment[]>();
  for (const r of routes) {
    const segs: Segment[] = [];
    for (let i = 0; i < r.points.length - 1; i++) {
      segs.push({ a: r.points[i], b: r.points[i + 1] });
    }
    routeSegmentsMap.set(r.edgeId, segs);
  }

  const placements: BadgePlacement[] = [];
  const placementsMap = new Map<string, BadgePlacement>();
  const placedBadgeRects: Rect[] = [];

  const edgeMap = new Map(normalizedGraph.edges.map((e) => [e.id, e]));

  for (const route of routes) {
    const edge = edgeMap.get(route.edgeId);
    if (!edge) continue;

    const label = edge.label;
    const isCycle = edge.isCycle;

    if (!hasBadge(label, isCycle)) continue;

    // Collect unrelated segments (all segments from other routes)
    const unrelatedSegments: Segment[] = [];
    for (const [eId, segs] of routeSegmentsMap.entries()) {
      if (eId !== route.edgeId) {
        unrelatedSegments.push(...segs);
      }
    }

    const candidates = generateBadgeCandidates(
      route,
      label ?? "",
      Boolean(isCycle),
      nodeRects,
      placedBadgeRects,
      unrelatedSegments,
      graphEnvelope,
      config
    );

    let bestCandidate: BadgeCandidate;
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.score - b.score);
      bestCandidate = candidates[0];
    } else {
      // Fallback if no candidate passed strict filtering
      const badgeDim = measureBadgeRect(label ?? "", config, Boolean(isCycle));
      const mid = pointAtPathRatio(route.points, 0.5);
      bestCandidate = {
        point: mid,
        rect: {
          x: mid.x - badgeDim.width / 2,
          y: mid.y - badgeDim.height / 2,
          width: badgeDim.width,
          height: badgeDim.height,
        },
        score: 99999,
      };
    }

    const placement: BadgePlacement = {
      edgeId: route.edgeId,
      label: label ?? (isCycle ? "Cycle" : ""),
      rect: bestCandidate.rect,
      anchorPoint: bestCandidate.point,
      ...(bestCandidate.leaderPoints ? { leaderPoints: bestCandidate.leaderPoints } : {}),
    };

    placements.push(placement);
    placementsMap.set(route.edgeId, placement);
    placedBadgeRects.push(bestCandidate.rect);
  }

  return {
    placements,
    placementsMap,
  };
}

