# Custom Engine Algorithmic Performance Optimization Plan (v6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate layout computation freezes and reduce execution time for complex graphs (like `Saga Workflow` and `K8s Topology`) from $> 15,000\text{ms}$ to under $50\text{ms}$ through state-budget bounding, incremental A* route caching, and Web Worker offloading.

**Architecture:** 
1. **Adaptive State Budget Bounding**: Dynamically calculate search budget caps based on node/edge density in `deriveSearchStateBudgets` so complex graphs do not enter combinatorial permutation loops.
2. **Incremental A* Route Caching**: Implement a lightweight route geometry cache in `routeSearch.ts` so unchanged edge routes are reused across optimizer state evaluations instead of re-running full A* grid search.
3. **Web Worker Thread Offloading**: Ensure background execution in `customLayoutWorker.ts` remains fast, non-blocking, and responsive.

**Tech Stack:** TypeScript, Bun Test, Vite, WebWorkers.

---

### Task 1: Graph-Density Adaptive Budget Bounding in `layoutOptimizerState.ts`

**Files:**
- Modify: `src/engine/layout/custom/layoutOptimizerState.ts:53-90`
- Test: `src/engine/layout/custom/layoutOptimizerState.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `src/engine/layout/custom/layoutOptimizerState.test.ts` to assert that for a 12-node 13-edge graph (`k8s-topology`), `deriveSearchStateBudgets` bounds `maxLayoutStates` to $\le 15$ states:

```typescript
import { describe, expect, it } from "bun:test";
import { deriveSearchStateBudgets } from "./layoutOptimizerState";
import k8sData from "../../../../public/graphs/kubernetes_cluster_topology.json";

describe("layoutOptimizerState performance budget derivation", () => {
  it("bounds maxLayoutStates to <= 15 for dense graphs with >= 10 nodes", () => {
    const nodes = k8sData.nodes.map((n) => ({ id: n.id, width: 200, height: 70 }));
    const edges = k8sData.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: Boolean(e.isCycle),
    }));
    const config = { nodeGap: 50, rankGap: 80 } as any;

    const budgets = deriveSearchStateBudgets(nodes as any, edges as any, config);
    expect(budgets.maxLayoutStates).toBeLessThanOrEqual(15);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/engine/layout/custom/layoutOptimizerState.test.ts`
Expected: FAIL (because current `maxLayoutStates` calculates $200+$ for 13 edges).

- [ ] **Step 3: Implement adaptive budget bounding in `layoutOptimizerState.ts`**

Update `deriveSearchStateBudgets` in `src/engine/layout/custom/layoutOptimizerState.ts`:

```typescript
export function deriveSearchStateBudgets(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  config: CustomLayoutConfig,
): SearchStateBudgets {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;

  // Scale maximum states inversely with graph complexity to maintain < 50ms total execution time
  let maxLayoutStates = 60;
  if (nodeCount >= 10 || edgeCount >= 12) {
    maxLayoutStates = 12;
  } else if (nodeCount >= 6 || edgeCount >= 8) {
    maxLayoutStates = 25;
  }

  return {
    maxLayoutStates,
    maxAestheticEvaluations: maxLayoutStates * 2,
    maxAStarStatesPerRoute: 500,
    maxConflictPermutations: 4,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/engine/layout/custom/layoutOptimizerState.test.ts`
Expected: PASS

---

### Task 2: Incremental A* Route Caching in `routeSearch.ts`

**Files:**
- Modify: `src/engine/layout/custom/routeSearch.ts:1-60`
- Test: `src/engine/layout/custom/routeSearch.test.ts`

- [ ] **Step 1: Write failing unit test for route caching**

```typescript
import { describe, expect, it } from "bun:test";
import { searchOrthogonalRouteCached, clearRouteCache } from "./routeSearch";

describe("routeSearch cached route execution", () => {
  it("returns identical cached route geometry on repeated calls without re-running A*", () => {
    clearRouteCache();
    const srcPort = { point: { x: 100, y: 100 }, side: "bottom" } as any;
    const tgtPort = { point: { x: 300, y: 300 }, side: "top" } as any;
    const grid = { nodes: [], xCoords: [100, 300], yCoords: [100, 300] } as any;
    const config = { epsilon: 0.001 } as any;

    const r1 = searchOrthogonalRouteCached(srcPort, tgtPort, grid, [], config);
    const r2 = searchOrthogonalRouteCached(srcPort, tgtPort, grid, [], config);

    expect(r1).toBe(r2); // Exact reference equality from cache
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `bun test src/engine/layout/custom/routeSearch.test.ts`
Expected: FAIL (`searchOrthogonalRouteCached` is not defined).

- [ ] **Step 3: Implement `searchOrthogonalRouteCached` in `routeSearch.ts`**

Add an LRU/Hash cache in `src/engine/layout/custom/routeSearch.ts`:

```typescript
const routeCache = new Map<string, Point[] | null>();

export function clearRouteCache(): void {
  routeCache.clear();
}

export function searchOrthogonalRouteCached(
  sourcePort: PortCandidate,
  targetPort: PortCandidate,
  grid: RoutingGrid,
  obstacles: Rect[],
  config: CustomLayoutConfig,
): Point[] | null {
  const key = `${sourcePort.point.x},${sourcePort.point.y}:${targetPort.point.x},${targetPort.point.y}:${obstacles.length}`;
  if (routeCache.has(key)) {
    return routeCache.get(key)!;
  }

  const result = searchOrthogonalRoute(sourcePort, targetPort, grid, obstacles, config);
  routeCache.set(key, result);
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/engine/layout/custom/routeSearch.test.ts`
Expected: PASS

---

### Task 3: Full Non-Regression & Benchmark Gate

**Files:**
- Run: `bun test`
- Verification: Benchmark execution of `distributed_saga_workflow.json` and `kubernetes_cluster_topology.json`

- [ ] **Step 1: Run all custom layout test suites**

Run: `bun test src/engine/layout/custom/`
Expected: 100% PASS across all unit and acceptance suites.

- [ ] **Step 2: Run benchmark verification script**

Run: `bun -e "import saga from './public/graphs/distributed_saga_workflow.json'; import k8s from './public/graphs/kubernetes_cluster_topology.json'; import { computeCustomEngineGraphLayout } from './src/engine/layout/customLayoutAdapter'; console.time('Saga'); computeCustomEngineGraphLayout(saga as any); console.timeEnd('Saga'); console.time('K8s'); computeCustomEngineGraphLayout(k8s as any); console.timeEnd('K8s');"`
Expected: Saga execution $< 30\text{ms}$, K8s execution $< 50\text{ms}$.
