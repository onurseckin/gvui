# 02. Top-Down Dagre Ranked Engine

The **Top-Down (Dagre Ranked Engine)** layout mode utilizes the classic **Sugiyama hierarchical framework** implemented via DagreJS with a Top-to-Bottom (`TB`) rank direction. It organizes nodes into rigid horizontal rank layers, producing a clean, structured hierarchy for decision trees and directed workflows.

---

## 1. Algorithmic Overview

The Sugiyama framework decomposes hierarchical layout into 4 distinct phases:

```
[1. Cycle Removal] -> [2. Layer Assignment (Simplex)] -> [Dummy Node Insertion] -> [3. Vertex Ordering] -> [4. Coordinate Assignment]
```

### Phase 1: Cycle Removal (Stack-Based DFS)
Cycles in the graph are identified using a depth-first search (DFS). Back-edges $(u, v)$ where target node $v$ is currently an active ancestor on the DFS recursion stack are temporarily reversed:

$$E_{\text{reversed}} = \{ (u, v) \in E \mid v \in \text{DFS\_Recursion\_Stack} \}$$

---

### Phase 2: Layer Assignment via Network Simplex

Nodes are assigned to integer layer ranks $r: V \to \mathbb{Z}_{\ge 0}$ such that for every directed edge $(u, v)$, the rank constraint is satisfied:

$$r(v) - r(u) \ge \delta(u, v) \ge 1$$

Where $\delta(u, v)$ is the minimum rank separation distance (default = 1).

#### Network Simplex Linear Program Formulation

The objective is to minimize total weighted edge length across ranks:

$$\min \sum_{(u, v) \in E} w(u, v) \cdot (r(v) - r(u))$$

Subject to:

$$r(v) - r(u) \ge 1 \quad \forall (u, v) \in E$$

The dual problem is solved using the Network Simplex method, finding an optimal spanning tree of tight edges where $r(v) - r(u) = 1$.

#### Virtual Dummy Node Insertion
For long edges spanning multiple ranks $r(v) - r(u) = k > 1$, $k - 1$ virtual dummy nodes $d_1, d_2, \dots, d_{k-1}$ are inserted on intermediate ranks to ensure all edges connect nodes in adjacent layers.

---

### Phase 3: Vertex Ordering (Barycentric Heuristic)

To minimize crossings between adjacent ranks $L_i$ and $L_{i+1}$:
1. Fix layer $L_0$.
2. For $i = 0$ to $k-1$:
   Assign each node $v \in L_{i+1}$ a weight equal to the average layer ordering index of its predecessors in $L_i$:
   $$\text{barycenter}(v) = \frac{1}{|\text{Predecessors}(v)|} \sum_{u \in \text{Predecessors}(v)} \text{pos}(u)$$
3. Sort $L_{i+1}$ by $\text{barycenter}(v)$.
4. Perform reverse sweeps from $L_k$ back to $L_0$.

---

### Phase 4: Coordinate Assignment (Brandes-Köpf Algorithm)

Horizontal coordinates $x(v)$ are calculated using the **Brandes-Köpf alignment algorithm** in 4 sub-pass alignments:
- Upper-Left (UL)
- Upper-Right (UR)
- Lower-Left (LL)
- Lower-Right (LR)

#### Alignment & Compaction

Each sub-pass aligns vertices with their median neighbor and builds blocks of connected vertices. The blocks are placed using a block graph compaction algorithm. The final X-coordinate is the median of the 4 candidate alignments:

$$x(v) = \text{Median}\left( x_{\text{UL}}(v), x_{\text{UR}}(v), x_{\text{LL}}(v), x_{\text{LR}}(v) \right)$$

This guarantees balanced subtree placement and aesthetic symmetry.
