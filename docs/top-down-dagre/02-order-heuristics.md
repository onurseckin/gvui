# 02. Barycentric Order Heuristics

[← Back to Master Index](../README.md)

This module documents vertex ordering heuristics and multi-pass barycentric sweeps used for **crossing minimization** across adjacent rank layers in Dagre.

---

## 1. Barycentric Ordering Formulation

Given an ordered sequence of rank layers $L_0, L_1, \dots, L_k$, crossing minimization determines horizontal order permutations $\pi(L_i)$ for each layer $L_i$ to minimize total edge intersections $C(G) = \sum_{i=0}^{k-1} C(L_i, L_{i+1})$.

### 1.1 Predecessor & Successor Barycenters
When sweeping downward from layer $L_i$ to $L_{i+1}$, each node $v \in L_{i+1}$ is assigned a weight equal to the average index of its upper neighbors (predecessors) in $L_i$:

$$\text{barycenter}_{\text{down}}(v) = \frac{1}{|N^-(v)|} \sum_{u \in N^-(v)} \text{pos}(u)$$

When sweeping upward from layer $L_{i+1}$ to $L_i$, each node $u \in L_i$ is assigned a weight equal to the average index of its lower neighbors (successors) in $L_{i+1}$:

$$\text{barycenter}_{\text{up}}(u) = \frac{1}{|N^+(u)|} \sum_{v \in N^+(u)} \text{pos}(v)$$

Where $\text{pos}(u)$ is the 0-indexed horizontal position of node $u$ in its current layer permutation.

---

## 2. Barycentric Sweep Visualizations

### 2.1 Multi-Pass Sweep Workflow

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

### 2.2 Detailed Barycentric Calculation & Re-ordering

Consider layer $L_0$ with fixed positions: `pos(A)=0`, `pos(B)=1`, `pos(C)=2`.
Layer $L_1$ contains nodes `{D, E, F}` with connected predecessors:
- $D$ connects to $B (\text{pos}=1)$ and $C (\text{pos}=2)$ $\implies \text{barycenter}(D) = (1 + 2) / 2 = 1.5$
- $E$ connects to $A (\text{pos}=0)$ $\implies \text{barycenter}(E) = 0 / 1 = 0.0$
- $F$ connects to $A (\text{pos}=0)$ and $B (\text{pos}=1)$ $\implies \text{barycenter}(F) = (0 + 1) / 2 = 0.5$

```
Before Barycentric Sweep (High Crossing Count):
Layer L_0 (fixed):  A(0)       B(1)       C(2)
                     │ \       / │       /
                     │  \     /  │      /
                     │   \   /   │     /
                     │    \ /    │    /
                     │     X     │   /
                     │    / \    │  /
Layer L_1 (raw):    D          E         F
Positions:          0          1         2
Crossings: 3 edge intersections!

Barycentric Re-ordering:
Calculated barycenters: E (0.0) < F (0.5) < D (1.5)
Sorted Layer L_1 order: [E, F, D]

After Barycentric Sweep (Zero Crossings):
Layer L_0 (fixed):  A(0)       B(1)       C(2)
                     │\         /│         /
                     │ \       / │        /
                     │  \     /  │       /
                     │   \   /   │      /
Layer L_1 (sorted): E     F      D
Positions:          0     1      2
Crossings: 0 edge intersections!
```

### 2.3 Adjacent Transposition (Local Swap) Pass
For nodes with equal barycenters ($\text{barycenter}(v_i) = \text{barycenter}(v_{i+1})$), a local transposition check swaps adjacent pairs $(v_i, v_{i+1})$ if and only if swapping strictly reduces local edge crossings $C(v_i, v_{i+1})$.

---

## 3. Codebase Reference Map

- [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) — `computeDagreLayout` invoking Dagre crossing reduction & ordering heuristics.
- [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L138-L152) — Mode dispatcher routing `"top-down-dagre"`.
