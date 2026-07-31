# 02. Barycentric Order Heuristics

[← Back to Master Index](../README.md)

This module documents vertex ordering heuristics for crossing minimization in Dagre.

---

## 1. Barycentric Ordering

To minimize edge crossings between adjacent ranks $L_i$ and $L_{i+1}$:
1. Fix layer $L_0$.
2. For $i = 0$ to $k-1$:
   Assign each node $v \in L_{i+1}$ a weight equal to the average layer ordering index of its predecessors in $L_i$:
   $$\text{barycenter}(v) = \frac{1}{|\text{Predecessors}(v)|} \sum_{u \in \text{Predecessors}(v)} \text{pos}(u)$$
3. Sort $L_{i+1}$ by $\text{barycenter}(v)$.
4. Perform reverse sweeps from $L_k$ back to $L_0$.

---

## 2. Codebase Reference Map

- [nodeDimensions.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) — `computeDagreLayout`
- [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L138-L144) — Mode dispatcher
