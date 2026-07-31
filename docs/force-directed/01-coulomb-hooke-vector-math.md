# 01. Coulomb Repulsion & Hooke Attraction Vector Mechanics

[← Back to Master Index](../README.md)

This document provides a comprehensive, bottom-up mathematical breakdown of the **Organic Force Engine** based on the Fruchterman-Reingold spring-embedder paradigm. It details the physical problem journey, force vector derivations, Cartesian component decompositions, numerical worked examples, targeted sub-step pseudocode, ASCII schematics, and force superposition mechanics.

---

## 1. Problem & Trade-off Journey: Unstructured Networks & Organic Physics

### The Graph Layout Obstacle
Real-world network datasets—such as microservice call graphs, social interaction networks, protein interaction webs, and cyclic peer-to-peer topologies—rarely feature a strict hierarchical flow or central root node. When visualizing these unstructured networks, traditional layout engines encounter severe structural limitations:

```
  Hierarchical Layout Failure on Cyclic Graph        Organic Force-Directed Layout
  (Forces artificial top-down ranks)               (Reveals natural symmetry & clusters)

              [ Node A ]                                      [ Node A ]
             ╱          ╲                                    ╱          ╲
     [ Node B ]        [ Node C ]                    [ Node B ] ──────── [ Node C ]
         │                  │                            │                  │
     [ Node D ]        [ Node E ]                    [ Node D ] ──────── [ Node E ]
             ╲          ╱                                    ╲          ╱
              [ Node F ]                                      [ Node F ]
   (Back-edges cause messy overlaps)              (Equilibrium distances maintained)
```

### Evaluation of Alternative Paradigms

| Layout Approach | Core Mechanism | Major Drawback on Organic Graphs | Suitability for Unstructured Graphs |
| :--- | :--- | :--- | :--- |
| **Hierarchical Layering (Sugiyama / Dagre)** | Assigns discrete ranks, breaks cycles via back-edge reversal. | Forces artificial top-down layers; distorts cyclic symmetry; causes massive dummy node expansion. | Poor |
| **Concentric Radial** | Projects nodes along circular orbits based on distance from a hub. | Requires a single dominant root node; misleads users on multi-hub networks. | Poor |
| **Spectral / Multidimensional Scaling (MDS)** | Uses eigenvector decomposition of graph Laplacian matrix. | Computationally expensive ($O(|V|^3)$); ignores physical node bounding boxes and label padding. | Moderate |
| **Spring-Embedder Physics (Fruchterman-Reingold)** | Models nodes as charged particles and edges as mechanical springs. | Requires iterative simulation ($O(|V|^2)$ per step), but preserves organic symmetry and cluster proximity. | **Optimal** |

### Why Force-Directed Physics is Chosen
The Fruchterman-Reingold algorithm balances two opposing physical forces to compute continuous 2D coordinates:
1. **Coulomb Electrostatic Repulsion ($\vec{F}_r$)**: Pushes **all** node pairs apart, preventing node overlap and expanding graph spatial footprint across the canvas.
2. **Hooke Spring Attraction ($\vec{F}_a$)**: Pulls **connected** neighbor pairs together, forming visual clusters for tightly coupled subgraphs.

When these forces reach mechanical equilibrium, connected nodes group into natural topological clusters, unrelated nodes remain separated, and edge lengths remain visually uniform.

---

## 2. Bottom-Up Mathematical Deconstruction & Numerical Sub-Steps

---

### Sub-step 2.1: Ideal Equilibrium Distance ($k$)

#### 1. Mathematical Sub-Component Formula
Before computing forces, the engine determines the ideal equilibrium distance $k$, representing optimal node spacing over display canvas area $\text{Area} = W \times H$:

$$\text{Area} = W \times H$$

$$k = C \cdot \sqrt{\frac{\text{Area}}{|V|}}$$

Where:
- $W, H$: Canvas width and height in pixels.
- $|V|$: Total count of vertices in graph $G = (V, E)$.
- $C \in [0.75, 1.0]$: Dimensionless density scaling constant (default $C = 0.75$).

#### 2. Concrete Numerical Graph Example
Consider a canvas with dimensions $W = 1200\text{px}$, $H = 800\text{px}$, density scaling constant $C = 0.75$, and a graph with $|V| = 16$ nodes:

$$\text{Area} = 1200 \times 800 = 960\,000\text{px}^2$$

$$\frac{\text{Area}}{|V|} = \frac{960\,000}{16} = 60\,000\text{px}^2$$

$$\sqrt{60\,000} \approx 244.94897\text{px}$$

$$k = 0.75 \times 244.94897 = 183.7117 \approx 183.71\text{px}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function computeEquilibriumDistance(
  width: number,
  height: number,
  nodeCount: number,
  densityFactor = 0.75
): number {
  if (nodeCount <= 0) return 0;
  const area = width * height;
  return densityFactor * Math.sqrt(area / nodeCount);
}
// Example execution: computeEquilibriumDistance(1200, 800, 16) => 183.71
```

#### 4. Sub-Step ASCII Infographic
```
+------------------------------------------------------------------------+
| Canvas Area W x H = 1200 x 800 = 960,000 px²                            |
| Vertices |V| = 16  ===> Area / |V| = 60,000 px²                        |
|                                                                        |
|         (Node u) <========== k = 183.71 px ==========> (Node v)          |
|                                                                        |
| Formula: k = 0.75 * sqrt(960,000 / 16) = 0.75 * 244.95 = 183.71 px       |
+------------------------------------------------------------------------+
```

---

### Sub-step 2.2: Displacement Vectors & Regularized Distance ($d_\epsilon$)

#### 1. Mathematical Sub-Component Formula
For any pair of distinct nodes $u, v \in V$, the spatial displacement vector $\vec{\Delta}_{uv}$ pointing from $v$ to $u$ is defined as:

$$\vec{\Delta}_{uv} = \vec{p}_u - \vec{p}_v = \begin{pmatrix} x_u - x_v \\ y_u - y_v \end{pmatrix}$$

The true Euclidean distance $d(u, v) = \|\vec{\Delta}_{uv}\|_2$ is:

$$d(u, v) = \sqrt{(x_u - x_v)^2 + (y_u - y_v)^2}$$

To prevent division-by-zero singularities when nodes overlap ($d(u, v) = 0$), a regularized distance $d_{\epsilon}(u, v)$ is enforced with threshold $\epsilon = 10^{-4}$:

$$d_{\epsilon}(u, v) = \max\left(\epsilon, d(u, v)\right)$$

The unit direction vector $\hat{u}_{uv}$ pointing from $v$ to $u$ is:

$$\hat{u}_{uv} = \frac{\vec{\Delta}_{uv}}{d_{\epsilon}(u, v)} = \begin{pmatrix} \frac{x_u - x_v}{d_{\epsilon}(u, v)} \\[4pt] \frac{y_u - y_v}{d_{\epsilon}(u, v)} \end{pmatrix}$$

#### 2. Concrete Numerical Graph Example
Let Node $u$ be positioned at $\vec{p}_u = (140.0, 230.0)$ and Node $v$ at $\vec{p}_v = (100.0, 200.0)$:

$$\Delta x = x_u - x_v = 140.0 - 100.0 = +40.0\text{px}$$

$$\Delta y = y_u - y_v = 230.0 - 200.0 = +30.0\text{px}$$

$$\vec{\Delta}_{uv} = \begin{pmatrix} 40.0 \\ 30.0 \end{pmatrix}\text{px}$$

$$d(u, v) = \sqrt{40.0^2 + 30.0^2} = \sqrt{1600 + 900} = \sqrt{2500} = 50.0\text{px}$$

$$d_{\epsilon}(u, v) = \max(10^{-4}, 50.0) = 50.0\text{px}$$

$$\hat{u}_{uv} = \begin{pmatrix} \frac{40.0}{50.0} \\[4pt] \frac{30.0}{50.0} \end{pmatrix} = \begin{pmatrix} +0.8 \\[4pt] +0.6 \end{pmatrix}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function computeDisplacementAndDistance(
  pu: { x: number; y: number },
  pv: { x: number; y: number },
  epsilon = 1e-4
): { dx: number; dy: number; dist: number; ux: number; uy: number } {
  const dx = pu.x - pv.x;
  const dy = pu.y - pv.y;
  const dist = Math.max(epsilon, Math.sqrt(dx * dx + dy * dy));
  return { dx, dy, dist, ux: dx / dist, uy: dy / dist };
}
// Example execution: (140,230), (100,200) => { dx: 40, dy: 30, dist: 50, ux: 0.8, uy: 0.6 }
```

#### 4. Sub-Step ASCII Infographic
```
                      y-axis
                        ▲
                        │             (Node u) (140, 230)
                        │                 ●
                        │                ╱│
                        │               ╱ │ Δy = +30.0 px
                        │  d = 50.0 px ╱  │
                        │             ╱   │
                        │  (Node v)  ●────┘
                        │ (100, 200)   Δx = +40.0 px
                        └───────────────────────────────► x-axis
                          Unit direction: u_hat = (+0.8, +0.6)
```

---

### Sub-step 2.3: Electrostatic Coulomb Repulsion Vector ($\vec{F}_r$)

#### 1. Mathematical Sub-Component Formula
Repulsion acts between **every distinct pair of nodes** $(u, v) \in V \times V, u \neq v$, pushing node $u$ away from node $v$:

$$\vec{F}_r(u, v) = +\frac{k^2}{d_{\epsilon}(u, v)} \cdot \hat{u}_{uv} = \begin{pmatrix} F_{rx}(u, v) \\[4pt] F_{ry}(u, v) \end{pmatrix}$$

Cartesian components:

$$F_{rx}(u, v) = +\frac{k^2 \cdot (x_u - x_v)}{d_{\epsilon}(u, v)^2}$$

$$F_{ry}(u, v) = +\frac{k^2 \cdot (y_u - y_v)}{d_{\epsilon}(u, v)^2}$$

#### 2. Concrete Numerical Graph Example
Using $k = 183.7117$ ($k^2 \approx 33\,750.0$), distance $d = 50.0\text{px}$, $\Delta x = 40.0\text{px}$, $\Delta y = 30.0\text{px}$, and unit vector $\hat{u}_{uv} = (+0.8, +0.6)$:

$$F_{\text{rep}} = \frac{k^2}{d} = \frac{33\,750.0}{50.0} = 675.0\text{px}$$

$$F_{rx}(u, v) = 675.0 \times (+0.8) = +540.0\text{px}$$

$$F_{ry}(u, v) = 675.0 \times (+0.6) = +405.0\text{px}$$

$$\vec{F}_r(u, v) = \begin{pmatrix} +540.0 \\ +405.0 \end{pmatrix}\text{px}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function computeCoulombRepulsion(
  dx: number,
  dy: number,
  dist: number,
  k: number
): { frx: number; fry: number; fRep: number } {
  const k2 = k * k;
  const fRep = k2 / dist; // Repulsive force magnitude
  const frx = (dx / dist) * fRep;
  const fry = (dy / dist) * fRep;
  return { frx, fry, fRep };
}
// Example execution: dx=40, dy=30, dist=50, k=183.71 => fRep=675.0, frx=540.0, fry=405.0
```

#### 4. Sub-Step ASCII Infographic
```
                             F_ry = +405.0 px
                                   ▲
                                   │   F_r Repulsion Vector
                                   │  ↗ (Magnitude = 675.0 px)
                                   │ ╱
                        (Node u)   ●───► F_rx = +540.0 px
                                  ╱
                       d = 50 px ╱
                                ╱
                      (Node v) ●
```

---

### Sub-step 2.4: Spring Hooke Attraction Vector ($\vec{F}_a$)

#### 1. Mathematical Sub-Component Formula
Attraction acts **only along connected edges** $(u, v) \in E$, pulling node $u$ toward node $v$:

$$\vec{F}_a(u, v) = -\frac{d_{\epsilon}(u, v)^2}{k} \cdot \hat{u}_{uv} = \begin{pmatrix} F_{ax}(u, v) \\[4pt] F_{ay}(u, v) \end{pmatrix}$$

Cartesian components:

$$F_{ax}(u, v) = -\frac{d_{\epsilon}(u, v) \cdot (x_u - x_v)}{k}$$

$$F_{ay}(u, v) = -\frac{d_{\epsilon}(u, v) \cdot (y_u - y_v)}{k}$$

#### 2. Concrete Numerical Graph Example
Assuming node $u$ and node $v$ are connected by an edge $(u, v) \in E$, with $d = 50.0\text{px}$, $k = 183.7117$, $\Delta x = 40.0\text{px}$, $\Delta y = 30.0\text{px}$, and unit vector $\hat{u}_{uv} = (+0.8, +0.6)$:

$$F_{\text{att}} = \frac{d^2}{k} = \frac{50.0^2}{183.7117} = \frac{2500}{183.7117} \approx 13.6083 \approx 13.61\text{px}$$

$$F_{ax}(u, v) = -13.6083 \times (+0.8) = -10.8866 \approx -10.89\text{px}$$

$$F_{ay}(u, v) = -13.6083 \times (+0.6) = -8.1650 \approx -8.17\text{px}$$

$$\vec{F}_a(u, v) = \begin{pmatrix} -10.89 \\ -8.17 \end{pmatrix}\text{px}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function computeHookeAttraction(
  dx: number,
  dy: number,
  dist: number,
  k: number
): { fax: number; fay: number; fAtt: number } {
  const fAtt = (dist * dist) / k; // Quadratic attraction magnitude
  const fax = -(dx / dist) * fAtt;
  const fay = -(dy / dist) * fAtt;
  return { fax, fay, fAtt };
}
// Example execution: dx=40, dy=30, dist=50, k=183.71 => fAtt=13.61, fax=-10.89, fay=-8.17
```

#### 4. Sub-Step ASCII Infographic
```
                        (Node u)   ●
                                  ╱ │ 
        F_ax = -10.89 px ◄───────┼──┘ 
                                ╱│
         F_a Vector (13.61 px) ↙ │ F_ay = -8.17 px
                              ↙  ▼
                             ● (Node v)
```

---

### Sub-step 2.5: Centripetal Center Gravity Vector ($\vec{F}_g$)

#### 1. Mathematical Sub-Component Formula
To prevent disconnected graph components or isolated nodes from drifting away into infinity, a linear centripetal restoration force is applied toward canvas center $\vec{p}_{\text{center}} = (x_{\text{center}}, y_{\text{center}})^T$:

$$\vec{F}_g(u) = -c_{\text{gravity}} \cdot (\vec{p}_u - \vec{p}_{\text{center}}) = \begin{pmatrix} F_{gx}(u) \\[4pt] F_{gy}(u) \end{pmatrix}$$

Cartesian components:

$$F_{gx}(u) = -c_{\text{gravity}} \cdot (x_u - x_{\text{center}})$$

$$F_{gy}(u) = -c_{\text{gravity}} \cdot (y_u - y_{\text{center}})$$

Where $c_{\text{gravity}} = 0.02$ is the gravitational coupling constant.

#### 2. Concrete Numerical Graph Example
For Node $u$ at $\vec{p}_u = (140.0, 230.0)$, canvas center $\vec{p}_{\text{center}} = (600.0, 400.0)$, and $c_{\text{gravity}} = 0.02$:

$$x_u - x_{\text{center}} = 140.0 - 600.0 = -460.0\text{px}$$

$$y_u - y_{\text{center}} = 230.0 - 400.0 = -170.0\text{px}$$

$$F_{gx}(u) = -0.02 \times (-460.0) = +9.20\text{px}$$

$$F_{gy}(u) = -0.02 \times (-170.0) = +3.40\text{px}$$

$$\vec{F}_g(u) = \begin{pmatrix} +9.20 \\ +3.40 \end{pmatrix}\text{px}$$

*(Note: For Node $v$ at $(100.0, 200.0)$, $x_v - x_{\text{center}} = -500.0 \implies F_{gx}(v) = +10.0\text{px}$, $y_v - y_{\text{center}} = -200.0 \implies F_{gy}(v) = +4.0\text{px}$.)*

#### 3. Targeted Sub-Step Pseudocode
```typescript
function computeCenterGravity(
  px: number,
  py: number,
  centerX: number,
  centerY: number,
  cGravity = 0.02
): { fgx: number; fgy: number } {
  const fgx = -cGravity * (px - centerX);
  const fgy = -cGravity * (py - centerY);
  return { fgx, fgy };
}
// Example execution: px=140, py=230, center=(600,400) => fgx = +9.20, fgy = +3.40
```

#### 4. Sub-Step ASCII Infographic
```
                        (Node u) (140, 230)
                           ● ───► F_gx = +9.20 px
                           │ ╲
                           │  ╲ F_g Center Gravity Vector
                           ▼   ↘
                      F_gy = +3.40 px
                                 .
                                   .
                                     .  (Canvas Center)
                                       ● (600, 400)
```

---

### Sub-step 2.6: Master Net Force Superposition ($\vec{F}_{\text{net}}$)

#### 1. Mathematical Sub-Component Formula
The total net force vector $\vec{F}_{\text{net}}(u)$ acting on node $u \in V$ is the vector sum of all pairwise Coulomb repulsions, edge Hooke attractions, and centripetal gravity:

$$\vec{F}_{\text{net}}(u) = \sum_{v \in V \setminus \{u\}} \vec{F}_r(u, v) + \sum_{v \in N(u)} \vec{F}_a(u, v) + \vec{F}_g(u)$$

Master Cartesian component equations:

$$F_{\text{net}, x}(u) = \sum_{v \in V \setminus \{u\}} \frac{k^2 (x_u - x_v)}{d_{\epsilon}(u, v)^2} - \sum_{v \in N(u)} \frac{d_{\epsilon}(u, v) (x_u - x_v)}{k} - c_{\text{gravity}} (x_u - x_{\text{center}})$$

$$F_{\text{net}, y}(u) = \sum_{v \in V \setminus \{u\}} \frac{k^2 (y_u - y_v)}{d_{\epsilon}(u, v)^2} - \sum_{v \in N(u)} \frac{d_{\epsilon}(u, v) (y_u - y_v)}{k} - c_{\text{gravity}} (y_u - y_{\text{center}})$$

#### 2. Concrete Numerical Graph Example
Summing force components acting on Node $u(140.0, 230.0)$ from Sub-steps 2.3, 2.4, and 2.5:

$$F_{\text{net}, x}(u) = F_{rx} + F_{ax} + F_{gx} = +540.00 + (-10.89) + (+9.20) = +538.31\text{px}$$

$$F_{\text{net}, y}(u) = F_{ry} + F_{ay} + F_{gy} = +405.00 + (-8.17) + (+3.40) = +400.23\text{px}$$

$$\vec{F}_{\text{net}}(u) = \begin{pmatrix} +538.31 \\ +400.23 \end{pmatrix}\text{px}$$

Net force magnitude $\|\vec{F}_{\text{net}}(u)\|_2$:

$$\|\vec{F}_{\text{net}}(u)\|_2 = \sqrt{538.31^2 + 400.23^2} = \sqrt{289\,777.66 + 160\,184.05} = \sqrt{449\,961.71} \approx 670.79\text{px}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function computeNetForceOnNode(
  uIndex: number,
  nodes: { x: number; y: number }[],
  edges: { source: number; target: number }[],
  k: number,
  cGravity: number,
  center: { x: number; y: number }
): { fnx: number; fny: number; fmag: number } {
  let fnx = 0;
  let fny = 0;
  const u = nodes[uIndex];

  // 1. Repulsion from all other nodes
  for (let j = 0; j < nodes.length; j++) {
    if (j === uIndex) continue;
    const v = nodes[j];
    const { dx, dy, dist } = computeDisplacementAndDistance(u, v);
    const { frx, fry } = computeCoulombRepulsion(dx, dy, dist, k);
    fnx += frx;
    fny += fry;
  }

  // 2. Attraction to connected neighbors
  for (const edge of edges) {
    let neighborIdx = -1;
    if (edge.source === uIndex) neighborIdx = edge.target;
    else if (edge.target === uIndex) neighborIdx = edge.source;
    if (neighborIdx === -1) continue;

    const v = nodes[neighborIdx];
    const { dx, dy, dist } = computeDisplacementAndDistance(u, v);
    const { fax, fay } = computeHookeAttraction(dx, dy, dist, k);
    fnx += fax;
    fny += fay;
  }

  // 3. Gravity
  const { fgx, fgy } = computeCenterGravity(u.x, u.y, center.x, center.y, cGravity);
  fnx += fgx;
  fny += fgy;

  const fmag = Math.sqrt(fnx * fnx + fny * fny);
  return { fnx, fny, fmag };
}
```

#### 4. Sub-Step ASCII Infographic
```
                          F_r = (+540.0, +405.0) Repulsion
                                  \
                                   \     F_net = (+538.31, +400.23)
                                    \   ↗ Magnitude = 670.79 px
                                     \ ╱
                      (Node u) ───────● ───────► +X Axis
                                     ╱ \
                                    ╱   \
                                   ╱     \
                                  /       ↘
       F_a = (-10.89, -8.17) Hooke   F_g = (+9.20, +3.40) Gravity
```

---

### Sub-step 2.7: Equilibrium Condition Analysis at $d = k$

#### 1. Mathematical Sub-Component Formula
When distance between two connected nodes exactly equals ideal distance $d(u, v) = k$:

$$|\vec{F}_r(u, v)| = \frac{k^2}{k} = k$$

$$|\vec{F}_a(u, v)| = \frac{k^2}{k} = k$$

Because $|\vec{F}_r| = |\vec{F}_a| = k$ and their vector directions are exactly opposite ($\hat{u}_{uv}$ vs $-\hat{u}_{uv}$), internal pairwise net force is zero:

$$\vec{F}_r(u, v) + \vec{F}_a(u, v) = k \cdot \hat{u}_{uv} - k \cdot \hat{u}_{uv} = \vec{0}$$

#### 2. Concrete Numerical Graph Example
For $k = 183.71\text{px}$ and $d = 183.71\text{px}$:

$$F_{\text{rep}} = \frac{183.71^2}{183.71} = 183.71\text{px}$$

$$F_{\text{att}} = \frac{183.71^2}{183.71} = 183.71\text{px}$$

$$F_{\text{net, pairwise}} = F_{\text{rep}} - F_{\text{att}} = 183.71 - 183.71 = 0.00\text{px}$$

#### 3. Sub-Step ASCII Infographic
```
  Force Magnitude vs Distance d(u, v)
  
  Force Magnitude |
                 |     \                                 /  F_a (Attraction = d^2 / k)
                 |      \                               /
          k=183.71 |.......X Equilibrium Point (d = k) ./
                 |        \                         /.
                 |         \                       / .
                 |          \_____________________/  .  F_r (Repulsion = k^2 / d)
               0 +-----------------------------------+-------------------> Distance d
                 0                k=183.71          2k
```

---

## 3. Step-by-Step Computational Pseudocode & Master Algorithm Synthesis

Merging all sub-steps 2.1 through 2.6 into a clean, complete modular force calculation engine:

```typescript
/**
 * Accumulates net force vectors acting on all nodes in graph G = (V, E).
 * Synthesizes Sub-steps 2.1 through 2.6 into a master algorithm.
 */
function accumulateForceVectors(
  nodes: { id: string; x: number; y: number }[],
  edges: { source: string; target: string }[],
  k: number,
  cGravity: number,
  canvasCenter: { x: number; y: number }
): { fx: number; fy: number }[] {
  const nodeCount = nodes.length;
  const k2 = k * k;
  const epsilon = 1e-4;
  const forces = Array.from({ length: nodeCount }, () => ({ fx: 0, fy: 0 }));

  const nodeIndexMap = new Map<string, number>(nodes.map((n, i) => [n.id, i]));

  // 1. Repulsive forces between ALL node pairs O(|V|^2) (Sub-steps 2.2 & 2.3)
  for (let i = 0; i < nodeCount; i++) {
    for (let j = i + 1; j < nodeCount; j++) {
      const u = nodes[i];
      const v = nodes[j];

      const dx = u.x - v.x;
      const dy = u.y - v.y;
      const distSq = Math.max(epsilon, dx * dx + dy * dy);
      const dist = Math.sqrt(distSq);

      // Repulsive magnitude F_r = k^2 / dist
      const fRep = k2 / dist;
      const fx = (dx / dist) * fRep;
      const fy = (dy / dist) * fRep;

      forces[i].fx += fx;
      forces[i].fy += fy;
      forces[j].fx -= fx;
      forces[j].fy -= fy;
    }
  }

  // 2. Attractive forces along connected edges O(|E|) (Sub-step 2.4)
  for (const edge of edges) {
    const idxU = nodeIndexMap.get(edge.source);
    const idxV = nodeIndexMap.get(edge.target);
    if (idxU === undefined || idxV === undefined) continue;

    const u = nodes[idxU];
    const v = nodes[idxV];

    const dx = u.x - v.x;
    const dy = u.y - v.y;
    const dist = Math.max(epsilon, Math.sqrt(dx * dx + dy * dy));

    // Attractive magnitude F_a = dist^2 / k
    const fAtt = (dist * dist) / k;
    const fx = (dx / dist) * fAtt;
    const fy = (dy / dist) * fAtt;

    forces[idxU].fx -= fx;
    forces[idxU].fy -= fy;
    forces[idxV].fx += fx;
    forces[idxV].fy += fy;
  }

  // 3. Center gravity forces O(|V|) (Sub-step 2.5)
  for (let i = 0; i < nodeCount; i++) {
    const u = nodes[i];
    forces[i].fx -= cGravity * (u.x - canvasCenter.x);
    forces[i].fy -= cGravity * (u.y - canvasCenter.y);
  }

  return forces;
}
```

---

## 4. Visual ASCII Master Force Schematics

```
                           F_r (Repulsion from v1)
                                \
                                 \     F_net (Unclamped Superposition)
                                  \   ↗
                                   \ ╱
                    (Node u) ───────● ─────────────────►  +X Axis
                                   ╱ \
                                  ╱   \
                                  ╱     \
                                 /       ↘
                   F_a (Attraction v2)   F_g (Gravity to Center)
```

---

## 🔗 Codebase Reference Anchors

- Layout Dispatcher: [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L71-L129)
- Master Layout Switch Entrypoint: [computeGraphLayout](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152)
