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

To minimize edge crossings, we construct the ordering framework from isolated node neighbor medians up to adjacent transposition swap matrices.

---

### Step 2.1: Downward Median & Barycenter Calculation

#### 1. Mathematical Sub-Component Formula
When sweeping downward from top layer $L_0$ to bottom layer $L_k$, the sequence of layer $L_i$ is fixed. For a node $v \in L_{i+1}$ with sorted upper predecessor positions $P = [\text{pos}(u_1), \text{pos}(u_2), \dots, \text{pos}(u_m)]$:

- **Downward Median**:
  $$\text{median}_{\text{down}}(v) = \begin{cases} P[\lfloor m/2 \rfloor] & \text{if } m \text{ is odd} \\ \frac{P[m/2 - 1] + P[m/2]}{2} & \text{if } m \text{ is even} \end{cases}$$

- **Downward Barycenter**:
  $$\text{barycenter}_{\text{down}}(v) = \frac{1}{m} \sum_{j=1}^{m} P[j]$$

#### 2. Concrete Numerical Graph Example
Consider reference layer $L_0$ with node positions $\text{pos}(A)=0, \text{pos}(B)=2, \text{pos}(C)=5$.

1. **Odd Degree Node $v$**: Predecessors $N^-(v) = \{A, B, C\}$ at positions $P = [0, 2, 5]$ ($m = 3$):
   - Median calculation ($m=3$ is odd, index $\lfloor 3/2 \rfloor = 1$):
     $$\text{median}(v) = P[1] = 2$$
   - Barycenter comparison:
     $$\text{barycenter}(v) = \frac{0 + 2 + 5}{3} = \frac{7}{3} \approx 2.333$$

2. **Even Degree Node $w$**: Predecessors $N^-(w) = \{A, B\}$ at positions $P = [1, 3]$ ($m = 2$):
   - Median calculation ($m=2$ is even):
     $$\text{median}(w) = \frac{P[0] + P[1]}{2} = \frac{1 + 3}{2} = 2.0$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
/**
 * Sub-step 2.1: Calculates the median position of a node's upper neighbors.
 */
function calculateNodeMedian(
  nodeId: string,
  refPosMap: Map<string, number>,
  inEdges: Array<{ source: string }>
): number {
  const positions = inEdges
    .map(e => refPosMap.get(e.source))
    .filter((pos): pos is number => pos !== undefined)
    .sort((a, b) => a - b);

  const m = positions.length;
  if (m === 0) return 0;
  if (m % 2 === 1) {
    return positions[Math.floor(m / 2)];
  }
  return (positions[m / 2 - 1] + positions[m / 2]) / 2;
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.1: Downward Median Calculation

  Layer L_0 (Fixed Anchors):  [ A ](pos=0)     [ B ](pos=2)     [ C ](pos=5)
                                │               │               │
                                └───────────────┼───────────────┘
                                                ▼
  Layer L_1 (Target Node v):                 [ Node v ]
                                             Neighbors: P = [0, 2, 5] (m=3)
                                             Median = P[1] = 2
                                             Barycenter = 7/3 = 2.333
```

---

### Step 2.2: Binary Crossing Predicate & Pairwise Crossing Count

#### 1. Mathematical Sub-Component Formula
For two adjacent nodes $u, v \in L_i$ with $\text{pos}(u) < \text{pos}(v)$, the crossing count $c(u, v)$ counts the number of edge intersections when $u$ precedes $v$:

$$c(u, v) = \sum_{e_1 = (u, y_1) \in E} \sum_{e_2 = (v, y_2) \in E} \chi(e_1, e_2)$$

Where binary predicate $\chi(e_1, e_2) = 1$ if $\text{pos}(y_1) > \text{pos}(y_2)$, and $0$ otherwise.

#### 2. Concrete Numerical Graph Example
Let $u, v \in L_i$ be placed at positions $\text{pos}(u) = 0, \text{pos}(v) = 1$.
- $u$ connects to targets in $L_{i+1}$ at positions $\{2, 4\}$.
- $v$ connects to targets in $L_{i+1}$ at positions $\{1, 3\}$.

Evaluating all 4 edge pairs for $c(u, v)$:
1. Pair $(u \to 2, v \to 1)$: $\text{pos}(2) > \text{pos}(1) \implies \chi = 1$ (Crosses!)
2. Pair $(u \to 2, v \to 3)$: $\text{pos}(2) < \text{pos}(3) \implies \chi = 0$
3. Pair $(u \to 4, v \to 1)$: $\text{pos}(4) > \text{pos}(1) \implies \chi = 1$ (Crosses!)
4. Pair $(u \to 4, v \to 3)$: $\text{pos}(4) > \text{pos}(3) \implies \chi = 1$ (Crosses!)

$$c(u, v) = 1 + 0 + 1 + 1 = 3 \quad \text{(3 Crossings when } u \text{ precedes } v \text{)}$$

Evaluating all 4 edge pairs for swapped order $c(v, u)$ (where $v$ precedes $u$):
1. Pair $(v \to 1, u \to 2)$: $\text{pos}(1) < \text{pos}(2) \implies \chi = 0$
2. Pair $(v \to 1, u \to 4)$: $\text{pos}(1) < \text{pos}(4) \implies \chi = 0$
3. Pair $(v \to 3, u \to 2)$: $\text{pos}(3) > \text{pos}(2) \implies \chi = 1$ (Crosses!)
4. Pair $(v \to 3, u \to 4)$: $\text{pos}(3) < \text{pos}(4) \implies \chi = 0$

$$c(v, u) = 0 + 0 + 1 + 0 = 1 \quad \text{(1 Crossing when } v \text{ precedes } u \text{)}$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
/**
 * Sub-step 2.2: Computes crossings c(u, v) between edges of node u and node v.
 */
function countPairCrossings(
  uId: string,
  vId: string,
  refPosMap: Map<string, number>,
  graph: { outEdges: (node: string) => Array<{ target: string }> }
): number {
  const uTargets = graph.outEdges(uId).map(e => refPosMap.get(e.target)!);
  const vTargets = graph.outEdges(vId).map(e => refPosMap.get(e.target)!);
  let crossings = 0;

  for (const uPos of uTargets) {
    for (const vPos of vTargets) {
      if (uPos > vPos) crossings++;
    }
  }

  return crossings;
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.2: Pairwise Edge Crossing Matrix (c(u,v) = 3 vs c(v,u) = 1)

   ORIGINAL ORDER (u before v):                 SWAPPED ORDER (v before u):
   Layer L_i:   [ u ](pos=0)  [ v ](pos=1)       Layer L_i:   [ v ](pos=0)  [ u ](pos=1)
                 │ \          / │                             │   \        / │
                 │  \        /  │                             │    \      /  │
                 │   \      /   │                             │     \    /   │
                 │    X    X    │                             │      \  /    │
                 │   / \  / \   │                             │       \/     │
                 │  /   \/   \  │                             │       /\     │
   Layer L_i+1: [1]    [2]   [3]   [4]           Layer L_i+1: [1]    [2]   [3]   [4]
   Crossings: c(u, v) = 3                        Crossings: c(v, u) = 1
```

---

### Step 2.3: Adjacent Transposition Pass & $\Delta \text{cross}$ Delta Matrix

#### 1. Mathematical Sub-Component Formula
For adjacent nodes $v_a, v_b \in L_i$ with $\text{pos}(v_a) = k$ and $\text{pos}(v_b) = k+1$, the crossing change $\Delta \text{cross}$ resulting from swapping $v_a$ and $v_b$ is:

$$\Delta \text{cross}(v_a, v_b) = c(v_b, v_a) - c(v_a, v_b)$$

- **Decision Rule**: Perform swap if $\Delta \text{cross}(v_a, v_b) < 0$.

#### 2. Concrete Numerical Graph Example
Using values from Step 2.2 for adjacent pair $(u, v)$:
- $c(u, v) = 3$
- $c(v, u) = 1$

Step-by-step delta calculation:
$$\Delta \text{cross}(u, v) = c(v, u) - c(u, v) = 1 - 3 = -2$$

Since $\Delta \text{cross} = -2 < 0$, swapping $u$ and $v$ strictly reduces layer crossings by 2. The swap is executed immediately.

#### 3. Targeted Sub-Step Pseudocode
```typescript
/**
 * Sub-step 2.3: Evaluates and executes an adjacent transposition swap if delta < 0.
 */
function tryAdjacentSwap(
  uId: string,
  vId: string,
  refPosMap: Map<string, number>,
  graph: { outEdges: (node: string) => Array<{ target: string }> }
): { swapped: boolean; delta: number } {
  const cUV = countPairCrossings(uId, vId, refPosMap, graph);
  const cVU = countPairCrossings(vId, uId, refPosMap, graph);
  const delta = cVU - cUV;

  if (delta < 0) {
    return { swapped: true, delta };
  }
  return { swapped: false, delta };
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.3: Adjacent Transposition Swap Transformation

   BEFORE SWAP:                                 AFTER SWAP:
   Layer L_i:  [ u ] (pos=0) ──► [ v ] (pos=1)   Layer L_i:  [ v ] (pos=0) ──► [ u ] (pos=1)
   Total Crossings = 3                          Total Crossings = 1

   Delta: Δcross = 1 - 3 = -2 < 0  ==> Swap Executed! (Saved 2 crossings)
```

---

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
