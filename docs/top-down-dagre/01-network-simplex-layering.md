# 01. Network Simplex Layer Assignment

[← Back to Master Index](../README.md)

This module documents the Network Simplex linear program used to assign integer rank layers to nodes in the **Top-Down Dagre Engine**.

---

## 1. Linear Programming Formulation

Nodes are assigned to integer layer ranks $r: V \to \mathbb{Z}_{\ge 0}$ such that for every directed edge $(u, v)$, the rank constraint is satisfied:

$$r(v) - r(u) \ge \delta(u, v) \ge 1$$

Where $\delta(u, v)$ is the minimum rank separation distance (default = 1).

```
   Objective: Minimize total weighted edge length across ranks
   
                 min ∑_{e=(u,v)} w(e) · (r(v) - r(u))
                 
   Subject to:   r(v) - r(u) >= 1   for all (u, v) in E
```

---

## 2. Spanning Tree Duality & Cut Values

The dual problem is solved using the Network Simplex algorithm:
1. Maintain a feasible rank assignment $r$.
2. Maintain a tight spanning tree $T = (V, E_T)$ where for every tree edge $e \in E_T$, the rank constraint is exactly tight ($r(v) - r(u) = 1$).
3. Compute edge cut values $\text{cutval}(e)$ for every tree edge $e \in E_T$.
4. If there exists an edge $e \in E_T$ with $\text{cutval}(e) < 0$, replace $e$ with a non-tree edge $e'$ that increases total tightness, updating node ranks along the tree cut.

---

## 3. Codebase Reference Map

- [nodeDimensions.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) — `computeDagreLayout` integration
- [layoutDispatcher.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L138-L142) — `mode === "top-down-dagre"` dispatcher case

```typescript
// Code Snippet from layoutDispatcher.ts
case "top-down-dagre":
  return computeDagreLayout(dataset, "TB");
```
