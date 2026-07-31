# 03. Codebase Reference Map for Left-to-Right Dagre Engine

[← Back to Master Index](../README.md)

This document maps the **Left-to-Right (LR) Dagre Engine** mathematical model to implementation files in the GVUI layout subsystem, complete with line anchors, symbol definitions, complexity bounds, and automated test execution commands.

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

## 2. Comprehensive Codebase Symbol Directory

| Source File | Line Range | Core Functionality | Exported Symbols | Asymptotic Complexity |
| :--- | :--- | :--- | :--- | :--- |
| [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152) | L134–L152 | Primary layout mode dispatcher routing `"left-right"` mode to `computeDagreLayout(dataset, "LR")` | `computeGraphLayout` | $O(1)$ dispatch |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L77-L173) | L77–L173 | Content-aware node width & height dynamic sizing | `calculateNodeDimensions` | $O(1)$ per node |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L178-L187) | L178–L187 | SVG path string formatter from point array | `buildSvgPath` | $O(K)$ points |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L192-L228) | L192–L228 | Ray clipping to node boundary bounding box | `clipPointToNodeRect` | $O(1)$ geometric raycast |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L389-L446) | L389–L446 | Arc-length 50% midpoint & normal vector finder | `findTotalPathMidpoint` | $O(K)$ segment polyline |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) | L451–L604 | Main Dagre graph construction, rankdir configuration, edge clipping & badge repulsion | `computeDagreLayout` | $O(V + E \log E + E^2)$ |

---

## 3. Validated Implementation Code Snippets

### 3.1 Layout Mode Dispatcher (`layoutDispatcher.ts`)

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

### 3.2 Dagre Configuration & Top-Left Canvas Origin Recovery (`nodeDimensions.ts`)

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

### 3.3 Arc-Length Midpoint Calculation (`nodeDimensions.ts`)

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

## 4. Verification & Automated Test Commands

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

## 5. Cross-Reference Index

- Document 01: [Coordinate Space Transformation](./01-coordinate-space-transformation.md)
- Document 02: [Horizontal Cubic Bezier Edge Routing & Badge Repulsion](./02-horizontal-bezier-routing.md)
