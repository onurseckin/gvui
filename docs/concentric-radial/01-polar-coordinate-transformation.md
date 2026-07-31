# 01. Polar Coordinate Transformation & Radial Projections

[← Back to Master Index](../README.md)

This module documents polar coordinate system transformations, dynamic orbit scaling, and Cartesian projections in the **Concentric Radial Engine**.

---

## 1. Mathematical Foundations & Polar Coordinate Projection

The Concentric Radial Engine arranges nodes along a 2D circular orbit. Each node $i \in \{0, 1, \dots, N_{\text{nodes}} - 1\}$ is assigned a polar coordinate tuple $\langle R, \theta_i \rangle$, which is subsequently projected into Cartesian canvas coordinates.

### 1. Orbit Radius & Canvas Origin Equations

To guarantee adequate circumferential separation between adjacent nodes regardless of graph size, the orbit radius $R$ scales dynamically with node count $N_{\text{nodes}}$:

$$R(N_{\text{nodes}}) = \max\left(280\text{px},\, N_{\text{nodes}} \cdot 45\text{px}\right)$$

The center hub origin point $(X_0, Y_0)$ is computed by adding a constant $100\text{px}$ padding margin relative to the orbit radius $R$:

$$X_0 = R + 100\text{px}, \quad Y_0 = R + 100\text{px}$$

This establishes a bounding canvas extent of $W_{\text{canvas}} = H_{\text{canvas}} = 2R + 200\text{px}$.

---

### 2. Angular Displacement & Separation Math

Nodes are distributed uniformly along the circumference with angular step size $\Delta\theta$:

$$\Delta\theta = \frac{2\pi}{N_{\text{nodes}}}$$

To place the first node ($i = 0$) at the 12 o'clock top-center position, an angular offset of $-\frac{\pi}{2}$ radians ($-90^\circ$) is applied:

$$\theta_i = \frac{2\pi \cdot i}{N_{\text{nodes}}} - \frac{\pi}{2}$$

The arc length distance $s$ along the orbit ring between any two adjacent node centers is constant:

$$s = R \cdot \Delta\theta = R \cdot \frac{2\pi}{N_{\text{nodes}}}$$

When $R = N_{\text{nodes}} \cdot 45\text{px}$, the arc length simplifies to $s = 45 \cdot 2\pi \approx 282.74\text{px}$, providing ample spatial clearance for node rendering.

---

### 3. Polar-to-Cartesian Center & Top-Left Projections

The center coordinates $\mathbf{P}_{\text{center}, i} = (cx_i, cy_i)$ of node $i$ are projected from polar space $\langle R, \theta_i \rangle$ into Cartesian coordinates:

$$\begin{pmatrix} cx_i \\ cy_i \end{pmatrix} = \begin{pmatrix} X_0 + R \cdot \cos(\theta_i) \\ Y_0 + R \cdot \sin(\theta_i) \end{pmatrix}$$

Because SVG rendering engines place elements using their top-left bounding box corner $(X_i, Y_i)$, node dimensions $(W_i, H_i)$ calculated via `calculateNodeDimensions` are subtracted:

$$\begin{pmatrix} X_i \\ Y_i \end{pmatrix} = \begin{pmatrix} cx_i - \frac{W_i}{2} \\ cy_i - \frac{H_i}{2} \end{pmatrix} = \begin{pmatrix} X_0 + R \cdot \cos(\theta_i) - \frac{W_i}{2} \\ Y_0 + R \cdot \sin(\theta_i) - \frac{H_i}{2} \end{pmatrix}$$

---

## 2. Radial Orbit ASCII Diagram & Axis Alignment

```
                         θ_0 = -π/2 (12 o'clock)
                            (cx_0, cy_0)
                            ┌───────────┐
                            │  Node 0   │
                            └─────┬─────┘
                                  │
                                  │  R (Orbit Radius)
                                  │
    θ_3 = π (9 o'clock)           ▼           θ_1 = 0 (3 o'clock)
      ┌───────────┐         (X_0, Y_0)          ┌───────────┐
      │  Node 3   │<────── Central Hub ────────>│  Node 1   │
      └───────────┘       Origin (0, 0)         └───────────┘
                                  ▲
                                  │
                                  │  R (Orbit Radius)
                                  │
                            ┌─────┴─────┐
                            │  Node 2   │
                            └───────────┘
                         θ_2 = π/2 (6 o'clock)
```

---

## 3. Implementation Code Snippet

The polar transformation logic is implemented in [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L18-L36):

```typescript
// Excerpt from computeRadialLayout in layoutDispatcher.ts
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
```
