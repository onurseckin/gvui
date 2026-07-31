# 01. Coordinate Space Transformation

[← Back to Master Index](../README.md)

This module documents the rotated matrix coordinate space transformation for horizontal **Left-to-Right (LR)** Dagre graph layout.

---

## 1. Matrix Rotation & Coordinate Mapping Mechanics

The Dagre layout engine computes hierarchical graph layouts using a rank-based Sugiyama framework. By default, Dagre operates in a vertical **Top-to-Bottom (TB)** orientation, where ranks correspond to $Y$-coordinates and in-layer node ordering corresponds to $X$-coordinates.

When configured with `rankdir: "LR"`, Dagre internally performs a linear matrix transformation, mapping the Sugiyama hierarchy onto a rotated 2D space:

$$\begin{pmatrix} X_{\text{final}} \\ Y_{\text{final}} \end{pmatrix} = \mathbf{M}_{\text{rot}} \begin{pmatrix} X_{\text{sugiyama}} \\ Y_{\text{sugiyama}} \end{pmatrix} = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix} \begin{pmatrix} X_{\text{sugiyama}} \\ Y_{\text{sugiyama}} \end{pmatrix} = \begin{pmatrix} Y_{\text{sugiyama}} \\ X_{\text{sugiyama}} \end{pmatrix}$$

### Mathematical Properties of the Transformation Matrix $\mathbf{M}_{\text{rot}}$

1. **Orthogonality & Symmetry**:
   $$\mathbf{M}_{\text{rot}} = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix} = \mathbf{M}_{\text{rot}}^T = \mathbf{M}_{\text{rot}}^{-1}$$
   The transformation is an involution, meaning applying it twice restores the original coordinate space ($\mathbf{M}_{\text{rot}}^2 = \mathbf{I}$).

2. **Diagonal Reflection vs. Rotation**:
   The transformation $\mathbf{M}_{\text{rot}}$ represents a reflection across the main diagonal $Y = X$, which is mathematically equivalent to a $90^\circ$ clockwise rotation followed by a vertical reflection across the $X$-axis:
   $$\mathbf{M}_{\text{rot}} = \begin{pmatrix} 1 & 0 \\ 0 & -1 \end{pmatrix} \begin{pmatrix} 0 & 1 \\ -1 & 0 \end{pmatrix} = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix}$$

3. **Inverse Transformation**:
   To project rendered screen coordinates back into Sugiyama layout ranks:
   $$\begin{pmatrix} X_{\text{sugiyama}} \\ Y_{\text{sugiyama}} \end{pmatrix} = \mathbf{M}_{\text{rot}}^{-1} \begin{pmatrix} X_{\text{final}} \\ Y_{\text{final}} \end{pmatrix} = \begin{pmatrix} Y_{\text{final}} \\ X_{\text{final}} \end{pmatrix}$$

---

## 2. ASCII Layout Transformation Diagrams

```
                       VERTICAL LAYOUT (TB)
                      ┌───────────────────┐
                      │    Rank 0 (Y=0)   │
                      └─────────┬─────────┘
                                │  Y-axis (Ranks Flow Down)
                                ▼
                      ┌───────────────────┐
                      │   Rank 1 (Y=120)  │
                      └───────────────────┘

                                  │
                                  │  Matrix Rotation M_rot
                                  ▼

                      HORIZONTAL LAYOUT (LR)
          ┌───────────────────┐       ┌───────────────────┐
          │    Rank 0 (X=0)   │──────►│   Rank 1 (X=120)  │
          └───────────────────┘       └───────────────────┘
            X-axis (Ranks Flow Left-to-Right)
```

### Node Bounding Box Coordinate Mapping

```
     Sugiyama Input (Unrotated)              Rotated Final Coordinate Space
     ┌────────────────────────┐              ┌────────────────────────┐
     │ Width  = W             │  M_rot       │ Width  = H             │
     │ Height = H             │ ───────────► │ Height = W             │
     │ Center = (x_sugi, y_sugi)│            │ Center = (y_sugi, x_sugi)│
     └────────────────────────┘              └────────────────────────┘
```

---

## 3. Dimension Swapping Mathematics

For node dimension computations, node bounding boxes must swap their width and height inputs when configured in Dagre to maintain correct rank spacing and node separation:

$$\text{DagreWidth}(v) = \text{Height}(v), \quad \text{DagreHeight}(v) = \text{Width}(v)$$

After Dagre computes node center coordinates $(X_{\text{dagre}}, Y_{\text{dagre}})$, top-left rendering coordinates $(X_{\text{top-left}}, Y_{\text{top-left}})$ are recovered via:

$$X_{\text{top-left}} = X_{\text{dagre}} - \frac{\text{Width}(v)}{2}$$

$$Y_{\text{top-left}} = Y_{\text{dagre}} - \frac{\text{Height}(v)}{2}$$

---

## 4. Codebase Reference Map

The matrix rotation parameters and Dagre configurations are implemented in the following codebase files:

- [`nodeDimensions.ts` (L451-L604)](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) — `computeDagreLayout` configures `rankdir: "LR"` (L457) and computes bounding box offsets (L483-L492).
- [`layoutDispatcher.ts` (L143-L144)](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L143-L144) — `computeGraphLayout` dispatches `"left-right"` mode directly to `computeDagreLayout(dataset, "LR")`.

```typescript
// Code Snippet from layoutDispatcher.ts (L143-L144)
case "left-right":
  return computeDagreLayout(dataset, "LR");
```

```typescript
// Code Snippet from nodeDimensions.ts (L456-L462)
const g = new dagre.graphlib.Graph({ multigraph: true });
g.setGraph({
  rankdir: direction, // "LR" for Left-to-Right layout
  nodesep: 150,
  ranksep: 120,
  marginx: 80,
  marginy: 80,
});
```
