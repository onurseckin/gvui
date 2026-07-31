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
```text
ALGORITHM CALCULATE_NODE_MEDIAN(node_id, ref_pos_map, in_edges)
    INPUT: target node ID, map of reference positions, list of incoming edges
    OUTPUT: numerical median position

    positions <- empty list
    FOR EACH edge IN in_edges:
        IF edge.source IN ref_pos_map THEN
            APPEND ref_pos_map[edge.source] TO positions
        END IF
    END FOR

    SORT(positions) IN ASCENDING ORDER
    m <- LENGTH(positions)

    IF m = 0 THEN
        RETURN 0
    END IF

    IF m IS ODD THEN
        RETURN positions[FLOOR(m / 2)]
    ELSE
        RETURN (positions[m / 2 - 1] + positions[m / 2]) / 2
    END IF
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
```text
ALGORITHM COUNT_PAIR_CROSSINGS(u_id, v_id, ref_pos_map, graph)
    INPUT: node u ID, node v ID, map of reference positions, graph structure
    OUTPUT: integer count of edge crossings between u and v

    u_targets <- list of ref_pos_map[target] for all outgoing edges from u
    v_targets <- list of ref_pos_map[target] for all outgoing edges from v
    crossings <- 0

    FOR EACH u_pos IN u_targets:
        FOR EACH v_pos IN v_targets:
            IF u_pos > v_pos THEN
                crossings <- crossings + 1
            END IF
        END FOR
    END FOR

    RETURN crossings
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
```text
ALGORITHM TRY_ADJACENT_SWAP(u_id, v_id, ref_pos_map, graph)
    INPUT: adjacent node u ID, adjacent node v ID, map of reference positions, graph
    OUTPUT: boolean swapped status, integer delta crossing change

    c_uv <- COUNT_PAIR_CROSSINGS(u_id, v_id, ref_pos_map, graph)
    c_vu <- COUNT_PAIR_CROSSINGS(v_id, u_id, ref_pos_map, graph)
    delta <- c_vu - c_uv

    IF delta < 0 THEN
        RETURN true, delta // Swap recommended
    END IF

    RETURN false, delta
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

```text
ALGORITHM COMPUTE_LAYER_BARYCENTERS(active_layer, ref_layer, graph, direction)
    INPUT: active layer nodes, reference layer nodes, graph, direction ("down" or "up")
    OUTPUT: updates barycenter attribute on active layer nodes

    ref_pos_map <- map from node ID to position for all nodes in ref_layer

    FOR EACH node IN active_layer:
        IF direction = "down" THEN
            neighbors <- source nodes of incoming edges to node.id
        ELSE
            neighbors <- target nodes of outgoing edges from node.id
        END IF

        IF neighbors IS EMPTY THEN
            node.barycenter <- node.pos
            CONTINUE
        END IF

        sum <- 0
        FOR EACH neighbor_id IN neighbors:
            sum <- sum + ref_pos_map[neighbor_id]
        END FOR

        node.barycenter <- sum / LENGTH(neighbors)
    END FOR


ALGORITHM ADJACENT_TRANSPOSITION_PASS(layer, ref_layer, graph, direction)
    INPUT: active layer nodes, reference layer nodes, graph, direction
    OUTPUT: boolean indicating if any adjacent swap occurred

    improved <- false

    FOR i FROM 0 TO LENGTH(layer) - 2:
        v_a <- layer[i]
        v_b <- layer[i + 1]

        current_crossings <- COUNT_PAIR_CROSSINGS(v_a.id, v_b.id, ref_layer, graph)
        swapped_crossings <- COUNT_PAIR_CROSSINGS(v_b.id, v_a.id, ref_layer, graph)

        IF swapped_crossings < current_crossings THEN
            // Swap adjacent nodes in layer array
            layer[i] <- v_b
            layer[i + 1] <- v_a
            v_b.pos <- i
            v_a.pos <- i + 1
            improved <- true
        END IF
    END FOR

    RETURN improved


ALGORITHM MINIMIZE_CROSSINGS(layers, graph, max_sweeps = 24)
    INPUT: list of rank layers, graph, maximum sweep iterations (default 24)
    OUTPUT: best ordering of nodes per layer

    best_layers <- CLONE(layers)
    min_crossings <- COUNT_TOTAL_GRAPH_CROSSINGS(best_layers, graph)

    FOR sweep FROM 0 TO max_sweeps - 1:
        is_downward <- (sweep MOD 2 = 0)

        IF is_downward THEN
            // Top to Bottom sweep
            FOR l FROM 1 TO LENGTH(layers) - 1:
                COMPUTE_LAYER_BARYCENTERS(layers[l], layers[l - 1], graph, "down")
                SORT layers[l] BY barycenter ASCENDING
                UPDATE_POSITIONS(layers[l])
                ADJACENT_TRANSPOSITION_PASS(layers[l], layers[l - 1], graph, "down")
            END FOR
        ELSE
            // Bottom to Top sweep
            FOR l FROM LENGTH(layers) - 2 DOWN TO 0:
                COMPUTE_LAYER_BARYCENTERS(layers[l], layers[l + 1], graph, "up")
                SORT layers[l] BY barycenter ASCENDING
                UPDATE_POSITIONS(layers[l])
                ADJACENT_TRANSPOSITION_PASS(layers[l], layers[l + 1], graph, "up")
            END FOR
        END IF

        current_crossings <- COUNT_TOTAL_GRAPH_CROSSINGS(layers, graph)
        IF current_crossings < min_crossings THEN
            min_crossings <- current_crossings
            best_layers <- CLONE(layers)
        END IF

        IF min_crossings = 0 THEN
            BREAK
        END IF
    END FOR

    RETURN best_layers
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
