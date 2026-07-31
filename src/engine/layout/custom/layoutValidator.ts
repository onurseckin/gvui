import { type CustomLayoutConfig, resolveCustomLayoutConfig } from "./config";
import { detectEdgeCrossings } from "./crossingDetection";
import {
  collinearOverlapLength,
  isFinitePoint,
  isOrthogonalSegment,
  pathManhattanLength,
  pointOnRectBoundary,
  rectsOverlapStrict,
  segmentIntersectsRectInterior,
  simplifyOrthogonalPath,
} from "./geometry";
import type {
  ClassifiedEdge,
  CustomLayoutResult,
  EdgeCrossing,
  EdgeRole,
  LayoutDiagnostic,
  LayoutMetrics,
  LayoutValidationResult,
  Point,
  Rect,
  Segment,
  Side,
} from "./types";

export interface ExtendedLayoutDiagnostic extends LayoutDiagnostic {
  segment?: Segment;
  rect?: Rect;
  point?: Point;
}

export interface ExtendedLayoutValidationResult extends LayoutValidationResult {
  diagnostics: ExtendedLayoutDiagnostic[];
  crossings: EdgeCrossing[];
}

function addDiagnostic(
  diagnostics: ExtendedLayoutDiagnostic[],
  seenKeys: Set<string>,
  diag: ExtendedLayoutDiagnostic
): boolean {
  let key: string;
  if (diag.ids.length === 0) {
    key = diag.code;
  } else if (diag.ids.length === 1) {
    key = `${diag.code}:${diag.ids[0]}`;
  } else {
    const sortedIds = [...diag.ids].sort();
    key = `${diag.code}:${sortedIds.join(":")}`;
  }

  if (!seenKeys.has(key)) {
    seenKeys.add(key);
    diagnostics.push(diag);
    return true;
  }
  return false;
}

export function validateCustomLayout(
  result: Pick<CustomLayoutResult, "nodes" | "edges" | "badges"> & {
    classifiedEdges?: ClassifiedEdge[];
    edgeRoles?: Map<string, EdgeRole> | Record<string, EdgeRole>;
  },
  partialConfig: CustomLayoutConfig | Partial<CustomLayoutConfig>,
): ExtendedLayoutValidationResult {
  const config = resolveCustomLayoutConfig(partialConfig);

  const diagnostics: ExtendedLayoutDiagnostic[] = [];
  const seenDiagnosticKeys = new Set<string>();

  const metrics: LayoutMetrics = {
    nodeNodeOverlaps: 0,
    edgeNodePenetrations: 0,
    sharedEdgeSegmentLength: 0,
    badgeNodeOverlaps: 0,
    badgeBadgeOverlaps: 0,
    badgeUnrelatedEdgeOverlaps: 0,
    crossingCount: 0,
    bendCount: 0,
    totalLength: 0,
    directionDeviationPenalty: 0,
    portSideReusePenalty: 0,
    totalArea: 0,
  };

  const nodes = result.nodes ?? [];
  const edges = result.edges ?? [];
  const badges = result.badges ?? [];

  const nodeRectMap = new Map<string, Rect>();

  // 1. Non-finite coordinate check
  for (const node of nodes) {
    if (!isFinitePoint(node) || !Number.isFinite(node.width) || !Number.isFinite(node.height)) {
      addDiagnostic(diagnostics, seenDiagnosticKeys, {
        code: "NON_FINITE_COORDINATE",
        severity: "error",
        message: `Node ${node.id} has non-finite coordinates or dimensions`,
        ids: [node.id],
      });
    } else {
      nodeRectMap.set(node.id, { x: node.x, y: node.y, width: node.width, height: node.height });
    }
  }

  for (const edge of edges) {
    let hasNonFinite = false;
    if (edge.sourcePort) {
      if (!isFinitePoint(edge.sourcePort.point) || !isFinitePoint(edge.sourcePort.stub)) hasNonFinite = true;
    }
    if (edge.targetPort) {
      if (!isFinitePoint(edge.targetPort.point) || !isFinitePoint(edge.targetPort.stub)) hasNonFinite = true;
    }
    if (edge.points) {
      for (const p of edge.points) {
        if (!isFinitePoint(p)) {
          hasNonFinite = true;
          break;
        }
      }
    }
    if (hasNonFinite) {
      addDiagnostic(diagnostics, seenDiagnosticKeys, {
        code: "NON_FINITE_COORDINATE",
        severity: "error",
        message: `Edge ${edge.edgeId} has non-finite point coordinates`,
        ids: [edge.edgeId],
      });
    }
  }

  for (const badge of badges) {
    if (
      !Number.isFinite(badge.rect.x) ||
      !Number.isFinite(badge.rect.y) ||
      !Number.isFinite(badge.rect.width) ||
      !Number.isFinite(badge.rect.height) ||
      !isFinitePoint(badge.anchorPoint)
    ) {
      addDiagnostic(diagnostics, seenDiagnosticKeys, {
        code: "NON_FINITE_COORDINATE",
        severity: "error",
        message: `Badge for edge ${badge.edgeId} has non-finite coordinates or dimensions`,
        ids: [badge.edgeId],
      });
    }
  }

  // 2. Node-node overlap check
  for (let i = 0; i < nodes.length; i++) {
    const nA = nodes[i];
    const rA = nodeRectMap.get(nA.id);
    if (!rA) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const nB = nodes[j];
      const rB = nodeRectMap.get(nB.id);
      if (!rB) continue;
      if (rectsOverlapStrict(rA, rB, config.epsilon)) {
        if (
          addDiagnostic(diagnostics, seenDiagnosticKeys, {
            code: "NODE_NODE_OVERLAP",
            severity: "error",
            message: `Node ${nA.id} and Node ${nB.id} overlap`,
            ids: [nA.id, nB.id],
            rect: rA,
          })
        ) {
          metrics.nodeNodeOverlaps++;
        }
      }
    }
  }

  // 3. Edge endpoint, direction, missing route, and non-orthogonal segment checks
  for (const edge of edges) {
    if (!edge.points || edge.points.length < 2) {
      addDiagnostic(diagnostics, seenDiagnosticKeys, {
        code: "MISSING_ROUTE",
        severity: "error",
        message: `Edge ${edge.edgeId} has a missing or incomplete route`,
        ids: [edge.edgeId],
      });
      continue;
    }

    // Check non-orthogonal internal segments
    for (let k = 0; k < edge.points.length - 1; k++) {
      const seg: Segment = { a: edge.points[k], b: edge.points[k + 1] };
      if (!isOrthogonalSegment(seg, config.epsilon)) {
        addDiagnostic(diagnostics, seenDiagnosticKeys, {
          code: "NON_ORTHOGONAL_SEGMENT",
          severity: "error",
          message: `Segment of edge ${edge.edgeId} is non-orthogonal`,
          ids: [edge.edgeId],
          segment: seg,
        });
      }
    }

    const sourceNodeRect = nodeRectMap.get(edge.sourcePort.nodeId);
    if (sourceNodeRect) {
      if (!pointOnRectBoundary(edge.sourcePort.point, sourceNodeRect, config.epsilon)) {
        addDiagnostic(diagnostics, seenDiagnosticKeys, {
          code: "ENDPOINT_OFF_BOUNDARY",
          severity: "error",
          message: `Source endpoint of edge ${edge.edgeId} is not on boundary of node ${edge.sourcePort.nodeId}`,
          ids: [edge.edgeId, edge.sourcePort.nodeId],
          point: edge.sourcePort.point,
        });
      }

      const p0 = edge.points[0];
      const p1 = edge.points[1];
      let validDeparture = true;
      switch (edge.sourcePort.side) {
        case "top":
          validDeparture = p1.y < p0.y - config.epsilon && Math.abs(p1.x - p0.x) <= config.epsilon;
          break;
        case "bottom":
          validDeparture = p1.y > p0.y + config.epsilon && Math.abs(p1.x - p0.x) <= config.epsilon;
          break;
        case "left":
          validDeparture = p1.x < p0.x - config.epsilon && Math.abs(p1.y - p0.y) <= config.epsilon;
          break;
        case "right":
          validDeparture = p1.x > p0.x + config.epsilon && Math.abs(p1.y - p0.y) <= config.epsilon;
          break;
      }
      if (!validDeparture) {
        addDiagnostic(diagnostics, seenDiagnosticKeys, {
          code: "WRONG_DEPARTURE_DIRECTION",
          severity: "error",
          message: `First segment of edge ${edge.edgeId} does not leave perpendicular from side ${edge.sourcePort.side}`,
          ids: [edge.edgeId, edge.sourcePort.nodeId],
          segment: { a: p0, b: p1 },
        });
      }
    }

    const targetNodeRect = nodeRectMap.get(edge.targetPort.nodeId);
    if (targetNodeRect) {
      if (!pointOnRectBoundary(edge.targetPort.point, targetNodeRect, config.epsilon)) {
        addDiagnostic(diagnostics, seenDiagnosticKeys, {
          code: "ENDPOINT_OFF_BOUNDARY",
          severity: "error",
          message: `Target endpoint of edge ${edge.edgeId} is not on boundary of node ${edge.targetPort.nodeId}`,
          ids: [edge.edgeId, edge.targetPort.nodeId],
          point: edge.targetPort.point,
        });
      }

      const pLast = edge.points[edge.points.length - 1];
      const pPrev = edge.points[edge.points.length - 2];
      let validEntry = true;
      switch (edge.targetPort.side) {
        case "top":
          validEntry = pPrev.y < pLast.y - config.epsilon && Math.abs(pPrev.x - pLast.x) <= config.epsilon;
          break;
        case "bottom":
          validEntry = pPrev.y > pLast.y + config.epsilon && Math.abs(pPrev.x - pLast.x) <= config.epsilon;
          break;
        case "left":
          validEntry = pPrev.x < pLast.x - config.epsilon && Math.abs(pPrev.y - pLast.y) <= config.epsilon;
          break;
        case "right":
          validEntry = pPrev.x > pLast.x + config.epsilon && Math.abs(pPrev.y - pLast.y) <= config.epsilon;
          break;
      }
      if (!validEntry) {
        addDiagnostic(diagnostics, seenDiagnosticKeys, {
          code: "WRONG_ENTRY_DIRECTION",
          severity: "error",
          message: `Last segment of edge ${edge.edgeId} does not enter perpendicular to side ${edge.targetPort.side}`,
          ids: [edge.edgeId, edge.targetPort.nodeId],
          segment: { a: pPrev, b: pLast },
        });
      }
    }

    const pLast = edge.points[edge.points.length - 1];
    const pPrev = edge.points[edge.points.length - 2];
    const arrowSegLen = Math.abs(pLast.x - pPrev.x) + Math.abs(pLast.y - pPrev.y);
    if (arrowSegLen <= config.epsilon) {
      addDiagnostic(diagnostics, seenDiagnosticKeys, {
        code: "ZERO_LENGTH_ARROW_SEGMENT",
        severity: "error",
        message: `Edge ${edge.edgeId} has zero-length final arrowhead segment`,
        ids: [edge.edgeId],
        segment: { a: pPrev, b: pLast },
      });
    }
  }

  // 4. Edge-node penetration check
  for (const edge of edges) {
    if (!edge.points || edge.points.length < 2) continue;
    for (let i = 0; i < edge.points.length - 1; i++) {
      const seg: Segment = { a: edge.points[i], b: edge.points[i + 1] };
      for (const node of nodes) {
        const nRect = nodeRectMap.get(node.id);
        if (!nRect) continue;
        if (segmentIntersectsRectInterior(seg, nRect, config.epsilon)) {
          if (
            addDiagnostic(diagnostics, seenDiagnosticKeys, {
              code: "EDGE_NODE_PENETRATION",
              severity: "error",
              message: `Segment of edge ${edge.edgeId} penetrates interior of node ${node.id}`,
              ids: [edge.edgeId, node.id],
              segment: seg,
              rect: nRect,
            })
          ) {
            metrics.edgeNodePenetrations++;
          }
        }
      }
    }
  }

  // 5. Shared positive-length collinear edge segment check
  for (let i = 0; i < edges.length; i++) {
    const edgeA = edges[i];
    if (!edgeA.points || edgeA.points.length < 2) continue;
    for (let j = i + 1; j < edges.length; j++) {
      const edgeB = edges[j];
      if (!edgeB.points || edgeB.points.length < 2) continue;
      let sharedLenForPair = 0;
      let firstOverlapSeg: Segment | undefined;
      for (let k = 0; k < edgeA.points.length - 1; k++) {
        const segA: Segment = { a: edgeA.points[k], b: edgeA.points[k + 1] };
        for (let l = 0; l < edgeB.points.length - 1; l++) {
          const segB: Segment = { a: edgeB.points[l], b: edgeB.points[l + 1] };
          const overlap = collinearOverlapLength(segA, segB, config.epsilon);
          if (overlap > config.epsilon) {
            sharedLenForPair += overlap;
            if (!firstOverlapSeg) firstOverlapSeg = segA;
          }
        }
      }
      if (sharedLenForPair > config.epsilon) {
        metrics.sharedEdgeSegmentLength += sharedLenForPair;
        addDiagnostic(diagnostics, seenDiagnosticKeys, {
          code: "SHARED_EDGE_SEGMENT",
          severity: "error",
          message: `Edges ${edgeA.edgeId} and ${edgeB.edgeId} share ${sharedLenForPair.toFixed(2)}px collinear segment`,
          ids: [edgeA.edgeId, edgeB.edgeId],
          segment: firstOverlapSeg,
        });
      }
    }
  }

  // 6. Badge-node overlap check
  for (const badge of badges) {
    for (const node of nodes) {
      const nRect = nodeRectMap.get(node.id);
      if (!nRect) continue;
      if (rectsOverlapStrict(badge.rect, nRect, config.epsilon)) {
        if (
          addDiagnostic(diagnostics, seenDiagnosticKeys, {
            code: "BADGE_NODE_OVERLAP",
            severity: "error",
            message: `Badge for edge ${badge.edgeId} overlaps node ${node.id}`,
            ids: [badge.edgeId, node.id],
            rect: badge.rect,
          })
        ) {
          metrics.badgeNodeOverlaps++;
        }
      }
    }
  }

  // 7. Badge-badge overlap check
  for (let i = 0; i < badges.length; i++) {
    const bA = badges[i];
    for (let j = i + 1; j < badges.length; j++) {
      const bB = badges[j];
      if (rectsOverlapStrict(bA.rect, bB.rect, config.epsilon)) {
        if (
          addDiagnostic(diagnostics, seenDiagnosticKeys, {
            code: "BADGE_BADGE_OVERLAP",
            severity: "error",
            message: `Badge for edge ${bA.edgeId} overlaps badge for edge ${bB.edgeId}`,
            ids: [bA.edgeId, bB.edgeId],
            rect: bA.rect,
          })
        ) {
          metrics.badgeBadgeOverlaps++;
        }
      }
    }
  }

  // 8. Badge-unrelated-edge overlap check
  for (const badge of badges) {
    for (const edge of edges) {
      if (edge.edgeId === badge.edgeId) continue;
      if (!edge.points || edge.points.length < 2) continue;
      for (let k = 0; k < edge.points.length - 1; k++) {
        const seg: Segment = { a: edge.points[k], b: edge.points[k + 1] };
        if (segmentIntersectsRectInterior(seg, badge.rect, config.epsilon)) {
          if (
            addDiagnostic(diagnostics, seenDiagnosticKeys, {
              code: "BADGE_UNRELATED_EDGE_OVERLAP",
              severity: "error",
              message: `Badge for edge ${badge.edgeId} overlaps unrelated edge ${edge.edgeId}`,
              ids: [badge.edgeId, edge.edgeId],
              rect: badge.rect,
              segment: seg,
            })
          ) {
            metrics.badgeUnrelatedEdgeOverlaps++;
          }
        }
      }
    }
  }

  // 9. Leader collision check
  for (const badge of badges) {
    if (badge.leaderPoints && badge.leaderPoints.length >= 2) {
      for (let k = 0; k < badge.leaderPoints.length - 1; k++) {
        const leaderSeg: Segment = { a: badge.leaderPoints[k], b: badge.leaderPoints[k + 1] };

        // Collides with node interior?
        for (const node of nodes) {
          const nRect = nodeRectMap.get(node.id);
          if (!nRect) continue;
          if (segmentIntersectsRectInterior(leaderSeg, nRect, config.epsilon)) {
            addDiagnostic(diagnostics, seenDiagnosticKeys, {
              code: "LEADER_COLLISION",
              severity: "error",
              message: `Badge leader for edge ${badge.edgeId} collides with node ${node.id}`,
              ids: [badge.edgeId, node.id],
              segment: leaderSeg,
              rect: nRect,
            });
          }
        }

        // Collides with another badge interior?
        for (const bOther of badges) {
          if (bOther.edgeId === badge.edgeId) continue;
          if (segmentIntersectsRectInterior(leaderSeg, bOther.rect, config.epsilon)) {
            addDiagnostic(diagnostics, seenDiagnosticKeys, {
              code: "LEADER_COLLISION",
              severity: "error",
              message: `Badge leader for edge ${badge.edgeId} collides with badge for edge ${bOther.edgeId}`,
              ids: [badge.edgeId, bOther.edgeId],
              segment: leaderSeg,
              rect: bOther.rect,
            });
          }
        }
      }
    }
  }

  // Soft Metrics: Crossing Detection and Crossing Count
  const crossings = detectEdgeCrossings(
    edges,
    result.edgeRoles ?? result.classifiedEdges,
    config.epsilon
  );
  metrics.crossingCount = crossings.length;

  // Soft Metrics: Bend Count
  for (const edge of edges) {
    if (!edge.points || edge.points.length < 2) continue;
    const simplified = simplifyOrthogonalPath(edge.points, config.epsilon);
    if (simplified.length > 2) {
      metrics.bendCount += simplified.length - 2;
    }
  }

  // Soft Metrics: Total Length
  for (const edge of edges) {
    if (edge.points && edge.points.length >= 2) {
      metrics.totalLength += pathManhattanLength(edge.points);
    }
  }

  // Soft Metrics: Direction Deviation Penalty
  for (const edge of edges) {
    if (!edge.points || edge.points.length < 2) continue;
    for (let k = 0; k < edge.points.length - 1; k++) {
      const p1 = edge.points[k];
      const p2 = edge.points[k + 1];
      const dy = p2.y - p1.y;
      if (dy < -config.epsilon) {
        metrics.directionDeviationPenalty += Math.abs(dy) * config.directionPenalty;
      }
    }
  }

  // Soft Metrics: Port Side Reuse Penalty
  const nodeSideCountMap = new Map<string, Map<Side, number>>();
  for (const edge of edges) {
    if (edge.sourcePort) {
      const sNode = edge.sourcePort.nodeId;
      const sSide = edge.sourcePort.side;
      if (!nodeSideCountMap.has(sNode)) nodeSideCountMap.set(sNode, new Map());
      const sMap = nodeSideCountMap.get(sNode)!;
      sMap.set(sSide, (sMap.get(sSide) ?? 0) + 1);
    }

    if (edge.targetPort) {
      const tNode = edge.targetPort.nodeId;
      const tSide = edge.targetPort.side;
      if (!nodeSideCountMap.has(tNode)) nodeSideCountMap.set(tNode, new Map());
      const tMap = nodeSideCountMap.get(tNode)!;
      tMap.set(tSide, (tMap.get(tSide) ?? 0) + 1);
    }
  }
  for (const [, sideMap] of nodeSideCountMap) {
    for (const [, count] of sideMap) {
      if (count > 1) {
        metrics.portSideReusePenalty += (count - 1) * config.sideReusePenalty;
      }
    }
  }

  // Soft Metrics: Total Area
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }
  for (const edge of edges) {
    if (edge.points) {
      for (const p of edge.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
  }
  for (const badge of badges) {
    minX = Math.min(minX, badge.rect.x);
    minY = Math.min(minY, badge.rect.y);
    maxX = Math.max(maxX, badge.rect.x + badge.rect.width);
    maxY = Math.max(maxY, badge.rect.y + badge.rect.height);
  }

  if (Number.isFinite(minX) && Number.isFinite(maxX) && maxX >= minX && maxY >= minY) {
    metrics.totalArea = (maxX - minX) * (maxY - minY);
  } else {
    metrics.totalArea = 0;
  }

  const hasError = diagnostics.some((d) => d.severity === "error");
  const isValid = !hasError;

  return {
    isValid,
    diagnostics,
    metrics,
    crossings,
  };
}

export function compareLayoutScores(a: LayoutValidationResult, b: LayoutValidationResult): number {
  if (a.isValid !== b.isValid) {
    return a.isValid ? -1 : 1;
  }

  const aErrorCount = a.diagnostics.filter((d) => d.severity === "error").length;
  const bErrorCount = b.diagnostics.filter((d) => d.severity === "error").length;
  if (aErrorCount !== bErrorCount) {
    return aErrorCount - bErrorCount;
  }

  if (a.metrics.nodeNodeOverlaps !== b.metrics.nodeNodeOverlaps) {
    return a.metrics.nodeNodeOverlaps - b.metrics.nodeNodeOverlaps;
  }

  if (a.metrics.edgeNodePenetrations !== b.metrics.edgeNodePenetrations) {
    return a.metrics.edgeNodePenetrations - b.metrics.edgeNodePenetrations;
  }

  if (a.metrics.sharedEdgeSegmentLength !== b.metrics.sharedEdgeSegmentLength) {
    return a.metrics.sharedEdgeSegmentLength - b.metrics.sharedEdgeSegmentLength;
  }

  if (a.metrics.badgeNodeOverlaps !== b.metrics.badgeNodeOverlaps) {
    return a.metrics.badgeNodeOverlaps - b.metrics.badgeNodeOverlaps;
  }

  if (a.metrics.badgeBadgeOverlaps !== b.metrics.badgeBadgeOverlaps) {
    return a.metrics.badgeBadgeOverlaps - b.metrics.badgeBadgeOverlaps;
  }

  if (a.metrics.badgeUnrelatedEdgeOverlaps !== b.metrics.badgeUnrelatedEdgeOverlaps) {
    return a.metrics.badgeUnrelatedEdgeOverlaps - b.metrics.badgeUnrelatedEdgeOverlaps;
  }

  if (a.metrics.crossingCount !== b.metrics.crossingCount) {
    return a.metrics.crossingCount - b.metrics.crossingCount;
  }

  if (a.metrics.bendCount !== b.metrics.bendCount) {
    return a.metrics.bendCount - b.metrics.bendCount;
  }

  if (a.metrics.totalLength !== b.metrics.totalLength) {
    return a.metrics.totalLength - b.metrics.totalLength;
  }

  if (a.metrics.directionDeviationPenalty !== b.metrics.directionDeviationPenalty) {
    return a.metrics.directionDeviationPenalty - b.metrics.directionDeviationPenalty;
  }

  if (a.metrics.portSideReusePenalty !== b.metrics.portSideReusePenalty) {
    return a.metrics.portSideReusePenalty - b.metrics.portSideReusePenalty;
  }

  if (a.metrics.totalArea !== b.metrics.totalArea) {
    return a.metrics.totalArea - b.metrics.totalArea;
  }

  return 0;
}
