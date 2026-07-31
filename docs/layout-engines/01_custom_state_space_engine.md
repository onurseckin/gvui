# 01. Custom State-Space Layout Engine (Top-Down)

The **Custom State-Space Engine** is GVUI's flagship directed graph layout and routing engine. It is specifically engineered to solve the most difficult graph layout challenges—including dense cyclic dependency meshes, reciprocal edge pairs, crossing minimizations, and dynamic badge clearance—with zero node overlaps and clean orthogonal edge routes.

---

## 1. Mathematical Architecture & Objective Function

The layout problem is framed as a discrete state-space optimization over a search graph $\mathcal{S}$. A candidate state $\sigma \in \mathcal{S}$ is defined as a tuple:

$$\sigma = \langle \Pi_{\text{sides}}, \Omega_{\text{ports}}, \mathcal{D}_{\text{demands}}, \mathcal{L}_{\text{orders}}, \Delta_{\text{shifts}} \rangle$$

Where:
- $\Pi_{\text{sides}}$: Assignment of departure and arrival sides ($\text{Top}, \text{Right}, \text{Bottom}, \text{Left}$) for edge ports.
- $\Omega_{\text{ports}}$: Ordering of ports along each node boundary side.
- $\mathcal{D}_{\text{demands}}$: Exact spacing demands $\langle \text{kind}, \text{rank}, \text{afterNodeId}, \text{minimum} \rangle$ for rank gaps and node gaps.
- $\mathcal{L}_{\text{orders}}$: Permutation order of nodes within each topological rank layer.
- $\Delta_{\text{shifts}}$: Sub-rank horizontal and vertical spatial shifts.

### Objective Fitness Function $f(\sigma)$

The quality of layout state $\sigma$ is evaluated by a multi-component lexicographic cost function:

$$f(\sigma) = w_{\text{hard}} \cdot C_{\text{hard}}(\sigma) + w_{\text{cross}} \cdot C_{\text{cross}}(\sigma) + w_{\text{bends}} \cdot C_{\text{bends}}(\sigma) + w_{\text{length}} \cdot C_{\text{length}}(\sigma) + w_{\text{badges}} \cdot C_{\text{badges}}(\sigma)$$

Where:
- $C_{\text{hard}}(\sigma)$: Count of hard constraint violations (node-node overlaps, edge-node penetrations, non-orthogonal segments).
- $C_{\text{cross}}(\sigma)$: Count of edge-edge line crossings $\sum_{i < j} \text{Cross}(e_i, e_j)$.
- $C_{\text{bends}}(\sigma)$: Total number of orthogonal route bends $\sum_{e} \text{Bends}(e)$.
- $C_{\text{length}}(\sigma)$: Total Manhattan route length $\sum_{e} \text{ManhattanLength}(e)$.
- $C_{\text{badges}}(\sigma)$: Penalty for badge placement retries, leader line lengths, or badge-edge proximity conflicts.

---

## 2. 32-Stage Algorithmic Pipeline

The optimization pipeline runs asynchronously in a dedicated Web Worker time-sliced across 32 micro-stages:

```
[Input Graph] -> [1. Normalization] -> [2. SCC Cycle Detection] -> [3. Cycle Breaking]
               -> [4. Rank Assignment] -> [5. Layer Graph Construction]
               -> [6-15. Barycentric Sweeps] -> [16-27. A* Corridor Routing]
               -> [28-31. Badge Spacing Demands] -> [32. Geometry Finalization]
```

### Stage 1–5: Topological Layering & Cycle Breaking

1. **Cycle Breaking via Strongly Connected Components (SCC)**:
   Cycles are identified using Tarjan's SCC algorithm. Edges forming feedback loops are reclassified to ensure the reduced layer graph $\mathcal{G}_{\text{DAG}}$ is acyclic:
   $$\text{scc}(v) = \text{lowlink}(v)$$

2. **Longest Path Rank Assignment**:
   Each node $v$ is assigned a topological rank $r(v)$:
   $$r(v) = \max_{(u, v) \in E} \{ r(u) + 1 \}, \quad r(\text{roots}) = 0$$

3. **Virtual Dummy Node Insertion**:
   For long edges spanning multiple ranks $r(v) - r(u) = k > 1$, $k - 1$ virtual dummy nodes $d_1, d_2, \dots, d_{k-1}$ are inserted to break the long edge into unit-length rank segments.

---

### Stage 6–18: Barycentric Crossing Minimization Sweeps

To minimize edge crossings, the engine performs alternating top-down and bottom-up sweeps over adjacent rank layers $(L_r, L_{r+1})$. The position of node $v \in L_{r+1}$ is updated based on the average position (barycenter) of its connected neighbors in $L_r$:

$$\text{barycenter}(v) = \frac{1}{\text{deg}^{-}(v)} \sum_{(u, v) \in E} \text{position}(u)$$

Nodes in $L_{r+1}$ are sorted deterministically by their barycenter values. Tied barycenters are resolved using median heuristics to prevent oscillation loops.

---

### Stage 19–27: A* Orthogonal Edge Corridor Routing

Edge routes are calculated using a grid-based A* pathfinder operating on an orthogonal grid.

#### Cost Heuristic for A* Search

Given current grid point $p = (x_1, y_1)$ and target port $q = (x_2, y_2)$:

$$h(p, q) = |x_1 - x_2| + |y_1 - y_2| + P_{\text{bend}} \cdot \text{IsBend}(p, \text{prev}) + P_{\text{obstacle}} \cdot \text{ObstacleDist}(p)$$

Where:
- $P_{\text{bend}} = 40$: Penalty applied whenever the search direction turns $90^\circ$.
- $P_{\text{obstacle}} = 500$: Penalty applied if the grid node falls inside a node clearance envelope.

#### Crossing Bridges
When two orthogonal edge paths intersect perpendicularly, a bridge curve arc is generated:

$$\text{BridgePath}(p_{\text{cross}}) = \text{Arc}(\text{radius} = 6\text{px})$$

---

### Stage 28–32: Badge Placement & Dynamic Spacing Demand Resolution

Edge badges (e.g. labels, cycle markers $\circlearrowleft$) require dedicated spatial corridors.

#### Required Same-Rank Badge Gap Equation

For a same-rank edge with badge width $W_{\text{badge}}$, the minimum required horizontal gap $G_{\text{req}}$ between node boundaries is:

$$G_{\text{req}} = W_{\text{badge}} + 2 \cdot C_{\text{badge}} + 2 \cdot L_{\text{stub}}$$

Where:
- $C_{\text{badge}} = 10\text{px}$: Badge clearance margin.
- $L_{\text{stub}} = 20\text{px}$: Port stub length.

If the current node gap $G_{\text{current}} < G_{\text{req}}$, the engine emits an exact spacing demand:

$$\mathcal{D} = \langle \text{kind}: \text{"node-gap"}, \text{rank}: r, \text{afterNodeId}: u, \text{minimum}: G_{\text{req}} \rangle$$

The state evaluator receives $\mathcal{D}$, updates spacing overrides $\Delta_{\text{shifts}}$, and re-computes coordinate assignment:

$$X(v_{i+1}) = X(v_i) + \frac{W(v_i) + W(v_{i+1})}{2} + \max(G_{\text{default}}, G_{\text{req}})$$

This expands the horizontal distance between adjacent nodes to **$G_{\text{req}}$**, placing the edge badge **directly on the straight edge line between the nodes** with zero node overlaps!
