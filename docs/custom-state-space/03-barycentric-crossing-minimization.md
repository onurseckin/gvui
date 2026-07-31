# 03. Barycentric Crossing Minimization

[← Back to Master Index](../README.md)

This module documents crossing count minimization via 12 alternating top-down and bottom-up barycentric sweeps.

---

## 1. Edge Crossing Formalization

For adjacent layer ranks $L_r$ and $L_{r+1}$, two edges $(u_1, v_1)$ and $(u_2, v_2)$ cross if and only if their endpoint orderings are non-monotonic:

$$\text{Cross}((u_1, v_1), (u_2, v_2)) = 1 \iff \left( \text{pos}(u_1) < \text{pos}(u_2) \land \text{pos}(v_1) > \text{pos}(v_2) \right)$$

```
       Layer L_r:       u_1 (pos 0)       u_2 (pos 1)
                            \           /
                             \         /   <-- Edge Crossing
                              \       /
       Layer L_{r+1}:   v_2 (pos 0)       v_1 (pos 1)
```

Total layer crossings $C_{\text{cross}}$:

$$C_{\text{cross}} = \sum_{r=0}^{K-1} \sum_{e_1, e_2 \in E(L_r, L_{r+1})} \text{Cross}(e_1, e_2)$$

---

## 2. Alternating Barycentric Sweeps

To minimize crossings, the engine executes **12 alternating sweeps** (6 top-down, 6 bottom-up).

```
     Top-Down Sweep (L_0 -> L_1 -> ... -> L_k):
     Assign barycenter based on predecessor positions in L_{r-1}

     Bottom-Up Sweep (L_k -> L_{k-1} -> ... -> L_0):
     Assign barycenter based on successor positions in L_{r+1}
```

### Top-Down Barycenter Weight

$$\text{barycenter}_{\text{top-down}}(v) = \frac{1}{|\text{Predecessors}(v)|} \sum_{u \in \text{Predecessors}(v)} \text{pos}(u)$$

### Bottom-Up Barycenter Weight

$$\text{barycenter}_{\text{bottom-up}}(v) = \frac{1}{|\text{Successors}(v)|} \sum_{w \in \text{Successors}(v)} \text{pos}(w)$$

Nodes on layer $L_r$ are sorted in ascending order of their barycenter weights. Ties are broken using median node positions to prevent local minima traps.

---

## 3. Codebase Reference Map

- [crossingMinimization.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/crossingMinimization.ts#L1-L120) — Crossing matrix computation & sweep loops
- [portOrdering.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/portOrdering.ts#L1-L60) — In-layer node ordering & barycentric sorting
