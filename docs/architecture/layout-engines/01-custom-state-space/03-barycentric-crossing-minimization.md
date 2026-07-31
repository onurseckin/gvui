# 03. Barycentric Crossing Minimization Sweeps

This module documents the iterative top-down and bottom-up barycentric heuristics used to minimize edge crossings between adjacent rank layers.

---

## 1. Crossing Minimization Problem Formulation

Edge crossings between adjacent rank layers $L_r$ and $L_{r+1}$ are caused by non-monotonic edge endpoint positions.

```
       Layer L_r:     (Node A)   (Node B)
                         \       /
                          \     /     <-- Crossing!
                           \   /
       Layer L_{r+1}: (Node C)   (Node D)
```

The total edge crossing count $C_{\text{cross}}$ across all adjacent rank pairs is:

$$C_{\text{cross}} = \sum_{r=0}^{K-1} \text{Crossings}(L_r, L_{r+1})$$

Where for two edges $(u_1, v_1)$ and $(u_2, v_2)$ connecting $L_r$ to $L_{r+1}$:

$$\text{Cross}((u_1, v_1), (u_2, v_2)) = 1 \iff \left( \text{pos}(u_1) < \text{pos}(u_2) \land \text{pos}(v_1) > \text{pos}(v_2) \right)$$

---

## 2. Alternating Barycentric Sweeps

The engine executes 12 alternating top-down and bottom-up sweeps over the layer hierarchy:

```
    Top-Down Sweep (Downwards):  L_0  ──────>  L_1  ──────>  L_2  ──────>  L_k
    Bottom-Up Sweep (Upwards):   L_0  <──────  L_1  <──────  L_2  <──────  L_k
```

### Top-Down Barycenter Heuristic
Fix $L_r$. For each node $v \in L_{r+1}$, compute the mean position of its predecessors in $L_r$:

$$\text{barycenter}_{\text{top-down}}(v) = \frac{1}{\text{deg}^{-}(v)} \sum_{(u, v) \in E} \text{pos}(u)$$

### Bottom-Up Barycenter Heuristic
Fix $L_{r+1}$. For each node $v \in L_r$, compute the mean position of its successors in $L_{r+1}$:

$$\text{barycenter}_{\text{bottom-up}}(v) = \frac{1}{\text{deg}^{+}(v)} \sum_{(v, w) \in E} \text{pos}(w)$$

Nodes within the target layer are then re-sorted by ascending barycenter value. Tied barycenter values are broken deterministically using median heuristics or pre-existing node IDs to prevent infinite oscillation loops.

---

## 3. Codebase Reference Map

- [barycentricOrdering.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/barycentricOrdering.ts#L1-L90) — `computeBarycentricOrders`, `sweepLayer`
- [crossingMinimization.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L1-L50) — `countLayerCrossings`

```typescript
// Code Snippet from barycentricOrdering.ts
export function computeBarycenter(
  nodeId: string,
  connectedNeighbors: string[],
  currentPosMap: Map<string, number>,
): number {
  if (connectedNeighbors.length === 0) return currentPosMap.get(nodeId) ?? 0;

  let sum = 0;
  for (const neighborId of connectedNeighbors) {
    sum += currentPosMap.get(neighborId) ?? 0;
  }
  return sum / connectedNeighbors.length;
}
```
