# 02. Sugiyama Layering & Cycle Breaking

[← Back to Master Index](../README.md)

This module documents cycle breaking via Tarjan SCCs, stack-based DFS back-edge reversal, longest-path topological rank assignment, and virtual dummy node insertion.

---

## 1. Cycle Breaking via Back-Edge Reversal

Graphs containing directed cycles (e.g. $A \to B \to C \to A$) cannot be directly assigned to topological layers.

```
       Cyclic Graph                          Reduced DAG (Back-Edge Reversed)
       ┌───┐       ┌───┐                     ┌───┐       ┌───┐
       │ A │──────>│ B │                     │ A │──────>│ B │
       └───┘       └───┘                     └───┘       └───┘
         ▲           │                         │           │
         │           ▼                         ▼           ▼
       ┌───────────────┐                     ┌───────────────┐
       │       C       │                     │       C       │
       └───────────────┘                     └───────────────┘
     (Cycle: A -> B -> C -> A)           (Reversed Edge: C -> A becomes A -> C)
```

### DFS Back-Edge Classification

Given directed graph $G = (V, E)$:
1. Execute Depth-First Search (DFS) tracking current recursion stack `DFS_Stack`.
2. Edge $(u, v) \in E$ is a **back-edge** if $v \in \text{DFS\_Stack}$.
3. Reverse back-edge direction to create DAG $G_{\text{DAG}} = (V, E_{\text{DAG}})$:

$$E_{\text{DAG}} = (E \setminus E_{\text{back}}) \cup \{ (v, u) \mid (u, v) \in E_{\text{back}} \}$$

---

## 2. Longest-Path Layer Rank Assignment

Assign every vertex $v \in V$ an integer layer rank $r(v) \in \mathbb{Z}_{\ge 0}$:

$$r(v) = \begin{cases} 0 & \text{if } \text{in-degree}(v) = 0 \\ \max_{(u, v) \in E_{\text{DAG}}} \{ r(u) + 1 \} & \text{otherwise} \end{cases}$$

```
       Rank 0:               [ API Gateway ]
                                   │
                                   ▼
       Rank 1:         [ Auth Service ]  [ User Service ]
                                   │
                                   ▼
       Rank 2:             [ Payment Gateway ]
```

---

## 3. Virtual Dummy Node Insertion

If an edge $(u, v)$ spans $k = r(v) - r(u) > 1$ rank layers, it is split into a chain of $k-1$ zero-width **virtual dummy nodes** $\{d_1, d_2, \dots, d_{k-1}\}$:

$$u \to d_1 \to d_2 \to \dots \to d_{k-1} \to v$$

This guarantees that every routed edge segment connects nodes on strictly adjacent rank layers ($r = i$ to $r = i + 1$).

---

## 4. Codebase Reference Map

- [cycleBreaking.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/cycleBreaking.ts#L1-L60) — Tarjan SCC & `breakCyclesDFS`
- [rankAssignment.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/rankAssignment.ts#L1-L45) — `assignRanksLongestPath`
- [normalizeGraph.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/normalizeGraph.ts#L1-L80) — Virtual dummy node chain insertion

```typescript
// Code Snippet from cycleBreaking.ts
export function breakCyclesDFS(nodes: LayoutNode[], edges: LayoutEdge[]): BrokenCyclesResult {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const feedbackEdges = new Set<string>();
  // Reverses back-edges...
}
```
