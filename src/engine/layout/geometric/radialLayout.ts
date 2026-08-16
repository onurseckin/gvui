import type { SugiyamaEdge, SugiyamaNode } from "../sugiyama/types";

export interface RadialLayoutOptions {
  radiusStep?: number;
  center?: { x: number; y: number };
  startAngle?: number;
  sweepAngle?: number;
  rootId?: string;
  collisionPadding?: number;
}

export interface RadialLayoutResult {
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
    angle: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    points: Array<{ x: number; y: number }>;
  }>;
  width: number;
  height: number;
}

/**
 * Concentric Radial Hierarchy Layout Engine.
 */
export function computeRadialLayout(
  nodes: SugiyamaNode[],
  edges: SugiyamaEdge[],
  options: RadialLayoutOptions = {},
): RadialLayoutResult {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const radiusStep = options.radiusStep ?? 180;
  const cx = options.center?.x ?? 0;
  const cy = options.center?.y ?? 0;
  const startAngle = options.startAngle ?? 0;
  const sweepAngle = options.sweepAngle ?? Math.PI * 2;

  const nodeMap = new Map<string, SugiyamaNode>(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const n of nodes) {
    outgoing.set(n.id, []);
    incoming.set(n.id, []);
  }

  for (const e of edges) {
    if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
      outgoing.get(e.source)?.push(e.target);
      incoming.get(e.target)?.push(e.source);
    }
  }

  // Find root node: user specified or in-degree 0 or max out-degree
  let rootId = options.rootId;
  if (!rootId || !nodeMap.has(rootId)) {
    const candidates = nodes.filter((n) => (incoming.get(n.id)?.length ?? 0) === 0);
    if (candidates.length > 0 && candidates[0]) {
      rootId = candidates[0].id;
    } else {
      // Find node with highest degree
      let maxDeg = -1;
      let bestId = nodes[0]!.id;
      for (const n of nodes) {
        const deg = (outgoing.get(n.id)?.length ?? 0) + (incoming.get(n.id)?.length ?? 0);
        if (deg > maxDeg) {
          maxDeg = deg;
          bestId = n.id;
        }
      }
      rootId = bestId;
    }
  }

  // BFS to assign concentric depth shells
  const depthMap = new Map<string, number>();
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];
  visited.add(rootId);
  depthMap.set(rootId, 0);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const neighbors = [...(outgoing.get(curr.id) || []), ...(incoming.get(curr.id) || [])];

    for (const nextId of neighbors) {
      if (!visited.has(nextId)) {
        visited.add(nextId);
        depthMap.set(nextId, curr.depth + 1);
        queue.push({ id: nextId, depth: curr.depth + 1 });
      }
    }
  }

  // Handle any disconnected components
  for (const n of nodes) {
    if (!depthMap.has(n.id)) {
      depthMap.set(n.id, 1);
    }
  }

  // Group by depth
  const shells = new Map<number, SugiyamaNode[]>();
  let maxDepth = 0;
  for (const n of nodes) {
    const d = depthMap.get(n.id) ?? 0;
    if (d > maxDepth) maxDepth = d;
    if (!shells.has(d)) shells.set(d, []);
    shells.get(d)?.push(n);
  }

  // Assign angular positions
  const posMap = new Map<string, { x: number; y: number; angle: number; depth: number }>();

  // Root at center
  const rootNode = nodeMap.get(rootId);
  if (rootNode) {
    posMap.set(rootId, { x: cx, y: cy, angle: 0, depth: 0 });
  }

  for (const [depth, shellNodes] of shells.entries()) {
    if (depth === 0) continue;

    const r = depth * radiusStep;
    const count = shellNodes.length;
    const angleStep = sweepAngle / Math.max(1, count);

    for (let i = 0; i < count; i++) {
      const n = shellNodes[i]!;
      const angle = startAngle + i * angleStep;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      posMap.set(n.id, { x, y, angle, depth });
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const resultNodes = nodes.map((n) => {
    const pos = posMap.get(n.id) ?? { x: cx, y: cy, angle: 0, depth: 0 };
    const w = n.width ?? 120;
    const h = n.height ?? 60;

    if (pos.x - w / 2 < minX) minX = pos.x - w / 2;
    if (pos.x + w / 2 > maxX) maxX = pos.x + w / 2;
    if (pos.y - h / 2 < minY) minY = pos.y - h / 2;
    if (pos.y + h / 2 > maxY) maxY = pos.y + h / 2;

    return {
      id: n.id,
      x: pos.x,
      y: pos.y,
      width: w,
      height: h,
      depth: pos.depth,
      angle: pos.angle,
    };
  });

  const resultEdges = edges.map((e) => {
    const src = posMap.get(e.source) ?? { x: cx, y: cy };
    const tgt = posMap.get(e.target) ?? { x: cx, y: cy };
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      points: [
        { x: src.x, y: src.y },
        { x: tgt.x, y: tgt.y },
      ],
    };
  });

  return {
    nodes: resultNodes,
    edges: resultEdges,
    width: Math.max(100, maxX - (minX === Infinity ? 0 : minX) + 80),
    height: Math.max(100, maxY - (minY === Infinity ? 0 : minY) + 80),
  };
}
