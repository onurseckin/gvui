# 02. Barycentric & Median Order Heuristics

[← Back to Master Index](../README.md)

This module documents vertex ordering heuristics and multi-pass barycentric/median sweeps used for **crossing minimization** across adjacent rank layers in the **Top-Down Dagre Engine**.

---

## 1. The Problem & Trade-off Journey

### 1.1 The Crossing Minimization Problem
Once nodes are partitioned into discrete rank layers $L_0, L_1, \dots, L_k$, the ordering of nodes within each layer determines how many edge lines intersect. Excessive edge crossings create a "spaghetti" visualization that severely reduces readability.

Given a sequence of ordered layers, the goal of crossing minimization is to determine horizontal permutations $\pi(L_i)$ for each layer $L_i$ that minimize the total crossing count:

$$C(G) = \sum_{i=0}^{k-1} C(L_i, L_{i+1})$$

```
   High Crossing Permutation (3 Crossings):      Minimized Permutation (0 Crossings):

   Layer 0:   [ A ]   [ B ]   [ C ]              Layer 0:   [ A ]   [ B ]   [ C ]
               │ \     / │     /                             │\     /│     /
               │  \   /  │    /                              │ \   / │    /
               │   \ /   │   /                               │  \ /  │   /
               │    X    │  /                                │   X   │  /
               │   / \   │ /                                 │  / \  │ /
   Layer 1:   [ D ]   [ E ]                      Layer 1:   [ E ]   [ D ]
```

### 1.2 Comparison of Crossing Reduction Heuristics

| Approach | Algorithm Mechanism | Time Complexity | Strengths | Weaknesses / Why Rejected |
| :--- | :--- | :--- | :--- | :--- |
| **Exact Integer Programming (IP)** | Formulate binary crossing variables $\chi_{ij,kl}$ | Exponential $O(2^N)$ | Finds provably optimal minimal crossing permutation | NP-hard problem; intractable for graphs with $>15$ nodes per layer. |
| **Barycentric Heuristic (Chosen)** | Places nodes at arithmetic mean of neighbor positions | $O(K \cdot (V + E \log E))$ | Smooth average placement; excellent for dense graphs; fast convergence | Can create overlapping node targets when neighbors have identical averages. |
| **Median Heuristic (Chosen)** | Places nodes at median of neighbor positions | $O(K \cdot (V + E \log E))$ | **Theoretical guarantee**: Provably $\le 3 \times$ optimal crossings for 2 layers | Produces integer ties frequently when node in-degrees are even. |
| **Random Swap / Annealing** | Stochastic pair swapping | $O(M \cdot E)$ | Simple to code | Non-deterministic; layout changes unpredictably on minor graph edits. |

### 1.3 Why Hybrid Barycentric/Median Sweeps are Chosen
Dagre uses alternating multi-pass **Barycentric and Median Sweeps** paired with **Adjacent Transpositions (Local Swaps)**. The median heuristic guarantees theoretical upper bounds on crossings, while the barycentric heuristic provides fine-grained tie-breaking. Adding an adjacent transposition pass after each sweep guarantees that local pairs with zero barycentric difference are swapped whenever doing so strictly reduces crossings.

---

## 2. Bottom-Up Mathematical Deconstruction

### Step 2.1: Binary Crossing Predicate & Crossing Matrix
Consider two layers $L_i$ and $L_{i+1}$. Let $u_1, u_2 \in L_i$ with positions $\text{pos}(u_1) < \text{pos}(u_2)$, and let $v_1, v_2 \in L_{i+1}$ with positions $\text{pos}(v_1)$ and $\text{pos}(v_2)$.

Two edges $e_1 = (u_1, v_1)$ and $e_2 = (u_2, v_2)$ cross if and only if their relative endpoint orderings are inverted:

$$\chi(e_1, e_2) = \begin{cases} 1 & \text{if } (\text{pos}(u_1) < \text{pos}(u_2) \land \text{pos}(v_1) > \text{pos}(v_2)) \lor (\text{pos}(u_1) > \text{pos}(u_2) \land \text{pos}(v_1) < \text{pos}(v_2)) \\ 0 & \text{otherwise} \end{cases}$$

The total crossings $C(L_i, L_{i+1})$ between two adjacent layers is:

$$C(L_i, L_{i+1}) = \sum_{e_1, e_2 \in E(L_i, L_{i+1})} \chi(e_1, e_2)$$

### Step 2.2: Downward Barycenter & Median Equations
When sweeping downward from top layer $L_0$ to bottom layer $L_k$, the ordering of layer $L_i$ is held fixed as a reference anchor. For each node $v \in L_{i+1}$, let $N^-(v) \subseteq L_i$ denote its set of upper predecessors.

- **Downward Barycenter**:
  $$\text{barycenter}_{\text{down}}(v) = \frac{1}{|N^-(v)|} \sum_{u \in N^-(v)} \text{pos}(u)$$

- **Downward Median**:
  Let $P = [\text{pos}(u_1), \text{pos}(u_2), \dots, \text{pos}(u_m)]$ be the sorted sequence of positions of $N^-(v)$.
  $$\text{median}_{\text{down}}(v) = \begin{cases} P[\lfloor m/2 \rfloor] & \text{if } m \text{ is odd} \\ \frac{P[m/2 - 1] + P[m/2]}{2} & \text{if } m \text{ is even} \end{cases}$$

If $N^-(v) = \emptyset$ (isolated node or root), $\text{barycenter}(v)$ defaults to its current index $\text{pos}(v)$.

### Step 2.3: Upward Barycenter & Median Equations
When sweeping upward from layer $L_k$ to $L_0$, layer $L_{i+1}$ is fixed. For each node $u \in L_i$, let $N^+(u) \subseteq L_{i+1}$ denote its lower successors.

- **Upward Barycenter**:
  $$\text{barycenter}_{\text{up}}(u) = \frac{1}{|N^+(u)|} \sum_{v \in N^+(u)} \text{pos}(v)$$

Nodes in the active layer are then re-sorted in ascending order of their computed barycenters or medians.

### Step 2.4: Adjacent Transposition $\Delta \text{cross}$ Delta Matrix
For any two adjacent nodes $v_a, v_b \in L_i$ with $\text{pos}(v_a) = k$ and $\text{pos}(v_b) = k+1$, swapping their order affects only edges incident to $v_a$ and $v_b$.

Let $c(v_a, v_b)$ be the number of crossings between edges incident to $v_a$ and $v_b$ when $v_a$ precedes $v_b$.
The crossing change $\Delta \text{cross}$ resulting from swapping $v_a$ and $v_b$ is:

$$\Delta \text{cross}(v_a, v_b) = c(v_b, v_a) - c(v_a, v_b)$$

- **Swap Decision Rule**: If $\Delta \text{cross}(v_a, v_b) < 0$, swap $v_a$ and $v_b$ immediately.

---

## 3. Step-by-Step Computational Pseudocode

The multi-pass crossing minimization algorithm alternates top-down and bottom-up sweeps for a fixed iteration limit (default = 24 passes), retaining the best layer permutation found.

```typescript
interface LayerNode {
  id: string;
  pos: number;
  barycenter: number;
}

/**
 * Step 1: Compute barycenters for an active layer against a fixed reference layer.
 */
function computeLayerBarycenters(
  activeLayer: LayerNode[],
  refLayer: LayerNode[],
  graph: Graph,
  direction: "down" | "up"
): void {
  const refPosMap = new Map<string, number>(refLayer.map(n => [n.id, n.pos]));

  for (const node of activeLayer) {
    const neighbors = direction === "down"
      ? graph.inEdges(node.id).map(e => e.source)
      : graph.outEdges(node.id).map(e => e.target);

    if (neighbors.length === 0) {
      node.barycenter = node.pos; // Default to current position if unattached
      continue;
    }

    let sum = 0;
    for (const neighborId of neighbors) {
      sum += refPosMap.get(neighborId) ?? 0;
    }
    node.barycenter = sum / neighbors.length;
  }
}

/**
 * Step 2: Adjacent Transposition Pass (Greedy Local Pair Swapping)
 */
function adjacentTranspositionPass(
  layer: LayerNode[],
  refLayer: LayerNode[],
  graph: Graph,
  direction: "down" | "up"
): boolean {
  let improved = false;

  for (let i = 0; i < layer.length - 1; i++) {
    const vA = layer[i];
    const vB = layer[i + 1];

    const currentCrossings = countPairCrossings(vA, vB, refLayer, graph, direction);
    const swappedCrossings = countPairCrossings(vB, vA, refLayer, graph, direction);

    if (swappedCrossings < currentCrossings) {
      // Swap adjacent nodes
      layer[i] = vB;
      layer[i + 1] = vA;
      vB.pos = i;
      vA.pos = i + 1;
      improved = true;
    }
  }

  return improved;
}

/**
 * Step 3: Multi-Pass Layer Ordering Sweep
 */
function minimizeCrossings(layers: LayerNode[][], graph: Graph, maxSweeps: number = 24): LayerNode[][] {
  let bestLayers = cloneLayers(layers);
  let minCrossings = countTotalGraphCrossings(bestLayers, graph);

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    const isDownward = (sweep % 2 === 0);

    if (isDownward) {
      // Sweep Top -> Bottom (Layer 1 down to Layer K)
      for (let l = 1; l < layers.length; l++) {
        computeLayerBarycenters(layers[l], layers[l - 1], graph, "down");
        layers[l].sort((a, b) => a.barycenter - b.barycenter);
        updateLayerPositions(layers[l]);
        adjacentTranspositionPass(layers[l], layers[l - 1], graph, "down");
      }
    } else {
      // Sweep Bottom -> Top (Layer K-1 up to Layer 0)
      for (let l = layers.length - 2; l >= 0; l--) {
        computeLayerBarycenters(layers[l], layers[l + 1], graph, "up");
        layers[l].sort((a, b) => a.barycenter - b.barycenter);
        updateLayerPositions(layers[l]);
        adjacentTranspositionPass(layers[l], layers[l + 1], graph, "up");
      }
    }

    const currentCrossings = countTotalGraphCrossings(layers, graph);
    if (currentCrossings < minCrossings) {
      minCrossings = currentCrossings;
      bestLayers = cloneLayers(layers);
    }

    // Early termination if zero crossings achieved
    if (minCrossings === 0) break;
  }

  return bestLayers;
}
```

---

## 4. Visual ASCII Schematics

### 4.1 Multi-Pass Sweep Sequence

```
        Downward Sweep (Top → Bottom)            Upward Sweep (Bottom → Top)
        
        Layer L_0  [A]  [B]  [C]  (Fixed)       Layer L_0  [A]  [B]  [C]  (Re-sorted)
                    │ \  │  / │                             │ \  │  / │
                    │  \ │ /  │                             │  \ │ /  │
        Layer L_1  [D]  [E]  [F]  (Sorted by        Layer L_1  [D]  [E]  [F]  (Fixed anchor)
                    │  / │ \  │    down-bary)                │  / │ \  │
                    │ /  │  \ │                             │ /  │  \ │
        Layer L_2  [G]  [H]  [I]  (Sorted by        Layer L_2  [G]  [H]  [I]  (Fixed anchor)
                                   down-bary)
```

### 4.2 Detailed Barycentric Calculation & Re-ordering Step

```
   BEFORE BARYCENTRIC SWEEP (3 Edge Crossings):
   Layer L_0 (Fixed Anchors):  A(pos=0)      B(pos=1)      C(pos=2)
                                │ \          / │          /
                                │  \        /  │         /
                                │   \      /   │        /
                                │    \    /    │       /
                                │     \  /     │      /
                                │      \/      │     /
                                │      /\      │    /
                                │     /  \     │   /
   Layer L_1 (Unsorted):       D(pos=0)   E(pos=1)   F(pos=2)
   Connections:                D->{B,C}   E->{A}     F->{A,B}

   CALCULATED BARYCENTERS:
   - bary(D) = (1 + 2) / 2 = 1.5
   - bary(E) = (0) / 1     = 0.0
   - bary(F) = (0 + 1) / 2 = 0.5

   SORTED ORDER FOR L_1: E (0.0) < F (0.5) < D (1.5)

   AFTER BARYCENTRIC SWEEP (0 Crossings):
   Layer L_0 (Fixed Anchors):  A(pos=0)      B(pos=1)      C(pos=2)
                                │\           /│           /
                                │ \         / │          /
                                │  \       /  │         /
   Layer L_1 (Re-ordered):     E(pos=0)   F(pos=1)   D(pos=2)
```

---

## 5. Codebase Reference Map

- [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) — `computeDagreLayout` layout execution invoking Dagre crossing reduction sweeps.
- [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L138-L152) — Dispatcher case routing `"top-down-dagre"`.
