# 01. Coulomb Repulsion & Hooke Attraction Vector Mechanics

[← Back to Master Index](../README.md)

This module documents the physical vector equations, vector derivations, and Cartesian component decompositions governing the **Organic Force Engine** (Fruchterman-Reingold spring embedder paradigm).

---

## 1. Physical Vector Mechanics Overview

Nodes in the graph $G = (V, E)$ are modeled as charged physical particles in a 2D Cartesian plane $\mathbb{R}^2$, and edges are modeled as mechanical springs connecting adjacent node pairs.

- **Vertex Position**: Each node $u \in V$ has position vector $\vec{p}_u = (x_u, y_u)^T \in \mathbb{R}^2$.
- **Displacement Vector**: For any node pair $(u, v)$, the displacement vector pointing from $v$ to $u$ is:
  $$\vec{\Delta}_{uv} = \vec{p}_u - \vec{p}_v = \begin{pmatrix} x_u - x_v \\ y_u - y_v \end{pmatrix}$$
- **Euclidean Distance**: $d(u, v) = \|\vec{\Delta}_{uv}\|_2 = \sqrt{(x_u - x_v)^2 + (y_u - y_v)^2}$.
- **Regularized Distance**: $d_{\epsilon}(u, v) = \max(\epsilon, d(u, v))$ with numerical safeguard $\epsilon = 10^{-4}$ to prevent division by zero when nodes overlap.
- **Unit Direction Vector**: $\hat{u}_{uv} = \frac{\vec{\Delta}_{uv}}{d_{\epsilon}(u, v)} = \begin{pmatrix} \frac{x_u - x_v}{d_{\epsilon}(u, v)} \\ \frac{y_u - y_v}{d_{\epsilon}(u, v)} \end{pmatrix}$, pointing in the direction of repulsive force acting on node $u$.

```
       Repulsion Force (Coulomb)             Attraction Force (Hooke)
        (Pushes ALL node pairs)               (Pulls CONNECTED edges)
             F_r = + (k^2 / d)                     F_a = (d^2 / k)
       
       (Node u) <───────> (Node v)           (Node u) ───────> <─────── (Node v)
```

---

## 2. Ideal Equilibrium Distance Derivation ($k$)

The ideal equilibrium distance $k$ represents the optimal edge length and density scale across the 2D bounding canvas of area $\text{Area} = W \times H$:

$$k = C \cdot \sqrt{\frac{\text{Area}}{|V|}}$$

Where:
- $\text{Area} = W \times H$: Display canvas width $W$ and height $H$.
- $|V|$: Total count of vertices in dataset $G$.
- $C \in [0.75, 1.0]$: Dimensionless scaling constant balancing layout compactness versus node spreading.

When distance $d(u, v) = k$, the magnitudes of repulsive force $F_r$ and attractive force $F_a$ are exactly equal ($F_r = F_a = k$), establishing mechanical force equilibrium.

---

## 3. Force Vector Equations & Derivations

### 1. Electrostatic Repulsion Force Vector $\vec{F}_r(u, v)$

Every pair of distinct nodes $(u, v) \in V \times V, u \neq v$ exerts a repulsive force pushing them apart along unit vector $\hat{u}_{uv}$:

$$\vec{F}_r(u, v) = +\frac{k^2}{d_{\epsilon}(u, v)} \cdot \hat{u}_{uv} = +\frac{k^2}{d_{\epsilon}(u, v)^2} \cdot \vec{\Delta}_{uv}$$

#### Cartesian Component Decomposition:
Expanding $\vec{F}_r(u, v) = \begin{pmatrix} F_{rx}(u, v) \\ F_{ry}(u, v) \end{pmatrix}$:

$$F_{rx}(u, v) = +\frac{k^2 \cdot (x_u - x_v)}{d_{\epsilon}(u, v)^2}$$

$$F_{ry}(u, v) = +\frac{k^2 \cdot (y_u - y_v)}{d_{\epsilon}(u, v)^2}$$

#### Physical Properties:
- **Inverse Distance Scaling**: Unlike classical electrostatic Coulomb law ($1/r^2$), Fruchterman-Reingold repulsion scales as $1/r$. This prevents extreme repulsive spikes when nodes are close, producing smoother trajectories.
- **Newton's Third Law Symmetry**: $\vec{F}_r(v, u) = -\vec{F}_r(u, v)$.

---

### 2. Spring Attraction Force Vector $\vec{F}_a(u, v)$

For connected neighbor pairs $v \in N(u) = \{ v \mid (u, v) \in E \text{ or } (v, u) \in E \}$, spring attraction pulls endpoints toward each other:

$$\vec{F}_a(u, v) = -\frac{d_{\epsilon}(u, v)^2}{k} \cdot \hat{u}_{uv} = +\frac{d_{\epsilon}(u, v)^2}{k} \cdot \hat{u}_{vu} = -\frac{d_{\epsilon}(u, v)}{k} \cdot \vec{\Delta}_{uv}$$

#### Cartesian Component Decomposition:
Expanding $\vec{F}_a(u, v) = \begin{pmatrix} F_{ax}(u, v) \\ F_{ay}(u, v) \end{pmatrix}$:

$$F_{ax}(u, v) = -\frac{d_{\epsilon}(u, v) \cdot (x_u - x_v)}{k}$$

$$F_{ay}(u, v) = -\frac{d_{\epsilon}(u, v) \cdot (y_u - y_v)}{k}$$

#### Physical Properties:
- **Quadratic Distance Scaling**: Attraction magnitude $F_a = \frac{d^2}{k}$ grows quadratically with edge length, pulling distant connected nodes rapidly closer.
- **Rest Length Equilibrium**: At $d(u,v) = k$, $F_a(u,v) = \frac{k^2}{k} = k$, balancing $F_r(u,v) = \frac{k^2}{k} = k$.

---

### 3. Centripetal Center Gravity Force Vector $\vec{F}_g(u)$

To prevent disconnected components or isolated vertices from drifting infinitely far from the canvas center $\vec{p}_{\text{center}} = (x_{\text{center}}, y_{\text{center}})^T$, a linear weak gravitational restoration force is applied:

$$\vec{F}_g(u) = -c_{\text{gravity}} \cdot (\vec{p}_u - \vec{p}_{\text{center}})$$

#### Cartesian Component Decomposition:
Expanding $\vec{F}_g(u) = \begin{pmatrix} F_{gx}(u) \\ F_{gy}(u) \end{pmatrix}$:

$$F_{gx}(u) = -c_{\text{gravity}} \cdot (x_u - x_{\text{center}})$$

$$F_{gy}(u) = -c_{\text{gravity}} \cdot (y_u - y_{\text{center}})$$

Where $c_{\text{gravity}} \approx 0.01 - 0.05$ is the gravitational coupling constant.

---

## 4. Net Force Superposition Principle

The total net force vector $\vec{F}_{\text{net}}(u)$ acting on vertex $u$ is the vector sum of all repulsive, attractive, and gravitational forces:

$$\vec{F}_{\text{net}}(u) = \sum_{v \in V \setminus \{u\}} \vec{F}_r(u, v) + \sum_{v \in N(u)} \vec{F}_a(u, v) + \vec{F}_g(u)$$

### Superposition Cartesian Component Equations:

$$F_{\text{net}, x}(u) = \sum_{v \in V \setminus \{u\}} \frac{k^2 (x_u - x_v)}{d_{\epsilon}(u, v)^2} - \sum_{v \in N(u)} \frac{d_{\epsilon}(u, v) (x_u - x_v)}{k} - c_{\text{gravity}} (x_u - x_{\text{center}})$$

$$F_{\text{net}, y}(u) = \sum_{v \in V \setminus \{u\}} \frac{k^2 (y_u - y_v)}{d_{\epsilon}(u, v)^2} - \sum_{v \in N(u)} \frac{d_{\epsilon}(u, v) (y_u - y_v)}{k} - c_{\text{gravity}} (y_u - y_{\text{center}})$$

---

## 🔗 Codebase Implementation Links

- Layout Dispatcher Engine: [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L71-L129)
- Main Layout Dispatch Entrypoint: [computeGraphLayout](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L134-L152)
