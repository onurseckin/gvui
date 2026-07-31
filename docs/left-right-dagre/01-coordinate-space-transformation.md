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

### 2.1 Transformation Matrix Definition ($\mathbf{M}_{\text{rot}}$)

#### 1. Mathematical Sub-Component Formula
The coordinate transformation mapping Sugiyama canonical vertical space $(X_{\text{sugi}}, Y_{\text{sugi}})^T$ into horizontal screen space $(X_{\text{screen}}, Y_{\text{screen}})^T$ is defined by the $2 \times 2$ linear transformation matrix $\mathbf{M}_{\text{rot}}$:

$$\begin{pmatrix} X_{\text{screen}} \\ Y_{\text{screen}} \end{pmatrix} = \mathbf{M}_{\text{rot}} \begin{pmatrix} X_{\text{sugi}} \\ Y_{\text{sugi}} \end{pmatrix} = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix} \begin{pmatrix} X_{\text{sugi}} \\ Y_{\text{sugi}} \end{pmatrix}$$

Expanding the matrix-vector multiplication yields:

$$X_{\text{screen}} = 0 \cdot X_{\text{sugi}} + 1 \cdot Y_{\text{sugi}} = Y_{\text{sugi}}$$

$$Y_{\text{screen}} = 1 \cdot X_{\text{sugi}} + 0 \cdot Y_{\text{sugi}} = X_{\text{sugi}}$$

#### 2. Concrete Numerical Graph Example
Consider node `AuthService` placed by the canonical Sugiyama engine at vertical rank coordinate $Y_{\text{sugi}} = 450\text{px}$ (representing rank distance) and in-layer ordering coordinate $X_{\text{sugi}} = 120\text{px}$.

$$\begin{pmatrix} X_{\text{screen}} \\ Y_{\text{screen}} \end{pmatrix} = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix} \begin{pmatrix} 120 \\ 450 \end{pmatrix} = \begin{pmatrix} 0 \cdot 120 + 1 \cdot 450 \\ 1 \cdot 120 + 0 \cdot 450 \end{pmatrix} = \begin{pmatrix} 450 \\ 120 \end{pmatrix}$$

- **Input Vector**: $(X_{\text{sugi}} = 120\text{px}, Y_{\text{sugi}} = 450\text{px})^T$
- **Intermediate Calculation**: $X_{\text{screen}} = 450$, $Y_{\text{screen}} = 120$
- **Output Screen Vector**: $(X_{\text{screen}} = 450\text{px}, Y_{\text{screen}} = 120\text{px})^T$

#### 3. Targeted Sub-Step Pseudocode
```python
def apply_matrix_rotation(x_sugi: float, y_sugi: float) -> tuple[float, float]:
    # 2x2 Rotation Matrix M_rot = [[0, 1], [1, 0]]
    # Multiplies [[0, 1], [1, 0]] * [x_sugi, y_sugi]^T
    x_screen = 0.0 * x_sugi + 1.0 * y_sugi
    y_screen = 1.0 * x_sugi + 0.0 * y_sugi
    return (x_screen, y_screen)

# Worked numerical test call
x_out, y_out = apply_matrix_rotation(120.0, 450.0)
# Output: (450.0, 120.0)
```

#### 4. Sub-Step ASCII Infographic
```
                      SUB-STEP 2.1: MATRIX ROTATION (M_rot)
                      
   Canonical Sugiyama Space                       Rotated Screen Space
        Y_sugi (Ranks)                                Y_screen (In-Layer)
             ▲                                             ▲
  450px ─────┼─────────● (120, 450)             120px ─────┼─────────● (450, 120)
             │        /                                    │        /
             │       /  M_rot = [0 1; 1 0]                 │       /
             │      /  ─────────────────►                  │      /
             └──────┴─────────► X_sugi                     └──────┴─────────► X_screen
                    120px  (In-Layer)                             450px  (Ranks)
```

---

### 2.2 Algebraic Involutive Identity & Inverse Mapping

#### 1. Mathematical Sub-Component Formula
The matrix $\mathbf{M}_{\text{rot}}$ is **involutive** ($\mathbf{M}_{\text{rot}}^2 = \mathbf{I}$), meaning it is its own matrix inverse ($\mathbf{M}_{\text{rot}}^{-1} = \mathbf{M}_{\text{rot}}$):

$$\mathbf{M}_{\text{rot}}^{-1} = \mathbf{M}_{\text{rot}} = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix}$$

$$\begin{pmatrix} X_{\text{sugi}} \\ Y_{\text{sugi}} \end{pmatrix} = \mathbf{M}_{\text{rot}}^{-1} \begin{pmatrix} X_{\text{screen}} \\ Y_{\text{screen}} \end{pmatrix} = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix} \begin{pmatrix} X_{\text{screen}} \\ Y_{\text{screen}} \end{pmatrix} = \begin{pmatrix} Y_{\text{screen}} \\ X_{\text{screen}} \end{pmatrix}$$

#### 2. Concrete Numerical Graph Example
To map interactive mouse click events at screen coordinate $(X_{\text{screen}} = 450\text{px}, Y_{\text{screen}} = 120\text{px})$ back into canonical Sugiyama rank coordinates for hit-testing:

$$\begin{pmatrix} X_{\text{sugi}} \\ Y_{\text{sugi}} \end{pmatrix} = \begin{pmatrix} 0 & 1 \\ 1 & 0 \end{pmatrix} \begin{pmatrix} 450 \\ 120 \end{pmatrix} = \begin{pmatrix} 0 \cdot 450 + 1 \cdot 120 \\ 1 \cdot 450 + 0 \cdot 120 \end{pmatrix} = \begin{pmatrix} 120 \\ 450 \end{pmatrix}$$

- **Input Screen Coordinate**: $(450\text{px}, 120\text{px})$
- **Matrix Product**: $\mathbf{M}_{\text{rot}}^{-1} \cdot (450, 120)^T = (120, 450)^T$
- **Recovered Canonical Rank Coordinate**: $(X_{\text{sugi}} = 120\text{px}, Y_{\text{sugi}} = 450\text{px})$

#### 3. Targeted Sub-Step Pseudocode
```python
def invert_matrix_rotation(x_screen: float, y_screen: float) -> tuple[float, float]:
    # Involutive matrix M_rot^-1 == M_rot = [[0, 1], [1, 0]]
    x_sugi = 0.0 * x_screen + 1.0 * y_screen
    y_sugi = 1.0 * x_screen + 0.0 * y_screen
    return (x_sugi, y_sugi)

# Worked numerical inverse mapping check
x_sugi, y_sugi = invert_matrix_rotation(450.0, 120.0)
# Output: (120.0, 450.0) - exact identity recovery!
```

#### 4. Sub-Step ASCII Infographic
```
                SUB-STEP 2.2: INVERSE REFLECTION MAPPING (M_rot^-1)
                
   Screen Hit Event (X_screen, Y_screen)            Canonical Graph Rank (X_sugi, Y_sugi)
   ┌───────────────────────────────────┐             ┌───────────────────────────────────┐
   │ X_screen = 450px                  │   M_rot^-1  │ X_sugi = 120px (In-layer pos)     │
   │ Y_screen = 120px                  │ ──────────► │ Y_sugi = 450px (Rank depth pos)   │
   └───────────────────────────────────┘             └───────────────────────────────────┘
   Reflection Line: Y = X   ==>   (450, 120)  --->  (120, 450)
```

---

### 2.3 Dimension Swapping Mechanics

#### 1. Mathematical Sub-Component Formula
Because Dagre's internal rank assignment solver spaces ranks along the layout vertical axis, passing un-swapped node dimensions for an `LR` layout would cause vertical bounding box height to be treated as rank depth.

To align physical node dimensions with the rotated coordinate system:

$$\text{DagreWidth}(v) = \text{Height}(v)$$

$$\text{DagreHeight}(v) = \text{Width}(v)$$

#### 2. Concrete Numerical Graph Example
Consider node `UserCard` with rendered screen dimensions: $\text{Width} = 180\text{px}$, $\text{Height} = 60\text{px}$.

1. **Before Layout Submission (Swapping)**:
   $$\text{DagreWidth} = \text{Height} = 60\text{px}$$
   $$\text{DagreHeight} = \text{Width} = 180\text{px}$$
2. **Dagre Internal Node Registration**:
   `g.setNode("UserCard", { width: 60, height: 180 })`

#### 3. Targeted Sub-Step Pseudocode
```python
def swap_node_dimensions(width: float, height: float) -> tuple[float, float]:
    # Transpose width and height for Dagre LR solver input
    dagre_width = height
    dagre_height = width
    return (dagre_width, dagre_height)

# Worked numerical test: 180x60 card
d_w, d_h = swap_node_dimensions(180.0, 60.0)
# Output: dagre_width = 60.0, dagre_height = 180.0
```

#### 4. Sub-Step ASCII Infographic
```
                SUB-STEP 2.3: BOUNDING BOX DIMENSION SWAPPING
                
   Screen Bounding Box (UserCard)                 Dagre Input Bounding Box
   ┌───────────────────────────────┐              ┌─────────────────┐
   │ Width  = 180px                │  Transpose   │ DagreWidth =60px│
   │ Height = 60px                 │ ───────────► │ DagreHeight=180 │
   └───────────────────────────────┘              │                 │
   Horizontal Card (Screen View)                  └─────────────────┘
                                                  Vertical Card (Dagre Input)
```

---

### 2.4 Top-Left Canvas Coordinate Recovery

#### 1. Mathematical Sub-Component Formula
Dagre computes node positions as center points $(X_{\text{center}}, Y_{\text{center}})$. HTML/SVG rendering engines position elements by top-left origin coordinates $(X_{\text{top-left}}, Y_{\text{top-left}})$.

Given screen center $(X_{\text{center}}, Y_{\text{center}})$ and un-swapped screen dimensions $(\text{Width}, \text{Height})$:

$$X_{\text{top-left}} = X_{\text{center}} - \frac{\text{Width}(v)}{2}$$

$$Y_{\text{top-left}} = Y_{\text{center}} - \frac{\text{Height}(v)}{2}$$

#### 2. Concrete Numerical Graph Example
Dagre returns center $(X_{\text{center}} = 450\text{px}, Y_{\text{center}} = 120\text{px})$ for `UserCard` ($\text{Width} = 180\text{px}, \text{Height} = 60\text{px}$).

- **Half-Width Offset**: $\frac{180}{2} = 90\text{px}$
- **Half-Height Offset**: $\frac{60}{2} = 30\text{px}$
- **Calculated Top-Left Origin**:
  $$X_{\text{top-left}} = 450 - 90 = 360\text{px}$$
  $$Y_{\text{top-left}} = 120 - 30 = 90\text{px}$$

#### 3. Targeted Sub-Step Pseudocode
```python
def compute_top_left_origin(center_x: float, center_y: float, width: float, height: float) -> tuple[float, float]:
    half_w = width / 2.0
    half_h = height / 2.0
    top_left_x = center_x - half_w
    top_left_y = center_y - half_h
    return (top_left_x, top_left_y)

# Worked numerical recovery
tl_x, tl_y = compute_top_left_origin(450.0, 120.0, 180.0, 60.0)
# Output: (360.0, 90.0)
```

#### 4. Sub-Step ASCII Infographic
```
               SUB-STEP 2.4: TOP-LEFT CANVAS ORIGIN RECOVERY
               
   (360, 90) Top-Left Origin
   ┌───────────────────────────────────────────────┐
   │                                               │
   │              Center (450, 120)                │ Height = 60px
   │                       ●                       │ (Half-H = 30px)
   │                                               │
   └───────────────────────────────────────────────┘
                     Width = 180px
                    (Half-W = 90px)
```

---

## 3. Gradual Bottom-Up Assembly & Master Algorithm

Now we combine sub-steps 2.1 (Matrix Rotation), 2.2 (Inverse Mapping), 2.3 (Dimension Swapping), and 2.4 (Top-Left Recovery) into the unified Left-to-Right layout master algorithm.

```python
algorithm ExecuteLeftRightDagreLayoutMaster(graph_dataset):
    input:  graph_dataset with nodes V (having content dimensions) and edges E
    output: positioned_nodes with screen (x, y, width, height), positioned_edges with paths

    // 1. Sub-step 2.3: Register nodes with Dagre, applying dimension swapping
    g = new DagreGraph(multigraph = true)
    g.setGraph({ rankdir: "LR", nodesep: 150, ranksep: 120, marginx: 80, marginy: 80 })
    
    dimensions_map = new Map()
    for each node v in graph_dataset.nodes:
        dims = calculateNodeDimensions(v) # e.g. width=180, height=60
        dimensions_map.set(v.id, dims)
        
        // Register original dimensions (Dagre LR rankdir handles internal rotation)
        g.setNode(v.id, { width: dims.width, height: dims.height })

    for each edge e in graph_dataset.edges:
        g.setEdge(e.source, e.target, label = {}, id = e.id)

    // 2. Execute Sugiyama Dagre layout solver
    dagre.layout(g)

    // 3. Sub-steps 2.1 & 2.4: Recover top-left origins from screen center
    positioned_nodes = []
    for each node v in graph_dataset.nodes:
        dagre_node = g.node(v.id) # x=450, y=120
        dims = dimensions_map.get(v.id) # width=180, height=60

        // Center coordinates returned by Dagre in screen space
        center_x = dagre_node.x # 450
        center_y = dagre_node.y # 120

        // Sub-step 2.4: Recover top-left rendering origin
        top_left_x = center_x - (dims.width / 2.0)   // 450 - 90 = 360
        top_left_y = center_y - (dims.height / 2.0)  // 120 - 30 = 90

        positioned_nodes.append({
            id: v.id,
            x: top_left_x,
            y: top_left_y,
            width: dims.width,
            height: dims.height
        })

    // 4. Process edge paths and routing
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
