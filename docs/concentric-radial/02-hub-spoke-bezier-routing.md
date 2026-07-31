# 02. Quadratic Hub-Spoke Bezier Routing

[← Back to Master Index](../README.md)

This module documents quadratic Bezier curve routing through the central origin hub in the **Concentric Radial Engine**.

---

## 1. Quadratic Bezier Curve Math & Hub Routing

Edges connecting radial orbit nodes are rendered as curved hub-and-spoke paths. Rather than connecting nodes directly with linear segments across the interior ring, edges route inward toward the central hub $(X_0, Y_0)$, acting as a common control point $\mathbf{P}_0$.

### 1. Parametric Quadratic Bezier Equation

The continuous path $\mathbf{B}(t)$ for $t \in [0, 1]$ between source node center $\mathbf{P}_s$ and target node center $\mathbf{P}_t$ is defined by:

$$\mathbf{B}(t) = (1-t)^2 \mathbf{P}_s + 2(1-t)t \mathbf{P}_0 + t^2 \mathbf{P}_t$$

Where:
- $\mathbf{P}_s = (srcCx, srcCy) = \left(X_{\text{src}} + \frac{W_{\text{src}}}{2},\, Y_{\text{src}} + \frac{H_{\text{src}}}{2}\right)$: Center point of the source node.
- $\mathbf{P}_0 = (centerX, centerY) = (X_0, Y_0)$: Central hub control point.
- $\mathbf{P}_t = (tgtCx, tgtCy) = \left(X_{\text{tgt}} + \frac{W_{\text{tgt}}}{2},\, Y_{\text{tgt}} + \frac{H_{\text{tgt}}}{2}\right)$: Center point of the target node.

In SVG path notation, this corresponds to:

$$\texttt{"M } srcCx \text{ } srcCy \texttt{ Q } centerX \text{ } centerY \text{ } tgtCx \text{ } tgtCy\texttt{"}$$

---

### 2. Tangent & Velocity Vector Analysis

The derivative of the parametric curve $\mathbf{B}'(t)$ represents the tangent velocity vector along the trajectory:

$$\mathbf{B}'(t) = \frac{d\mathbf{B}(t)}{dt} = 2(1-t)(\mathbf{P}_0 - \mathbf{P}_s) + 2t(\mathbf{P}_t - \mathbf{P}_0)$$

Evaluating at endpoints $t = 0$ and $t = 1$:
- Initial Tangent Vector ($t = 0$): $\mathbf{B}'(0) = 2(\mathbf{P}_0 - \mathbf{P}_s)$. Trajectory leaves the source node pointing directly toward the central hub $\mathbf{P}_0$.
- Terminal Tangent Vector ($t = 1$): $\mathbf{B}'(1) = 2(\mathbf{P}_t - \mathbf{P}_0)$. Trajectory approaches the target node pointing directly away from the central hub $\mathbf{P}_0$.

---

## 2. Mathematical Comparison: Label Midpoint vs. True Bezier Midpoint

### 1. True Curve Midpoint ($t = 0.5$)

Evaluating $\mathbf{B}(t)$ at parameter $t = 0.5$ gives the true apex of the Bezier curve:

$$\mathbf{B}(0.5) = (0.5)^2 \mathbf{P}_s + 2(0.5)(0.5) \mathbf{P}_0 + (0.5)^2 \mathbf{P}_t = \frac{\mathbf{P}_s + 2\mathbf{P}_0 + \mathbf{P}_t}{4}$$

Notice that $\mathbf{B}(0.5)$ is pulled heavily inward toward the central hub $\mathbf{P}_0$.

---

### 2. Linear Chord Midpoint Placement

To prevent edge label badges from crowding together at the central hub origin where all edge curves converge, the engine places edge label badges at the linear chord midpoint $\mathbf{P}_{\text{label}} = (X_{\text{label}}, Y_{\text{label}})$:

$$X_{\text{label}} = \frac{srcCx + tgtCx}{2}, \quad Y_{\text{label}} = \frac{srcCy + tgtCy}{2}$$

$$\mathbf{P}_{\text{label}} = \frac{\mathbf{P}_s + \mathbf{P}_t}{2}$$

---

### 3. Deflection Vector Analysis

The spatial offset between the true curve apex $\mathbf{B}(0.5)$ and the label badge position $\mathbf{P}_{\text{label}}$ is given by the deflection vector:

$$\mathbf{D} = \mathbf{B}(0.5) - \mathbf{P}_{\text{label}} = \frac{\mathbf{P}_s + 2\mathbf{P}_0 + \mathbf{P}_t}{4} - \frac{2\mathbf{P}_s + 2\mathbf{P}_t}{4} = \frac{\mathbf{P}_0 - \left(\frac{\mathbf{P}_s + \mathbf{P}_t}{2}\right)}{2} = \frac{\mathbf{P}_0 - \mathbf{P}_{\text{label}}}{2}$$

This shows that $\mathbf{B}(0.5)$ is located exactly halfway between the linear chord midpoint $\mathbf{P}_{\text{label}}$ and the central hub $\mathbf{P}_0$. Using $\mathbf{P}_{\text{label}}$ for badge placement maintains clear visual readability while retaining curved hub-spoke routing aesthetics.

---

## 3. Hub Control Point Schematic Diagram

```
                 Source Node Center (P_s)                      Target Node Center (P_t)
                     (srcCx, srcCy)                                (tgtCx, tgtCy)
                           │                                             │
                           │\                                           /│
                           │ \          Linear Chord Midpoint          / │
                           │  \           P_label = (P_s+P_t)/2       /  │
                           │   \─────────────── o ───────────────/   │
                           │    \               │               /    │
                           │     \              │ Deflection   /     │
                           │      \             │ D = (P_0-P_l)/2     │
                           │       \            ▼            /       │
                           │        \──────> B(0.5) <───────/        │
                           │          True Curve Midpoint            │
                           │                     │                   │
                           │                     │                   │
                           └─────────────────────┼───────────────────┘
                                                 ▼
                                        Central Hub Control
                                          Point P_0 (X_0, Y_0)
```

---

## 4. Implementation Code Snippet

The edge routing and label coordinate logic is implemented in [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L40-L63):

```typescript
// Excerpt from computeRadialLayout in layoutDispatcher.ts
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
```
