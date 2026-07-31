# 02. Cycle Breaking & Sugiyama Layer Assignment

This module documents Tarjan's SCC cycle breaking, stack-based DFS back-edge reversal, longest path topological ranking, and virtual dummy node insertion.

---

## 1. Cycle Breaking via Tarjan's SCC

To compute a hierarchical top-down layout, directed cycles (e.g. $A \to B \to C \to A$) must be temporarily broken to construct a Directed Acyclic Graph (DAG) $\mathcal{G}_{\text{DAG}} = (V, E_{\text{DAG}})$.

```
   Original Cyclic Graph                  Reduced DAG (Feedback Edge Reversed)
     ┌───┐       ┌───┐                        ┌───┐       ┌───┐
     │ A │──────>│ B │                        │ A │──────>│ B │
     └───┘       └───┘                        └───┘       └───┘
       ▲           │                            │           │
       │           │                            │           │
       │  (Cycle)  │                            ▼           │
       │           │                          ┌───┐         │
     ┌───┴──┐      │                          │ C │<────────┘
     │  C   │<─────┘                          └───┘
     └──────┘                               (Feedback edge C->A flipped to A->C)
```

### Algorithm Steps

1. Run Tarjan's Strongly Connected Components (SCC) algorithm to identify cyclic subgraphs.
2. For each SCC, execute a stack-based DFS traversal.
3. Track active vertices on the current DFS recursion stack: $\text{DFS\_Stack}$.
4. If an edge $(u, v)$ targets a vertex $v \in \text{DFS\_Stack}$, reclassify $(u, v)$ as a **feedback cycle back-edge**:
   $$E_{\text{feedback}} = \{ (u, v) \in E \mid v \in \text{DFS\_Stack} \}$$
5. Reverse $E_{\text{feedback}}$ during layering calculations: $E_{\text{DAG}} = (E \setminus E_{\text{feedback}}) \cup \{ (v, u) \mid (u, v) \in E_{\text{feedback}} \}$.

---

## 2. Longest Path Topological Rank Assignment

Each node $v \in V$ is assigned an integer rank layer $r(v) \in \mathbb{Z}_{\ge 0}$:

$$r(v) = \max_{(u, v) \in E_{\text{DAG}}} \{ r(u) + 1 \}, \quad r(\text{root nodes}) = 0$$

```
   Rank 0:               [ API Gateway ]
                             │
                             ▼
   Rank 1:         [ Auth ]     [ User ]
                             │
                             ▼
   Rank 2:            [ Payment Gateway ]
```

---

## 3. Virtual Dummy Node Insertion

If an edge $(u, v)$ spans across $k > 1$ ranks ($r(v) - r(u) = k$), $k-1$ virtual dummy nodes $d_1, d_2, \dots, d_{k-1}$ are inserted to break the long edge into unit-length rank segments:

$$u \to d_1 \to d_2 \to \dots \to d_{k-1} \to v$$

```
   Rank 0:    (u)
               │
               ▼
   Rank 1:   [d_1]  <-- Virtual Dummy Node (Zero Width)
               │
               ▼
   Rank 2:    (v)
```

Dummy nodes guarantee that every edge segment connects nodes in adjacent rank layers ($r = i$ to $r = i+1$), enabling clean barycentric sweeps and channel routing.

---

## 4. Codebase Reference Map

- [cycleBreaker.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/cycleBreaker.ts#L1-L60) — `breakCyclesDFS`, Tarjan SCC
- [rankAssignment.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/rankAssignment.ts#L1-L80) — `assignLongestPathRanks`
- [dummyNodes.ts](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/dummyNodes.ts#L1-L50) — `insertVirtualDummyNodes`

```typescript
// Code Snippet from cycleBreaker.ts
export function breakCyclesDFS(nodes: NormalizedNode[], edges: NormalizedEdge[]): BrokenCyclesResult {
  const stack = new Set<string>();
  const visited = new Set<string>();
  const feedbackEdges = new Set<string>();

  function dfs(u: string): void {
    visited.add(u);
    stack.add(u);

    for (const edge of outEdges.get(u) ?? []) {
      const v = edge.target;
      if (stack.has(v)) {
        feedbackEdges.add(edge.id);
      } else if (!visited.has(v)) {
        dfs(v);
      }
    }
    stack.delete(u);
  }

  // Run DFS over all unvisited nodes
  for (const node of nodes) {
    if (!visited.has(node.id)) dfs(node.id);
  }

  return { feedbackEdges };
}
```
