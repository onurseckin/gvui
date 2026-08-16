import type {
  GraphDataset,
  GraphEdgeData,
  GraphNodeData,
  GraphSection,
  PositionedNode,
} from "../../types/graphData";
import type { CanvasAnnotation } from "../../components/CanvasAnnotations/types";
import type {
  BoundaryEdge,
  ClosureDirection,
  ClosureOptions,
  ExtractedSubgraph,
  ExtractSubgraphOptions,
  Point,
  PolygonContainmentMode,
  Rect,
  SubgraphStats,
} from "./types";

/**
 * Computes bounding rectangle of a polygon.
 */
export function computePolygonBounds(polygon: Point[]): Rect {
  if (!polygon || polygon.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of polygon) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

/**
 * Checks if a point is inside a rectangle.
 */
export function isPointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * Tests if point lies on segment [p1, p2] within epsilon tolerance.
 */
function isPointOnSegment(point: Point, p1: Point, p2: Point, epsilon = 1e-7): boolean {
  const cross = (point.y - p1.y) * (p2.x - p1.x) - (point.x - p1.x) * (p2.y - p1.y);
  if (Math.abs(cross) > epsilon) return false;

  const dot = (point.x - p1.x) * (p2.x - p1.x) + (point.y - p1.y) * (p2.y - p1.y);
  if (dot < 0) return false;

  const sqLen = (p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y);
  return dot <= sqLen;
}

/**
 * Point in polygon test using Ray-Casting algorithm (even-odd rule).
 * Handles boundary points, vertex touches, and horizontal edges.
 */
export function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  if (!polygon || polygon.length < 3) {
    return false;
  }

  // Quick bounding box check
  const bounds = computePolygonBounds(polygon);
  if (!isPointInRect(point, bounds)) {
    return false;
  }

  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    // Check if point lies directly on edge
    if (isPointOnSegment(point, polygon[i], polygon[j])) {
      return true;
    }

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Checks orientation of ordered triplet (p, q, r).
 * Returns: 0 -> collinear, 1 -> clockwise, 2 -> counterclockwise
 */
function orientation(p: Point, q: Point, r: Point): number {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(val) < 1e-9) return 0;
  return val > 0 ? 1 : 2;
}

/**
 * Checks if point q lies on segment pr.
 */
function onSegment(p: Point, q: Point, r: Point): boolean {
  return (
    q.x <= Math.max(p.x, r.x) &&
    q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) &&
    q.y >= Math.min(p.y, r.y)
  );
}

/**
 * Determines whether line segments p1q1 and p2q2 intersect.
 */
export function doSegmentsIntersect(p1: Point, q1: Point, p2: Point, q2: Point): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  // General case
  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  // Special cases for collinear points
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;

  return false;
}

/**
 * Checks if a rectangular region intersects with or is inside a polygon.
 */
export function doesRectIntersectPolygon(rect: Rect, polygon: Point[]): boolean {
  if (!polygon || polygon.length < 3) return false;

  const rectCorners: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];

  // If any rect corner is in polygon
  for (const corner of rectCorners) {
    if (isPointInPolygon(corner, polygon)) return true;
  }

  // If any polygon vertex is inside rect
  for (const vertex of polygon) {
    if (isPointInRect(vertex, rect)) return true;
  }

  // If any rect segment intersects any polygon segment
  const rectEdges: [Point, Point][] = [
    [rectCorners[0], rectCorners[1]],
    [rectCorners[1], rectCorners[2]],
    [rectCorners[2], rectCorners[3]],
    [rectCorners[3], rectCorners[0]],
  ];

  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];

    for (const [r1, r2] of rectEdges) {
      if (doSegmentsIntersect(p1, p2, r1, r2)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Evaluates whether a positioned node falls within a polygon boundary.
 */
export function isNodeInPolygon(
  node: PositionedNode,
  polygon: Point[],
  mode: PolygonContainmentMode = "center",
): boolean {
  if (!polygon || polygon.length < 3) return false;

  const rect: Rect = {
    x: node.x,
    y: node.y,
    width: node.width || 1,
    height: node.height || 1,
  };

  switch (mode) {
    case "center": {
      const center: Point = {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      };
      return isPointInPolygon(center, polygon);
    }
    case "any_vertex": {
      const corners: Point[] = [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.width, y: rect.y },
        { x: rect.x + rect.width, y: rect.y + rect.height },
        { x: rect.x, y: rect.y + rect.height },
      ];
      return corners.some((pt) => isPointInPolygon(pt, polygon));
    }
    case "all_vertices": {
      const corners: Point[] = [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.width, y: rect.y },
        { x: rect.x + rect.width, y: rect.y + rect.height },
        { x: rect.x, y: rect.y + rect.height },
      ];
      return corners.every((pt) => isPointInPolygon(pt, polygon));
    }
    case "intersects": {
      return doesRectIntersectPolygon(rect, polygon);
    }
    default: {
      const center: Point = {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      };
      return isPointInPolygon(center, polygon);
    }
  }
}

/**
 * Computes transitive closure over graph dataset starting from root node IDs.
 * Supports downstream (forward), upstream (reverse), or bidirectional reachability with optional depth cap.
 */
export function computeTransitiveClosure(
  dataset: GraphDataset,
  rootNodeIds: Set<string> | readonly string[],
  options: ClosureOptions,
): Set<string> {
  const rootSet = rootNodeIds instanceof Set ? rootNodeIds : new Set(rootNodeIds);
  const result = new Set<string>();

  if (rootSet.size === 0) {
    return result;
  }

  if (options.includeRootNodes !== false) {
    for (const id of rootSet) {
      result.add(id);
    }
  }

  const maxDepth = options.maxDepth !== undefined ? Math.max(0, options.maxDepth) : Infinity;
  if (maxDepth === 0) {
    return result;
  }

  // Build adjacency maps
  const forwardAdj = new Map<string, string[]>();
  const reverseAdj = new Map<string, string[]>();

  for (const edge of dataset.edges) {
    if (!forwardAdj.has(edge.source)) forwardAdj.set(edge.source, []);
    forwardAdj.get(edge.source)?.push(edge.target);

    if (!reverseAdj.has(edge.target)) reverseAdj.set(edge.target, []);
    reverseAdj.get(edge.target)?.push(edge.source);
  }

  interface QueueItem {
    id: string;
    depth: number;
  }

  const queue: QueueItem[] = [];
  const visited = new Set<string>();

  for (const id of rootSet) {
    queue.push({ id, depth: 0 });
    visited.add(id);
  }

  const direction: ClosureDirection = options.direction || "downstream";

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;

    const { id, depth } = item;
    result.add(id);

    if (depth >= maxDepth) {
      continue;
    }

    const nextNeighbors: string[] = [];

    if (direction === "downstream" || direction === "bidirectional") {
      const fwd = forwardAdj.get(id);
      if (fwd) {
        for (const target of fwd) {
          nextNeighbors.push(target);
        }
      }
    }

    if (direction === "upstream" || direction === "bidirectional") {
      const rev = reverseAdj.get(id);
      if (rev) {
        for (const source of rev) {
          nextNeighbors.push(source);
        }
      }
    }

    for (const neighbor of nextNeighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ id: neighbor, depth: depth + 1 });
      }
    }
  }

  return result;
}

/**
 * Extracts a coherent subgraph based on user selection, lasso polygon, transitive closure, or sections.
 */
export function extractSubgraph(options: ExtractSubgraphOptions): ExtractedSubgraph {
  const {
    dataset,
    positionedNodes = [],
    mode = "selection",
    selectedNodeIds = [],
    lassoPolygon,
    polygonContainmentMode = "center",
    closureOptions,
    sectionIds,
    boundaryEdgePolicy = "none",
    includeAnnotations = true,
    annotations = [],
  } = options;

  const targetNodeIds = new Set<string>();

  // 1. Resolve targeted node IDs based on mode
  switch (mode) {
    case "all": {
      for (const node of dataset.nodes) {
        targetNodeIds.add(node.id);
      }
      break;
    }
    case "polygon": {
      if (lassoPolygon && lassoPolygon.length >= 3) {
        const posMap = new Map<string, PositionedNode>();
        for (const pn of positionedNodes) {
          posMap.set(pn.id, pn);
        }

        for (const node of dataset.nodes) {
          const pn = posMap.get(node.id);
          if (pn) {
            if (isNodeInPolygon(pn, lassoPolygon, polygonContainmentMode)) {
              targetNodeIds.add(node.id);
            }
          }
        }
      }
      break;
    }
    case "closure": {
      const roots = new Set<string>(
        selectedNodeIds instanceof Set ? selectedNodeIds : selectedNodeIds,
      );
      const effectiveClosureOptions: ClosureOptions = closureOptions ?? {
        direction: "downstream",
        maxDepth: Infinity,
        includeRootNodes: true,
      };
      const closureResult = computeTransitiveClosure(dataset, roots, effectiveClosureOptions);
      for (const id of closureResult) {
        targetNodeIds.add(id);
      }
      break;
    }
    case "section": {
      const allowedSections = new Set(sectionIds ?? []);
      const datasetSections = dataset.sections ?? [];
      for (const section of datasetSections) {
        if (allowedSections.has(section.id)) {
          for (const nid of section.nodeIds) {
            targetNodeIds.add(nid);
          }
        }
      }
      break;
    }
    case "selection":
    default: {
      const ids = selectedNodeIds instanceof Set ? selectedNodeIds : selectedNodeIds;
      for (const id of ids) {
        targetNodeIds.add(id);
      }
      break;
    }
  }

  // 2. Filter nodes
  const extractedNodes: GraphNodeData[] = dataset.nodes.filter((node) =>
    targetNodeIds.has(node.id),
  );
  const validNodeIds = new Set<string>(extractedNodes.map((n) => n.id));

  // 3. Filter positioned nodes
  const extractedPositionedNodes: PositionedNode[] = positionedNodes.filter((pn) =>
    validNodeIds.has(pn.id),
  );

  // 4. Classify internal and boundary edges
  const internalEdges: GraphEdgeData[] = [];
  const boundaryEdges: BoundaryEdge[] = [];
  let incomingCount = 0;
  let outgoingCount = 0;

  for (const edge of dataset.edges) {
    const sourceIn = validNodeIds.has(edge.source);
    const targetIn = validNodeIds.has(edge.target);

    if (sourceIn && targetIn) {
      internalEdges.push(edge);
    } else if (sourceIn && !targetIn) {
      outgoingCount++;
      boundaryEdges.push({
        edge,
        boundaryType: "outgoing",
        internalNodeId: edge.source,
        externalNodeId: edge.target,
      });
    } else if (!sourceIn && targetIn) {
      incomingCount++;
      boundaryEdges.push({
        edge,
        boundaryType: "incoming",
        internalNodeId: edge.target,
        externalNodeId: edge.source,
      });
    }
  }

  // 5. Determine subgraph edges based on boundary edge policy
  const combinedEdges: GraphEdgeData[] = [...internalEdges];
  if (boundaryEdgePolicy === "outgoing" || boundaryEdgePolicy === "all") {
    for (const be of boundaryEdges) {
      if (be.boundaryType === "outgoing") {
        combinedEdges.push(be.edge);
      }
    }
  }
  if (boundaryEdgePolicy === "incoming" || boundaryEdgePolicy === "all") {
    for (const be of boundaryEdges) {
      if (be.boundaryType === "incoming") {
        combinedEdges.push(be.edge);
      }
    }
  }

  // 6. Filter sections
  const extractedSections: GraphSection[] = [];
  if (dataset.sections) {
    for (const sec of dataset.sections) {
      const retainedNodeIds = sec.nodeIds.filter((nid) => validNodeIds.has(nid));
      if (retainedNodeIds.length > 0) {
        extractedSections.push({
          ...sec,
          nodeIds: retainedNodeIds,
        });
      }
    }
  }

  // 7. Filter bookmarks / annotations
  const extractedAnnotations: CanvasAnnotation[] = [];
  if (includeAnnotations && annotations.length > 0) {
    for (const ann of annotations) {
      if (ann.nodeId && validNodeIds.has(ann.nodeId)) {
        extractedAnnotations.push(ann);
      } else if (
        ann.coordinates &&
        mode === "polygon" &&
        lassoPolygon &&
        lassoPolygon.length >= 3
      ) {
        if (isPointInPolygon(ann.coordinates, lassoPolygon)) {
          extractedAnnotations.push(ann);
        }
      }
    }
  }

  // 8. Compute metrics and stats
  let totalTokens = 0;
  let totalDurationMs = 0;
  let totalCostUsd = 0;

  for (const node of extractedNodes) {
    if (node.metrics) {
      const m = node.metrics;
      if (typeof m.tokensIn === "number") totalTokens += m.tokensIn;
      if (typeof m.tokensOut === "number") totalTokens += m.tokensOut;
      if (typeof m.tokens?.totalTokens === "number") totalTokens += m.tokens.totalTokens;
      if (typeof m.durationMs === "number") totalDurationMs += m.durationMs;
      if (typeof m.costUsd === "number") totalCostUsd += m.costUsd;
    }
  }

  const stats: SubgraphStats = {
    nodeCount: extractedNodes.length,
    internalEdgeCount: internalEdges.length,
    boundaryIncomingCount: incomingCount,
    boundaryOutgoingCount: outgoingCount,
    boundaryTotalCount: incomingCount + outgoingCount,
    annotationCount: extractedAnnotations.length,
    sectionCount: extractedSections.length,
    totalTokens,
    totalDurationMs,
    totalCostUsd: Number(totalCostUsd.toFixed(4)),
  };

  const subgraphDataset: GraphDataset = {
    id: `${dataset.id || "subgraph"}-extract`,
    title: `${dataset.title || "Graph"} (Subgraph)`,
    description: dataset.description
      ? `Extracted subgraph from: ${dataset.description}`
      : `Extracted subgraph from dataset ${dataset.id || "unknown"}`,
    directed: dataset.directed !== false,
    entry: dataset.entry && validNodeIds.has(dataset.entry) ? dataset.entry : undefined,
    exits: dataset.exits ? dataset.exits.filter((e) => validNodeIds.has(e)) : undefined,
    sections: extractedSections.length > 0 ? extractedSections : undefined,
    nodes: extractedNodes,
    edges: combinedEdges,
  };

  return {
    dataset: subgraphDataset,
    boundaryEdges,
    annotations: extractedAnnotations,
    positionedNodes: extractedPositionedNodes,
    nodeIds: validNodeIds,
    stats,
  };
}
