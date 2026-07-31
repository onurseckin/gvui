# 01. Coulomb Repulsion & Hooke Attraction Vector Mechanics

[← Back to Master Index](../README.md)

This module documents the physical vector equations governing the **Organic Force Engine**.

---

## 1. Physical Vector Mechanics

Nodes are modeled as charged physical particles, and edges are modeled as mechanical springs connecting them in a 2D Cartesian plane.

```
       Repulsion Force (Coulomb)             Attraction Force (Hooke)
        (Pushes ALL node pairs)               (Pulls CONNECTED edges)
             F_r = + (k^2 / d)                     F_a = (d^2 / k)
       
       (Node u) <───────> (Node v)           (Node u) ───────> <─────── (Node v)
```

---

## 2. Force Vector Equations

### 1. Electrostatic Repulsion Force $\vec{F}_r$ (Coulomb's Law Variant)

Every pair of distinct nodes $(u, v)$ exerts a repulsive force pushing them apart in direction $\hat{u}_{uv}$:

$$\vec{F}_r(u, v) = +\frac{k^2}{d_{\epsilon}(u, v)} \cdot \hat{u}_{uv}$$

Where:
- $d_{\epsilon}(u, v) = \max(\epsilon, \|\vec{p}_u - \vec{p}_v\|_2)$: Euclidean distance with numerical safeguard $\epsilon = 10^{-4}$.
- $k = C \cdot \sqrt{\frac{\text{Area}}{|V|}}$: Ideal equilibrium distance.
- $\hat{u}_{uv} = \frac{\vec{p}_u - \vec{p}_v}{d_{\epsilon}(u, v)}$: Unit direction vector pointing away from $v$ towards $u$.

---

### 2. Spring Attraction Force $\vec{F}_a$ (Hooke's Law Variant)

For connected neighbors $v \in N(u) = \{ v \mid (u, v) \in E \text{ or } (v, u) \in E \}$, spring attraction pulls endpoints together:

$$\vec{F}_a(u, v) = \frac{d_{\epsilon}(u, v)^2}{k} \cdot \hat{u}_{vu}$$

---

### 3. Center Gravity Force $\vec{F}_g$

To prevent disconnected components from drifting to infinity, a weak gravitational force pulls nodes toward canvas center $\vec{p}_{\text{center}}$:

$$\vec{F}_g(u) = -c_{\text{gravity}} \cdot (\vec{p}_u - \vec{p}_{\text{center}})$$

---

### 4. Net Force Summation

$$\vec{F}_{\text{net}}(u) = \sum_{v \in V \setminus \{u\}} \vec{F}_r(u, v) + \sum_{v \in N(u)} \vec{F}_a(u, v) + \vec{F}_g(u)$$
