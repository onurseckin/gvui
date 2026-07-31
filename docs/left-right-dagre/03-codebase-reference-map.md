# 03. Codebase Reference Map for Left-to-Right Dagre Engine

[← Back to Master Index](../README.md)

This document maps the **Left-to-Right (LR) Dagre Engine** mathematical model to implementation files in the GVUI layout subsystem, complete with line anchors, symbol definitions, step-by-step asymptotic complexity derivations with worked numerical graph bounds, and automated test execution commands.

---

## 1. Engine Architecture & Execution Pipeline Schematic

```
                          LAYOUT COMPUTATION PIPELINE
                          
          Client Request / Store Dispatch
                        │
                        ▼
      ┌───────────────────────────────────┐
      │  computeGraphLayout(dataset, LR) │  [layoutDispatcher.ts:L134-L152]
      └─────────────────┬─────────────────┘
                        │
                        ▼
      ┌───────────────────────────────────┐
      │   computeDagreLayout(dataset, LR) │  [nodeDimensions.ts:L451-L604]
      └─────────────────┬─────────────────┘
                        │
        ┌───────────────┼────────────────────────┐
        │               │                        │
        ▼               ▼                        ▼
  ┌───────────┐   ┌───────────┐            ┌───────────┐
  │  Node     │   │  Dagre    │            │ Edge Path │
  │ Dimension │   │  Layout   │            │ Geometry  │
  │ Calculation   │ Execution │            │ Clipping  │
  └─────┬─────┘   └─────┬─────┘            └─────┬─────┘
        │               │                        │
        │               │ [rankdir: "LR"]        │
        └───────────────┼────────────────────────┘
                        │
                        ▼
      ┌───────────────────────────────────┐
      │ findTotalPathMidpoint(points)     │  [nodeDimensions.ts:L389-L446]
      └─────────────────┬─────────────────┘
                        │
                        ▼
      ┌───────────────────────────────────┐
      │ Pairwise Badge Repulsion Pass     │  [nodeDimensions.ts:L575-L601]
      └─────────────────┬─────────────────┘
                        │
                        ▼
            Rendered Positioned Nodes & Edges
```

---

## 2. Comprehensive Codebase Symbol Directory & Asymptotic Bounds

| Source File | Line Range | Core Functionality | Exported Symbols | Asymptotic Complexity |
| :--- | :--- | :--- | :--- | :--- |
| [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152) | L134–L152 | Primary layout mode dispatcher routing `"left-right"` mode to `computeDagreLayout(dataset, "LR")` | `computeGraphLayout` | $O(1)$ dispatch |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L77-L173) | L77–L173 | Content-aware node width & height dynamic sizing | `calculateNodeDimensions` | $O(1)$ per node |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L178-L187) | L178–L187 | SVG path string formatter from point array | `buildSvgPath` | $O(K)$ points |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L192-L228) | L192–L228 | Ray clipping to node boundary bounding box | `clipPointToNodeRect` | $O(1)$ geometric raycast |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L389-L446) | L389–L446 | Arc-length 50% midpoint & normal vector finder | `findTotalPathMidpoint` | $O(K)$ segment polyline |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) | L451–L604 | Main Dagre graph construction, rankdir configuration, edge clipping & badge repulsion | `computeDagreLayout` | $O(|V| + |E| \log |E| + |E|^2)$ |

---

## 3. Step-by-Step Asymptotic Complexity Derivation & Numerical Worked Example

To evaluate the real-world computational footprint of the Left-to-Right layout pipeline, consider a benchmark microservice graph with $|V| = 20$ service nodes and $|E| = 30$ RPC edges, where each Bezier curve is discretized into $K = 10$ polyline segments.

```
                  NUMERICAL COMPLEXITY PIPELINE BREAKDOWN
                  
  [Phase 1: Node Dims] ──► [Phase 2: Dagre Solver] ──► [Phase 3: Arc Midpoints] ──► [Phase 4: Repulsion Pass]
       O(|V|)                 O(|V| + |E| log |E|)             O(|E| * K)                  O(|E|^2)
     20 ops                  167.21 ops                      300 ops                     435 ops
```

### 3.1 Step-by-Step Arithmetic Calculation

1. **Phase 1: Content Node Sizing & Dimension Registration ($O(|V|)$)**:
   - For $|V| = 20$ nodes:
     $$\text{Ops}_{\text{phase1}} = 20 \times O(1) = 20\text{ operations}$$

2. **Phase 2: Sugiyama DAG Rank & Ordering Solver ($O(|V| + |E| \log_2 |E|)$)**:
   - Base node traversal: $20$ ops
   - Crossing reduction & rank sorting for $|E| = 30$:
     $$\log_2(30) \approx 4.907 \implies 30 \times 4.907 = 147.21\text{ operations}$$
   - Total Phase 2 Ops: $20 + 147.21 = 167.21\text{ operations}$

3. **Phase 3: Polyline Arc-Length 50% Midpoint Extraction ($O(|E| \cdot K)$)**:
   - For $|E| = 30$ edges with $K = 10$ segments per edge:
     $$\text{Ops}_{\text{phase3}} = 30 \times 10 = 300\text{ operations}$$

4. **Phase 4: Pairwise Badge Repulsion Post-Processing Pass ($O(|E|^2)$)**:
   - Pairwise overlap checks for $|E| = 30$ badges:
     $$\text{Ops}_{\text{phase4}} = \frac{|E|(|E|-1)}{2} = \frac{30 \times 29}{2} = 435\text{ pair comparison operations}$$

5. **Master Pipeline Operation Sum**:
   $$\text{Total Operation Units} = 20 + 167.21 + 300 + 435 = 922.21\text{ operations}$$

---

## 4. Validated Implementation Code Snippets

### 4.1 Layout Mode Dispatcher (`layoutDispatcher.ts`)

```typescript
// layoutDispatcher.ts (L134-L152)
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

### 4.2 Dagre Configuration & Top-Left Canvas Origin Recovery (`nodeDimensions.ts`)

```typescript
// nodeDimensions.ts (L451-L493)
export function computeDagreLayout(
  dataset: GraphDataset,
  direction: "TB" | "LR" = "TB",
): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: direction, // Configures "LR" for Left-to-Right space
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
  ...
}
```

### 4.3 Arc-Length Midpoint Calculation (`nodeDimensions.ts`)

```typescript
// nodeDimensions.ts (L389-L415)
export function findTotalPathMidpoint(points: Point2D[]): PathMidpointResult {
  if (points.length === 0) return { x: 0, y: 0, normal: { x: 0, y: 1 } };
  if (points.length === 1) return { x: points[0].x, y: points[0].y, normal: { x: 0, y: 1 } };

  const segmentLengths: number[] = [];
  let totalLength = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    segmentLengths.push(len);
    totalLength += len;
  }

  const targetDist = totalLength / 2;
  let accumulated = 0;
  ...
}
```

---

## 5. Verification & Automated Test Commands

To verify the Left-to-Right layout implementation, run the unit test suite and TypeScript validation:

```bash
# Execute Left-to-Right layout dispatcher unit tests
bun test src/engine/layout/layoutDispatcher.test.ts

# Execute node dimensions & badge repulsion unit tests
bun test src/engine/layout/nodeDimensions.test.ts

# Run complete TypeScript type checking and ESLint audit
bun run typecheck && bun run lint
```

---

## 6. Cross-Reference Index

- Document 01: [Coordinate Space Transformation](./01-coordinate-space-transformation.md)
- Document 02: [Horizontal Cubic Bezier Edge Routing & Badge Repulsion](./02-horizontal-bezier-routing.md)
