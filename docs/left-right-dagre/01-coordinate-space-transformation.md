# 01. Coordinate Space Transformation

[← Back to Master Index](../README.md)

This module documents the rotated matrix coordinate space transformation for the horizontal **Left-to-Right (LR)** Dagre graph layout engine.

---

## 1. The Problem & Trade-off Journey

### 1.1 Visualizing Sequential Trace Logs & Timelines

In modern graph visualization, sequential data—such as distributed trace spans, microservice execution call stacks, CI/CD pipeline stages, and workflow state machines—inherently represents progression along a temporal or logical axis.

- **Vertical Top-to-Bottom (TB) Layouts** force the timeline downward. While natural for vertical document scrolling, TB layout degrades horizontal screen real estate utilization on modern widescreen displays ($16:9$ or $16:10$ aspect ratios), resulting in deep, narrow diagrams requiring excessive vertical scrolling.
- **Left-to-Right (LR) Layouts** align horizontal screen space with human reading habits (left-to-right in Western scripts) and temporal progression ($t_0 \to t_1 \to t_2$). Nodes stretch horizontally across ranks, matching the wide aspect ratio of desktop viewports.

```
       VERTICAL (TB) ORIENTATION                  HORIZONTAL (LR) ORIENTATION
       [Widescreen Aspect Ratio: 16:9]            [Widescreen Aspect Ratio: 16:9]
       ┌────────────────────────────┐             ┌────────────────────────────┐
       │     ┌──────────────┐       │             │ ┌──────┐  ┌──────┐  ┌──────┐ │
       │     │    Step 1    │       │             │ │Step 1├──►│Step 2├──►│Step 3│ │
       │     └──────┬───────┘       │             │ └──────┘  └──────┘  └──────┘ │
       │            │               │             └────────────────────────────┘
       │            ▼               │             Fits naturally inside viewport!
       │     ┌──────────────┐       │
       │     │    Step 2    │       │
       │     └──────┬───────┘       │
       │            │ (Scrolls down)│
       └────────────┼───────────────┘
                    ▼
```

### 1.2 Architectural Dilemma: Engine Re-implementation vs. Coordinate Matrix Transformation

To support Left-to-Right layouts, graph visualization architectures face a core design decision:

1. **Option A: Re-writing a Dedicated Horizontal Sugiyama Engine**
   - Re-implement all 4 Sugiyama phases (Cycle Breaking, Rank Assignment via Network Simplex, Barycentric Crossing Reduction, Brandes-Köpf Coordinate Assignment) with horizontal coordinates ($X$ for ranks, $Y$ for ordering).
   - **Drawbacks**: Massive code duplication ($\sim 1,500+$ lines of redundant algorithmic logic), dual bug surface, and maintenance drift between TB and LR code paths.

2. **Option B: Matrix Coordinate Transformation Wrapper (Chosen Solution)**
   - Retain the battle-tested, highly optimized Sugiyama DAG engine operating in a canonical vertical coordinate space.
   - Before passing node dimensions to the engine, transpose the node bounding boxes ($\text{Width} \leftrightarrow \text{Height}$).
   - After the engine computes layout coordinates, map the output coordinates back to screen space using a linear matrix rotation transformation $\mathbf{M}_{\text{rot}}$.

| Architectural Metric | Re-written Horizontal Engine | Matrix Transformation Wrapper (Chosen) |
| :--- | :--- | :--- |
| **Code Footprint** | $+1,500$ lines of duplicate code | $\sim 20$ lines of matrix mapping logic |
| **Maintenance Burden** | High (fixes must be ported twice) | Zero (single engine core) |
| **Algorithmic Correctness** | High risk of subtle divergence | $100\%$ identity parity with vertical layout |
| **Runtime Performance Overhead** | $O(N + E)$ initialization | $O(N)$ coordinate transpositions |

---

## 2. Bottom-Up Mathematical Deconstruction

### 2.1 Transformation Matrix Definition

The coordinate transformation mapping Sugiyama canonical vertical space $(X_{\text{sugi}}, Y_{\text{sugi}})^T$ into horizontal screen space $(X_{\text{screen}}, Y_{\text{screen}})^T$ is defined by the $2 \times 2$ linear transformation matrix $\mathbf{M}_{\text{rot}}$:

$$\begin{pmatrix} X_{\text{screen}} \\ Y_{\text{screen}} \end{pmatrix} = \mathbf{M}_{\text{rot}} \begin{pmatrix} X_{\text{sugi}} \\ Y_{\text{sugi}} \end{pmatrix} = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix} \begin{pmatrix} X_{\text{sugi}} \\ Y_{\text{sugi}} \end{pmatrix}$$

Expanding the matrix-vector multiplication yields:

$$X_{\text{screen}} = 0 \cdot X_{\text{sugi}} + 1 \cdot Y_{\text{sugi}} = Y_{\text{sugi}}$$

$$Y_{\text{screen}} = 1 \cdot X_{\text{sugi}} + 0 \cdot Y_{\text{sugi}} = X_{\text{sugi}}$$

### 2.2 Algebraic Involutive Identity & Inverse Mapping

The transformation matrix $\mathbf{M}_{\text{rot}}$ possesses unique geometric and algebraic properties:

1. **Symmetry & Orthogonality**:
   $$\mathbf{M}_{\text{rot}}^T = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix} = \mathbf{M}_{\text{rot}}$$

2. **Involutive Property ($\mathbf{M}_{\text{rot}}^2 = \mathbf{I}$)**:
   Multiplying $\mathbf{M}_{\text{rot}}$ by itself returns the identity matrix $\mathbf{I}$:
   $$\mathbf{M}_{\text{rot}}^2 = \mathbf{M}_{\text{rot}} \mathbf{M}_{\text{rot}} = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix} \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix} = \begin{pmatrix} 0 \cdot 0 + 1 \cdot 1 & 0 \cdot 1 + 1 \cdot 0 \\ 1 \cdot 0 + 0 \cdot 1 & 1 \cdot 1 + 0 \cdot 0 \end{pmatrix} = \begin{pmatrix} 1 & 0 \\ 0 & 1 \end{pmatrix} = \mathbf{I}$$

3. **Self-Inverse Mapping ($\mathbf{M}_{\text{rot}}^{-1} = \mathbf{M}_{\text{rot}}$)**:
   Because $\mathbf{M}_{\text{rot}}^2 = \mathbf{I}$, the inverse matrix is identical to the transformation matrix itself:
   $$\mathbf{M}_{\text{rot}}^{-1} = \mathbf{M}_{\text{rot}} = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix}$$

   Therefore, projecting horizontal screen coordinates back into canonical Sugiyama rank coordinates uses the exact same linear transformation:
   $$\begin{pmatrix} X_{\text{sugi}} \\ Y_{\text{sugi}} \end{pmatrix} = \mathbf{M}_{\text{rot}}^{-1} \begin{pmatrix} X_{\text{screen}} \\ Y_{\text{screen}} \end{pmatrix} = \begin{pmatrix} Y_{\text{screen}} \\ X_{\text{screen}} \end{pmatrix}$$

4. **Diagonal Reflection Duality**:
   Geometrically, $\mathbf{M}_{\text{rot}}$ performs a reflection across the main diagonal line $Y = X$. This is equivalent to a $90^\circ$ clockwise rotation followed by a vertical reflection across the $X$-axis:
   $$\mathbf{M}_{\text{rot}} = \mathbf{S}_y \cdot \mathbf{R}_{90^\circ} = \begin{pmatrix} 1 & 0 \\ 0 & -1 \end{pmatrix} \begin{pmatrix} 0 & 1 \\ -1 & 0 \end{pmatrix} = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix}$$

### 2.3 Dimension Swapping Mechanics

Because rank spacing ($\text{ranksep}$) in Sugiyama operates along the vertical $Y$-axis and in-layer node separation ($\text{nodesep}$) operates along the horizontal $X$-axis, passing un-rotated node dimensions to Dagre when configured for `rankdir: "LR"` would cause rank overlap.

To maintain correct spatial margins, node bounding box dimensions are swapped prior to layout execution:

$$\text{DagreWidth}(v) = \text{Height}(v)$$

$$\text{DagreHeight}(v) = \text{Width}(v)$$

### 2.4 Top-Left Canvas Coordinate Recovery

Dagre computes node positions based on node bounding box center coordinates $(X_{\text{center}}, Y_{\text{center}})$. Canvas rendering engines require top-left origin coordinates $(X_{\text{top-left}}, Y_{\text{top-left}})$.

After applying matrix transformation and un-swapping dimensions, top-left canvas coordinates are calculated as:

$$X_{\text{top-left}} = X_{\text{center}} - \frac{\text{Width}(v)}{2}$$

$$Y_{\text{top-left}} = Y_{\text{center}} - \frac{\text{Height}(v)}{2}$$

---

## 3. Step-by-Step Computational Pseudocode

The complete coordinate space transformation and Dagre layout pipeline is executed via the following algorithm:

```python
algorithm ExecuteLeftRightDagreLayout(graph_dataset):
    input:  graph_dataset containing nodes V and edges E
    output: positioned_nodes with (x, y, width, height), positioned_edges with paths

    // Step 1: Initialize Dagre multigraph with LR orientation
    g = new DagreGraph(multigraph = true)
    g.setGraph({
        rankdir: "LR",
        nodesep: 150,   // Spacing between nodes in same rank (Y-axis in LR)
        ranksep: 120,   // Spacing between adjacent ranks (X-axis in LR)
        marginx: 80,
        marginy: 80
    })

    // Step 2: Register nodes with swapped dimensions
    dimensions_map = new Map()
    for each node v in graph_dataset.nodes:
        dims = calculateNodeDimensions(v)  // Content-aware width & height
        dimensions_map.set(v.id, dims)

        // Dagre handles LR rankdir internally by expecting actual node dims
        g.setNode(v.id, { width: dims.width, height: dims.height })

    for each edge e in graph_dataset.edges:
        g.setEdge(e.source, e.target, label = {}, id = e.id)

    // Step 3: Execute Sugiyama Dagre layout computation
    dagre.layout(g)

    // Step 4: Extract positioned nodes and recover top-left canvas origins
    positioned_nodes = []
    for each node v in graph_dataset.nodes:
        dagre_node = g.node(v.id)
        dims = dimensions_map.get(v.id)

        center_x = dagre_node.x
        center_y = dagre_node.y

        // Recover top-left coordinates: X_topleft = X_center - W/2
        top_left_x = center_x - (dims.width / 2)
        top_left_y = center_y - (dims.height / 2)

        positioned_nodes.append({
            id: v.id,
            x: top_left_x,
            y: top_left_y,
            width: dims.width,
            height: dims.height
        })

    // Step 5: Process edge control points and path routing
    positioned_edges = processEdgePaths(g, graph_dataset.edges, positioned_nodes)

    return { nodes: positioned_nodes, edges: positioned_edges }
```

---

## 4. Visual ASCII Diagrams

### 4.1 Coordinate Space Matrix Reflection ($Y = X$)

```
                     CANONICAL VERTICAL (TB) SPACE
                               Y-axis (Ranks)
                                  │
                                  │  Rank 0 (Y=0)
                                  ▼
                            ┌──────────┐
                            │  Node A  │
                            └────┬─────┘
                                 │
                                 ▼  Rank 1 (Y=120)
                            ┌──────────┐
                            │  Node B  │
                            └──────────┘
                                 └──────────► X-axis (In-layer ordering)

                                      │
                                      │  Transformation Matrix M_rot = [0 1; 1 0]
                                      ▼

                     ROTATED HORIZONTAL (LR) SPACE
     Y-axis (In-layer)
        ▲
        │
        │      ┌──────────┐            ┌──────────┐
        ├─────►│  Node A  ├───────────►│  Node B  │
        │      └──────────┘            └──────────┘
        │      Rank 0 (X=0)            Rank 1 (X=120)
        └─────────────────────────────────────────────► X-axis (Ranks)
```

### 4.2 Bounding Box Dimension Swapping

```
      Sugiyama Input Bounding Box                 Rotated Final Screen Bounding Box
      ┌──────────────────────────┐                 ┌──────────────────────────┐
      │ Width  = W               │   M_rot         │ Width  = W               │
      │ Height = H               │ ──────────────► │ Height = H               │
      │ Center = (X_sugi, Y_sugi)│                 │ Center = (Y_sugi, X_sugi)│
      └──────────────────────────┘                 └──────────────────────────┘
```

---

## 5. Codebase Reference Map

The linear coordinate transformation and Left-to-Right layout configuration are implemented in the following codebase files:

- [`layoutDispatcher.ts` (L134–L152)](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152) — `computeGraphLayout` dispatches `"left-right"` mode directly to `computeDagreLayout(dataset, "LR")`.
- [`nodeDimensions.ts` (L451–L493)](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L493) — `computeDagreLayout` configures `rankdir: "LR"` on line 457 and calculates top-left bounding box origins on lines 483–492.

```typescript
// Code Snippet from layoutDispatcher.ts (L143-L144)
case "left-right":
  return computeDagreLayout(dataset, "LR");
```

```typescript
// Code Snippet from nodeDimensions.ts (L456-L462)
const g = new dagre.graphlib.Graph({ multigraph: true });
g.setGraph({
  rankdir: direction, // "LR" configures Left-to-Right matrix space
  nodesep: 150,
  ranksep: 120,
  marginx: 80,
  marginy: 80,
});
```
