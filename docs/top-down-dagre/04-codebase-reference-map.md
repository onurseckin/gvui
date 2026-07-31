# 04. Codebase Reference Map for Dagre Engines

[← Back to Master Index](../README.md)

This document maps the **Top-Down Dagre Engine** theoretical algorithms directly to implementation files, exported functions, and exact line anchors in GVUI.

---

## 🗺️ Codebase Directory & Symbol Matrix

| File Path | Core Functionality | Primary Exported Symbols | Verified Line Anchors |
| :--- | :--- | :--- | :--- |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) | Dagre graph construction, layout execution, coordinate conversion & label repulsion pass | `computeDagreLayout`, `calculateNodeDimensions` | [`L451-L604`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) |
| [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152) | Layout mode dispatcher routing `"top-down-dagre"` and `"left-right"` engine execution | `computeGraphLayout` | [`L134-L152`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152) |

---

## 🔍 Verified Source Code Snippets

### 1. `computeDagreLayout` in [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604)

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

  // ... (Edge path routing, node rectangle clipping, and badge repulsion pass)

  return { nodes: positionedNodes, edges: positionedEdges };
}
```

### 2. `computeGraphLayout` Dispatcher in [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152)

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

## 🎯 Implementation Subsystem Breakdown

1. **Graph Configuration & Sizing**: [nodeDimensions.ts:L455-L463](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L455-L463) initializes Graphlib graph parameters (`nodesep: 150`, `ranksep: 120`, `marginx: 80`, `marginy: 80`).
2. **Dagre Execution**: [nodeDimensions.ts:L477](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L477) executes `dagre.layout(g)` performing Network Simplex Layering, Barycentric Crossing Reduction, and Brandes-Köpf Coordinate Assignment.
3. **Coordinate Normalization**: [nodeDimensions.ts:L479-L493](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L479-L493) converts center-origin `(dagreNode.x, dagreNode.y)` coordinates into top-left bounding box coordinates `(x, y)`.
4. **Boundary Clipping**: [nodeDimensions.ts:L518-L562](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L518-L562) clips edge endpoint paths to node boundary rectangles via `clipPointToNodeRect`.
5. **Label Badge Repulsion**: [nodeDimensions.ts:L575-L601](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L575-L601) shifts overlapping edge label badges along $X$ or $Y$ axes.
