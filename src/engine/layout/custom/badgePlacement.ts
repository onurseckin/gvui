import { hasBadge, measureBadgeRect } from "./badgeMeasurement";
import type { CustomLayoutConfig } from "./config";
import { expandRect, rectsOverlapStrict } from "./geometry";
import type { NodeLayoutResult } from "./nodeLayout";
import type { BadgePlacement, Point, Rect, RoutedPath } from "./types";

export interface BadgePlacementResult {
  placements: BadgePlacement[];
  placementsMap: Map<string, BadgePlacement>;
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

    const badgeDim = measureBadgeRect(label ?? "", config, isCycle);

    // Find longest segment in route
    let longestLen = -1;
    let longestSeg: { a: Point; b: Point } = { a: route.points[0], b: route.points[1] ?? route.points[0] };

    for (let i = 0; i < route.points.length - 1; i++) {
      const a = route.points[i];
      const b = route.points[i + 1];
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      if (len > longestLen) {
        longestLen = len;
        longestSeg = { a, b };
      }
    }

    const midX = (longestSeg.a.x + longestSeg.b.x) / 2;
    const midY = (longestSeg.a.y + longestSeg.b.y) / 2;

    const candidates: Point[] = [
      { x: midX, y: midY },
      { x: longestSeg.a.x * 0.4 + longestSeg.b.x * 0.6, y: longestSeg.a.y * 0.4 + longestSeg.b.y * 0.6 },
      { x: longestSeg.a.x * 0.6 + longestSeg.b.x * 0.4, y: longestSeg.a.y * 0.6 + longestSeg.b.y * 0.4 },
    ];

    let bestCenter = candidates[0];
    let bestScore = Infinity;

    for (const cand of candidates) {
      const bRect: Rect = {
        x: cand.x - badgeDim.width / 2,
        y: cand.y - badgeDim.height / 2,
        width: badgeDim.width,
        height: badgeDim.height,
      };

      let nodeOverlaps = 0;
      for (const nRect of nodeRects) {
        if (rectsOverlapStrict(bRect, nRect, config.epsilon)) {
          nodeOverlaps++;
        }
      }

      let badgeOverlaps = 0;
      for (const pRect of placedBadgeRects) {
        if (rectsOverlapStrict(bRect, pRect, config.epsilon)) {
          badgeOverlaps++;
        }
      }

      const score = nodeOverlaps * 1000 + badgeOverlaps * 500;
      if (score < bestScore) {
        bestScore = score;
        bestCenter = cand;
      }
    }

    const finalRect: Rect = {
      x: bestCenter.x - badgeDim.width / 2,
      y: bestCenter.y - badgeDim.height / 2,
      width: badgeDim.width,
      height: badgeDim.height,
    };

    const placement: BadgePlacement = {
      edgeId: route.edgeId,
      label: label ?? (isCycle ? "Cycle" : ""),
      rect: finalRect,
      anchorPoint: bestCenter,
    };

    placements.push(placement);
    placementsMap.set(route.edgeId, placement);
    placedBadgeRects.push(finalRect);
  }

  return {
    placements,
    placementsMap,
  };
}
