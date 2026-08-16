import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";
import { buildEdgePath } from "./custom/edgePath";
import { getDefaultMeasurer } from "./measurement";
import {
  ForceSimulation,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  type SimulationLink,
  type SimulationNode,
} from "./force";
import { computeSugiyamaLayout } from "./sugiyama/sugiyamaLayout";
import type { SugiyamaEdge, SugiyamaNode } from "./sugiyama/types";
import { computeHybridLayout } from "./hybrid/hybridLayout";
import { computeRadialLayout } from "./geometric/radialLayout";
import { computeGridLayout } from "./geometric/gridLayout";
import { computeCustomEngineGraphLayout } from "./customLayoutAdapter";
import type { EdgeStyle } from "./custom/config";

export type LayoutAlgorithm =
  | "force"
  | "dag-sugiyama"
  | "hybrid-force-dag"
  | "radial"
  | "grid"
  | "layered"
  | "sugiyama"
  | "hybrid"
  | "force-directed";

export interface DynamicLayoutOptions {
  algorithm?: LayoutAlgorithm | string;
  charge?: number;
  linkDistance?: number;
  linkStrength?: number;
  centerForce?: number;
  alphaDecay?: number;
  velocityDecay?: number;
  collisionRadius?: number;
  nodePadding?: number;
  theta?: number;
  rankSeparation?: number;
  nodeSeparation?: number;
  maxIterations?: number;
  energyThreshold?: number;
  randomSeed?: number;
  edgeStyle?: EdgeStyle;
  cornerRadius?: number;
  columns?: number;
  useCache?: boolean;
}

export interface DynamicLayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  algorithm: string;
  iterations?: number;
  converged?: boolean;
  durationMs?: number;
}

// In-memory LRU cache for deterministic layout results
const MAX_CACHE_SIZE = 100;
const layoutCache = new Map<string, { nodes: PositionedNode[]; edges: PositionedEdge[] }>();

export function computeDatasetHash(
  dataset: GraphDataset,
  options: DynamicLayoutOptions = {},
): string {
  const nodeSig = dataset.nodes.map((n) => `${n.id}:${n.rank ?? ""}:${n.group ?? ""}`).join(";");
  const edgeSig = dataset.edges
    .map((e) => `${e.id || ""}:${e.source}->${e.target}:${e.weight ?? ""}`)
    .join(";");
  const optSig = JSON.stringify({
    alg: options.algorithm ?? "hybrid-force-dag",
    c: options.charge,
    ld: options.linkDistance,
    ls: options.linkStrength,
    rs: options.rankSeparation,
    ns: options.nodeSeparation,
    seed: options.randomSeed,
  });
  return `${dataset.id || "ds"}#${dataset.nodes.length}n#${dataset.edges.length}e#${nodeSig}#${edgeSig}#${optSig}`;
}

export function clearDynamicLayoutCache(): void {
  layoutCache.clear();
}

/**
 * Normalizes algorithm name to standard key.
 */
export function normalizeAlgorithm(
  alg?: string,
): "force" | "dag-sugiyama" | "hybrid-force-dag" | "radial" | "grid" | "layered" {
  if (!alg) return "hybrid-force-dag";
  const lower = alg.toLowerCase().trim();
  if (lower === "force" || lower === "force-directed") return "force";
  if (lower === "dag-sugiyama" || lower === "sugiyama" || lower === "dag") return "dag-sugiyama";
  if (lower === "hybrid-force-dag" || lower === "hybrid" || lower === "hybrid-dag")
    return "hybrid-force-dag";
  if (lower === "radial") return "radial";
  if (lower === "grid") return "grid";
  if (lower === "layered" || lower === "top-down" || lower === "hierarchical") return "layered";
  return "hybrid-force-dag";
}

/**
 * Universal dynamic layout calculation engine supporting all algorithms:
 * - force: Barnes-Hut n-body spatial repulsion + spring attraction + collision
 * - dag-sugiyama: 4-phase decycling, ranking, crossing reduction, coordinate assignment
 * - hybrid-force-dag: Sugiyama topological DAG ranking with continuous force relaxation
 * - radial: Concentric hierarchical radial layout
 * - grid: Structured matrix layout
 * - layered: Custom WASM layout with fallback
 */
export async function computeDynamicLayout(
  dataset: GraphDataset,
  options: DynamicLayoutOptions = {},
): Promise<DynamicLayoutResult> {
  const startTime = typeof performance !== "undefined" ? performance.now() : Date.now();

  if (!dataset || dataset.nodes.length === 0) {
    return {
      nodes: [],
      edges: [],
      algorithm: options.algorithm ?? "hybrid-force-dag",
      iterations: 0,
      converged: true,
      durationMs: 0,
    };
  }

  // Check cache
  const cacheKey = computeDatasetHash(dataset, options);
  if (options.useCache !== false && layoutCache.has(cacheKey)) {
    const cached = layoutCache.get(cacheKey)!;
    return {
      nodes: cached.nodes,
      edges: cached.edges,
      algorithm: normalizeAlgorithm(options.algorithm),
      converged: true,
      durationMs: 0,
    };
  }

  const algorithm = normalizeAlgorithm(options.algorithm);
  const measurer = getDefaultMeasurer();
  const nodeSizes = measurer.measureNodes(dataset.nodes);

  const edgeStyle: EdgeStyle = options.edgeStyle ?? "rounded";
  const cornerRadius: number = options.cornerRadius ?? 8;

  let positionedNodes: PositionedNode[] = [];
  let positionedEdges: PositionedEdge[] = [];
  let iters = 0;
  let converged = true;

  if (algorithm === "layered") {
    try {
      const res = await computeCustomEngineGraphLayout(dataset);
      positionedNodes = res.nodes;
      positionedEdges = res.edges;
    } catch {
      // Fallback to Sugiyama if WASM fails
      const sugiyamaNodes: SugiyamaNode[] = dataset.nodes.map((n, i) => ({
        id: n.id,
        name: n.name,
        width: nodeSizes[i]?.width ?? 120,
        height: nodeSizes[i]?.height ?? 60,
        rank: n.rank,
        group: n.group,
        data: n,
      }));
      const sugiyamaEdges: SugiyamaEdge[] = dataset.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        weight: e.weight,
        minLen: e.minLen,
      }));
      const res = computeSugiyamaLayout(sugiyamaNodes, sugiyamaEdges, {
        rankSeparation: options.rankSeparation,
        nodeSeparation: options.nodeSeparation,
      });
      const resMap = new Map(res.nodes.map((n) => [n.id, n]));
      positionedNodes = dataset.nodes.map((n) => {
        const p = resMap.get(n.id) ?? { x: 0, y: 0, width: 120, height: 60 };
        return { ...n, x: p.x ?? 0, y: p.y ?? 0, width: p.width, height: p.height };
      });
      positionedEdges = mapEdgesToPositioned(
        dataset.edges,
        res.edges,
        positionedNodes,
        edgeStyle,
        cornerRadius,
      );
    }
  } else if (algorithm === "dag-sugiyama") {
    const sugiyamaNodes: SugiyamaNode[] = dataset.nodes.map((n, i) => ({
      id: n.id,
      name: n.name,
      width: nodeSizes[i]?.width ?? 120,
      height: nodeSizes[i]?.height ?? 60,
      rank: n.rank,
      group: n.group,
      data: n,
    }));
    const sugiyamaEdges: SugiyamaEdge[] = dataset.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      weight: e.weight,
      minLen: e.minLen,
    }));
    const res = computeSugiyamaLayout(sugiyamaNodes, sugiyamaEdges, {
      rankSeparation: options.rankSeparation,
      nodeSeparation: options.nodeSeparation,
    });
    const resMap = new Map(res.nodes.map((n) => [n.id, n]));
    positionedNodes = dataset.nodes.map((n) => {
      const p = resMap.get(n.id) ?? { x: 0, y: 0, width: 120, height: 60 };
      return { ...n, x: p.x ?? 0, y: p.y ?? 0, width: p.width, height: p.height };
    });
    positionedEdges = mapEdgesToPositioned(
      dataset.edges,
      res.edges,
      positionedNodes,
      edgeStyle,
      cornerRadius,
    );
  } else if (algorithm === "hybrid-force-dag") {
    const sugiyamaNodes: SugiyamaNode[] = dataset.nodes.map((n, i) => ({
      id: n.id,
      name: n.name,
      width: nodeSizes[i]?.width ?? 120,
      height: nodeSizes[i]?.height ?? 60,
      rank: n.rank,
      group: n.group,
      data: n,
    }));
    const sugiyamaEdges: SugiyamaEdge[] = dataset.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      weight: e.weight,
      minLen: e.minLen,
    }));
    const res = computeHybridLayout(sugiyamaNodes, sugiyamaEdges, {
      rankSeparation: options.rankSeparation,
      nodeSeparation: options.nodeSeparation,
      charge: options.charge,
      linkDistance: options.linkDistance,
      linkStrength: options.linkStrength,
      centerForce: options.centerForce,
      collisionPadding: options.nodePadding,
      alphaDecay: options.alphaDecay,
      velocityDecay: options.velocityDecay,
      maxIterations: options.maxIterations,
      energyThreshold: options.energyThreshold,
      randomSeed: options.randomSeed,
    });
    const resMap = new Map(res.nodes.map((n) => [n.id, n]));
    positionedNodes = dataset.nodes.map((n) => {
      const p = resMap.get(n.id) ?? { x: 0, y: 0, width: 120, height: 60 };
      return { ...n, x: p.x, y: p.y, width: p.width, height: p.height };
    });
    positionedEdges = mapEdgesToPositioned(
      dataset.edges,
      res.edges,
      positionedNodes,
      edgeStyle,
      cornerRadius,
    );
  } else if (algorithm === "radial") {
    const sugiyamaNodes: SugiyamaNode[] = dataset.nodes.map((n, i) => ({
      id: n.id,
      name: n.name,
      width: nodeSizes[i]?.width ?? 120,
      height: nodeSizes[i]?.height ?? 60,
      rank: n.rank,
      group: n.group,
      data: n,
    }));
    const sugiyamaEdges: SugiyamaEdge[] = dataset.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));
    const res = computeRadialLayout(sugiyamaNodes, sugiyamaEdges, {
      radiusStep: options.rankSeparation ?? 180,
    });
    const resMap = new Map(res.nodes.map((n) => [n.id, n]));
    positionedNodes = dataset.nodes.map((n) => {
      const p = resMap.get(n.id) ?? { x: 0, y: 0, width: 120, height: 60 };
      return { ...n, x: p.x, y: p.y, width: p.width, height: p.height };
    });
    positionedEdges = mapEdgesToPositioned(
      dataset.edges,
      res.edges,
      positionedNodes,
      edgeStyle,
      cornerRadius,
    );
  } else if (algorithm === "grid") {
    const sugiyamaNodes: SugiyamaNode[] = dataset.nodes.map((n, i) => ({
      id: n.id,
      name: n.name,
      width: nodeSizes[i]?.width ?? 120,
      height: nodeSizes[i]?.height ?? 60,
      rank: n.rank,
      group: n.group,
      data: n,
    }));
    const sugiyamaEdges: SugiyamaEdge[] = dataset.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));
    const res = computeGridLayout(sugiyamaNodes, sugiyamaEdges, {
      columns: options.columns,
      rowGap: options.rankSeparation ?? 50,
      columnGap: options.nodeSeparation ?? 60,
    });
    const resMap = new Map(res.nodes.map((n) => [n.id, n]));
    positionedNodes = dataset.nodes.map((n) => {
      const p = resMap.get(n.id) ?? { x: 0, y: 0, width: 120, height: 60 };
      return { ...n, x: p.x, y: p.y, width: p.width, height: p.height };
    });
    positionedEdges = mapEdgesToPositioned(
      dataset.edges,
      res.edges,
      positionedNodes,
      edgeStyle,
      cornerRadius,
    );
  } else {
    // Pure Force-directed
    const simNodes: SimulationNode[] = dataset.nodes.map((n, i) => ({
      id: n.id,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      width: nodeSizes[i]?.width ?? 120,
      height: nodeSizes[i]?.height ?? 60,
      charge: options.charge ?? -350,
      rank: n.rank,
      group: n.group,
    }));

    const simLinks: SimulationLink[] = dataset.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      distance: options.linkDistance ?? 120,
      strength: options.linkStrength ?? 0.7,
      weight: e.weight ?? 1,
    }));

    const sim = new ForceSimulation(simNodes, {
      alpha: 1.0,
      alphaMin: 0.001,
      alphaDecay: options.alphaDecay ?? 0.0228,
      velocityDecay: options.velocityDecay ?? 0.6,
      energyThreshold: options.energyThreshold ?? 1e-4,
      maxIterations: options.maxIterations ?? 300,
      randomSeed: options.randomSeed ?? 42,
    });

    sim.force(
      "many-body",
      forceManyBody({ charge: options.charge ?? -350, theta: options.theta ?? 0.8 }),
    );
    sim.force(
      "link",
      forceLink(simLinks, {
        distance: options.linkDistance ?? 120,
        strength: options.linkStrength ?? 0.7,
      }),
    );
    sim.force(
      "collide",
      forceCollide({ padding: options.nodePadding ?? 24, strength: 0.85, useBoundingBox: true }),
    );
    sim.force("center", forceCenter(0, 0, { strength: options.centerForce ?? 0.08 }));

    sim.run(options.maxIterations ?? 300);
    iters = sim.iteration();
    converged = sim.isConverged();

    const nodePosMap = new Map(simNodes.map((n) => [n.id, n]));
    positionedNodes = dataset.nodes.map((n) => {
      const pos = nodePosMap.get(n.id) ?? { x: 0, y: 0, width: 120, height: 60 };
      return {
        ...n,
        x: pos.x,
        y: pos.y,
        width: pos.width ?? 120,
        height: pos.height ?? 60,
      };
    });

    const edgeMap = new Map<string, Array<{ x: number; y: number }>>();
    for (const e of dataset.edges) {
      const src = nodePosMap.get(e.source);
      const tgt = nodePosMap.get(e.target);
      if (src && tgt) {
        edgeMap.set(e.id, [
          { x: src.x, y: src.y },
          { x: tgt.x, y: tgt.y },
        ]);
      }
    }

    positionedEdges = dataset.edges.map((e) => {
      const points = edgeMap.get(e.id) || [];
      const path = buildEdgePath(points, edgeStyle, cornerRadius);
      const mid =
        points.length >= 2
          ? {
              x: (points[0]!.x + points[points.length - 1]!.x) * 0.5,
              y: (points[0]!.y + points[points.length - 1]!.y) * 0.5,
            }
          : { x: 0, y: 0 };

      return {
        ...e,
        path,
        points,
        labelX: mid.x,
        labelY: mid.y,
      };
    });
  }

  // Update LRU cache
  if (layoutCache.size >= MAX_CACHE_SIZE) {
    const firstKey = layoutCache.keys().next().value;
    if (firstKey) layoutCache.delete(firstKey);
  }
  layoutCache.set(cacheKey, { nodes: positionedNodes, edges: positionedEdges });

  const endTime = typeof performance !== "undefined" ? performance.now() : Date.now();
  const durationMs = Math.round((endTime - startTime) * 100) / 100;

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    algorithm,
    iterations: iters,
    converged,
    durationMs,
  };
}

/**
 * Creates an interactive ForceSimulation for continuous tick-by-tick animation.
 */
export function createDynamicLayoutSimulation(
  dataset: GraphDataset,
  options: DynamicLayoutOptions = {},
): ForceSimulation {
  const measurer = getDefaultMeasurer();
  const nodeSizes = measurer.measureNodes(dataset.nodes);

  const simNodes: SimulationNode[] = dataset.nodes.map((n, i) => ({
    id: n.id,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    width: nodeSizes[i]?.width ?? 120,
    height: nodeSizes[i]?.height ?? 60,
    charge: options.charge ?? -350,
    rank: n.rank,
    group: n.group,
    data: n,
  }));

  const simLinks: SimulationLink[] = dataset.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    distance: options.linkDistance ?? 120,
    strength: options.linkStrength ?? 0.7,
    weight: e.weight ?? 1,
    data: e,
  }));

  const sim = new ForceSimulation(simNodes, {
    alpha: 1.0,
    alphaMin: 0.001,
    alphaDecay: options.alphaDecay ?? 0.0228,
    velocityDecay: options.velocityDecay ?? 0.6,
    energyThreshold: options.energyThreshold ?? 1e-4,
    maxIterations: options.maxIterations ?? 300,
    randomSeed: options.randomSeed ?? 42,
  });

  sim.force(
    "many-body",
    forceManyBody({ charge: options.charge ?? -350, theta: options.theta ?? 0.8 }),
  );
  sim.force(
    "link",
    forceLink(simLinks, {
      distance: options.linkDistance ?? 120,
      strength: options.linkStrength ?? 0.7,
    }),
  );
  sim.force(
    "collide",
    forceCollide({ padding: options.nodePadding ?? 24, strength: 0.85, useBoundingBox: true }),
  );
  sim.force("center", forceCenter(0, 0, { strength: options.centerForce ?? 0.08 }));

  return sim;
}

function mapEdgesToPositioned(
  datasetEdges: GraphDataset["edges"],
  computedEdges: Array<{
    id: string;
    source: string;
    target: string;
    points?: Array<{ x: number; y: number }>;
  }>,
  nodes: PositionedNode[],
  edgeStyle: EdgeStyle,
  cornerRadius: number,
): PositionedEdge[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const computedMap = new Map(computedEdges.map((e) => [e.id, e]));

  return datasetEdges.map((edge) => {
    const comp = computedMap.get(edge.id);
    let points = comp?.points && comp.points.length >= 2 ? comp.points : [];

    if (points.length === 0) {
      const src = nodeMap.get(edge.source);
      const tgt = nodeMap.get(edge.target);
      if (src && tgt) {
        points = [
          { x: src.x, y: src.y + src.height * 0.5 },
          { x: tgt.x, y: tgt.y - tgt.height * 0.5 },
        ];
      }
    }

    const path = buildEdgePath(points, edgeStyle, cornerRadius);
    const mid =
      points.length >= 2
        ? {
            x: (points[0]!.x + points[points.length - 1]!.x) * 0.5,
            y: (points[0]!.y + points[points.length - 1]!.y) * 0.5,
          }
        : { x: 0, y: 0 };

    return {
      ...edge,
      path,
      points,
      labelX: mid.x,
      labelY: mid.y,
    };
  });
}
