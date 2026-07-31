# 03. Codebase Reference Map for Concentric Radial Engine

[← Back to Master Index](../README.md)

This document maps the **Concentric Radial Engine** specification, polar coordinate equations, and Bezier hub routing mechanics directly to source code line anchors in the GVUI codebase.

---

## ⚡ Asymptotic Complexity Bounds

```
┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ Algorithm Stage               │ Time Complexity               │ Space Complexity              │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Dynamic Radius & Center Setup │ O(1)                          │ O(1)                          │
│ Node Polar Transformation     │ O(|V|)                        │ O(|V|)                        │
│ Node Lookup Map Construction  │ O(|V|)                        │ O(|V|)                        │
│ Edge Quadratic Bezier Routing │ O(|E|)                        │ O(|E|)                        │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Master Concentric Engine Total│ O(|V| + |E|)                  │ O(|V| + |E|)                  │
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

- **Time Complexity $O(|V| + |E|)$**: Nodes are positioned in a single $O(|V|)$ pass using closed-form polar-to-Cartesian trigonometric equations without iterative physical simulation or sorting. Edges are routed in a single $O(|E|)$ pass with $O(1)$ node lookup via `nodeMap`.
- **Space Complexity $O(|V| + |E|)$**: Allocates memory for `positionedNodes` of size $|V|$, `nodeMap` hash table of size $|V|$, and `positionedEdges` array of size $|E|$.

---

## 🗺️ Codebase Directory & Symbol Matrix

| File Path | Core Functionality | Primary Exported / Internal Symbols | Line Anchors |
| :--- | :--- | :--- | :--- |
| [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L9-L66) | Polar coordinate calculation & quadratic Bezier edge generator | `computeRadialLayout` | [L9-L66](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L9-L66) |
| [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152) | Layout dispatcher handling `"radial"` layout mode switch | `computeGraphLayout` | [L134-L152](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152) |
| [nodeDimensions.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L1-L50) | Node bounding box calculation helper | `calculateNodeDimensions` | [L1-L50](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L1-L50) |

---

## 💻 Primary Source Code Implementation

The complete implementation of `computeRadialLayout` in [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L9-L66):

```typescript
/**
 * Computes radial layout coordinates where nodes are arranged along concentric circular paths.
 */
function computeRadialLayout(dataset: GraphDataset): {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
} {
  const nodeCount = dataset.nodes.length;
  if (nodeCount === 0) {
    return { nodes: [], edges: [] };
  }

  const radius = Math.max(280, nodeCount * 45);
  const centerX = radius + 100;
  const centerY = radius + 100;

  const positionedNodes: PositionedNode[] = dataset.nodes.map((node, index) => {
    const dims = calculateNodeDimensions(node);
    const angle = (2 * Math.PI * index) / nodeCount - Math.PI / 2;

    const cx = centerX + radius * Math.cos(angle);
    const cy = centerY + radius * Math.sin(angle);

    return {
      ...node,
      x: cx - dims.width / 2,
      y: cy - dims.height / 2,
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

    const path = `M ${srcCx} ${srcCy} Q ${centerX} ${centerY} ${tgtCx} ${tgtCy}`;
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

## 🔍 Step-by-Step Execution Breakdown

1. **Base Case Validation** ([L14-L16](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L14-L16)):
   Checks if `dataset.nodes.length === 0` and immediately returns empty arrays if no nodes exist.

2. **Orbit Geometry Setup** ([L18-L20](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L18-L20)):
   Calculates `radius = Math.max(280, nodeCount * 45)` and canvas center origin `centerX = radius + 100`, `centerY = radius + 100`.

3. **Node Polar Transformation Loop** ([L22-L36](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L22-L36)):
   Computes angular displacement `angle = (2 * Math.PI * index) / nodeCount - Math.PI / 2`, converts polar space to Cartesian center `(cx, cy)`, and subtracts half-dimensions `(dims.width / 2, dims.height / 2)` to determine node top-left origin `(x, y)`.

4. **Node Lookup Map Creation** ([L38](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L38)):
   Constructs a `Map<string, PositionedNode>` mapping node IDs to positioned node instances for $O(1)$ lookup during edge routing.

5. **Edge Quadratic Bezier Routing Loop** ([L40-L63](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L40-L63)):
   Retrieves source and target node centers `(srcCx, srcCy)` and `(tgtCx, tgtCy)`, builds the SVG quadratic Bezier curve path string `M ${srcCx} ${srcCy} Q ${centerX} ${centerY} ${tgtCx} ${tgtCy}`, and computes label placement at linear chord midpoint `labelX = (srcCx + tgtCx) / 2`, `labelY = (srcCy + tgtCy) / 2`.

6. **Dispatcher Mode Handler** ([L147-L148](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L147-L148)):
   Executes `computeRadialLayout(dataset)` when `mode === "radial"` inside `computeGraphLayout`.

---

## 🧪 Executable Test & Quality Verification Commands

To verify and validate the Concentric Radial Engine implementation and documentation integrity:

```bash
# Typecheck TypeScript files
bun run typecheck

# Lint files using Oxlint / ESLint
bun run lint
```
