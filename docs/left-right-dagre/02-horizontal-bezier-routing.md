# 02. Horizontal Cubic Bezier Edge Routing & Badge Repulsion

[← Back to Master Index](../README.md)

This module documents horizontal **Cubic Bezier curve edge routing**, polyline arc-length midpoint extraction, and pairwise badge repulsion displacement mechanics for Left-to-Right (LR) graph layouts.

---

## 1. The Problem & Trade-off Journey

### 1.1 Edge Routing Challenges in Horizontal Ranks

In Left-to-Right hierarchical layouts, edges connect source node right borders to target node left borders.

- **Naive Straight-Line (Chords) Routing**: Direct line segments ($L$-lines) slice across intermediate cards when connecting non-adjacent ranks, creating visual clutter and obscuring node text.
- **Orthogonal Polyline Routing**: 90-degree stair-step polylines reduce node intersection but introduce sharp corners that break the visual flow of timeline-based trace logs.
- **Horizontal S-Curve Cubic Bezier Routing (Chosen Solution)**: Smooth, double-bent parametric curves ensure edges exit nodes horizontally from the right border and enter target nodes horizontally from the left border, eliminating sharp corners and maintaining visual continuity across ranks.

```
       NAIVE STRAIGHT LINE CHORD                  HORIZONTAL CUBIC BEZIER S-CURVE
    ┌──────┐                  ┌──────┐         ┌──────┐                  ┌──────┐
    │  v1  ├─────────────────►│  v2  │         │  v1  ├───────┐          │  v2  │
    └──────┘   (Cuts across)  └──────┘         └──────┘       │          └──────┘
                 ┌──────┐                                     └───►┌──────┐
                 │  v3  │                                          │  v3  │
                 └──────┘                                          └──────┘
```

### 1.2 Edge Label Badge Overlapping & Collisions

When multiple parallel edges span between nodes in adjacent ranks, their midpoints cluster in close spatial proximity.

- Rendering edge labels at raw geometric midpoints causes text badges (dimensions $W_{\text{badge}} \times H_{\text{badge}} = 84\text{px} \times 34\text{px}$) to stack directly on top of each other, making labels unreadable.
- **Global Optimization vs. Pairwise Repulsion Pass**:
  - *Global Non-linear Optimization*: Formulating label positions as a global energy-minimization problem requires $O(N^3)$ computational time and can cause unpredictable label displacement far from the parent edge.
  - *Pairwise Repulsion Displacement (Chosen Solution)*: An $O(E^2)$ post-processing pass checks overlapping badge bounding boxes and applies a deterministic linear shift $(\delta_x, \delta_y)$ along the axis of minimum displacement, preserving proximity to the edge while preventing overlap.

---

## 2. Bottom-Up Mathematical Deconstruction

### 2.1 Parametric Cubic Bezier S-Curve & Control Points

#### 1. Mathematical Sub-Component Formula
An edge connecting source anchor $\mathbf{P}_0$ to target anchor $\mathbf{P}_3$ is governed by a 2D parametric cubic Bezier curve $\mathbf{B}(t)$ for $t \in [0, 1]$:

$$\mathbf{B}(t) = (1-t)^3 \mathbf{P}_0 + 3(1-t)^2 t \mathbf{C}_1 + 3(1-t) t^2 \mathbf{C}_2 + t^3 \mathbf{P}_3$$

With source right center $\mathbf{P}_0 = (X_s + W_s, Y_s + H_s/2)$, target left center $\mathbf{P}_3 = (X_t, Y_t + H_t/2)$, and rank span $\Delta X = X_t - (X_s + W_s)$, control points are:

$$\mathbf{C}_1 = \mathbf{P}_0 + \begin{pmatrix} \frac{\Delta X}{2} \\ 0 \end{pmatrix}, \quad \mathbf{C}_2 = \mathbf{P}_3 - \begin{pmatrix} \frac{\Delta X}{2} \\ 0 \end{pmatrix}$$

#### 2. Concrete Numerical Graph Example
Let source anchor $\mathbf{P}_0 = (100\text{px}, 50\text{px})$ and target anchor $\mathbf{P}_3 = (300\text{px}, 150\text{px})$.

1. **Rank Span Calculation**:
   $$\Delta X = 300 - 100 = 200\text{px} \implies \frac{\Delta X}{2} = 100\text{px}$$
2. **Control Point Coordinates**:
   $$\mathbf{C}_1 = (100 + 100, 50) = (200\text{px}, 50\text{px})$$
   $$\mathbf{C}_2 = (300 - 100, 150) = (200\text{px}, 150\text{px})$$
3. **Evaluating Curve Midpoint at $t = 0.5$**:
   - Bernstein Polynomial Weights for $t=0.5$:
     $$(1-t)^3 = 0.125, \quad 3(1-t)^2 t = 0.375, \quad 3(1-t) t^2 = 0.375, \quad t^3 = 0.125$$
   - Component $X(0.5)$:
     $$X(0.5) = 0.125(100) + 0.375(200) + 0.375(200) + 0.125(300) = 12.5 + 75 + 75 + 37.5 = 200\text{px}$$
   - Component $Y(0.5)$:
     $$Y(0.5) = 0.125(50) + 0.375(50) + 0.375(150) + 0.125(150) = 6.25 + 18.75 + 56.25 + 18.75 = 100\text{px}$$
- **Evaluated Curve Point $\mathbf{B}(0.5)$**: $(200\text{px}, 100\text{px})$

#### 3. Targeted Sub-Step Pseudocode
```python
def compute_cubic_bezier_midpoint(p0: tuple[float, float], p3: tuple[float, float]) -> tuple[float, float]:
    delta_x = p3[0] - p0[0]
    c1 = (p0[0] + delta_x / 2.0, p0[1])
    c2 = (p3[0] - delta_x / 2.0, p3[1])
    
    t = 0.5
    w0 = (1 - t) ** 3          # 0.125
    w1 = 3 * ((1 - t) ** 2) * t # 0.375
    w2 = 3 * (1 - t) * (t ** 2) # 0.375
    w3 = t ** 3                # 0.125
    
    x_mid = w0 * p0[0] + w1 * c1[0] + w2 * c2[0] + w3 * p3[0]
    y_mid = w0 * p0[1] + w1 * c1[1] + w2 * c2[1] + w3 * p3[1]
    return (x_mid, y_mid)

# Worked numerical test call
mid_pt = compute_cubic_bezier_midpoint((100.0, 50.0), (300.0, 150.0))
# Output: (200.0, 100.0)
```

#### 4. Sub-Step ASCII Infographic
```
                SUB-STEP 2.1: CUBIC BEZIER S-CURVE & B(0.5) EVALUATION
                
    P0(100,50) ─────── C1(200,50)
        ●─────────────────●
                           \
                            \   ● B(0.5) = (200, 100)
                             \
                              ●─────────────────●
                          C2(200,150)        P3(300,150)
```

---

### 2.2 Tangent Velocity Vector & Boundary Orthogonality

#### 1. Mathematical Sub-Component Formula
Taking the derivative of $\mathbf{B}(t)$ with respect to parameter $t$ gives the tangent velocity vector $\mathbf{B}'(t)$:

$$\mathbf{B}'(t) = \frac{d\mathbf{B}}{dt} = 3(1-t)^2 (\mathbf{C}_1 - \mathbf{P}_0) + 6(1-t)t (\mathbf{C}_2 - \mathbf{C}_1) + 3t^2 (\mathbf{P}_3 - \mathbf{C}_2)$$

#### 2. Concrete Numerical Graph Example
Using $\mathbf{P}_0 = (100, 50)$, $\mathbf{C}_1 = (200, 50)$, $\mathbf{C}_2 = (200, 150)$, $\mathbf{P}_3 = (300, 150)$:

1. **Source Exit Velocity ($t = 0$)**:
   $$\mathbf{B}'(0) = 3(1)^2 (\mathbf{C}_1 - \mathbf{P}_0) = 3 \begin{pmatrix} 200 - 100 \\ 50 - 50 \end{pmatrix} = \begin{pmatrix} 300 \\ 0 \end{pmatrix}$$
   - $Y$-velocity is $0\text{px/unit}$, proving strict $90^\circ$ horizontal exit from source node right border!
2. **Target Entry Velocity ($t = 1$)**:
   $$\mathbf{B}'(1) = 3(1)^2 (\mathbf{P}_3 - \mathbf{C}_2) = 3 \begin{pmatrix} 300 - 200 \\ 150 - 150 \end{pmatrix} = \begin{pmatrix} 300 \\ 0 \end{pmatrix}$$
   - $Y$-velocity is $0\text{px/unit}$, proving strict $90^\circ$ horizontal entry into target node left border!

#### 3. Targeted Sub-Step Pseudocode
```python
def compute_bezier_boundary_tangents(p0: tuple[float, float], c1: tuple[float, float],
                                     c2: tuple[float, float], p3: tuple[float, float]):
    # Tangent at t=0: 3 * (C1 - P0)
    v_exit = (3.0 * (c1[0] - p0[0]), 3.0 * (c1[1] - p0[1]))
    # Tangent at t=1: 3 * (P3 - C2)
    v_entry = (3.0 * (p3[0] - c2[0]), 3.0 * (p3[1] - c2[1]))
    return (v_exit, v_entry)

# Worked numerical test
v_out, v_in = compute_bezier_boundary_tangents((100.0, 50.0), (200.0, 50.0), (200.0, 150.0), (300.0, 150.0))
# Output: v_exit = (300.0, 0.0), v_entry = (300.0, 0.0)
```

#### 4. Sub-Step ASCII Infographic
```
             SUB-STEP 2.2: BOUNDARY TANGENT VELOCITY VECTORS
             
   Source Right Border                           Target Left Border
   ┌──────────┐                                  ┌──────────┐
   │  Node v1 ├───────► B'(0) = (300, 0)         │  Node v2 │
   │          │ (Horizontal Exit)   B'(1) = (300, 0) ───►│          │
   └──────────┘                     (Horizontal Entry)└──────────┘
```

---

### 2.3 Discrete Polyline Arc-Length 50% Midpoint & Normal

#### 1. Mathematical Sub-Component Formula
For discretized polyline points $P = [p_0, p_1, \dots, p_n]$, the accumulated arc-length $L = \sum \ell_i$. Target midpoint distance is $s = L / 2$.

Interpolation factor $t_{\text{seg}}$ on target segment $k$ with remaining distance $r$:

$$t_{\text{seg}} = \frac{r}{\ell_k}, \quad \mathbf{P}_{\text{mid}} = (1 - t_{\text{seg}}) p_k + t_{\text{seg}} p_{k+1}$$

Unit normal vector $\hat{\mathbf{n}}$ for segment vector $(\Delta x, \Delta y)$:

$$\hat{\mathbf{n}} = \left( -\frac{\Delta y}{\ell_k}, \, \frac{\Delta x}{\ell_k} \right)$$

#### 2. Concrete Numerical Graph Example
Consider 3 polyline points: $p_0 = (100\text{px}, 50\text{px})$, $p_1 = (200\text{px}, 50\text{px})$, $p_2 = (300\text{px}, 150\text{px})$.

1. **Segment Lengths**:
   $$\ell_0 = \sqrt{(200-100)^2 + (50-50)^2} = \sqrt{100^2 + 0} = 100\text{px}$$
   $$\ell_1 = \sqrt{(300-200)^2 + (150-50)^2} = \sqrt{100^2 + 100^2} = \sqrt{20000} \approx 141.42\text{px}$$
2. **Total Arc-Length & Target Distance**:
   $$L = 100 + 141.42 = 241.42\text{px} \implies s = \frac{241.42}{2} = 120.71\text{px}$$
3. **Segment Interpolation**:
   - Segment 0 covers $0 \to 100\text{px}$.
   - Segment 1 starts at $100\text{px}$. Remaining distance: $r = 120.71 - 100 = 20.71\text{px}$.
   - $t_{\text{seg}} = \frac{20.71}{141.42} \approx 0.1464$.
4. **Calculated Midpoint & Unit Normal**:
   $$\mathbf{P}_{\text{mid}} = (200, 50) + 0.1464 \cdot (100, 100) = (214.64\text{px}, 64.64\text{px})$$
   $$\hat{\mathbf{n}} = \left( -\frac{100}{141.42}, \, \frac{100}{141.42} \right) = (-0.7071, 0.7071)$$

#### 3. Targeted Sub-Step Pseudocode
```python
import math

def compute_polyline_arc_midpoint(p0: tuple[float, float], p1: tuple[float, float], p2: tuple[float, float]):
    l0 = math.hypot(p1[0] - p0[0], p1[1] - p0[1]) # 100.0
    l1 = math.hypot(p2[0] - p1[0], p2[1] - p1[1]) # 141.421
    total_l = l0 + l1                           # 241.421
    target = total_l / 2.0                      # 120.711
    
    rem = target - l0                           # 20.711
    t_seg = rem / l1                            # 0.1464
    
    mid_x = p1[0] + t_seg * (p2[0] - p1[0])
    mid_y = p1[1] + t_seg * (p2[1] - p1[1])
    
    normal = (-(p2[1] - p1[1]) / l1, (p2[0] - p1[0]) / l1)
    return (mid_x, mid_y, normal)

# Worked numerical check
mx, my, norm = compute_polyline_arc_midpoint((100, 50), (200, 50), (300, 150))
# Output: mx=214.64, my=64.64, norm=(-0.7071, 0.7071)
```

#### 4. Sub-Step ASCII Infographic
```
                SUB-STEP 2.3: ARC-LENGTH POLYLINE MIDPOINT EXTRACTION
                
   p0 (100,50) ── Seg 0 (100px) ──► p1 (200,50)
                                        \
                                         \ Seg 1 (20.71px into 141.42px)
                                          ● P_mid (214.64, 64.64)
                                           \  ^ Unit Normal (-0.7071, 0.7071)
                                            ▼ p2 (300,150)
```

---

### 2.4 Badge Overlap Repulsion Displacement Calculus

#### 1. Mathematical Sub-Component Formula
For two badge labels centered at $(x_1, y_1)$ and $(x_2, y_2)$ with bounding box dimensions $W_{\text{badge}} = 84\text{px}$ and $H_{\text{badge}} = 34\text{px}$:

$$\Delta x = |x_2 - x_1|, \quad \Delta y = |y_2 - y_1|$$

Overlap occurs if $\Delta x < 84$ and $\Delta y < 34$. Shift amounts with a $4\text{px}$ gap:

$$\delta_x = \frac{84 - \Delta x + 4}{2}, \quad \delta_y = \frac{34 - \Delta y + 4}{2}$$

If $\Delta x \le \Delta y$, displace along $X$-axis by $\delta_x$; else displace along $Y$-axis by $\delta_y$.

#### 2. Concrete Numerical Graph Example
Badge 1 centered at $(200\text{px}, 100\text{px})$, Badge 2 centered at $(204\text{px}, 110\text{px})$.

1. **Distance Deltas**:
   $$\Delta x = |204 - 200| = 4\text{px} < 84\text{px}$$
   $$\Delta y = |110 - 100| = 10\text{px} < 34\text{px} \implies \text{Overlap Detected!}$$
2. **Axis Selection**:
   $$\Delta x = 4 \le \Delta y = 10 \implies \text{Select Horizontal (X) Repulsion}$$
3. **Shift Calculation**:
   $$\delta_x = \frac{84 - 4 + 4}{2} = \frac{84}{2} = 42\text{px}$$
4. **Updated Positions**:
   - Badge 1: $x_1 = 200 - 42 = 158\text{px}, y_1 = 100\text{px}$
   - Badge 2: $x_2 = 204 + 42 = 246\text{px}, y_2 = 110\text{px}$
5. **Verification**: New $\Delta x = |246 - 158| = 88\text{px} > 84\text{px}$ (Collision fully resolved!).

#### 3. Targeted Sub-Step Pseudocode
```python
def apply_pairwise_badge_repulsion(b1: tuple[float, float], b2: tuple[float, float],
                                   w: float = 84.0, h: float = 34.0):
    dx = abs(b2[0] - b1[0])
    dy = abs(b2[1] - b1[1])
    
    if dx < w and dy < h:
        shift_x = (w - dx + 4.0) / 2.0
        shift_y = (h - dy + 4.0) / 2.0
        
        if dx <= dy:
            # Horizontal shift
            return ((b1[0] - shift_x, b1[1]), (b2[0] + shift_x, b2[1]))
        else:
            # Vertical shift
            return ((b1[0], b1[1] - shift_y), (b2[0], b2[1] + shift_y))
    return (b1, b2)

# Worked numerical test
new_b1, new_b2 = apply_pairwise_badge_repulsion((200.0, 100.0), (204.0, 110.0))
# Output: new_b1 = (158.0, 100.0), new_b2 = (246.0, 110.0)
```

#### 4. Sub-Step ASCII Infographic
```
                SUB-STEP 2.4: PAIRWISE BADGE REPULSION SHIFT
                
    BEFORE REPULSION (Overlap: dx=4, dy=10)
    Badge 1 (200, 100) ───┐
    Badge 2 (204, 110) ───┴───► Overlapping 84x34 Badges!
    
    AFTER HORIZONTAL SHIFT (delta_x = 42px)
    ┌───────────────┐                  ┌───────────────┐
    │ Badge 1       │                  │ Badge 2       │
    │ (158, 100)    │                  │ (246, 110)    │
    └───────────────┘                  └───────────────┘
    ◄─────────────── New dx = 88px (> 84px) ───────────►
```

---

## 3. Gradual Bottom-Up Assembly & Master Algorithm

Combining sub-steps 2.1 (Cubic Bezier Routing), 2.2 (Boundary Tangents), 2.3 (Arc-Length Midpoint), and 2.4 (Badge Repulsion Pass) into the master edge routing algorithm:

```python
algorithm ExecuteLeftRightEdgeRoutingMaster(positioned_nodes, edges):
    input:  positioned_nodes with (x, y, width, height), edge list E
    output: positioned_edges with cubic Bezier paths, arc midpoints, and non-overlapping label badges

    BADGE_W = 84.0
    BADGE_H = 34.0
    positioned_edges = []

    // Phase 1: Sub-steps 2.1, 2.2 & 2.3 - Compute Bezier paths & initial label midpoints
    for each edge e in edges:
        source = findNode(positioned_nodes, e.source)
        target = findNode(positioned_nodes, e.target)

        // Sub-step 2.1: Anchor point coordinates
        p0 = (source.x + source.width, source.y + source.height / 2.0)
        p3 = (target.x, target.y + target.height / 2.0)
        delta_x = p3[0] - p0[0]

        // Control points
        c1 = (p0[0] + delta_x / 2.0, p0[1])
        c2 = (p3[0] - delta_x / 2.0, p3[1])

        path_svg = sprintf("M %f %f C %f %f, %f %f, %f %f",
                           p0[0], p0[1], c1[0], c1[1], c2[0], c2[1], p3[0], p3[1])

        // Sub-step 2.3: Compute 50% arc-length midpoint for label placement
        points = discretizeBezierPath(p0, c1, c2, p3, steps = 10)
        (mid_x, mid_y, normal) = compute_polyline_arc_midpoint(points)

        positioned_edges.append({
            id: e.id,
            path: path_svg,
            labelX: mid_x,
            labelY: mid_y,
            normal: normal
        })

    // Phase 2: Sub-step 2.4 - Pairwise Badge Repulsion Post-Processing Pass
    for i from 0 to length(positioned_edges) - 1:
        e1 = positioned_edges[i]
        for j from i + 1 to length(positioned_edges) - 1:
            e2 = positioned_edges[j]

            (b1_new, b2_new) = apply_pairwise_badge_repulsion(
                (e1.labelX, e1.labelY), (e2.labelX, e2.labelY), BADGE_W, BADGE_H
            )
            e1.labelX, e1.labelY = b1_new
            e2.labelX, e2.labelY = b2_new

    return positioned_edges
```

---

## 4. Visual ASCII Diagrams

### 4.1 Cubic Bezier S-Curve Control Geometry

```
                           HORIZONTALLY ROUTED CUBIC BEZIER S-CURVE
                          
      Source Node (v_s)                                                   Target Node (v_t)
     ┌──────────────────┐                                                ┌──────────────────┐
     │                  │                                                │                  │
     │  (X_s, Y_s)      │                                                │  (X_t, Y_t)      │
     │                  │P_0 (Right Center)                              │                  │
     │                  ├───●───────────────┐                            │                  │
     │  Width: W_s      │   │  Tangent B'(0)│                            │  Width: W_t      │
     │  Height: H_s     │   ▼               │                            │  Height: H_t     │
     └──────────────────┘  C_1 (Control 1)  │    Edge Label Badge        │                  │
                                            └───────────[M]──────────────┼───● (Left Center)│
                                                        │                │   P_3            │
                                                        ▼                └──────────────────┘
                                                       C_2 (Control 2)
```

---

## 5. Codebase Reference Map

The Bezier curve routing, path midpoint extraction, and badge repulsion pass are implemented in:

- [`nodeDimensions.ts` (L178–L187)](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L178-L187) — `buildSvgPath` converts point arrays into SVG path strings.
- [`nodeDimensions.ts` (L192–L228)](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L192-L228) — `clipPointToNodeRect` clips edge terminal rays against node bounding boxes.
- [`nodeDimensions.ts` (L389–L446)](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L389-L446) — `findTotalPathMidpoint` calculates the 50% arc-length midpoint $(x, y)$ and normal vector.
- [`nodeDimensions.ts` (L575–L601)](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L575-L601) — Badge repulsion displacement pass.

```typescript
// Code Snippet from nodeDimensions.ts (L389-L408)
export function findTotalPathMidpoint(points: Point2D[]): PathMidpointResult {
  if (points.length === 0) return { x: 0, y: 0, normal: { x: 0, y: 1 } };
  if (points.length === 1) return { x: points[0].x, y: points[0].y, normal: { x: 0, y: 1 } };

  const segmentLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i+1].x - points[i].x, points[i+1].y - points[i].y);
    segmentLengths.push(len);
    totalLength += len;
  }
  const targetDist = totalLength / 2;
  ...
}
```

```typescript
// Code Snippet from nodeDimensions.ts (L575-L601): Badge Repulsion Pass
const BADGE_WIDTH = 84;
const BADGE_HEIGHT = 34;
for (let i = 0; i < positionedEdges.length; i++) {
  const e1 = positionedEdges[i];
  if (e1.labelX === undefined || e1.labelY === undefined) continue;
  for (let j = i + 1; j < positionedEdges.length; j++) {
    const e2 = positionedEdges[j];
    if (e2.labelX === undefined || e2.labelY === undefined) continue;

    const dx = Math.abs(e2.labelX - e1.labelX);
    const dy = Math.abs(e2.labelY - e1.labelY);

    if (dx < BADGE_WIDTH && dy < BADGE_HEIGHT) {
      const shiftX = (BADGE_WIDTH - dx + 4) / 2;
      const shiftY = (BADGE_HEIGHT - dy + 4) / 2;
      if (dx <= dy) {
        e1.labelX -= shiftX;
        e2.labelX += shiftX;
      } else {
        e1.labelY -= shiftY;
        e2.labelY += shiftY;
      }
    }
  }
}
```
