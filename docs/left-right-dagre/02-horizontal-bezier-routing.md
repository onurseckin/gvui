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

### 2.1 Parametric Cubic Bezier Curve Math

An edge connecting source anchor $\mathbf{P}_0$ to target anchor $\mathbf{P}_3$ is governed by a 2D parametric cubic Bezier curve $\mathbf{B}(t)$ for $t \in [0, 1]$:

$$\mathbf{B}(t) = (1-t)^3 \mathbf{P}_0 + 3(1-t)^2 t \mathbf{C}_1 + 3(1-t) t^2 \mathbf{C}_2 + t^3 \mathbf{P}_3$$

Separating into $X$ and $Y$ Cartesian components:

$$X(t) = (1-t)^3 X_0 + 3(1-t)^2 t X_{C1} + 3(1-t) t^2 X_{C2} + t^3 X_3$$

$$Y(t) = (1-t)^3 Y_0 + 3(1-t)^2 t Y_{C1} + 3(1-t) t^2 Y_{C2} + t^3 Y_3$$

### 2.2 Anchor Points & Control Point Vector Derivations

1. **Source Anchor Point ($\mathbf{P}_0$)**: Located at the center of the right border of source node $v_s$:
   $$\mathbf{P}_0 = \left( X_s + W_s, \, Y_s + \frac{H_s}{2} \right)$$

2. **Target Anchor Point ($\mathbf{P}_3$)**: Located at the center of the left border of target node $v_t$:
   $$\mathbf{P}_3 = \left( X_t, \, Y_t + \frac{H_t}{2} \right)$$

3. **Horizontal Rank Span ($\Delta X$)**:
   $$\Delta X = X_t - (X_s + W_s)$$

4. **Control Points ($\mathbf{C}_1, \mathbf{C}_2$)**:
   To enforce horizontal tangency at both boundaries, control points are offset horizontally by half the rank distance $\frac{\Delta X}{2}$:
   $$\mathbf{C}_1 = \mathbf{P}_0 + \begin{pmatrix} \frac{\Delta X}{2} \\ 0 \end{pmatrix} = \left( X_s + W_s + \frac{\Delta X}{2}, \, Y_s + \frac{H_s}{2} \right)$$

   $$\mathbf{C}_2 = \mathbf{P}_3 - \begin{pmatrix} \frac{\Delta X}{2} \\ 0 \end{pmatrix} = \left( X_t - \frac{\Delta X}{2}, \, Y_t + \frac{H_t}{2} \right)$$

### 2.3 Tangent Velocity Vector & Boundary Orthogonality

Taking the first derivative of $\mathbf{B}(t)$ with respect to parameter $t$ yields the velocity vector $\mathbf{B}'(t)$:

$$\mathbf{B}'(t) = \frac{d\mathbf{B}}{dt} = 3(1-t)^2 (\mathbf{C}_1 - \mathbf{P}_0) + 6(1-t)t (\mathbf{C}_2 - \mathbf{C}_1) + 3t^2 (\mathbf{P}_3 - \mathbf{C}_2)$$

Evaluating at the boundary endpoints $t=0$ and $t=1$:

- **Source Exit Velocity ($t=0$)**:
  $$\mathbf{B}'(0) = 3(\mathbf{C}_1 - \mathbf{P}_0) = 3 \begin{pmatrix} \frac{\Delta X}{2} \\ 0 \end{pmatrix} = \begin{pmatrix} \frac{3 \Delta X}{2} \\ 0 \end{pmatrix}$$
  The $Y$-component is zero, proving that the curve exits the source node's right border at a strict $90^\circ$ orthogonal horizontal tangent.

- **Target Entry Velocity ($t=1$)**:
  $$\mathbf{B}'(1) = 3(\mathbf{P}_3 - \mathbf{C}_2) = 3 \begin{pmatrix} \frac{\Delta X}{2} \\ 0 \end{pmatrix} = \begin{pmatrix} \frac{3 \Delta X}{2} \\ 0 \end{pmatrix}$$
  The $Y$-component is zero, proving that the curve enters the target node's left border at a strict $90^\circ$ orthogonal horizontal tangent.

### 2.4 Discrete Polyline Arc-Length Midpoint Calculus

When Dagre emits edge paths as discretized polylines $P = [p_0, p_1, \dots, p_n]$, edge label badges must be placed at the exact 50% arc-length midpoint rather than the parametric mid-point.

1. **Segment Lengths ($\ell_i$)**:
   $$\ell_i = \text{hypot}(x_{i+1} - x_i, \, y_{i+1} - y_i) = \sqrt{(x_{i+1} - x_i)^2 + (y_{i+1} - y_i)^2}$$

2. **Total Arc Length ($L$)**:
   $$L = \sum_{i=0}^{n-1} \ell_i$$

3. **Target Midpoint Distance ($s$)**:
   $$s = \frac{L}{2}$$

4. **Segment Interpolation**:
   Iterating through segments, find index $k$ where accumulated length $\sum_{i=0}^{k-1} \ell_i \le s \le \sum_{i=0}^{k} \ell_i$. The remaining distance is $r = s - \sum_{i=0}^{k-1} \ell_i$. Interpolation factor $t_{\text{seg}}$ is:
   $$t_{\text{seg}} = \frac{r}{\ell_k}$$

   $$\mathbf{P}_{\text{mid}} = (1 - t_{\text{seg}}) \, p_k + t_{\text{seg}} \, p_{k+1}$$

5. **Perpendicular Unit Normal Vector ($\hat{\mathbf{n}}$)**:
   For segment vector $\Delta p = (\Delta x, \Delta y) = p_{k+1} - p_k$:
   $$\hat{\mathbf{n}} = \left( -\frac{\Delta y}{\ell_k}, \, \frac{\Delta x}{\ell_k} \right)$$

### 2.5 Badge Overlap Repulsion Displacement Calculus

For two edge label badges with bounding box dimensions $W_{\text{badge}} = 84\text{px}$ and $H_{\text{badge}} = 34\text{px}$ centered at $(x_1, y_1)$ and $(x_2, y_2)$:

1. **Distance Deltas**:
   $$\Delta x = |x_2 - x_1|, \quad \Delta y = |y_2 - y_1|$$

2. **Collision Threshold**:
   An overlap occurs if and only if $\Delta x < 84$ and $\Delta y < 34$.

3. **Repulsion Shift Calculation**:
   To eliminate overlap with a $4\text{px}$ safety margin:
   $$\delta_x = \frac{84 - \Delta x + 4}{2}, \quad \delta_y = \frac{34 - \Delta y + 4}{2}$$

4. **Directional Resolution Logic**:
   - If $\Delta x \le \Delta y$: apply horizontal displacement ($\text{shiftX} = \delta_x$):
     $$x_1 \leftarrow x_1 - \delta_x, \quad x_2 \leftarrow x_2 + \delta_x$$
   - Else: apply vertical displacement ($\text{shiftY} = \delta_y$):
     $$y_1 \leftarrow y_1 - \delta_y, \quad y_2 \leftarrow y_2 + \delta_y$$

---

## 3. Step-by-Step Computational Pseudocode

```python
algorithm ComputeHorizontalBezierPath(sourceNode, targetNode):
    input:  sourceNode (x, y, w, h), targetNode (x, y, w, h)
    output: SVG cubic Bezier path string

    // 1. Calculate border anchor coordinates
    P0_x = sourceNode.x + sourceNode.width
    P0_y = sourceNode.y + (sourceNode.height / 2)

    P3_x = targetNode.x
    P3_y = targetNode.y + (targetNode.height / 2)

    // 2. Compute horizontal rank span DeltaX
    deltaX = P3_x - P0_x

    // 3. Compute control points C1 and C2
    C1_x = P0_x + (deltaX / 2)
    C1_y = P0_y

    C2_x = P3_x - (deltaX / 2)
    C2_y = P3_y

    // 4. Construct SVG Cubic Bezier command string
    path_string = sprintf("M %f %f C %f %f, %f %f, %f %f",
                          P0_x, P0_y, C1_x, C1_y, C2_x, C2_y, P3_x, P3_y)

    return path_string
```

```python
algorithm FindTotalPathMidpoint(points):
    input:  list of 2D points [p0, p1, ..., pn]
    output: midpoint (x, y) and unit normal vector

    if points is empty: return (0, 0, normal=(0, 1))
    if length(points) == 1: return (points[0].x, points[0].y, normal=(0, 1))

    segment_lengths = []
    total_length = 0
    for i from 0 to length(points) - 2:
        dx = points[i+1].x - points[i].x
        dy = points[i+1].y - points[i].y
        len = hypot(dx, dy)
        segment_lengths.append(len)
        total_length += len

    target_dist = total_length / 2
    accumulated = 0

    for i from 0 to length(points) - 2:
        len = segment_lengths[i]
        if accumulated + len >= target_dist or i == length(points) - 2:
            remaining = target_dist - accumulated
            t = remaining / len if len > 0 else 0
            t = clamp(t, 0.0, 1.0)

            p1 = points[i]
            p2 = points[i+1]
            mid_x = p1.x + t * (p2.x - p1.x)
            mid_y = p1.y + t * (p2.y - p1.y)

            dx = p2.x - p1.x
            dy = p2.y - p1.y
            normal = (-dy / len, dx / len) if len > 0 else (0, 1)

            return (mid_x, mid_y, normal)

        accumulated += len
```

```python
algorithm ApplyBadgeRepulsionPass(positioned_edges):
    input:  list of positioned_edges with (labelX, labelY)
    output: modified positioned_edges with non-overlapping label coordinates

    BADGE_WIDTH = 84
    BADGE_HEIGHT = 34

    for i from 0 to length(positioned_edges) - 1:
        e1 = positioned_edges[i]
        if e1.labelX is None or e1.labelY is None: continue

        for j from i + 1 to length(positioned_edges) - 1:
            e2 = positioned_edges[j]
            if e2.labelX is None or e2.labelY is None: continue

            dx = abs(e2.labelX - e1.labelX)
            dy = abs(e2.labelY - e1.labelY)

            // Check bounding box overlap
            if dx < BADGE_WIDTH and dy < BADGE_HEIGHT:
                shiftX = (BADGE_WIDTH - dx + 4) / 2
                shiftY = (BADGE_HEIGHT - dy + 4) / 2

                if dx <= dy:
                    e1.labelX -= shiftX
                    e2.labelX += shiftX
                else:
                    e1.labelY -= shiftY
                    e2.labelY += shiftY
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

### 4.2 Edge Badge Repulsion Shift Dynamics

```
                           BADGE REPULSION DISPLACEMENT
                         
          Before Repulsion                             After Repulsion
          ┌─────────────┐                              ┌─────────────┐
          │  Badge 1    │                              │  Badge 1    │
          │  ┌──────────┼──┐                           └─────────────┘
          └──┼──────────┘  │                                 ▲ shiftY
             │   Badge 2   │                                 ▼ shiftY
             └─────────────┘                           ┌─────────────┐
                                                       │  Badge 2    │
                                                       └─────────────┘
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
