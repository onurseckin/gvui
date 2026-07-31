# 03. Codebase Reference Map for Concentric Radial Engine

[← Back to Master Index](../README.md)

This document maps the **Concentric Radial Engine** to source code files in GVUI.

---

## 🗺️ Codebase Directory

| File Path | Core Functionality | Primary Exported Symbols |
| :--- | :--- | :--- |
| [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L9-L66) | Polar coordinate calculation & quadratic Bezier generator | `computeRadialLayout` |

```typescript
// Code Snippet from layoutDispatcher.ts
function computeRadialLayout(dataset: GraphDataset): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  const radius = Math.max(280, nodeCount * 45);
  const centerX = radius + 100;
  const centerY = radius + 100;

  const positionedNodes: PositionedNode[] = dataset.nodes.map((node, index) => {
    const dims = calculateNodeDimensions(node);
    const angle = (2 * Math.PI * index) / nodeCount - Math.PI / 2;

    const cx = centerX + radius * Math.cos(angle);
    const cy = centerY + radius * Math.sin(angle);
    return { ...node, x: cx - dims.width / 2, y: cy - dims.height / 2, width: dims.width, height: dims.height };
  });
  // ...
}
```
