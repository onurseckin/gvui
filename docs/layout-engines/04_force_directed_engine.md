# 04. Organic Force Engine (Physics Force-Directed)

The **Organic Force Engine** uses a **Fruchterman-Reingold spring embedder algorithm** governed by electrostatic repulsion forces and mechanical spring attraction forces. It is optimal for non-hierarchical, unstructured graphs, cluster analysis, and network discovery.

---

## 1. Physical Vector Equations

Nodes are modeled as charged physical particles, and edges are modeled as mechanical springs connecting them in a 2D Cartesian plane.

### 1. Electrostatic Repulsion Force $\vec{F}_r$ (Coulomb's Law Variant)

Every pair of nodes $(u, v)$ exerts a repulsive force pushing them apart:

$$\vec{F}_r(u, v) = -\frac{k^2}{d(u, v)} \cdot \hat{u}_{uv}$$

Where:
- $d(u, v) = \|\vec{p}_u - \vec{p}_v\|_2$: Euclidean distance between node positions.
- $k = C \cdot \sqrt{\frac{\text{Area}}{|V|}}$: Ideal equilibrium distance between nodes.
- $\hat{u}_{uv} = \frac{\vec{p}_u - \vec{p}_v}{\|\vec{p}_u - \vec{p}_v\|}$: Unit direction vector from $v$ to $u$.

---

### 2. Spring Attraction Force $\vec{F}_a$ (Hooke's Law Variant)

Connected edges $(u, v) \in E$ exert an attractive force pulling the endpoints together:

$$\vec{F}_a(u, v) = \frac{d(u, v)^2}{k} \cdot \hat{u}_{vu}$$

---

### 3. Net Force & Position Update

The net force acting on node $u$ at iteration $t$ is the sum of all repulsive and attractive vectors:

$$\vec{F}_{\text{net}}(u) = \sum_{v \in V \setminus \{u\}} \vec{F}_r(u, v) + \sum_{(u, v) \in E} \vec{F}_a(u, v)$$

---

## 2. Simulated Annealing & Temperature Schedule

To prevent chaotic oscillation and ensure convergence, displacement per iteration is bounded by a temperature parameter $T(t)$:

$$\vec{p}_u^{(t+1)} = \vec{p}_u^{(t)} + \min\left( \|\vec{F}_{\text{net}}(u)\|, T(t) \right) \cdot \frac{\vec{F}_{\text{net}}(u)}{\|\vec{F}_{\text{net}}(u)\|}$$

### Cooling Schedule

The temperature $T(t)$ decays exponentially across iterations:

$$T(t) = T_{\text{initial}} \cdot \gamma^t, \quad \gamma \approx 0.95$$

The simulation halts when $T(t) < T_{\text{threshold}}$ or after 100 iterations.
