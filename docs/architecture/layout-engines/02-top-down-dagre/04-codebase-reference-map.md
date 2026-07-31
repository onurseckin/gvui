# 04. Codebase Reference Map for Dagre Engines

This document maps the **Top-Down Dagre Engine** to source code files in GVUI.

---

## 🗺️ Codebase Directory

| File Path | Core Functionality | Primary Exported Symbols |
| :--- | :--- | :--- |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts) | Dagre graph construction & execution | `computeDagreLayout` |
| [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts) | Layout mode routing dispatcher | `computeGraphLayout` |

```typescript
// Code Snippet from nodeDimensions.ts
export function computeDagreLayout(
  dataset: GraphDataset,
  rankdir: "TB" | "LR" = "TB",
): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir, nodesep: 56, ranksep: 120 });
  g.setDefaultEdgeLabel(() => ({}));
  // ...
  dagre.layout(g);
  // ...
  return { nodes, edges };
}
```
