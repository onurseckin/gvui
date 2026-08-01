import { describe, expect, it } from "bun:test";
import { computeCustomLayout } from "./computeCustomLayout";
import type { CustomLayoutResult, NormalizedEdge, NormalizedNode } from "./types";

const TEST_TIMEOUT_MS = 60000;
const CONFIG_OVERRIDE = { nodeGap: 100, obstacleClearance: 8 };

function createPRNG(seed: number): () => number {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function assertFiniteCoordinates(result: CustomLayoutResult): void {
  for (const n of result.nodes) {
    expect(Number.isFinite(n.x)).toBe(true);
    expect(Number.isFinite(n.y)).toBe(true);
    expect(Number.isFinite(n.width)).toBe(true);
    expect(Number.isFinite(n.height)).toBe(true);
  }
  for (const e of result.edges) {
    for (const p of e.points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  }
  for (const b of result.badges) {
    expect(Number.isFinite(b.rect.x)).toBe(true);
    expect(Number.isFinite(b.rect.y)).toBe(true);
    expect(Number.isFinite(b.rect.width)).toBe(true);
    expect(Number.isFinite(b.rect.height)).toBe(true);
    expect(Number.isFinite(b.anchorPoint.x)).toBe(true);
    expect(Number.isFinite(b.anchorPoint.y)).toBe(true);
  }
}

async function assertLayoutProperties(
  result: CustomLayoutResult,
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  initialResult?: CustomLayoutResult,
): Promise<void> {
  // 100% finite coordinates
  assertFiniteCoordinates(result);

  // Node and Edge count preservation
  expect(result.nodes.length).toBe(nodes.length);
  expect(result.edges.length).toBe(edges.length);

  if (!result.validation.isValid) {
    return;
  }

  expect(["success", "unresolved_soft_conflicts"]).toContain(result.status);
  expect(result.validation.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

  // Ordinary leaders must be 0
  expect(result.validation.metrics.ordinaryLeaderCount ?? 0).toBe(0);

  // No duplicate port points per node
  const nodePortPoints = new Map<string, string[]>();
  for (const route of result.edges) {
    if (route.sourcePort) {
      const srcNode = route.sourcePort.nodeId;
      const srcPt = `${route.sourcePort.point.x.toFixed(3)},${route.sourcePort.point.y.toFixed(3)}`;
      if (!nodePortPoints.has(srcNode)) nodePortPoints.set(srcNode, []);
      nodePortPoints.get(srcNode)!.push(srcPt);
    }
    if (route.targetPort) {
      const tgtNode = route.targetPort.nodeId;
      const tgtPt = `${route.targetPort.point.x.toFixed(3)},${route.targetPort.point.y.toFixed(3)}`;
      if (!nodePortPoints.has(tgtNode)) nodePortPoints.set(tgtNode, []);
      nodePortPoints.get(tgtNode)!.push(tgtPt);
    }
  }
  for (const pts of nodePortPoints.values()) {
    expect(new Set(pts).size).toBe(pts.length);
  }

  // Crossing count non-regression property
  if (initialResult && initialResult.validation.isValid) {
    expect(result.validation.metrics.crossingCount).toBeLessThanOrEqual(
      initialResult.validation.metrics.crossingCount,
    );
  }

  // Optimization stats stay within bounds
  if (result.optimizationStats) {
    expect(result.optimizationStats.globalPasses).toBeGreaterThanOrEqual(1);
    expect(result.optimizationStats.globalPasses).toBeLessThanOrEqual(16);
    expect(result.optimizationStats.evaluatedPortStates).toBeGreaterThanOrEqual(0);
    expect(result.optimizationStats.spacingExpansions).toBeGreaterThanOrEqual(0);
  }

  // Input reversal determinism
  const reversedNodes = [...nodes].reverse();
  const reversedEdges = [...edges].reverse();
  const resultReversed = await computeCustomLayout(reversedNodes, reversedEdges, CONFIG_OVERRIDE);
  expect(resultReversed.nodes).toEqual(result.nodes);
  expect(resultReversed.edges).toEqual(result.edges);
  expect(resultReversed.badges).toEqual(result.badges);
  expect(resultReversed.crossings).toEqual(result.crossings);
}

/**
 * Generator for Random DAGs with 8 to 12 nodes and variable edge density.
 */
function generateRandomDAG(
  seed: number,
  minNodes = 8,
  maxNodes = 12,
): { nodes: NormalizedNode[]; edges: NormalizedEdge[] } {
  const rng = createPRNG(seed);
  const nodeCount = randomInt(rng, minNodes, maxNodes);
  const density = 0.03 + rng() * 0.04;

  const nodes: NormalizedNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      id: `dag_node_${i}`,
      label: `Node ${i}`,
      width: randomInt(rng, 80, 140),
      height: randomInt(rng, 40, 70),
    });
  }

  const edges: NormalizedEdge[] = [];
  let edgeId = 0;

  for (let i = 0; i < nodeCount - 1; i++) {
    edges.push({
      id: `dag_e_${edgeId++}`,
      source: `dag_node_${i}`,
      target: `dag_node_${i + 1}`,
    });
  }

  for (let i = 0; i < nodeCount; i++) {
    for (let j = i + 2; j < nodeCount; j++) {
      if (rng() < density) {
        edges.push({
          id: `dag_e_${edgeId++}`,
          source: `dag_node_${i}`,
          target: `dag_node_${j}`,
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Generator for Random Cyclic Graphs with feedback loops.
 */
function generateRandomCyclicGraph(
  seed: number,
  minNodes = 8,
  maxNodes = 12,
): { nodes: NormalizedNode[]; edges: NormalizedEdge[] } {
  const rng = createPRNG(seed);
  const nodeCount = randomInt(rng, minNodes, maxNodes);

  const nodes: NormalizedNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      id: `cyc_node_${i}`,
      label: `Node ${i}`,
      width: randomInt(rng, 90, 150),
      height: randomInt(rng, 45, 75),
    });
  }

  const edges: NormalizedEdge[] = [];
  let edgeId = 0;

  for (let i = 0; i < nodeCount - 1; i++) {
    edges.push({
      id: `cyc_e_${edgeId++}`,
      source: `cyc_node_${i}`,
      target: `cyc_node_${i + 1}`,
    });
  }

  const feedbackCount = randomInt(rng, 1, 3);
  for (let f = 0; f < feedbackCount; f++) {
    const targetIdx = randomInt(rng, 0, Math.floor(nodeCount / 2));
    const sourceIdx = randomInt(rng, Math.ceil(nodeCount / 2), nodeCount - 1);
    edges.push({
      id: `cyc_e_${edgeId++}`,
      source: `cyc_node_${sourceIdx}`,
      target: `cyc_node_${targetIdx}`,
      isCycle: true,
      layoutRole: "feedback",
    });
  }

  return { nodes, edges };
}

/**
 * Generator for Variable Size Nodes Graphs.
 */
function generateVariableSizeNodesGraph(seed: number): {
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
} {
  const rng = createPRNG(seed);
  const nodeCount = randomInt(rng, 8, 12);

  const nodes: NormalizedNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const isTiny = rng() < 0.3;
    const isHuge = !isTiny && rng() < 0.4;

    const width = isTiny
      ? randomInt(rng, 40, 60)
      : isHuge
        ? randomInt(rng, 220, 320)
        : randomInt(rng, 100, 160);
    const height = isTiny
      ? randomInt(rng, 30, 40)
      : isHuge
        ? randomInt(rng, 120, 180)
        : randomInt(rng, 50, 80);

    nodes.push({
      id: `var_node_${i}`,
      label: `Node ${i}`,
      width,
      height,
    });
  }

  const edges: NormalizedEdge[] = [];
  let edgeId = 0;

  for (let i = 0; i < nodeCount - 1; i++) {
    edges.push({
      id: `var_e_${edgeId++}`,
      source: `var_node_${i}`,
      target: `var_node_${i + 1}`,
    });
  }

  return { nodes, edges };
}

/**
 * Generator for Dense Multi-Edge Graphs.
 */
function generateDenseMultiEdgeGraph(seed: number): {
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
} {
  const rng = createPRNG(seed);
  const nodeCount = randomInt(rng, 6, 9);

  const nodes: NormalizedNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      id: `dense_node_${i}`,
      label: `Node ${i}`,
      width: randomInt(rng, 100, 150),
      height: randomInt(rng, 50, 75),
    });
  }

  const edges: NormalizedEdge[] = [];
  let edgeId = 0;

  for (let i = 0; i < nodeCount - 1; i++) {
    const src = `dense_node_${i}`;
    const tgt = `dense_node_${i + 1}`;
    const parallelCount = randomInt(rng, 2, 4);

    for (let p = 0; p < parallelCount; p++) {
      edges.push({
        id: `dense_e_${edgeId++}`,
        source: src,
        target: tgt,
        label: `channel-${p}`,
      });
    }
  }

  return { nodes, edges };
}

/**
 * Generator for High-Degree Hub Graphs.
 */
function generateHubGraph(seed: number): { nodes: NormalizedNode[]; edges: NormalizedEdge[] } {
  const rng = createPRNG(seed);
  const spokeCount = randomInt(rng, 6, 10);

  const nodes: NormalizedNode[] = [
    {
      id: "hub_node",
      label: "Central Hub",
      width: 180,
      height: 90,
    },
  ];

  const edges: NormalizedEdge[] = [];
  let edgeId = 0;

  for (let i = 0; i < spokeCount; i++) {
    const spokeId = `spoke_node_${i}`;
    nodes.push({
      id: spokeId,
      label: `Spoke ${i}`,
      width: randomInt(rng, 80, 120),
      height: randomInt(rng, 40, 60),
    });

    const isFanIn = i % 2 === 0;
    if (isFanIn) {
      edges.push({
        id: `hub_e_${edgeId++}`,
        source: spokeId,
        target: "hub_node",
      });
    } else {
      edges.push({
        id: `hub_e_${edgeId++}`,
        source: "hub_node",
        target: spokeId,
      });
    }
  }

  return { nodes, edges };
}

/**
 * Generator for Disconnected Component Graphs.
 */
function generateDisconnectedComponentsGraph(seed: number): {
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
} {
  const rng = createPRNG(seed);
  const componentCount = randomInt(rng, 2, 4);

  const nodes: NormalizedNode[] = [];
  const edges: NormalizedEdge[] = [];
  let edgeId = 0;

  for (let c = 0; c < componentCount; c++) {
    const compNodes = randomInt(rng, 3, 5);
    const nodeIds: string[] = [];

    for (let i = 0; i < compNodes; i++) {
      const id = `comp_${c}_node_${i}`;
      nodeIds.push(id);
      nodes.push({
        id,
        label: `C${c}-N${i}`,
        width: randomInt(rng, 80, 130),
        height: randomInt(rng, 40, 65),
      });
    }

    for (let i = 0; i < compNodes - 1; i++) {
      edges.push({
        id: `disc_e_${edgeId++}`,
        source: nodeIds[i],
        target: nodeIds[i + 1],
      });
    }
  }

  return { nodes, edges };
}

describe("Generated Graph Layout & Routing Stress Tests", () => {
  describe("Random DAGs (8 to 12 nodes, variable density)", () => {
    const seeds = [1001, 2024, 3050, 5555, 7777];

    for (const seed of seeds) {
      it(
        `handles random DAG generated with seed ${seed}`,
        async () => {
          const { nodes, edges } = generateRandomDAG(seed);
          const initialResult = await computeCustomLayout(nodes, edges, {
            ...CONFIG_OVERRIDE,
            maxGlobalPasses: 1,
          });
          const result1 = await computeCustomLayout(nodes, edges, CONFIG_OVERRIDE);

          await assertLayoutProperties(result1, nodes, edges, initialResult);

          const { nodes: nodes2, edges: edges2 } = generateRandomDAG(seed);
          const result2 = await computeCustomLayout(nodes2, edges2, CONFIG_OVERRIDE);
          expect(result1).toEqual(result2);
        },
        TEST_TIMEOUT_MS,
      );
    }
  });

  describe("Random Cyclic Graphs with Feedback Loops", () => {
    const seeds = [101, 202, 303, 404, 505];

    for (const seed of seeds) {
      it(
        `handles random cyclic graph generated with seed ${seed}`,
        async () => {
          const { nodes, edges } = generateRandomCyclicGraph(seed);
          const initialResult = await computeCustomLayout(nodes, edges, {
            ...CONFIG_OVERRIDE,
            maxGlobalPasses: 1,
          });
          const result1 = await computeCustomLayout(nodes, edges, CONFIG_OVERRIDE);

          await assertLayoutProperties(result1, nodes, edges, initialResult);

          const { nodes: nodes2, edges: edges2 } = generateRandomCyclicGraph(seed);
          const result2 = await computeCustomLayout(nodes2, edges2, CONFIG_OVERRIDE);
          expect(result1).toEqual(result2);
        },
        TEST_TIMEOUT_MS,
      );
    }
  });

  describe("Variable Size Nodes Graphs", () => {
    const seeds = [11, 22, 33, 44, 55];

    for (const seed of seeds) {
      it(
        `handles graph with variable node dimensions generated with seed ${seed}`,
        async () => {
          const { nodes, edges } = generateVariableSizeNodesGraph(seed);
          const initialResult = await computeCustomLayout(nodes, edges, {
            ...CONFIG_OVERRIDE,
            maxGlobalPasses: 1,
          });
          const result1 = await computeCustomLayout(nodes, edges, CONFIG_OVERRIDE);

          await assertLayoutProperties(result1, nodes, edges, initialResult);

          const { nodes: nodes2, edges: edges2 } = generateVariableSizeNodesGraph(seed);
          const result2 = await computeCustomLayout(nodes2, edges2, CONFIG_OVERRIDE);
          expect(result1).toEqual(result2);
        },
        TEST_TIMEOUT_MS,
      );
    }
  });

  describe("Dense Multi-Edge Graphs", () => {
    const seeds = [901, 902, 903, 904, 905];

    for (const seed of seeds) {
      it(
        `handles dense multi-edge graph generated with seed ${seed}`,
        async () => {
          const { nodes, edges } = generateDenseMultiEdgeGraph(seed);
          const initialResult = await computeCustomLayout(nodes, edges, {
            ...CONFIG_OVERRIDE,
            maxGlobalPasses: 1,
          });
          const result1 = await computeCustomLayout(nodes, edges, CONFIG_OVERRIDE);

          await assertLayoutProperties(result1, nodes, edges, initialResult);

          const { nodes: nodes2, edges: edges2 } = generateDenseMultiEdgeGraph(seed);
          const result2 = await computeCustomLayout(nodes2, edges2, CONFIG_OVERRIDE);
          expect(result1).toEqual(result2);
        },
        TEST_TIMEOUT_MS,
      );
    }
  });

  describe("High-Degree Hub Graphs", () => {
    const seeds = [701, 702, 703];

    for (const seed of seeds) {
      it(
        `handles high-degree hub graph generated with seed ${seed}`,
        async () => {
          const { nodes, edges } = generateHubGraph(seed);
          const initialResult = await computeCustomLayout(nodes, edges, {
            ...CONFIG_OVERRIDE,
            maxGlobalPasses: 1,
          });
          const result1 = await computeCustomLayout(nodes, edges, CONFIG_OVERRIDE);

          await assertLayoutProperties(result1, nodes, edges, initialResult);

          const { nodes: nodes2, edges: edges2 } = generateHubGraph(seed);
          const result2 = await computeCustomLayout(nodes2, edges2, CONFIG_OVERRIDE);
          expect(result1).toEqual(result2);
        },
        TEST_TIMEOUT_MS,
      );
    }
  });

  describe("Disconnected Component Graphs", () => {
    const seeds = [801, 802, 803];

    for (const seed of seeds) {
      it(
        `handles disconnected component graph generated with seed ${seed}`,
        async () => {
          const { nodes, edges } = generateDisconnectedComponentsGraph(seed);
          const initialResult = await computeCustomLayout(nodes, edges, {
            ...CONFIG_OVERRIDE,
            maxGlobalPasses: 1,
          });
          const result1 = await computeCustomLayout(nodes, edges, CONFIG_OVERRIDE);

          await assertLayoutProperties(result1, nodes, edges, initialResult);

          const { nodes: nodes2, edges: edges2 } = generateDisconnectedComponentsGraph(seed);
          const result2 = await computeCustomLayout(nodes2, edges2, CONFIG_OVERRIDE);
          expect(result1).toEqual(result2);
        },
        TEST_TIMEOUT_MS,
      );
    }
  });
});
