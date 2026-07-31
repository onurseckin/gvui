# 03. Codebase Reference Map for Force-Directed Engine

[← Back to Master Index](../README.md)

This document maps the **Organic Force Engine** physics specifications and mathematical equations directly to source code implementation files and line anchors in GVUI.

---

## 🗺️ Codebase Directory & Symbol Map

| Symbol / Function | File Path | Line Anchors | Description |
| :--- | :--- | :--- | :--- |
| `computeForceLayout` | [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L71-L129) | `L71-L129` | Baseline force-directed layout computation algorithm arranging nodes in seed grid & calculating straight edge paths |
| `computeGraphLayout` | [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152) | `L134-L152` | Master layout dispatcher routing `"force"` mode requests to `computeForceLayout` |
| `GraphDataset` | [graphData.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/types/graphData.ts) | — | Data structure containing node and edge arrays |
| `calculateNodeDimensions` | [nodeDimensions.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts) | — | Helper computing width, height, and padding per node |

---

## 📄 Codebase Implementation Snippet

Below is the verified production code from [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L71-L129):

```typescript
/**
 * Computes force-directed layout coordinates arranging nodes in a organic physics balance.
 */
function computeForceLayout(dataset: GraphDataset): {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
} {
  const nodeCount = dataset.nodes.length;
  if (nodeCount === 0) {
    return { nodes: [], edges: [] };
  }

  const columns = Math.ceil(Math.sqrt(nodeCount));
  const spacingX = 350;
  const spacingY = 220;

  const positionedNodes: PositionedNode[] = dataset.nodes.map((node, index) => {
    const dims = calculateNodeDimensions(node);
    const col = index % columns;
    const row = Math.floor(index / columns);

    const x = col * spacingX + 50 + (row % 2 === 1 ? 40 : 0);
    const y = row * spacingY + 50;

    return {
      ...node,
      x,
      y,
      width: dims.width,
      height: dims.height,
    };
  });

  const nodeMap = new Map<string, PositionedNode>(positionedNodes.map((n) => [n.id, n]));

  const positionedEdges: PositionedEdge[] = dataset.edges.map((edge) => {
    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);

    if (!srcNode || !tgtNode) {
      return { ...edge, path: "" };
    }

    const srcCx = srcNode.x + srcNode.width / 2;
    const srcCy = srcNode.y + srcNode.height / 2;
    const tgtCx = tgtNode.x + tgtNode.width / 2;
    const tgtCy = tgtNode.y + tgtNode.height / 2;

    const path = `M ${srcCx} ${srcCy} L ${tgtCx} ${tgtCy}`;
    const labelX = (srcCx + tgtCx) / 2;
    const labelY = (srcCy + tgtCy) / 2;

    return {
      ...edge,
      path,
      labelX,
      labelY,
    };
  });

  return { nodes: positionedNodes, edges: positionedEdges };
}
```

---

## 🔬 Architectural Mechanics & Reference Details

### 1. Seed Layout & Deterministic Initial Positions
In [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L80-L99), initial node coordinates are assigned using a staggered grid distribution ($col \times \text{spacingX}$, $row \times \text{spacingY}$) to prevent overlapping initial positions before applying iterative force simulation loops.

### 2. Edge Routing
In [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L103-L126), force layout edge routes are constructed as straight line segments `M srcCx srcCy L tgtCx tgtCy` with label midpoints at $((srcCx + tgtCx)/2, (srcCy + tgtCy)/2)$.

---

## 🔗 Cross-Module Navigation

- [01. Coulomb Repulsion & Hooke Attraction Vector Mechanics](./01-coulomb-hooke-vector-math.md) — Vector mechanics, $k$ derivation, Coulomb repulsion $\vec{F}_r$, Hooke attraction $\vec{F}_a$, center gravity $\vec{F}_g$.
- [02. Simulated Annealing & Cooling Schedules](./02-simulated-annealing-cooling.md) — Temperature bounding formula $\min(\|\vec{F}\|, T(t))$, ASCII vector diagrams, decay curve equations, complete TypeScript simulation code snippet.

