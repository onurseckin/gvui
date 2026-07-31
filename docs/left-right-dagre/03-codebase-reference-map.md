# 03. Codebase Reference Map for Left-to-Right Dagre Engine

[← Back to Master Index](../README.md)

This document maps the **Left-to-Right (LR) Dagre Engine** mathematical model to implementation files in the GVUI layout subsystem.

---

## 1. Engine Call-Flow & Execution Pipeline Schematic

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

## 2. Codebase Symbol Directory

| Source File | Line Range | Core Functionality | Exported Symbols |
| :--- | :--- | :--- | :--- |
| [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152) | L134–L152 | Primary layout mode dispatcher routing `"left-right"` mode | `computeGraphLayout` |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L77-L173) | L77–L173 | Content-aware node width & height dynamic sizing | `calculateNodeDimensions` |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L178-L187) | L178–L187 | SVG path string formatter from point array | `buildSvgPath` |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L192-L228) | L192–L228 | Ray clipping to node boundary bounding box | `clipPointToNodeRect` |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L389-L446) | L389–L446 | Arc-length 50% midpoint & normal vector finder | `findTotalPathMidpoint` |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) | L451–L604 | Main Dagre graph construction, rankdir configuration, edge clipping & badge repulsion | `computeDagreLayout` |

---

## 3. Validated Implementation Code Snippets

### Layout Mode Dispatcher (`layoutDispatcher.ts`)

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

### Dagre Configuration & Node Offset Calculation (`nodeDimensions.ts`)

```typescript
// nodeDimensions.ts (L451-L493)
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

---

## 4. Cross-Reference Index

- Document 01: [Coordinate Space Transformation](./01-coordinate-space-transformation.md)
- Document 02: [Horizontal Cubic Bezier Edge Routing](./02-horizontal-bezier-routing.md)
