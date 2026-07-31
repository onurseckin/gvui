# 04. Organic Force Engine (Physics Force-Directed)

The **Organic Force Engine** uses a **Fruchterman-Reingold spring embedder algorithm** governed by electrostatic repulsion forces and mechanical spring attraction forces. It is optimal for non-hierarchical, unstructured graphs, cluster analysis, and network discovery.

---

## 1. Physical Vector Equations

Nodes are modeled as charged physical particles, and edges are modeled as mechanical springs connecting them in a 2D Cartesian plane.

### 1. Electrostatic Repulsion Force $\vec{F}_r$ (Coulomb's Law Variant)

Every pair of distinct nodes $(u, v)$ exerts a repulsive force pushing them apart in direction $\hat{u}_{uv}$:

$$\vec{F}_r(u, v) = +\frac{k^2}{d_{\epsilon}(u, v)} \cdot \hat{u}_{uv}$$

Where:
- $d_{\epsilon}(u, v) = \max(\epsilon, \|\vec{p}_u - \vec{p}_v\|_2)$: Euclidean distance between node center positions with small numerical safeguard $\epsilon = 10^{-4}$.
- $k = C \cdot \sqrt{\frac{\text{Area}}{|V|}}$: Ideal equilibrium distance scaling constant.
- $\hat{u}_{uv} = \frac{\vec{p}_u - \vec{p}_v}{d_{\epsilon}(u, v)}$: Unit direction vector pointing away from $v$ towards $u$.

---

### 2. Spring Attraction Force $\vec{F}_a$ (Hooke's Law Variant)

For connected neighbors $v \in N(u) = \{ v \mid (u, v) \in E \text{ or } (v, u) \in E \}$, spring attraction pulls endpoints together:

$$\vec{F}_a(u, v) = \frac{d_{\epsilon}(u, v)^2}{k} \cdot \hat{u}_{vu}$$

Where $\hat{u}_{vu} = -\hat{u}_{uv}$ is the unit direction vector pointing towards $v$.

---

### 3. Center Gravity Force $\vec{F}_g$

To prevent disconnected components from drifting to infinity, a weak gravitational force pulls nodes toward canvas center $\vec{p}_{\text{center}}$:

$$\vec{F}_g(u) = -c_{\text{gravity}} \cdot (\vec{p}_u - \vec{p}_{\text{center}})$$

---

### 4. Net Force & Position Update

The net force acting on node $u$ at iteration $t$ is:

$$\vec{F}_{\text{net}}(u) = \sum_{v \in V \setminus \{u\}} \vec{F}_r(u, v) + \sum_{v \in N(u)} \vec{F}_a(u, v) + \vec{F}_g(u)$$

---

## 2. Simulated Annealing & Temperature Schedule

To prevent chaotic oscillation and ensure convergence, displacement per iteration is bounded by a temperature parameter $T(t)$:

$$\vec{p}_u^{(t+1)} = \vec{p}_u^{(t)} + \min\left( \|\vec{F}_{\text{net}}(u)\|, T(t) \right) \cdot \frac{\vec{F}_{\text{net}}(u)}{\max(\epsilon, \|\vec{F}_{\text{net}}(u)\|)}$$

### Cooling Schedule

The temperature $T(t)$ decays exponentially across iterations:

$$T(t) = T_{\text{initial}} \cdot \gamma^t, \quad \gamma \approx 0.95$$

The simulation halts when $T(t) < T_{\text{threshold}}$ or after 100 iterations.

---

## 3. Straight Edge Path & Badge Coordinates

Edges are drawn as direct straight line segments between node center points:

$$\text{Path}(t) = (1-t) \mathbf{P}_u + t \mathbf{P}_v, \quad t \in [0, 1]$$

The edge label badge is positioned at the linear midpoint ($t = 0.5$):

$$X_{\text{label}} = \frac{X_u + X_v}{2}, \quad Y_{\text{label}} = \frac{Y_u + Y_v}{2}$$
