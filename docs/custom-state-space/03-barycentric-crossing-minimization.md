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
| **Median Heuristic** | Sorts nodes by the median index of connected neighbors | Fast ($O(|E| \log |V|)$); guarantees $\le 3 \times$ optimal for 2-layer trees | Trapped in local ties when nodes have even degrees or uniform distributions | ❌ Used only as secondary backup |
| **Barycentric Heuristic + Adjacent Transposition** | Sorts nodes by arithmetic mean of neighbor indices, followed by greedy pairwise adjacent swaps | Smooth continuous convergence, handles dense edge bundles gracefully, eliminates residual 2-layer crossings | Requires multiple sweeps ($\sim 12\text{--}24$) | ✅ **Chosen Approach** |

---

## 2. Bottom-Up Mathematical Deconstruction

### Step 2.1: Binary Crossing Predicate $\chi(e_1, e_2)$

#### 1. Mathematical Sub-Component Formula
Consider two directed edges $e_1 = (u_1, v_1)$ and $e_2 = (u_2, v_2)$ between adjacent rank layers $L_r$ and $L_{r+1}$.

Let $\pi_r(u)$ denote the 0-indexed horizontal position of node $u$ in layer $L_r$.

The binary crossing predicate $\chi(e_1, e_2) \in \{0, 1\}$ evaluates whether edges $e_1$ and $e_2$ intersect:

$$\chi(e_1, e_2) = \begin{cases} 1 & \text{if } (\pi_r(u_1) < \pi_r(u_2) \land \pi_{r+1}(v_1) > \pi_{r+1}(v_2)) \\ & \lor (\pi_r(u_1) > \pi_r(u_2) \land \pi_{r+1}(v_1) < \pi_{r+1}(v_2)) \\ 0 & \text{otherwise} \end{cases}$$

The total crossing count between adjacent rank layers $L_r$ and $L_{r+1}$ is:

$$C(L_r, L_{r+1}) = \sum_{i=1}^{|E_{r, r+1}|} \sum_{j=i+1}^{|E_{r, r+1}|} \chi(e_i, e_j)$$

#### 2. Concrete Numerical Calculation Example
Consider 2 adjacent layers $L_0$ and $L_1$:
- **Layer 0**: $\pi_0(u_1) = 0, \pi_0(u_2) = 1$
- **Layer 1**: $\pi_1(v_1) = 1, \pi_1(v_2) = 0$
- **Edges**: $e_1 = (u_1, v_1)$ and $e_2 = (u_2, v_2)$

**Predicate Step-by-Step Evaluation**:
1. Check condition 1: $\pi_0(u_1) < \pi_0(u_2) \implies 0 < 1$ (TRUE).
2. Check condition 2: $\pi_1(v_1) > \pi_1(v_2) \implies 1 > 0$ (TRUE).
3. Both conditions TRUE $\implies \chi(e_1, e_2) = 1$.
4. Total crossings between $L_0$ and $L_1$: $C(L_0, L_1) = 1$.

#### 3. Targeted Sub-Step Pseudocode
```typescript
function evaluateCrossingPredicate(e1: Edge, e2: Edge, posR: Map<string, number>, posR1: Map<string, number>): number {
  const u1 = posR.get(e1.source)!;
  const u2 = posR.get(e2.source)!;
  const v1 = posR1.get(e1.target)!;
  const v2 = posR1.get(e2.target)!;

  const crosses = (u1 < u2 && v1 > v2) || (u1 > u2 && v1 < v2);
  return crosses ? 1 : 0;
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.1: Binary Crossing Predicate Evaluation
 Layer 0:   u1 (pos 0) ─────── u2 (pos 1)
                │ \         / │
                │  \       /  │
                │   \  X  /   │   Predicate χ(e1, e2):
                │    \/   │       (u1 < u2 && v1 > v2) => (0 < 1 && 1 > 0) = TRUE
                │    /\   │       Result: χ(e1, e2) = 1 (Intersection!)
 Layer 1:   v2 (pos 0) ─────── v1 (pos 1)
```

---

### Step 2.2: Top-Down & Bottom-Up Barycentric Layer Sorting $\beta(v)$

#### 1. Mathematical Sub-Component Formula
During a downward sweep, for each node $v \in L_r$ ($r > 0$), its top-down barycenter $\beta_{\text{TD}}(v)$ is the average position of its predecessors in $L_{r-1}$:

$$\beta_{\text{TD}}(v) = \begin{cases} \frac{1}{|\text{Pred}(v)|} \sum_{u \in \text{Pred}(v)} \pi_{r-1}(u) & \text{if } |\text{Pred}(v)| > 0 \\ \pi_r(v) & \text{otherwise} \end{cases}$$

Nodes within layer $L_r$ are sorted in ascending order of their barycenter values.

#### 2. Concrete Numerical Calculation Example
Consider Layer 0 nodes $\{A, B, C\}$ fixed at positions $\pi_0(A) = 0, \pi_0(B) = 1, \pi_0(C) = 2$.

Layer 1 contains nodes $\{D, E, F\}$ with edge connections:
- Node $D$ connected to predecessors $B(\pi=1)$ and $C(\pi=2)$.
- Node $E$ connected to predecessor $A(\pi=0)$.
- Node $F$ connected to predecessors $A(\pi=0)$ and $B(\pi=1)$.

**Step-by-Step Barycenter Computations**:
- $\beta(D) = \frac{\pi_0(B) + \pi_0(C)}{2} = \frac{1 + 2}{2} = \mathbf{1.5}$
- $\beta(E) = \frac{\pi_0(A)}{1} = \frac{0}{1} = \mathbf{0.0}$
- $\beta(F) = \frac{\pi_0(A) + \pi_0(B)}{2} = \frac{0 + 1}{2} = \mathbf{0.5}$

**Ascending Barycenter Sort**:
$$0.0 \text{ (Node E)} < 0.5 \text{ (Node F)} < 1.5 \text{ (Node D)}$$

$$\text{Reordered Layer 1}: [E, F, D]$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function computeDownwardBarycentersAndSort(
  layer: LayerNode[],
  prevPos: Map<string, number>,
  predMap: Map<string, string[]>
): LayerNode[] {
  const barycenters = new Map<string, number>();

  for (let i = 0; i < layer.length; i++) {
    const node = layer[i];
    const preds = (predMap.get(node.id) ?? []).filter(p => prevPos.has(p));
    if (preds.length > 0) {
      const sum = preds.reduce((acc, p) => acc + prevPos.get(p)!, 0);
      barycenters.set(node.id, sum / preds.length);
    } else {
      barycenters.set(node.id, i);
    }
  }

  return [...layer].sort((a, b) => {
    const bA = barycenters.get(a.id)!;
    const bB = barycenters.get(b.id)!;
    if (Math.abs(bA - bB) > 0.0001) return bA - bB;
    return a.id.localeCompare(b.id);
  });
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.2: Barycenter Calculation & Sorting Table
 Layer 0 (Fixed):  A (pos 0)    B (pos 1)    C (pos 2)
                   │  \         │  \         │
                   │   \        │   \        │
                   ▼    ▼       ▼    ▼       ▼
 Node ID   Predecessors   Positions   Sum   Count   Barycenter β(v)   Sorted Order
 ───────   ────────────   ─────────   ───   ─────   ───────────────   ────────────
 Node D    {B, C}         {1, 2}       3      2          1.5             3rd
 Node E    {A}            {0}          0      1          0.0             1st
 Node F    {A, B}         {0, 1}       1      2          0.5             2nd

 Reordered Layer 1 Sequence: [ Node E (0.0), Node F (0.5), Node D (1.5) ]
```

---

### Step 2.3: Adjacent Transposition Delta $\Delta \text{cross}$

#### 1. Mathematical Sub-Component Formula
After barycentric sorting, a fine-tuning pass checks adjacent nodes $v_i, v_{i+1} \in L_r$ and calculates the crossing delta if swapped:

$$\Delta \text{cross} = c(v_{i+1}, v_i) - c(v_i, v_{i+1})$$

where $c(a, b)$ is the number of crossings between edges incident to $a$ and $b$ when $a$ is placed to the left of $b$.

If $\Delta \text{cross} < 0$, the swap strictly reduces crossings and is committed; otherwise, it is reverted.

#### 2. Concrete Numerical Swap Example
Consider adjacent pair $[v_1, v_2]$ in Layer 1:
- Current order $[v_1, v_2]$: Edges attached to $v_1$ and $v_2$ cause $c(v_1, v_2) = 2$ crossings.
- Swapped order $[v_2, v_1]$: Edges attached to $v_2$ and $v_1$ cause $c(v_2, v_1) = 0$ crossings.

**Delta Calculation**:
$$\Delta \text{cross} = c(v_2, v_1) - c(v_1, v_2) = 0 - 2 = -2$$

Since $\Delta \text{cross} = -2 < 0$, swapping $[v_1, v_2] \to [v_2, v_1]$ reduces graph crossings by 2. Swap is **COMMITTED**.

#### 3. Targeted Sub-Step Pseudocode
```typescript
function adjacentTranspositionPass(
  layers: LayerNode[][],
  succMap: Map<string, string[]>
): { layers: LayerNode[][]; reducedCount: number } {
  let bestLayers = layers.map(l => [...l]);
  let currentCrossings = countTotalGraphCrossings(bestLayers, succMap);
  let reduced = 0;

  for (let r = 0; r < bestLayers.length; r++) {
    const layer = bestLayers[r];
    for (let i = 0; i < layer.length - 1; i++) {
      // Swap adjacent nodes
      const temp = layer[i];
      layer[i] = layer[i + 1];
      layer[i + 1] = temp;

      const newCrossings = countTotalGraphCrossings(bestLayers, succMap);
      if (newCrossings < currentCrossings) {
        reduced += (currentCrossings - newCrossings);
        currentCrossings = newCrossings;
      } else {
        // Revert swap if no improvement
        layer[i + 1] = layer[i];
        layer[i] = temp;
      }
    }
  }
  return { layers: bestLayers, reducedCount: reduced };
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.3: Adjacent Transposition Swap Check
 Before Swap [v1, v2]:                    After Swap [v2, v1]:
 Layer 0: [ A ]    [ B ]                  Layer 0: [ A ]    [ B ]
            │ \    / │                               │ \    / │
            │  \  /  │   (2 Crossings)               │  \  /  │   (0 Crossings!)
            │   \/   │                               │   \/   │
 Layer 1: [ v1 ]  [ v2 ]                  Layer 1: [ v2 ]  [ v1 ]
 Δcross = c(v2,v1) - c(v1,v2) = 0 - 2 = -2 < 0 => COMMIT SWAP!
```

---

## 3. Master Synthesis: Merged Alternating Barycentric Search Algorithm

### 1. Unified Mathematical Crossing Minimization Formulation
Combining binary crossing predicates (2.1), alternating top-down/bottom-up barycentric sweeps (2.2), and adjacent transposition passes (2.3), the master crossing solver is:

$$\mathcal{L}^* = \arg\min_{\mathcal{L} \in \text{Perm}(V_R)} \sum_{r=0}^{K-2} C(L_r, L_{r+1})$$

### 2. Complete Master Crossing Minimization Pseudocode
```typescript
function minimizeCrossings(
  layerGraph: ExpandedLayerGraph,
  maxSweeps = 24
): CrossingMinimizationResult {
  let currentLayers = layerGraph.layers.map(l => [...l]);
  let bestLayers = currentLayers.map(l => [...l]);
  let bestCrossings = countTotalGraphCrossings(bestLayers, layerGraph.successorsMap);

  if (bestCrossings === 0) return { orderedLayers: bestLayers, crossingCount: 0 };

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    // 1. Downward Sweep (Rank 1 to K-1)
    for (let r = 1; r < currentLayers.length; r++) {
      const prevPos = new Map<string, number>(currentLayers[r - 1].map((n, idx) => [n.id, idx]));
      currentLayers[r] = computeDownwardBarycentersAndSort(currentLayers[r], prevPos, layerGraph.predecessorsMap);
    }

    // 2. Upward Sweep (Rank K-2 down to 0)
    for (let r = currentLayers.length - 2; r >= 0; r--) {
      const nextPos = new Map<string, number>(currentLayers[r + 1].map((n, idx) => [n.id, idx]));
      currentLayers[r] = computeUpwardBarycentersAndSort(currentLayers[r], nextPos, layerGraph.successorsMap);
    }

    // 3. Adjacent Transposition Pass
    const transposeResult = adjacentTranspositionPass(currentLayers, layerGraph.successorsMap);
    currentLayers = transposeResult.layers;

    const newCrossings = countTotalGraphCrossings(currentLayers, layerGraph.successorsMap);
    if (newCrossings < bestCrossings) {
      bestCrossings = newCrossings;
      bestLayers = currentLayers.map(l => [...l]);
    }

    if (bestCrossings === 0 || (transposeResult.reducedCount === 0 && sweep > 4)) break;
  }

  return { orderedLayers: bestLayers, crossingCount: bestCrossings };
}
```

### 3. Master Sweeping Flow Diagram
```
Alternating Barycentric Sweep Architecture:
┌────────────────────────────────────────────────────────────────────────┐
│               Initial Unordered Layer Permutations L_0..L_K            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│    24-Sweep Loop: Downward (r=1..K-1) -> Upward (r=K-2..0)            │
│                                                                        │
│  Step 2.2: Compute Barycenters β_TD(v) / β_BU(u)                       │
│  Step 2.1: Count Crossings C(L_r, L_r+1) via χ(e1, e2)                 │
│  Step 2.3: Adjacent Transposition Pass (Swap if Δcross < 0)            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             Crossing-Minimized Layer Permutation Array L*              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Codebase Reference Map & Line Anchors

- [`src/engine/layout/custom/crossingMinimization.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L9-L204)
  - [`countLayerCrossings`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L9-L42) — Evaluates 2-layer binary crossing counts $\chi(e_1, e_2)$.
  - [`countTotalGraphCrossings`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L44-L66) — Sums overall graph crossings $C_{\text{cross}}$.
  - [`minimizeCrossings`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L95-L204) — Alternating downward/upward barycentric sweeps with adjacent transposition.
- [`src/engine/layout/custom/portOrdering.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/portOrdering.ts#L12-L65)
  - [`computeTargetAngle`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/portOrdering.ts#L12-L30) — Computes spatial angles for pin port sorting along node boundary sides.
  - [`sortNodeSideEndpoints`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/portOrdering.ts#L32-L65) — Sorts edge port endpoints along node sides.
