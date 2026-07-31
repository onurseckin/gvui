import { hasBadge, measureBadgeRect } from "./badgeMeasurement";
import type { CustomLayoutConfig } from "./config";
import {
  collinearOverlapLength,
  expandRect,
  pathManhattanLength,
  pointAtPathRatio,
  rectsOverlapStrict,
  segmentIntersectsRectInterior,
  segmentsCross,
  simplifyOrthogonalPath,
} from "./geometry";
import type { NodeLayoutResult } from "./nodeLayout";
import type { BadgeCandidate, BadgePlacement, Point, Rect, RoutedPath, Segment } from "./types";

export interface BadgePlacementResult {
  placements: BadgePlacement[];
  placementsMap: Map<string, BadgePlacement>;
  unresolvedEdgeIds?: string[];
}

export function candidatesConflict(cA: BadgeCandidate, cB: BadgeCandidate, epsilon = 0.001): boolean {
  if (rectsOverlapStrict(cA.rect, cB.rect, epsilon)) return true;

  if (cB.leaderPoints) {
    for (let i = 0; i < cB.leaderPoints.length - 1; i++) {
      const seg: Segment = { a: cB.leaderPoints[i], b: cB.leaderPoints[i + 1] };
      if (segmentIntersectsRectInterior(seg, cA.rect, epsilon)) return true;
    }
  }

  if (cA.leaderPoints) {
    for (let i = 0; i < cA.leaderPoints.length - 1; i++) {
      const seg: Segment = { a: cA.leaderPoints[i], b: cA.leaderPoints[i + 1] };
      if (segmentIntersectsRectInterior(seg, cB.rect, epsilon)) return true;
    }
  }

  if (cA.leaderPoints && cB.leaderPoints) {
    for (let i = 0; i < cA.leaderPoints.length - 1; i++) {
      const segA: Segment = { a: cA.leaderPoints[i], b: cA.leaderPoints[i + 1] };
      for (let j = 0; j < cB.leaderPoints.length - 1; j++) {
        const segB: Segment = { a: cB.leaderPoints[j], b: cB.leaderPoints[j + 1] };
        if (segmentsCross(segA, segB, epsilon)) return true;
        if (collinearOverlapLength(segA, segB, epsilon) > epsilon) return true;
      }
    }
  }

  return false;
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
        for (const uSeg of unrelatedSegments) {
          if (segmentsCross(seg, uSeg, config.epsilon) || collinearOverlapLength(seg, uSeg, config.epsilon) > config.epsilon) return false;
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

  // Sort candidates deterministically
  candidates.sort((a, b) => {
    if (Math.abs(a.score - b.score) > config.epsilon) {
      return a.score - b.score;
    }
    if (Math.abs(a.point.x - b.point.x) > config.epsilon) {
      return a.point.x - b.point.x;
    }
    if (Math.abs(a.point.y - b.point.y) > config.epsilon) {
      return a.point.y - b.point.y;
    }
    if (Math.abs(a.rect.x - b.rect.x) > config.epsilon) {
      return a.rect.x - b.rect.x;
    }
    return a.rect.y - b.rect.y;
  });

  if (candidates.length > config.maxBadgeCandidatesPerEdge) {
    return candidates.slice(0, config.maxBadgeCandidatesPerEdge);
  }

  return candidates;
}

interface BadgeItem {
  edgeId: string;
  label: string;
  isCycle: boolean;
  candidates: BadgeCandidate[];
  area: number;
}

function sortBadgeItems(items: BadgeItem[]): BadgeItem[] {
  return [...items].sort((a, b) => {
    if (a.candidates.length !== b.candidates.length) {
      return a.candidates.length - b.candidates.length;
    }
    if (Math.abs(b.area - a.area) > 0.001) {
      return b.area - a.area;
    }
    return a.edgeId.localeCompare(b.edgeId);
  });
}

export function placeEdgeBadges(
  routes: RoutedPath[],
  nodeLayout: NodeLayoutResult,
  config: CustomLayoutConfig
): BadgePlacementResult {
  const { normalizedGraph, nodePositions } = nodeLayout;

  // Sort routes deterministically by edgeId
  const sortedRoutes = [...routes].sort((a, b) => a.edgeId.localeCompare(b.edgeId));

  const nodeRects: Rect[] = normalizedGraph.nodes.map((n) => {
    const pos = nodePositions.get(n.id) ?? { x: 0, y: 0 };
    return expandRect({ x: pos.x, y: pos.y, width: n.width, height: n.height }, config.badgeClearance);
  });

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

  for (const r of sortedRoutes) {
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

  const routeSegmentsMap = new Map<string, Segment[]>();
  for (const r of sortedRoutes) {
    const segs: Segment[] = [];
    for (let i = 0; i < r.points.length - 1; i++) {
      segs.push({ a: r.points[i], b: r.points[i + 1] });
    }
    routeSegmentsMap.set(r.edgeId, segs);
  }

  const edgeMap = new Map(normalizedGraph.edges.map((e) => [e.id, e]));

  const badgeItems: BadgeItem[] = [];
  const unresolvedEdgeIds: string[] = [];

  for (const route of sortedRoutes) {
    const edge = edgeMap.get(route.edgeId);
    if (!edge) continue;

    const label = edge.label;
    const isCycle = Boolean(edge.isCycle);

    if (!hasBadge(label, isCycle)) continue;

    const unrelatedSegments: Segment[] = [];
    for (const [eId, segs] of routeSegmentsMap.entries()) {
      if (eId !== route.edgeId) {
        unrelatedSegments.push(...segs);
      }
    }

    const candidates = generateBadgeCandidates(
      route,
      label ?? "",
      isCycle,
      nodeRects,
      [],
      unrelatedSegments,
      graphEnvelope,
      config
    );

    const badgeDim = measureBadgeRect(label ?? "", config, isCycle);
    const area = badgeDim.width * badgeDim.height;

    if (candidates.length === 0) {
      unresolvedEdgeIds.push(route.edgeId);
    } else {
      badgeItems.push({
        edgeId: route.edgeId,
        label: label ?? (isCycle ? "Cycle" : ""),
        isCycle,
        candidates,
        area,
      });
    }
  }

  // DSU for Conflict Components
  const numItems = badgeItems.length;
  const parent = Array.from({ length: numItems }, (_, i) => i);
  const find = (i: number): number => {
    let curr = i;
    while (curr !== parent[curr]) {
      parent[curr] = parent[parent[curr]];
      curr = parent[curr];
    }
    return curr;
  };
  const union = (i: number, j: number) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent[rootI] = rootJ;
  };

  for (let i = 0; i < numItems; i++) {
    for (let j = i + 1; j < numItems; j++) {
      let hasConflict = false;
      for (const cA of badgeItems[i].candidates) {
        for (const cB of badgeItems[j].candidates) {
          if (candidatesConflict(cA, cB, config.epsilon)) {
            hasConflict = true;
            break;
          }
        }
        if (hasConflict) break;
      }
      if (hasConflict) {
        union(i, j);
      }
    }
  }

  const componentMap = new Map<number, BadgeItem[]>();
  for (let i = 0; i < numItems; i++) {
    const root = find(i);
    if (!componentMap.has(root)) componentMap.set(root, []);
    componentMap.get(root)!.push(badgeItems[i]);
  }

  const sortedComponents = Array.from(componentMap.values()).sort((a, b) => {
    const minEdgeA = a.map((x) => x.edgeId).sort()[0];
    const minEdgeB = b.map((x) => x.edgeId).sort()[0];
    return minEdgeA.localeCompare(minEdgeB);
  });

  const finalPlacementsMap = new Map<string, BadgePlacement>();

  for (const component of sortedComponents) {
    const sortedCompBadges = sortBadgeItems(component);

    let stepCount = 0;
    const maxSteps = config.maxBadgeBacktrackSteps;
    const visitedStates = new Set<string>();

    const solutionMap = new Map<string, BadgeCandidate>();

    function search(idx: number, currentMap: Map<string, BadgeCandidate>): boolean {
      if (idx === sortedCompBadges.length) {
        for (const [k, v] of currentMap.entries()) {
          solutionMap.set(k, v);
        }
        return true;
      }

      if (stepCount >= maxSteps) return false;

      const stateKey = sortedCompBadges
        .slice(0, idx)
        .map((b) => {
          const c = currentMap.get(b.edgeId)!;
          return `${b.edgeId}:${c.point.x},${c.point.y},${c.rect.x},${c.rect.y}`;
        })
        .join("|");

      if (visitedStates.has(stateKey)) return false;
      visitedStates.add(stateKey);

      const badge = sortedCompBadges[idx];

      for (const cand of badge.candidates) {
        stepCount++;
        if (stepCount > maxSteps) return false;

        let conflict = false;
        for (const [, assignedCand] of currentMap.entries()) {
          if (candidatesConflict(cand, assignedCand, config.epsilon)) {
            conflict = true;
            break;
          }
        }

        if (conflict) continue;

        currentMap.set(badge.edgeId, cand);
        if (search(idx + 1, currentMap)) return true;
        currentMap.delete(badge.edgeId);
      }

      return false;
    }

    const foundFullSolution = search(0, new Map<string, BadgeCandidate>());

    if (foundFullSolution) {
      for (const bItem of sortedCompBadges) {
        const cand = solutionMap.get(bItem.edgeId)!;
        finalPlacementsMap.set(bItem.edgeId, {
          edgeId: bItem.edgeId,
          label: bItem.label,
          rect: cand.rect,
          anchorPoint: cand.point,
          ...(cand.leaderPoints ? { leaderPoints: cand.leaderPoints } : {}),
        });
      }
    } else {
      const partialMap = new Map<string, BadgeCandidate>();
      for (const bItem of sortedCompBadges) {
        for (const cand of bItem.candidates) {
          let conflict = false;
          for (const [, assignedCand] of partialMap.entries()) {
            if (candidatesConflict(cand, assignedCand, config.epsilon)) {
              conflict = true;
              break;
            }
          }
          if (!conflict) {
            partialMap.set(bItem.edgeId, cand);
            break;
          }
        }
        if (partialMap.has(bItem.edgeId)) {
          const cand = partialMap.get(bItem.edgeId)!;
          finalPlacementsMap.set(bItem.edgeId, {
            edgeId: bItem.edgeId,
            label: bItem.label,
            rect: cand.rect,
            anchorPoint: cand.point,
            ...(cand.leaderPoints ? { leaderPoints: cand.leaderPoints } : {}),
          });
        } else {
          unresolvedEdgeIds.push(bItem.edgeId);
        }
      }
    }
  }

  const placements: BadgePlacement[] = [];
  const placementsMap = new Map<string, BadgePlacement>();

  for (const route of sortedRoutes) {
    const p = finalPlacementsMap.get(route.edgeId);
    if (p) {
      placements.push(p);
      placementsMap.set(p.edgeId, p);
    }
  }

  return {
    placements,
    placementsMap,
    ...(unresolvedEdgeIds.length > 0 ? { unresolvedEdgeIds: unresolvedEdgeIds.sort() } : {}),
  };
}
