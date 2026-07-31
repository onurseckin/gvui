# 03. Codebase Reference Map for Force-Directed Engine

This document maps the **Organic Force Engine** to source code files in GVUI.

---

## 🗺️ Codebase Directory

| File Path | Core Functionality | Primary Exported Symbols |
| :--- | :--- | :--- |
| [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L68-L125) | Physics force simulation loop & straight edge generator | `computeForceLayout` |

```typescript
// Code Snippet from layoutDispatcher.ts
function computeForceLayout(dataset: GraphDataset): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  // ... Fruchterman-Reingold simulation loop ...
}
```
