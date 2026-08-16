import type { SugiyamaEdge, SugiyamaNode, SugiyamaOptions } from "./types";

export interface CoordinateAssignmentResult {
  nodes: SugiyamaNode[];
  edges: SugiyamaEdge[];
  width: number;
  height: number;
}

/**
 * Phase 4: Assign X and Y coordinates to all nodes and compute edge polyline waypoints.
 */
export function assignCoordinates(
  ranks: SugiyamaNode[][],
  segmentEdges: SugiyamaEdge[],
  originalEdges: SugiyamaEdge[],
  options: SugiyamaOptions = {},
): CoordinateAssignmentResult {
  const rankSep = options.rankSeparation ?? 100;
  const nodeSep = options.nodeSeparation ?? 50;
  const direction = options.direction ?? "TB";

  const numRanks = ranks.length;
  if (numRanks === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  // 1. Calculate layer max heights
  const layerHeights: number[] = new Array(numRanks).fill(0);
  for (let r = 0; r < numRanks; r++) {
    let maxH = 40;
    for (const node of ranks[r] ?? []) {
      if (!node.isVirtual && node.height > maxH) {
        maxH = node.height;
      }
    }
    layerHeights[r] = maxH;
  }

  // 2. Assign Y coordinates per rank
  const rankY: number[] = new Array(numRanks).fill(0);
  let currentY = (layerHeights[0] ?? 40) * 0.5;
  rankY[0] = currentY;

  for (let r = 1; r < numRanks; r++) {
    const prevH = layerHeights[r - 1] ?? 40;
    const currH = layerHeights[r] ?? 40;
    currentY += prevH * 0.5 + rankSep + currH * 0.5;
    rankY[r] = currentY;
  }

  // 3. Initial X coordinates by packing within layer
  let maxLayerWidth = 0;
  const layerWidths: number[] = new Array(numRanks).fill(0);

  for (let r = 0; r < numRanks; r++) {
    const layer = ranks[r] ?? [];
    let curX = 0;

    for (let i = 0; i < layer.length; i++) {
      const node = layer[i]!;
      const w = node.isVirtual ? 20 : node.width;
      if (i > 0) {
        const prev = layer[i - 1]!;
        const prevW = prev.isVirtual ? 20 : prev.width;
        curX += prevW * 0.5 + nodeSep + w * 0.5;
      } else {
        curX = w * 0.5;
      }
      node.x = curX;
      node.y = rankY[r];
    }

    const last = layer[layer.length - 1];
    const totalW = last ? (last.x ?? 0) + (last.isVirtual ? 10 : last.width * 0.5) : 0;
    layerWidths[r] = totalW;
    if (totalW > maxLayerWidth) maxLayerWidth = totalW;
  }

  // 4. Center layers and align dummy chains
  for (let r = 0; r < numRanks; r++) {
    const layer = ranks[r] ?? [];
    const lw = layerWidths[r] ?? 0;
    const offset = (maxLayerWidth - lw) * 0.5;
    for (const node of layer) {
      if (node.x !== undefined) {
        node.x += offset;
      }
    }
  }

  // Dummy chain vertical straightening passes
  for (let sweep = 0; sweep < 3; sweep++) {
    for (let r = 1; r < numRanks; r++) {
      const layer = ranks[r] ?? [];
      for (const node of layer) {
        if (node.isVirtual && node.originalEdgeId) {
          // Find dummy parent
          const parentEdge = segmentEdges.find((e) => e.target === node.id);
          if (parentEdge) {
            const parent = findNodeInRanks(ranks, parentEdge.source);
            if (parent && parent.x !== undefined) {
              node.x = parent.x;
            }
          }
        }
      }

      // Re-compact layer to prevent overlaps after straightening
      resolveLayerOverlaps(layer, nodeSep);
    }
  }

  // 5. Build edge paths from waypoints (combining dummy nodes)
  const nodeMap = new Map<string, SugiyamaNode>();
  for (const layer of ranks) {
    for (const n of layer) {
      nodeMap.set(n.id, n);
    }
  }

  // Group segment edges by original edge ID
  const segmentsByOriginal = new Map<string, SugiyamaEdge[]>();
  for (const seg of segmentEdges) {
    const origId = seg.id.startsWith("seg_") ? getOriginalEdgeId(seg, nodeMap) : seg.id;
    if (!segmentsByOriginal.has(origId)) {
      segmentsByOriginal.set(origId, []);
    }
    segmentsByOriginal.get(origId)?.push(seg);
  }

  const finalEdges: SugiyamaEdge[] = originalEdges.map((orig) => {
    const segments = segmentsByOriginal.get(orig.id) || [];
    const points: Array<{ x: number; y: number }> = [];

    const srcNode = nodeMap.get(orig.source);
    const tgtNode = nodeMap.get(orig.target);

    if (srcNode && tgtNode) {
      // Start point
      points.push({
        x: srcNode.x ?? 0,
        y: (srcNode.y ?? 0) + (srcNode.isVirtual ? 0 : srcNode.height * 0.5),
      });

      // Intermediate dummy points
      if (segments.length > 1) {
        // Trace chain from srcNode to tgtNode
        let curr = orig.source;
        for (let step = 0; step < segments.length - 1; step++) {
          const nextSeg = segments.find((s) => s.source === curr);
          if (nextSeg) {
            const dummy = nodeMap.get(nextSeg.target);
            if (dummy && dummy.isVirtual) {
              points.push({ x: dummy.x ?? 0, y: dummy.y ?? 0 });
              curr = dummy.id;
            }
          }
        }
      }

      // End point
      points.push({
        x: tgtNode.x ?? 0,
        y: (tgtNode.y ?? 0) - (tgtNode.isVirtual ? 0 : tgtNode.height * 0.5),
      });
    }

    return {
      ...orig,
      points,
    };
  });

  // Extract non-virtual nodes for result
  const realNodes: SugiyamaNode[] = [];
  let finalMinX = Infinity;
  let finalMinY = Infinity;
  let finalMaxX = -Infinity;
  let finalMaxY = -Infinity;

  for (const layer of ranks) {
    for (const n of layer) {
      if (!n.isVirtual) {
        realNodes.push(n);
      }
      const nx = n.x ?? 0;
      const ny = n.y ?? 0;
      const nw = n.isVirtual ? 0 : n.width;
      const nh = n.isVirtual ? 0 : n.height;

      if (nx - nw / 2 < finalMinX) finalMinX = nx - nw / 2;
      if (nx + nw / 2 > finalMaxX) finalMaxX = nx + nw / 2;
      if (ny - nh / 2 < finalMinY) finalMinY = ny - nh / 2;
      if (ny + nh / 2 > finalMaxY) finalMaxY = ny + nh / 2;
    }
  }

  // Handle direction transformation if not TB
  if (direction === "LR" || direction === "RL" || direction === "BT") {
    transformDirection(realNodes, finalEdges, direction);
  }

  const totalWidth = Math.max(100, finalMaxX - (finalMinX === Infinity ? 0 : finalMinX) + 80);
  const totalHeight = Math.max(100, finalMaxY - (finalMinY === Infinity ? 0 : finalMinY) + 80);

  return {
    nodes: realNodes,
    edges: finalEdges,
    width: totalWidth,
    height: totalHeight,
  };
}

function findNodeInRanks(ranks: SugiyamaNode[][], id: string): SugiyamaNode | undefined {
  for (const layer of ranks) {
    for (const n of layer) {
      if (n.id === id) return n;
    }
  }
  return undefined;
}

function getOriginalEdgeId(seg: SugiyamaEdge, nodeMap: Map<string, SugiyamaNode>): string {
  const target = nodeMap.get(seg.target);
  if (target?.originalEdgeId) return target.originalEdgeId;
  const source = nodeMap.get(seg.source);
  if (source?.originalEdgeId) return source.originalEdgeId;
  return seg.id;
}

function resolveLayerOverlaps(layer: SugiyamaNode[], nodeSep: number): void {
  for (let i = 1; i < layer.length; i++) {
    const prev = layer[i - 1]!;
    const curr = layer[i]!;
    const prevW = prev.isVirtual ? 20 : prev.width;
    const currW = curr.isVirtual ? 20 : curr.width;
    const minX = (prev.x ?? 0) + prevW * 0.5 + nodeSep + currW * 0.5;
    if ((curr.x ?? 0) < minX) {
      curr.x = minX;
    }
  }
}

function transformDirection(
  nodes: SugiyamaNode[],
  edges: SugiyamaEdge[],
  direction: "TB" | "BT" | "LR" | "RL",
): void {
  for (const node of nodes) {
    if (node.x === undefined || node.y === undefined) continue;
    if (direction === "LR") {
      const temp = node.x;
      node.x = node.y;
      node.y = temp;
    } else if (direction === "BT") {
      node.y = -node.y;
    } else if (direction === "RL") {
      const temp = node.x;
      node.x = -node.y;
      node.y = temp;
    }
  }

  for (const edge of edges) {
    if (!edge.points) continue;
    for (const pt of edge.points) {
      if (direction === "LR") {
        const temp = pt.x;
        pt.x = pt.y;
        pt.y = temp;
      } else if (direction === "BT") {
        pt.y = -pt.y;
      } else if (direction === "RL") {
        const temp = pt.x;
        pt.x = -pt.y;
        pt.y = temp;
      }
    }
  }
}
