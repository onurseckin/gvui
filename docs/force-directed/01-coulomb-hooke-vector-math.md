# 01. Coulomb Repulsion & Hooke Attraction Vector Mechanics

[← Back to Master Index](../README.md)

This document provides a comprehensive, bottom-up mathematical breakdown of the **Organic Force Engine** based on the Fruchterman-Reingold spring-embedder paradigm. It details the physical problem journey, force vector derivations, Cartesian component decompositions, and force superposition mechanics.

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

## 2. Bottom-Up Mathematical Deconstruction

### Step 1: Bounding Domain & Ideal Equilibrium Distance ($k$)
Before computing forces, the engine computes the ideal equilibrium distance $k$, which represents the optimal spacing between adjacent vertices over canvas area $\text{Area} = W \times H$:

$$\text{Area} = W \times H$$

$$k = C \cdot \sqrt{\frac{\text{Area}}{|V|}}$$

Where:
- $W, H$: Display canvas width and height in pixels.
- $|V|$: Total count of vertices in graph $G = (V, E)$.
- $C \in [0.75, 1.0]$: Dimensionless density scaling factor tuning layout compactness.

```
+-------------------------------------------------------+
|  Canvas Area (W x H)                                  |
|                                                       |
|        (u) <==== k ====> (v)                          |
|        Ideal equilibrium distance k = C * sqrt(Area / |V|) |
|                                                       |
+-------------------------------------------------------+
```

---

### Step 2: Displacement Vectors & Safeguarded Distance Calculation
For any pair of distinct nodes $u, v \in V$, the spatial displacement vector $\vec{\Delta}_{uv}$ pointing from $v$ to $u$ is defined as:

$$\vec{\Delta}_{uv} = \vec{p}_u - \vec{p}_v = \begin{pmatrix} x_u - x_v \\ y_u - y_v \end{pmatrix}$$

The true Euclidean distance $d(u, v) = \|\vec{\Delta}_{uv}\|_2$ is:

$$d(u, v) = \sqrt{(x_u - x_v)^2 + (y_u - y_v)^2}$$

To prevent division by zero or explosive forces when two nodes share identical coordinates ($d(u, v) = 0$), a regularized distance function $d_{\epsilon}(u, v)$ is enforced with safeguard threshold $\epsilon = 10^{-4}$:

$$d_{\epsilon}(u, v) = \max\left(\epsilon, d(u, v)\right)$$

The unit direction vector $\hat{u}_{uv}$ pointing from $v$ to $u$ is:

$$\hat{u}_{uv} = \frac{\vec{\Delta}_{uv}}{d_{\epsilon}(u, v)} = \begin{pmatrix} \frac{x_u - x_v}{d_{\epsilon}(u, v)} \\[4pt] \frac{y_u - y_v}{d_{\epsilon}(u, v)} \end{pmatrix}$$

---

### Step 3: Electrostatic Coulomb Repulsion Vector ($\vec{F}_r$)
Repulsion acts between **every distinct pair of nodes** $(u, v) \in V \times V, u \neq v$, pushing $u$ away from $v$:

$$\vec{F}_r(u, v) = +\frac{k^2}{d_{\epsilon}(u, v)} \cdot \hat{u}_{uv} = +\frac{k^2}{d_{\epsilon}(u, v)^2} \cdot \vec{\Delta}_{uv}$$

#### Cartesian Component Decomposition:
$$\vec{F}_r(u, v) = \begin{pmatrix} F_{rx}(u, v) \\[4pt] F_{ry}(u, v) \end{pmatrix}$$

$$F_{rx}(u, v) = +\frac{k^2 \cdot (x_u - x_v)}{d_{\epsilon}(u, v)^2}$$

$$F_{ry}(u, v) = +\frac{k^2 \cdot (y_u - y_v)}{d_{\epsilon}(u, v)^2}$$

> [!NOTE]
> **Why $1/r$ instead of classical $1/r^2$ Coulomb Law?**
> Physical electrostatics uses an inverse-square law ($F \propto 1/r^2$), which causes severe mathematical instabilities and numerical spikes when $r \to 0$. Fruchterman-Reingold uses an inverse-linear law ($F \propto 1/r$), providing smoother numerical integration while maintaining strong short-range anti-collision behavior.

---

### Step 4: Spring Hooke Attraction Vector ($\vec{F}_a$)
Attraction acts **only along connected edges** $(u, v) \in E$, pulling node $u$ toward node $v$:

$$\vec{F}_a(u, v) = -\frac{d_{\epsilon}(u, v)^2}{k} \cdot \hat{u}_{uv} = +\frac{d_{\epsilon}(u, v)^2}{k} \cdot \hat{u}_{vu} = -\frac{d_{\epsilon}(u, v)}{k} \cdot \vec{\Delta}_{uv}$$

#### Cartesian Component Decomposition:
$$\vec{F}_a(u, v) = \begin{pmatrix} F_{ax}(u, v) \\[4pt] F_{ay}(u, v) \end{pmatrix}$$

$$F_{ax}(u, v) = -\frac{d_{\epsilon}(u, v) \cdot (x_u - x_v)}{k}$$

$$F_{ay}(u, v) = -\frac{d_{\epsilon}(u, v) \cdot (y_u - y_v)}{k}$$

> [!NOTE]
> **Why $r^2/k$ Quadratic Attraction?**
> Scaling attraction quadratically with distance ensures that distant connected nodes experience strong attractive forces, bringing connected components together quickly during initial simulation steps.

---

### Step 5: Force Magnitude Equilibrium at Distance $d = k$
When the distance between two connected nodes equals the ideal equilibrium distance $d(u, v) = k$:

$$|\vec{F}_r(u, v)| = \frac{k^2}{k} = k$$

$$|\vec{F}_a(u, v)| = \frac{k^2}{k} = k$$

Because $|\vec{F}_r| = |\vec{F}_a| = k$ and their direction vectors are opposite ($\hat{u}_{uv}$ vs $-\hat{u}_{uv}$), the net force acting between the nodes becomes exactly zero ($\vec{F}_{\text{net}} = \vec{0}$).

```
  Force Magnitude vs Distance d(u, v)
  
  Force Magnitude |
                 |     \                                 /  F_a (Attraction = d^2 / k)
                 |      \                               /
               k |.......X Equilibrium Point (d = k) ./
                 |        \                         /.
                 |         \                       / .
                 |          \_____________________/  .  F_r (Repulsion = k^2 / d)
               0 +-----------------------------------+-------------------> Distance d
                 0                   k               2k
```

---

### Step 6: Centripetal Center Gravity Vector ($\vec{F}_g$)
To prevent disconnected components or isolated nodes from drifting endlessly away from the active viewport center $\vec{p}_{\text{center}} = (x_{\text{center}}, y_{\text{center}})^T$, a linear centripetal restoration force is applied:

$$\vec{F}_g(u) = -c_{\text{gravity}} \cdot (\vec{p}_u - \vec{p}_{\text{center}})$$

#### Cartesian Components:
$$F_{gx}(u) = -c_{\text{gravity}} \cdot (x_u - x_{\text{center}})$$

$$F_{gy}(u) = -c_{\text{gravity}} \cdot (y_u - y_{\text{center}})$$

Where $c_{\text{gravity}} \approx 0.01 - 0.05$ is the gravitational coupling constant.

---

### Step 7: Master Net Force Superposition
Combining all forces acting on node $u \in V$:

$$\vec{F}_{\text{net}}(u) = \sum_{v \in V \setminus \{u\}} \vec{F}_r(u, v) + \sum_{v \in N(u)} \vec{F}_a(u, v) + \vec{F}_g(u)$$

#### Master Cartesian Equations:

$$F_{\text{net}, x}(u) = \sum_{v \in V \setminus \{u\}} \frac{k^2 (x_u - x_v)}{d_{\epsilon}(u, v)^2} - \sum_{v \in N(u)} \frac{d_{\epsilon}(u, v) (x_u - x_v)}{k} - c_{\text{gravity}} (x_u - x_{\text{center}})$$

$$F_{\text{net}, y}(u) = \sum_{v \in V \setminus \{u\}} \frac{k^2 (y_u - y_v)}{d_{\epsilon}(u, v)^2} - \sum_{v \in N(u)} \frac{d_{\epsilon}(u, v) (y_u - y_v)}{k} - c_{\text{gravity}} (y_u - y_{\text{center}})$$

---

## 3. Step-by-Step Computational Pseudocode

```typescript
/**
 * Accumulates net force vectors acting on all nodes in graph G = (V, E).
 * 
 * @param nodes List of layout nodes with current (x, y) positions.
 * @param edges List of graph edges (source, target pairs).
 * @param k Ideal equilibrium distance.
 * @param cGravity Centripetal gravity strength constant.
 * @returns Array of net force vectors indexed by node position.
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

  // Index map for fast node lookup
  const nodeIndexMap = new Map<string, number>(nodes.map((n, i) => [n.id, i]));

  // 1. Repulsive forces between ALL node pairs O(|V|^2)
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

  // 2. Attractive forces along connected edges O(|E|)
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

  // 3. Center gravity forces O(|V|)
  for (let i = 0; i < nodeCount; i++) {
    const u = nodes[i];
    forces[i].fx -= cGravity * (u.x - canvasCenter.x);
    forces[i].fy -= cGravity * (u.y - canvasCenter.y);
  }

  return forces;
}
```

---

## 4. Visual ASCII Force Schematics

### Spatial Force Decomposition Diagram
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
