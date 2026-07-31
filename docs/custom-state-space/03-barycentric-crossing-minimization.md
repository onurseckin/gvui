# 03. Barycentric Crossing Minimization

[← Previous: Sugiyama Layering & Cycle Breaking](./02-sugiyama-layering-cycle-breaking.md) | [← Back to Custom State-Space Engine Overview](./README.md) | [Next: A* Orthogonal Edge Routing →](./04-astar-orthogonal-routing.md)

This document presents a rigorous mathematical and algorithmic breakdown of crossing minimization in the **Custom State-Space Layout Engine**.

---

## 1. Problem & Trade-Off Journey

### The Core Challenge
When rendering layered graph layouts, edge crossings ($\times$) severely degrade visual legibility and make tracking structural dependencies difficult for users:

```
High Crossing Count (Unordered Rank Permutations):     Crossing-Minimized Layout (Barycentric Sweeps):
Rank 0:    [ Node A ]   [ Node B ]                     Rank 0:    [ Node A ]   [ Node B ]
               │            │                                         │ \        / │
               │     X      │   (2 Crossings)                         │  \      /  │   (0 Crossings)
               │    / \     │                                         │   \    /   │
Rank 1:    [ Node D ]   [ Node C ]                     Rank 1:    [ Node C ]   [ Node D ]
```

Minimizing edge crossings across all rank layers simultaneously is an **NP-hard problem** (Garey & Johnson, 1983). Even for a simple 2-layer graph, finding the absolute minimum number of crossings requires evaluating $O(|V_1|! \cdot |V_2|!)$ permutations.

### Trade-Off Comparison of Heuristics

| Algorithm | Mechanism | Pros | Cons | Decision |
| :--- | :--- | :--- | :--- | :--- |
| **Exact Integer Program (ILP)** | Formulates crossing binary indicator variables $\chi(e_1, e_2)$ | Finds global minimum crossings | $O(2^{|E|})$ exponential runtime; unusable in browser JS UI thread | ❌ Rejected |
| **Median Heuristic** | Sorts nodes by the median index of connected neighbors | Fast ($O(\|E\| \log \|V\|)$); guarantees $\le 3 \times$ optimal for 2-layer trees | Trapped in local ties when nodes have even degrees or uniform distributions | ❌ Used only as secondary backup |
| **Barycentric Heuristic + Adjacent Transposition** | Sorts nodes by arithmetic mean of neighbor indices, followed by greedy pairwise adjacent swaps | Smooth continuous convergence, handles dense edge bundles gracefully, eliminates residual 2-layer crossings | Requires multiple sweeps ($\sim 12\text{--}24$) | ✅ **Chosen Approach** |

---

## 2. Bottom-Up Mathematical Deconstruction

### Step 2.1: Binary Crossing Predicate $\chi(e_1, e_2)$
Consider two directed edges $e_1 = (u_1, v_1)$ and $e_2 = (u_2, v_2)$ between adjacent layers $L_r$ and $L_{r+1}$.

Let $\pi_r(u)$ denote the 0-indexed horizontal position of node $u$ in layer $L_r$.

The binary crossing predicate $\chi(e_1, e_2) \in \{0, 1\}$ evaluates whether edges $e_1$ and $e_2$ intersect:

$$\chi(e_1, e_2) = \begin{cases} 1 & \text{if } (\pi_r(u_1) < \pi_r(u_2) \land \pi_{r+1}(v_1) > \pi_{r+1}(v_2)) \\ & \lor (\pi_r(u_1) > \pi_r(u_2) \land \pi_{r+1}(v_1) < \pi_{r+1}(v_2)) \\ 0 & \text{otherwise} \end{cases}$$

---

### Step 2.2: Total Layer & Graph Crossing Metric
The total crossing count between adjacent rank layers $L_r$ and $L_{r+1}$ is given by:

$$C(L_r, L_{r+1}) = \sum_{i=1}^{|E_{r, r+1}|} \sum_{j=i+1}^{|E_{r, r+1}|} \chi(e_i, e_j)$$

where $E_{r, r+1}$ is the set of edges connecting nodes in $L_r$ to $L_{r+1}$.

The total graph crossing objective $C_{\text{cross}}$ across all $K$ rank layers is the sum over all adjacent pairs:

$$C_{\text{cross}}(\sigma) = \sum_{r=0}^{K-2} C(L_r, L_{r+1})$$

---

### Step 2.3: Top-Down & Bottom-Up Barycenter Equations
During a downward sweep, for each node $v \in L_r$ ($r > 0$), its top-down barycenter $\beta_{\text{TD}}(v)$ is the average position of its predecessors in $L_{r-1}$:

$$\beta_{\text{TD}}(v) = \begin{cases} \frac{1}{|\text{Pred}(v)|} \sum_{u \in \text{Pred}(v)} \pi_{r-1}(u) & \text{if } |\text{Pred}(v)| > 0 \\ \pi_r(v) & \text{otherwise} \end{cases}$$

During an upward sweep, for each node $u \in L_r$ ($r < K-1$), its bottom-up barycenter $\beta_{\text{BU}}(u)$ is the average position of its successors in $L_{r+1}$:

$$\beta_{\text{BU}}(u) = \begin{cases} \frac{1}{|\text{Succ}(u)|} \sum_{v \in \text{Succ}(u)} \pi_{r+1}(v) & \text{if } |\text{Succ}(u)| > 0 \\ \pi_r(u) & \text{otherwise} \end{cases}$$

Nodes within layer $L_r$ are sorted in ascending order of their barycenter values. Ties ($\beta(a) = \beta(b)$) are broken deterministically using node IDs.

---

### Step 2.4: Adjacent Transposition Delta $\Delta \text{cross}$
After barycentric sorting, a fine-tuning pass swaps adjacent nodes $v_i, v_{i+1} \in L_r$ if swapping strictly reduces total crossings:

$$\Delta \text{cross} = C_{\text{new}} - C_{\text{old}}$$

If $\Delta \text{cross} < 0$, the swap is committed; otherwise, it is immediately reverted.

---

## 3. Step-by-Step Computational Pseudocode

The following pseudocode details the 24-sweep alternating barycentric search with adjacent transposition:

```typescript
function minimizeCrossings(
  layerGraph: ExpandedLayerGraph,
  maxSweeps = 24,
  layerOrders?: Map<number, string[]>
): CrossingMinimizationResult {
  let currentLayers = applyLayerOrderOverrides(layerGraph.layers, layerOrders);
  let bestLayers = currentLayers.map(l => [...l]);
  let bestCrossings = countTotalGraphCrossings(bestLayers, layerGraph.successorsMap);

  if (bestCrossings === 0) return { orderedLayers: bestLayers, crossingCount: 0 };

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    // 1. Downward Sweep (Rank 1 to K-1)
    for (let r = 1; r < currentLayers.length; r++) {
      const prevPos = new Map<string, number>(currentLayers[r - 1].map((n, idx) => [n.id, idx]));
      const barycenters = new Map<string, number>();

      for (let i = 0; i < currentLayers[r].length; i++) {
        const node = currentLayers[r][i];
        const preds = (layerGraph.predecessorsMap.get(node.id) ?? []).filter(p => prevPos.has(p));

        if (preds.length > 0) {
          const sum = preds.reduce((acc, p) => acc + prevPos.get(p)!, 0);
          barycenters.set(node.id, sum / preds.length);
        } else {
          barycenters.set(node.id, i);
        }
      }

      currentLayers[r].sort((a, b) => {
        const bA = barycenters.get(a.id)!;
        const bB = barycenters.get(b.id)!;
        if (Math.abs(bA - bB) > 0.0001) return bA - bB;
        return a.id.localeCompare(b.id);
      });
    }

    // 2. Upward Sweep (Rank K-2 down to 0)
    for (let r = currentLayers.length - 2; r >= 0; r--) {
      const nextPos = new Map<string, number>(currentLayers[r + 1].map((n, idx) => [n.id, idx]));
      const barycenters = new Map<string, number>();

      for (let i = 0; i < currentLayers[r].length; i++) {
        const node = currentLayers[r][i];
        const succs = (layerGraph.successorsMap.get(node.id) ?? []).filter(s => nextPos.has(s));

        if (succs.length > 0) {
          const sum = succs.reduce((acc, s) => acc + nextPos.get(s)!, 0);
          barycenters.set(node.id, sum / succs.length);
        } else {
          barycenters.set(node.id, i);
        }
      }

      currentLayers[r].sort((a, b) => {
        const bA = barycenters.get(a.id)!;
        const bB = barycenters.get(b.id)!;
        if (Math.abs(bA - bB) > 0.0001) return bA - bB;
        return a.id.localeCompare(b.id);
      });
    }

    // 3. Adjacent Transposition Pass
    let swappedAny = false;
    for (let r = 0; r < currentLayers.length; r++) {
      const layer = currentLayers[r];
      for (let i = 0; i < layer.length - 1; i++) {
        // Swap adjacent nodes
        const temp = layer[i];
        layer[i] = layer[i + 1];
        layer[i + 1] = temp;

        const newCrossings = countTotalGraphCrossings(currentLayers, layerGraph.successorsMap);
        if (newCrossings < bestCrossings) {
          bestCrossings = newCrossings;
          bestLayers = currentLayers.map(l => [...l]);
          swappedAny = true;
        } else {
          // Revert swap
          layer[i + 1] = layer[i];
          layer[i] = temp;
        }
      }
    }

    if (bestCrossings === 0 || (!swappedAny && sweep > 4)) break;
  }

  return { orderedLayers: bestLayers, crossingCount: bestCrossings };
}
```

---

## 4. Visual ASCII Diagrams

### Downward & Upward Barycentric Sweeps

```
Downward Sweep (Sort L_1 based on L_0):        Upward Sweep (Sort L_0 based on L_1):
Rank 0 (Fixed):  [ A (0) ]   [ B (1) ]        Rank 0 (Sorted): [ A ]      [ B ]
                    │          /                                  ▲          ▲
                    │        /                                    │          │
                    ▼      ▼                                      │          │
Rank 1 (Reordered): [ C ]  [ D ]              Rank 1 (Fixed):  [ C (0) ]  [ D (1) ]
  β_TD(C) = 0                                   β_BU(A) = 0
  β_TD(D) = 1                                   β_BU(B) = 0.5
```

---

## 5. Codebase Reference Map & Line Anchors

- [`src/engine/layout/custom/crossingMinimization.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L9-L204)
  - [`countLayerCrossings`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L9-L42) — Evaluates 2-layer binary crossing counts $\chi(e_1, e_2)$.
  - [`countTotalGraphCrossings`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L44-L66) — Sums overall graph crossings $C_{\text{cross}}$.
  - [`minimizeCrossings`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L95-L204) — Alternating downward/upward barycentric sweeps with adjacent transposition.
- [`src/engine/layout/custom/portOrdering.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/portOrdering.ts#L12-L65)
  - [`computeTargetAngle`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/portOrdering.ts#L12-L30) — Computes spatial angles for pin port sorting along node boundary sides.
  - [`sortNodeSideEndpoints`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/portOrdering.ts#L32-L65) — Sorts edge port endpoints along node sides.
