import { type CustomLayoutConfig, resolveCustomLayoutConfig } from "./config";
import {
  collinearOverlapLength,
  isFinitePoint,
  pathManhattanLength,
  pointOnRectBoundary,
  rectsOverlapStrict,
  segmentIntersectsRectInterior,
  segmentsCross,
  simplifyOrthogonalPath,
} from "./geometry";
import type {
  CustomLayoutResult,
  LayoutDiagnostic,
  LayoutMetrics,
  LayoutValidationResult,
  Rect,
  Segment,
  Side,
} from "./types";

export function validateCustomLayout(
  result: Pick<CustomLayoutResult, "nodes" | "edges" | "badges">,
  partialConfig: CustomLayoutConfig | Partial<CustomLayoutConfig>,
): LayoutValidationResult {
  const config = resolveCustomLayoutConfig(partialConfig);

  const diagnostics: LayoutDiagnostic[] = [];
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
      diagnostics.push({
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
    if (!isFinitePoint(edge.sourcePort.point) || !isFinitePoint(edge.sourcePort.stub)) hasNonFinite = true;
    if (!isFinitePoint(edge.targetPort.point) || !isFinitePoint(edge.targetPort.stub)) hasNonFinite = true;
    for (const p of edge.points) {
      if (!isFinitePoint(p)) {
        hasNonFinite = true;
        break;
      }
    }
    if (hasNonFinite) {
      diagnostics.push({
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
      diagnostics.push({
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
        metrics.nodeNodeOverlaps++;
        diagnostics.push({
          code: "NODE_NODE_OVERLAP",
          severity: "error",
          message: `Node ${nA.id} and Node ${nB.id} overlap`,
          ids: [nA.id, nB.id],
        });
      }
    }
  }

  // 3. Edge endpoint & direction checks
  for (const edge of edges) {
    if (edge.points.length < 2) {
      diagnostics.push({
        code: "INVALID_EDGE_POINTS",
        severity: "error",
        message: `Edge ${edge.edgeId} has fewer than 2 points`,
        ids: [edge.edgeId],
      });
      continue;
    }

    const sourceNodeRect = nodeRectMap.get(edge.sourcePort.nodeId);
    if (sourceNodeRect) {
      if (!pointOnRectBoundary(edge.sourcePort.point, sourceNodeRect, config.epsilon)) {
        diagnostics.push({
          code: "ENDPOINT_OFF_BOUNDARY",
          severity: "error",
          message: `Source endpoint of edge ${edge.edgeId} is not on boundary of node ${edge.sourcePort.nodeId}`,
          ids: [edge.edgeId, edge.sourcePort.nodeId],
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
        diagnostics.push({
          code: "WRONG_DEPARTURE_DIRECTION",
          severity: "error",
          message: `First segment of edge ${edge.edgeId} does not leave perpendicular from side ${edge.sourcePort.side}`,
          ids: [edge.edgeId, edge.sourcePort.nodeId],
        });
      }
    }

    const targetNodeRect = nodeRectMap.get(edge.targetPort.nodeId);
    if (targetNodeRect) {
      if (!pointOnRectBoundary(edge.targetPort.point, targetNodeRect, config.epsilon)) {
        diagnostics.push({
          code: "ENDPOINT_OFF_BOUNDARY",
          severity: "error",
          message: `Target endpoint of edge ${edge.edgeId} is not on boundary of node ${edge.targetPort.nodeId}`,
          ids: [edge.edgeId, edge.targetPort.nodeId],
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
        diagnostics.push({
          code: "WRONG_ENTRY_DIRECTION",
          severity: "error",
          message: `Last segment of edge ${edge.edgeId} does not enter perpendicular to side ${edge.targetPort.side}`,
          ids: [edge.edgeId, edge.targetPort.nodeId],
        });
      }
    }

    const pLast = edge.points[edge.points.length - 1];
    const pPrev = edge.points[edge.points.length - 2];
    const arrowSegLen = Math.abs(pLast.x - pPrev.x) + Math.abs(pLast.y - pPrev.y);
    if (arrowSegLen <= config.epsilon) {
      diagnostics.push({
        code: "ZERO_LENGTH_ARROW_SEGMENT",
        severity: "error",
        message: `Edge ${edge.edgeId} has zero-length final arrowhead segment`,
        ids: [edge.edgeId],
      });
    }
  }

  // 4. Edge-node penetration check
  for (const edge of edges) {
    for (let i = 0; i < edge.points.length - 1; i++) {
      const seg: Segment = { a: edge.points[i], b: edge.points[i + 1] };
      for (const node of nodes) {
        const nRect = nodeRectMap.get(node.id);
        if (!nRect) continue;
        if (segmentIntersectsRectInterior(seg, nRect, config.epsilon)) {
          metrics.edgeNodePenetrations++;
          diagnostics.push({
            code: "EDGE_NODE_PENETRATION",
            severity: "error",
            message: `Segment of edge ${edge.edgeId} penetrates interior of node ${node.id}`,
            ids: [edge.edgeId, node.id],
          });
        }
      }
    }
  }

  // 5. Shared positive-length collinear edge segment check
  for (let i = 0; i < edges.length; i++) {
    const edgeA = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const edgeB = edges[j];
      let sharedLenForPair = 0;
      for (let k = 0; k < edgeA.points.length - 1; k++) {
        const segA: Segment = { a: edgeA.points[k], b: edgeA.points[k + 1] };
        for (let l = 0; l < edgeB.points.length - 1; l++) {
          const segB: Segment = { a: edgeB.points[l], b: edgeB.points[l + 1] };
          const overlap = collinearOverlapLength(segA, segB, config.epsilon);
          if (overlap > config.epsilon) {
            sharedLenForPair += overlap;
          }
        }
      }
      if (sharedLenForPair > config.epsilon) {
        metrics.sharedEdgeSegmentLength += sharedLenForPair;
        diagnostics.push({
          code: "SHARED_EDGE_SEGMENT",
          severity: "error",
          message: `Edges ${edgeA.edgeId} and ${edgeB.edgeId} share ${sharedLenForPair.toFixed(2)}px collinear segment`,
          ids: [edgeA.edgeId, edgeB.edgeId],
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
        metrics.badgeNodeOverlaps++;
        diagnostics.push({
          code: "BADGE_NODE_OVERLAP",
          severity: "error",
          message: `Badge for edge ${badge.edgeId} overlaps node ${node.id}`,
          ids: [badge.edgeId, node.id],
        });
      }
    }
  }

  // 7. Badge-badge overlap check
  for (let i = 0; i < badges.length; i++) {
    const bA = badges[i];
    for (let j = i + 1; j < badges.length; j++) {
      const bB = badges[j];
      if (rectsOverlapStrict(bA.rect, bB.rect, config.epsilon)) {
        metrics.badgeBadgeOverlaps++;
        diagnostics.push({
          code: "BADGE_BADGE_OVERLAP",
          severity: "error",
          message: `Badge for edge ${bA.edgeId} overlaps badge for edge ${bB.edgeId}`,
          ids: [bA.edgeId, bB.edgeId],
        });
      }
    }
  }

  // 8. Badge-unrelated-edge overlap check
  for (const badge of badges) {
    for (const edge of edges) {
      if (edge.edgeId === badge.edgeId) continue;
      for (let k = 0; k < edge.points.length - 1; k++) {
        const seg: Segment = { a: edge.points[k], b: edge.points[k + 1] };
        if (segmentIntersectsRectInterior(seg, badge.rect, config.epsilon)) {
          metrics.badgeUnrelatedEdgeOverlaps++;
          diagnostics.push({
            code: "BADGE_UNRELATED_EDGE_OVERLAP",
            severity: "error",
            message: `Badge for edge ${badge.edgeId} overlaps unrelated edge ${edge.edgeId}`,
            ids: [badge.edgeId, edge.edgeId],
          });
        }
      }
    }
  }

  // Soft Metrics: Crossing Count
  for (let i = 0; i < edges.length; i++) {
    const edgeA = edges[i];
    for (let j = i + 1; j < edges.length; j++) {
      const edgeB = edges[j];
      for (let k = 0; k < edgeA.points.length - 1; k++) {
        const segA: Segment = { a: edgeA.points[k], b: edgeA.points[k + 1] };
        for (let l = 0; l < edgeB.points.length - 1; l++) {
          const segB: Segment = { a: edgeB.points[l], b: edgeB.points[l + 1] };
          if (segmentsCross(segA, segB, config.epsilon)) {
            metrics.crossingCount++;
          }
        }
      }
    }
  }

  // Soft Metrics: Bend Count
  for (const edge of edges) {
    const simplified = simplifyOrthogonalPath(edge.points, config.epsilon);
    if (simplified.length > 2) {
      metrics.bendCount += simplified.length - 2;
    }
  }

  // Soft Metrics: Total Length
  for (const edge of edges) {
    metrics.totalLength += pathManhattanLength(edge.points);
  }

  // Soft Metrics: Direction Deviation Penalty
  for (const edge of edges) {
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
    const sNode = edge.sourcePort.nodeId;
    const sSide = edge.sourcePort.side;
    if (!nodeSideCountMap.has(sNode)) nodeSideCountMap.set(sNode, new Map());
    const sMap = nodeSideCountMap.get(sNode)!;
    sMap.set(sSide, (sMap.get(sSide) ?? 0) + 1);

    const tNode = edge.targetPort.nodeId;
    const tSide = edge.targetPort.side;
    if (!nodeSideCountMap.has(tNode)) nodeSideCountMap.set(tNode, new Map());
    const tMap = nodeSideCountMap.get(tNode)!;
    tMap.set(tSide, (tMap.get(tSide) ?? 0) + 1);
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
    for (const p of edge.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
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
