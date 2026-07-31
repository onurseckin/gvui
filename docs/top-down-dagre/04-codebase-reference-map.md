# 04. Codebase Reference Map for Top-Down Dagre Engine

[← Back to Master Index](../README.md)

This document maps the theoretical algorithms of the **Top-Down Dagre Engine** directly to implementation files, exported functions, exact line anchors, complexity bounds, and verification commands in GVUI.

---

## 1. 🗺️ Codebase Directory & Symbol Matrix

| File Path | Core Subsystem / Functionality | Primary Exported Symbols | Verified Line Anchors |
| :--- | :--- | :--- | :--- |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) | Dagre graph construction, layout execution, coordinate conversion, path clipping, and badge repulsion pass | `computeDagreLayout`, `calculateNodeDimensions` | [`L451-L604`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) |
| [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L138-L152) | Layout mode dispatcher routing `"top-down-dagre"` and `"left-right"` engine execution | `computeGraphLayout` | [`L138-L152`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L138-L152) |

---

## 2. 🔍 Verified Source Code Snippets

### 2.1 `computeDagreLayout` in [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604)

```typescript
/**
 * Computes node coordinates and edge paths using the Dagre hierarchical positioning algorithm.
 */
export function computeDagreLayout(
  dataset: GraphDataset,
  direction: "TB" | "LR" = "TB",
): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: direction,
    nodesep: 150,
    ranksep: 120,
    marginx: 80,
    marginy: 80,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const dimensionsMap = new Map<string, { width: number; height: number }>();

  dataset.nodes.forEach((node) => {
    const dims = calculateNodeDimensions(node);
    dimensionsMap.set(node.id, dims);
    g.setNode(node.id, { width: dims.width, height: dims.height });
  });

  dataset.edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target, {}, edge.id);
  });

  // Executes Network Simplex, Barycentric Ordering, and Brandes-Köpf Placement
  dagre.layout(g);

  const positionedNodes: PositionedNode[] = dataset.nodes.map((node) => {
    const dagreNode = g.node(node.id);
    const dims = dimensionsMap.get(node.id) ?? calculateNodeDimensions(node);

    const centerX = dagreNode?.x ?? dims.width / 2;
    const centerY = dagreNode?.y ?? dims.height / 2;

    return {
      ...node,
      x: centerX - dims.width / 2,
      y: centerY - dims.height / 2,
      width: dims.width,
      height: dims.height,
    };
  });

  // ... (Edge path routing, boundary rectangle clipping, and badge repulsion pass)

  return { nodes: positionedNodes, edges: positionedEdges };
}
```

### 2.2 `computeGraphLayout` Dispatcher in [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L138-L152)

```typescript
/**
 * Main layout dispatcher exporting layout calculations for all LayoutModes.
 */
export async function computeGraphLayout(
  dataset: GraphDataset,
  mode: LayoutMode = "top-down",
): Promise<{ nodes: PositionedNode[]; edges: PositionedEdge[] }> {
  switch (mode) {
    case "top-down":
      return await computeCustomEngineGraphLayout(dataset);
    case "top-down-dagre":
      return computeDagreLayout(dataset, "TB");
    case "left-right":
      return computeDagreLayout(dataset, "LR");
    case "force":
      return computeForceLayout(dataset);
    case "radial":
      return computeRadialLayout(dataset);
    default:
      return await computeCustomEngineGraphLayout(dataset);
  }
}
```

---

## 3. 🎯 Theoretical Algorithm to Code Execution Mapping

```
  Theoretical Phase                   Graphlib / Dagre Execution              GVUI Integration Source
 ┌──────────────────┐               ┌───────────────────────────┐           ┌────────────────────────────┐
 │ Network Simplex  │──────────────►│ Phase 1: Rank Assignment  │──────────►│ nodeDimensions.ts#L477     │
 │ Layering         │               │ (min edge length ILP)     │           │ dagre.layout(g)            │
 └──────────────────┘               └───────────────────────────┘           └────────────────────────────┘
          │                                       │                                       │
          ▼                                       ▼                                       ▼
 ┌──────────────────┐               ┌───────────────────────────┐           ┌────────────────────────────┐
 │ Barycentric      │──────────────►│ Phase 2: Crossing         │──────────►│ nodeDimensions.ts#L477     │
 │ Order Sweeps     │               │ Minimization (24 passes)  │           │ dagre.layout(g)            │
 └──────────────────┘               └───────────────────────────┘           └────────────────────────────┘
          │                                       │                                       │
          ▼                                       ▼                                       ▼
 ┌──────────────────┐               ┌───────────────────────────┐           ┌────────────────────────────┐
 │ Brandes-Köpf     │──────────────►│ Phase 3: Coordinate       │──────────►│ nodeDimensions.ts#L477     │
 │ Alignment        │               │ Assignment (4 passes)     │           │ dagre.layout(g)            │
 └──────────────────┘               └───────────────────────────┘           └────────────────────────────┘
                                                  │                                       │
                                                  ▼                                       ▼
                                    ┌───────────────────────────┐           ┌────────────────────────────┐
                                    │ Center-to-Top-Left        │──────────►│ nodeDimensions.ts#L479-493 │
                                    │ Coordinate Shift          │           │ x = cx - w/2; y = cy - h/2 │
                                    └───────────────────────────┘           └────────────────────────────┘
                                                  │                                       │
                                                  ▼                                       ▼
                                    ┌───────────────────────────┐           ┌────────────────────────────┐
                                    │ Boundary Clipping &       │──────────►│ nodeDimensions.ts#L518-601 │
                                    │ Badge Repulsion           │           │ clipPointToNodeRect        │
                                    └───────────────────────────┘           └────────────────────────────┘
```

1. **Graph Initialization & Parameters**: [`nodeDimensions.ts:L455-L463`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L455-L463) sets `rankdir: "TB"`, `nodesep: 150`, `ranksep: 120`, `marginx: 80`, `marginy: 80`.
2. **Dagre Pipeline Execution**: [`nodeDimensions.ts:L477`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L477) executes `dagre.layout(g)`.
3. **Center-to-Top-Left Conversion**: [`nodeDimensions.ts:L479-L493`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L479-L493) converts center origin $(c_x, c_y)$ to canvas top-left position $(x, y) = (c_x - w/2, c_y - h/2)$.
4. **Node Rect Path Clipping**: [`nodeDimensions.ts:L518-L562`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L518-L562) clips edge polyline endpoints at node border perimeters via `clipPointToNodeRect`.
5. **Label Badge Repulsion Pass**: [`nodeDimensions.ts:L575-L601`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L575-L601) shifts overlapping edge label badges along $X$ or $Y$ axes.

---

## 4. 📊 Asymptotic Complexity Bounds & Step-by-Step Derivation

### 4.1 Step-by-Step Operational Arithmetic for Sample Graph ($|V|=20, |E|=30$)

For a typical graph with $|V| = 20$ nodes, $|E| = 30$ edges, and $K = 24$ crossing minimization sweeps:

1. **Network Simplex Layering Phase**:
   $$T_{\text{simplex}} = O(|V| \cdot |E|) = 20 \cdot 30 = 600 \text{ operations (worst-case pivot iterations)}$$

2. **Barycentric Order Sweeps Phase ($K = 24$)**:
   $$T_{\text{bary}} = O\left(K \cdot (|V| + |E| \log_2 |E|)\right) = 24 \cdot (20 + 30 \cdot \log_2(30))$$
   $$\log_2(30) \approx 4.907 \implies 30 \cdot 4.907 \approx 147.2$$
   $$T_{\text{bary}} = 24 \cdot (20 + 147.2) = 24 \cdot 167.2 = 4012.8 \text{ operations}$$

3. **Brandes-Köpf Coordinate Alignment Phase**:
   $$T_{\text{BK}} = O(|V| + |E|) = 20 + 30 = 50 \text{ operations (4 linear passes)}$$

4. **Total Layout Engine Execution**:
   $$T_{\text{total}} = 600 + 4012.8 + 50 = 4662.8 \text{ operations}$$

### 4.2 Complexity Summary Table

| Phase / Algorithm | Time Complexity (Average) | Time Complexity (Worst-Case) | Space Complexity | Theoretical Driver |
| :--- | :--- | :--- | :--- | :--- |
| **Network Simplex Layering** | $O(V \cdot E)$ | $O(V^2 \cdot E)$ | $O(V + E)$ | Spanning tree cut pivoting until $\text{cutval}(e) \ge 0$. |
| **Barycentric Order Sweeps** | $O(K \cdot (V + E \log E))$ | $O(K \cdot V \cdot E)$ | $O(V + E)$ | $K = 24$ sweeps sorting neighbor positions per layer. |
| **Brandes-Köpf Alignment** | $O(V + E)$ | $O(V + E)$ | $O(V + E)$ | 4 linear sweeps + block graph compaction + median calculation. |
| **Edge Clipping & Badge Repulsion** | $O(E)$ | $O(E^2)$ | $O(E)$ | Pairwise badge overlap check on edge midpoints. |
| **Total Engine Execution** | **$O(V \cdot E + K \cdot E \log E)$** | **$O(V^2 \cdot E)$** | **$O(V + E)$** | **Guaranteed polynomial execution time.** |

### 4.3 Sub-Step Pseudocode: Complexity Estimator
```typescript
/**
 * Computes estimated total operation count for Top-Down Dagre engine phases.
 */
function estimateDagreOperations(V: number, E: number, K: number = 24): {
  simplexOps: number;
  barycenterOps: number;
  brandesKopfOps: number;
  totalOps: number;
} {
  const simplexOps = V * E;
  const barycenterOps = K * (V + E * Math.log2(E));
  const brandesKopfOps = V + E;
  return {
    simplexOps,
    barycenterOps,
    brandesKopfOps,
    totalOps: simplexOps + barycenterOps + brandesKopfOps,
  };
}
```

### 4.4 Visual ASCII Complexity Pipeline Breakdown
```
  [ DAG Input (|V|=20, |E|=30) ]
                 │
                 ▼
  Phase 1: Network Simplex (600 ops)  ──► Layer Ranks r(v)
                 │
                 ▼
  Phase 2: Barycentric Sweeps (4012.8 ops) ──► Permutations π(L_i)
                 │
                 ▼
  Phase 3: Brandes-Köpf Placement (50 ops) ──► Final Coordinates (x, y)
                 │
                 ▼
  [ Total Execution: ~4663 ops (Linear / Log-Linear Bound) ]
```

---

## 5. 🧪 Executable Verification Commands

To verify and test the Top-Down Dagre Engine layout implementation and line anchors, run the following commands in the workspace root:

```bash
# 1. Typecheck TypeScript interfaces and layout signatures
bun run typecheck

# 2. Run ESLint code quality checks across engine files
bun run lint

# 3. Execute unit test suite for layout engine
bun test src/engine/layout/
```
