import {
  ForceSimulation,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRank,
  type SimulationLink,
  type SimulationNode,
} from "../force";
import { decycleGraph } from "../sugiyama/decycle";
import { assignRanksAndDummyNodes } from "../sugiyama/ranking";
import type { SugiyamaEdge, SugiyamaNode } from "../sugiyama/types";

export interface HybridLayoutOptions {
  rankSeparation?: number;
  nodeSeparation?: number;
  charge?: number;
  linkDistance?: number;
  linkStrength?: number;
  centerForce?: number;
  collisionPadding?: number;
  alphaDecay?: number;
  velocityDecay?: number;
  maxIterations?: number;
  energyThreshold?: number;
  randomSeed?: number;
}

export interface HybridLayoutResult {
  nodes: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rank: number;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    points: Array<{ x: number; y: number }>;
    isReversed?: boolean;
    isCycle?: boolean;
  }>;
  width: number;
  height: number;
}

/**
 * Hybrid Dynamic Force-Directed & Hierarchical Sugiyama DAG Layout Engine.
 * Combines topological DAG ranking with continuous force-directed spatial relaxation
 * and bounding box collision avoidance.
 */
export function computeHybridLayout(
  nodes: SugiyamaNode[],
  edges: SugiyamaEdge[],
  options: HybridLayoutOptions = {},
): HybridLayoutResult {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const rankSep = options.rankSeparation ?? 120;
  const nodeSep = options.nodeSeparation ?? 60;
  const chargeVal = options.charge ?? -400;
  const linkDist = options.linkDistance ?? 100;
  const linkStr = options.linkStrength ?? 0.8;
  const padding = options.collisionPadding ?? 24;
  const maxIters = options.maxIterations ?? 250;
  const energyThresh = options.energyThreshold ?? 1e-4;

  // 1. Topological Rank Discovery
  const decycle = decycleGraph(nodes, edges);
  const ranking = assignRanksAndDummyNodes(nodes, decycle.edges);

  const rankMap = new Map<string, number>();
  for (let r = 0; r < ranking.ranks.length; r++) {
    for (const n of ranking.ranks[r] ?? []) {
      if (!n.isVirtual) {
        rankMap.set(n.id, r);
      }
    }
  }

  // 2. Prepare Simulation Nodes
  const simNodes: SimulationNode[] = nodes.map((n) => {
    const rank = rankMap.get(n.id) ?? n.rank ?? 0;
    const initialY = rank * rankSep;

    return {
      id: n.id,
      x: 0,
      y: initialY,
      vx: 0,
      vy: 0,
      width: n.width,
      height: n.height,
      rank,
      charge: chargeVal,
      data: n,
    };
  });

  // Distribute initial X positions by rank
  const nodesByRank = new Map<number, SimulationNode[]>();
  for (const sn of simNodes) {
    const r = sn.rank ?? 0;
    if (!nodesByRank.has(r)) nodesByRank.set(r, []);
    nodesByRank.get(r)?.push(sn);
  }

  for (const layer of nodesByRank.values()) {
    const count = layer.length;
    for (let i = 0; i < count; i++) {
      const sn = layer[i]!;
      sn.x = (i - (count - 1) * 0.5) * (nodeSep + 120);
    }
  }

  // 3. Prepare Simulation Links
  const simLinks: SimulationLink[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    distance: linkDist,
    strength: linkStr,
    weight: e.weight ?? 1,
  }));

  // 4. Build Simulation with Hybrid Forces
  const sim = new ForceSimulation(simNodes, {
    alpha: 1.0,
    alphaMin: 0.001,
    alphaDecay: options.alphaDecay ?? 0.02,
    velocityDecay: options.velocityDecay ?? 0.65,
    energyThreshold: energyThresh,
    maxIterations: maxIters,
    randomSeed: options.randomSeed ?? 1337,
  });

  sim.force("many-body", forceManyBody({ charge: chargeVal, theta: 0.8 }));
  sim.force("link", forceLink(simLinks, { distance: linkDist, strength: linkStr }));
  sim.force("collide", forceCollide({ padding, strength: 0.9, useBoundingBox: true }));
  sim.force("rank", forceRank({ rankSeparation: rankSep, strength: 0.9, axis: "y" }));
  sim.force(
    "center",
    forceCenter(0, ranking.ranks.length * rankSep * 0.5, { strength: options.centerForce ?? 0.05 }),
  );

  // Run simulation to convergence
  sim.run(maxIters);

  // 5. Post-relaxation hierarchy and overlap guarantee
  for (const sn of simNodes) {
    const targetY = (sn.rank ?? 0) * rankSep;
    sn.y = targetY; // Strictly anchor rank level
  }

  // Final collision resolution pass along horizontal axis within each layer
  for (const layer of nodesByRank.values()) {
    layer.sort((a, b) => a.x - b.x);
    for (let i = 1; i < layer.length; i++) {
      const prev = layer[i - 1]!;
      const curr = layer[i]!;
      const minX = prev.x + (prev.width ?? 120) * 0.5 + padding + (curr.width ?? 120) * 0.5;
      if (curr.x < minX) {
        curr.x = minX;
      }
    }
  }

  // 6. Build Result Nodes & Edges
  const nodePosMap = new Map<string, SimulationNode>(simNodes.map((n) => [n.id, n]));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const resultNodes = simNodes.map((sn) => {
    const w = sn.width ?? 120;
    const h = sn.height ?? 60;
    if (sn.x - w / 2 < minX) minX = sn.x - w / 2;
    if (sn.x + w / 2 > maxX) maxX = sn.x + w / 2;
    if (sn.y - h / 2 < minY) minY = sn.y - h / 2;
    if (sn.y + h / 2 > maxY) maxY = sn.y + h / 2;

    return {
      id: sn.id,
      x: sn.x,
      y: sn.y,
      width: w,
      height: h,
      rank: sn.rank ?? 0,
    };
  });

  const resultEdges = edges.map((e) => {
    const src = nodePosMap.get(e.source);
    const tgt = nodePosMap.get(e.target);
    const points: Array<{ x: number; y: number }> = [];

    if (src && tgt) {
      const srcY = src.y + (src.height ?? 60) * 0.5;
      const tgtY = tgt.y - (tgt.height ?? 60) * 0.5;
      points.push({ x: src.x, y: srcY });

      // If spanning more than 1 rank, add intermediate curvature control points
      if (Math.abs((tgt.rank ?? 0) - (src.rank ?? 0)) > 1) {
        const midY = (srcY + tgtY) * 0.5;
        points.push({ x: (src.x + tgt.x) * 0.5, y: midY });
      }

      points.push({ x: tgt.x, y: tgtY });
    }

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      points,
      isReversed: e.isReversed,
      isCycle: e.isCycle,
    };
  });

  const totalWidth = Math.max(100, maxX - (minX === Infinity ? 0 : minX) + 80);
  const totalHeight = Math.max(100, maxY - (minY === Infinity ? 0 : minY) + 80);

  return {
    nodes: resultNodes,
    edges: resultEdges,
    width: totalWidth,
    height: totalHeight,
  };
}
