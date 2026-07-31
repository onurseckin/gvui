# 04. Codebase Reference Map for Dagre Engines

[← Back to Master Index](../README.md)

This document maps the **Top-Down Dagre Engine** to source code files in GVUI.

---

## 🗺️ Codebase Directory

| File Path | Core Functionality | Primary Exported Symbols |
| :--- | :--- | :--- |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) | Dagre graph construction & execution | `computeDagreLayout` |
| [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L138-L152) | Layout mode dispatcher routing `"top-down-dagre"` | `computeGraphLayout` |

```typescript
// Code Snippet from nodeDimensions.ts
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

  for (const node of dataset.nodes) {
    const dims = calculateNodeDimensions(node);
    g.setNode(node.id, { width: dims.width, height: dims.height });
  }

  for (const edge of dataset.edges) {
    g.setEdge(edge.source, edge.target, { name: edge.id }, edge.id);
  }

  dagre.layout(g);
  return { nodes, edges };
}
```
