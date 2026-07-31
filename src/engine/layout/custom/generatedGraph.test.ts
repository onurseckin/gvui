import { describe, expect, it } from "bun:test";
import { computeCustomLayout } from "./computeCustomLayout";
import type { CustomLayoutResult, NormalizedEdge, NormalizedNode } from "./types";

const TEST_TIMEOUT_MS = 10000;

/**
 * Deterministic PRNG using Mulberry32 algorithm.
 * Seed is a positive 32-bit integer.
 */
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
    expect(Number.isNaN(n.x)).toBe(false);
    expect(Number.isNaN(n.y)).toBe(false);
  }
  for (const e of result.edges) {
    for (const p of e.points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(Number.isNaN(p.x)).toBe(false);
      expect(Number.isNaN(p.y)).toBe(false);
    }
    expect(Number.isFinite(e.sourcePort.point.x)).toBe(true);
    expect(Number.isFinite(e.sourcePort.point.y)).toBe(true);
    expect(Number.isFinite(e.sourcePort.stub.x)).toBe(true);
    expect(Number.isFinite(e.sourcePort.stub.y)).toBe(true);

    expect(Number.isFinite(e.targetPort.point.x)).toBe(true);
    expect(Number.isFinite(e.targetPort.point.y)).toBe(true);
    expect(Number.isFinite(e.targetPort.stub.x)).toBe(true);
    expect(Number.isFinite(e.targetPort.stub.y)).toBe(true);
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

function assertLayoutProperties(result: CustomLayoutResult, nodes: NormalizedNode[], edges: NormalizedEdge[]): void {
  // 100% finite coordinates
  assertFiniteCoordinates(result);

  // Status must be either success or unresolved soft conflicts (never invalid hard crash)
  expect(["success", "unresolved_soft_conflicts"]).toContain(result.status);
  expect(result.validation).toBeDefined();
  expect(typeof result.validation.isValid).toBe("boolean");
  expect(Array.isArray(result.validation.diagnostics)).toBe(true);

  // Node count preservation
  expect(result.nodes.length).toBe(nodes.length);

  // Edge count behavior based on status
  if (result.status === "success") {
    expect(result.edges.length).toBe(edges.length);
    expect(result.validation.isValid).toBe(true);
  } else {
    expect(result.edges.length).toBeLessThanOrEqual(edges.length);
  }
}

/**
 * Generator for Random DAGs with 10 to 18 nodes and variable edge density.
 */
function generateRandomDAG(seed: number, minNodes = 10, maxNodes = 18): { nodes: NormalizedNode[]; edges: NormalizedEdge[] } {
  const rng = createPRNG(seed);
  const nodeCount = randomInt(rng, minNodes, maxNodes);
  const density = 0.05 + rng() * 0.08;

  const nodes: NormalizedNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      id: `dag_node_${i}`,
      label: `Node ${i}`,
      width: randomInt(rng, 80, 160),
      height: randomInt(rng, 40, 80),
    });
  }

  const edges: NormalizedEdge[] = [];
  let edgeId = 0;
  // Backbone to guarantee connectivity
  for (let i = 0; i < nodeCount - 1; i++) {
    edges.push({
      id: `dag_e_${edgeId++}`,
      source: `dag_node_${i}`,
      target: `dag_node_${i + 1}`,
    });
  }

  // Additional forward edges according to density
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
 * Generator for Random Cyclic Graphs with feedback loops and self-loops.
 */
function generateRandomCyclicGraph(seed: number, nodeCount = 12): { nodes: NormalizedNode[]; edges: NormalizedEdge[] } {
  const rng = createPRNG(seed);
  const nodes: NormalizedNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      id: `cycle_node_${i}`,
      label: `Node ${i}`,
      width: 100,
      height: 50,
    });
  }

  const edges: NormalizedEdge[] = [];
  let edgeId = 0;
  // Forward chain
  for (let i = 0; i < nodeCount - 1; i++) {
    edges.push({
      id: `cyc_e_${edgeId++}`,
      source: `cycle_node_${i}`,
      target: `cycle_node_${i + 1}`,
    });
  }

  // Add feedback loops (back edges)
  for (let i = 0; i < nodeCount; i++) {
    for (let j = 0; j < i; j++) {
      if (rng() < 0.08) {
        edges.push({
          id: `cyc_e_${edgeId++}`,
          source: `cycle_node_${i}`,
          target: `cycle_node_${j}`,
          isCycle: true,
        });
      }
    }
  }

  // Add occasional self-loops
  for (let i = 0; i < nodeCount; i++) {
    if (rng() < 0.1) {
      edges.push({
        id: `cyc_e_${edgeId++}`,
        source: `cycle_node_${i}`,
        target: `cycle_node_${i}`,
      });
    }
  }

  return { nodes, edges };
}

/**
 * Generator for Variable-Size Nodes graph.
 */
function generateVariableSizeNodesGraph(seed: number, nodeCount = 12): { nodes: NormalizedNode[]; edges: NormalizedEdge[] } {
  const rng = createPRNG(seed);
  const nodes: NormalizedNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      id: `var_node_${i}`,
      label: `VarNode ${i}`,
      width: randomInt(rng, 50, 220),
      height: randomInt(rng, 30, 130),
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
    if (i + 2 < nodeCount && rng() < 0.25) {
      edges.push({
        id: `var_e_${edgeId++}`,
        source: `var_node_${i}`,
        target: `var_node_${i + 2}`,
      });
    }
  }

  return { nodes, edges };
}

/**
 * Generator for Dense Multi-Edge Graphs.
 */
function generateDenseMultiEdgeGraph(seed: number, nodeCount = 8): { nodes: NormalizedNode[]; edges: NormalizedEdge[] } {
  const rng = createPRNG(seed);
  const nodes: NormalizedNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({
      id: `dense_node_${i}`,
      label: `Node ${i}`,
      width: 110,
      height: 60,
    });
  }

  const edges: NormalizedEdge[] = [];
  let edgeId = 0;
  for (let i = 0; i < nodeCount; i++) {
    for (let j = 0; j < nodeCount; j++) {
      if (i === j) continue;
      if (rng() < 0.18) {
        const multiCount = randomInt(rng, 1, 2);
        for (let k = 0; k < multiCount; k++) {
          edges.push({
            id: `dense_e_${edgeId++}`,
            source: `dense_node_${i}`,
            target: `dense_node_${j}`,
            label: `badge_${i}_${j}_${k}`,
          });
        }
      }
    }
  }

  return { nodes, edges };
}

/**
 * Generator for High-Degree Hub graph.
 */
function generateHubGraph(seed: number, leafCount = 10): { nodes: NormalizedNode[]; edges: NormalizedEdge[] } {
  const rng = createPRNG(seed);
  const nodes: NormalizedNode[] = [
    { id: "hub_central", label: "Central Hub", width: 180, height: 90 },
  ];
  const edges: NormalizedEdge[] = [];

  for (let i = 0; i < leafCount; i++) {
    const leafId = `hub_leaf_${i}`;
    nodes.push({
      id: leafId,
      width: randomInt(rng, 80, 130),
      height: randomInt(rng, 40, 65),
    });

    if (rng() < 0.5) {
      edges.push({ id: `hub_e_in_${i}`, source: leafId, target: "hub_central" });
    } else {
      edges.push({ id: `hub_e_out_${i}`, source: "hub_central", target: leafId });
    }
  }

  return { nodes, edges };
}

/**
 * Generator for Disconnected Component subgraphs.
 */
function generateDisconnectedComponentsGraph(seed: number, componentCount = 3): { nodes: NormalizedNode[]; edges: NormalizedEdge[] } {
  const rng = createPRNG(seed);
  const nodes: NormalizedNode[] = [];
  const edges: NormalizedEdge[] = [];
  let edgeId = 0;

  for (let c = 0; c < componentCount; c++) {
    const compSize = randomInt(rng, 3, 5);
    for (let i = 0; i < compSize; i++) {
      const nodeId = `c${c}_n${i}`;
      nodes.push({
        id: nodeId,
        width: randomInt(rng, 90, 120),
        height: randomInt(rng, 45, 60),
      });
      if (i > 0) {
        edges.push({
          id: `disc_e_${edgeId++}`,
          source: `c${c}_n${i - 1}`,
          target: nodeId,
        });
      }
    }
  }

  return { nodes, edges };
}

describe("Generated Graph Layout & Routing Stress Tests", () => {
  describe("Random DAGs (10 to 18 nodes, variable density)", () => {
    const seeds = [1001, 2024, 3050, 4112, 5555];

    for (const seed of seeds) {
      it(`handles random DAG generated with seed ${seed}`, () => {
        const { nodes, edges } = generateRandomDAG(seed);
        const result1 = computeCustomLayout(nodes, edges);

        assertLayoutProperties(result1, nodes, edges);

        // Determinism check: identical seed re-run produces deep equal result
        const { nodes: nodes2, edges: edges2 } = generateRandomDAG(seed);
        const result2 = computeCustomLayout(nodes2, edges2);
        expect(result1).toEqual(result2);
      }, TEST_TIMEOUT_MS);
    }
  });

  describe("Random Cyclic Graphs with Feedback Loops", () => {
    const seeds = [101, 202, 303, 404, 505];

    for (const seed of seeds) {
      it(`handles random cyclic graph generated with seed ${seed}`, () => {
        const { nodes, edges } = generateRandomCyclicGraph(seed);
        const result1 = computeCustomLayout(nodes, edges);

        assertLayoutProperties(result1, nodes, edges);

        // Determinism check
        const { nodes: nodes2, edges: edges2 } = generateRandomCyclicGraph(seed);
        const result2 = computeCustomLayout(nodes2, edges2);
        expect(result1).toEqual(result2);
      }, TEST_TIMEOUT_MS);
    }
  });

  describe("Variable Size Nodes Graphs", () => {
    const seeds = [11, 22, 33, 44, 55];

    for (const seed of seeds) {
      it(`handles graph with variable node dimensions generated with seed ${seed}`, () => {
        const { nodes, edges } = generateVariableSizeNodesGraph(seed);
        const result1 = computeCustomLayout(nodes, edges);

        assertLayoutProperties(result1, nodes, edges);

        // Determinism check
        const { nodes: nodes2, edges: edges2 } = generateVariableSizeNodesGraph(seed);
        const result2 = computeCustomLayout(nodes2, edges2);
        expect(result1).toEqual(result2);
      }, TEST_TIMEOUT_MS);
    }
  });

  describe("Dense Multi-Edge Graphs", () => {
    const seeds = [901, 902, 903, 904, 905];

    for (const seed of seeds) {
      it(`handles dense multi-edge graph generated with seed ${seed}`, () => {
        const { nodes, edges } = generateDenseMultiEdgeGraph(seed);
        const result1 = computeCustomLayout(nodes, edges);

        assertLayoutProperties(result1, nodes, edges);

        // Determinism check
        const { nodes: nodes2, edges: edges2 } = generateDenseMultiEdgeGraph(seed);
        const result2 = computeCustomLayout(nodes2, edges2);
        expect(result1).toEqual(result2);
      }, TEST_TIMEOUT_MS);
    }
  });

  describe("High-Degree Hub Graphs", () => {
    const seeds = [701, 702, 703];

    for (const seed of seeds) {
      it(`handles high-degree hub graph generated with seed ${seed}`, () => {
        const { nodes, edges } = generateHubGraph(seed);
        const result1 = computeCustomLayout(nodes, edges);

        assertLayoutProperties(result1, nodes, edges);

        // Determinism check
        const { nodes: nodes2, edges: edges2 } = generateHubGraph(seed);
        const result2 = computeCustomLayout(nodes2, edges2);
        expect(result1).toEqual(result2);
      }, TEST_TIMEOUT_MS);
    }
  });

  describe("Disconnected Component Graphs", () => {
    const seeds = [801, 802, 803];

    for (const seed of seeds) {
      it(`handles disconnected component graph generated with seed ${seed}`, () => {
        const { nodes, edges } = generateDisconnectedComponentsGraph(seed);
        const result1 = computeCustomLayout(nodes, edges);

        assertLayoutProperties(result1, nodes, edges);

        // Determinism check
        const { nodes: nodes2, edges: edges2 } = generateDisconnectedComponentsGraph(seed);
        const result2 = computeCustomLayout(nodes2, edges2);
        expect(result1).toEqual(result2);
      }, TEST_TIMEOUT_MS);
    }
  });
});
