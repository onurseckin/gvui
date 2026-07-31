# 02. Sugiyama Layering & Cycle Breaking

[← Back to Master Index](../README.md)

This module documents cycle breaking via Tarjan SCC decomposition, Eades-style greedy back-edge reversal, longest-path topological rank assignment, and virtual dummy node chain insertion.

---

## 1. Tarjan SCC Decomposition & Cycle Breaking

Graphs containing directed cycles (e.g. $A \to B \to C \to A$) cannot be directly assigned to topological layers. The engine decomposes directed graph $G = (V, E)$ into Strongly Connected Components (SCCs) using Tarjan's algorithm.

```
       Cyclic Graph                          Decomposed DAG (Back-Edge Reversed)
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

### Tarjan SCC Formal Mathematical Definitions

For vertex $v \in V$, Tarjan's algorithm maintains:
1. **Discovery Index** $d(v) \in \mathbb{N}$: Timestamp when vertex $v$ was first visited during Depth-First Search (DFS).
2. **Low-Link Value** $\text{low}(v) \in \mathbb{N}$: Smallest discovery index reachable from $v$ via tree edges and cross/back-edges to vertices currently on the DFS stack:
   $$\text{low}(v) = \min \left( \{ d(v) \} \cup \{ d(w) \mid (v, w) \in E \land w \in \text{DFS\_Stack} \} \cup \{ \text{low}(w) \mid (v, w) \in E_{\text{tree}} \} \right)$$

A vertex $u$ is the root of an SCC if and only if $\text{low}(u) = d(u)$. The set of vertices popped from $\text{DFS\_Stack}$ up to $u$ forms a strongly connected component $C_i \subseteq V$.

### Eades-Style Greedy Cycle Breaking Math

For any cyclic SCC $C_i$ ($|C_i| > 1$), the engine classifies edges into forward and feedback sets using Eades' greedy ordering algorithm:

1. Maintain active vertex set $S \subseteq C_i$, initialized to $S = C_i$.
2. Maintain net outward flow metric $\delta(v)$ for each $v \in S$:
   $$\delta(v) = \text{deg}^+(v, S) - \text{deg}^-(v, S)$$
3. Iteratively construct linear order sequences $L_{\text{left}}$ (built left-to-right) and $L_{\text{right}}$ (built right-to-left):
   - **Sink Removal**: If $\exists v \in S$ with $\text{deg}^+(v, S) = 0$, remove $v$ from $S$ and prepend to $L_{\text{right}}$.
   - **Source Removal**: If $\exists v \in S$ with $\text{deg}^-(v, S) = 0$, remove $v$ from $S$ and append to $L_{\text{left}}$.
   - **Max Flow Choice**: Otherwise, select $v^* = \arg\max_{v \in S} \delta(v)$ (tie-broken deterministically by node ID), remove $v^*$ from $S$ and append to $L_{\text{left}}$.
4. Concatenate $L = L_{\text{left}} \parallel L_{\text{right}}$, yielding deterministic total order $\pi: C_i \to \{1, 2, \dots, |C_i|\}$.

### Edge Classification Theorem

An edge $e = (u, v) \in E$ inside cyclic SCC $C_i$ is classified as a **feedback edge** if and only if its endpoints violate the linear ordering $\pi$:

$$\text{role}(e) = \begin{cases} \text{feedback} & \text{if } \pi(u) > \pi(v) \\ \text{forward} & \text{if } \pi(u) < \pi(v) \end{cases}$$

Reversing all feedback edges $E_{\text{feedback}} = \{ (u, v) \in E \mid \pi(u) > \pi(v) \}$ yields acyclic DAG $G_{\text{DAG}} = (V, E_{\text{forward}})$.

```
                             Eades Greedy Cycle Breaking Flow
   ┌──────────────────────┐    sinks / sources    ┌──────────────────────┐
   │ Active Nodes Set S   │ ────────────────────> │ Build Linear Order L │
   └──────────┬───────────┘                       └──────────┬───────────┘
              │                                              │
              │ max (deg+ - deg-)                            │ Compare π(u) vs π(v)
              ▼                                              ▼
   ┌──────────────────────┐                       ┌──────────────────────┐
   │ Select Pivot Node v* │                       │  Classify Edge Roles │
   └──────────────────────┘                       │ Forward vs Feedback  │
                                                  └──────────────────────┘
```

---

## 2. Longest-Path Layer Rank Assignment

Given reduced acyclic DAG $G_{\text{DAG}} = (V, E_{\text{forward}})$, every vertex $v \in V$ is assigned an integer layer rank $r(v) \in \mathbb{Z}_{\ge 0}$.

### Linear Programming Formulation

$$\min_{r} \sum_{(u, v) \in E_{\text{forward}}} (r(v) - r(u))$$

$$\text{subject to} \quad r(v) - r(u) \ge 1 \quad \forall (u, v) \in E_{\text{forward}}, \quad r(v) \in \mathbb{Z}_{\ge 0}$$

### Recurrence Relation

Using topological Kahn ordering, layer ranks are computed via:

$$r(v) = \begin{cases} 0 & \text{if } \text{in-degree}_{\text{forward}}(v) = 0 \\ \max_{(u, v) \in E_{\text{forward}}} \{ r(u) + 1 \} & \text{otherwise} \end{cases}$$

```
       Rank 0 (Root):              [ API Gateway ]
                                         │
                                         ▼
       Rank 1 (Services):     [ Auth Service ]  [ User Service ]
                                         │
                                         ▼
       Rank 2 (Database):         [ Payment Gateway ]
```

---

## 3. Virtual Dummy Node Insertion

If an edge $e = (u, v) \in E_{\text{forward}}$ spans rank distance $k = r(v) - r(u) > 1$, it is split into a chain of $k-1$ zero-width **virtual dummy nodes** $\{d_1^e, d_2^e, \dots, d_{k-1}^e\}$:

$$u \to d_1^e \to d_2^e \to \dots \to d_{k-1}^e \to v$$

Where $r(d_i^e) = r(u) + i$ for $i \in \{1, \dots, k-1\}$.

```
       Rank 0:    [ Node u ]
                      │
                      ▼
       Rank 1:    (Dummy Node d_1)   <-- Zero-width Virtual Node
                      │
                      ▼
       Rank 2:    (Dummy Node d_2)   <-- Keeps Edge Segments Vertical
                      │
                      ▼
       Rank 3:    [ Node v ]
```

This guarantees that every routed edge segment connects nodes on strictly adjacent rank layers ($r = i$ to $r = i + 1$), enforcing Sugiyama layering invariants.

---

## 4. Step-by-Step Developer Walkthrough

1. **Graph Normalization**: Call `normalizeGraph()` to validate node dimensions, unique IDs, and build adjacency maps.
2. **SCC Identification**: Run Tarjan's algorithm via `findStronglyConnectedComponents()` to identify cyclic sub-graphs.
3. **Cycle Reversal**: Call `classifyEdgeRoles()` to run Eades' greedy cycle breaking within cyclic components, flagging back-edges with `role: "feedback"`.
4. **Rank Assignment**: Call `assignRanks()` to execute Kahn topological traversal and apply longest-path layer assignment.
5. **Dummy Expansion**: In `normalizeGraphStructure()`, identify edges spanning $k > 1$ ranks and inject virtual dummy node chains $\{d_1, \dots, d_{k-1}\}$.

---

## 5. Codebase Reference Map & Line Anchors

- [`src/engine/layout/custom/cycleBreaking.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/cycleBreaking.ts#L10-L355)
  - [`classifyEdgeRoles`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/cycleBreaking.ts#L10-L355) — Tarjan SCC & Eades greedy cycle breaking algorithm
- [`src/engine/layout/custom/stronglyConnectedComponents.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/stronglyConnectedComponents.ts#L1-L90)
  - Tarjan strongly connected components solver
- [`src/engine/layout/custom/rankAssignment.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/rankAssignment.ts#L11-L105)
  - [`assignRanks`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/rankAssignment.ts#L11-L105) — Longest-path topological layer rank assignment
- [`src/engine/layout/custom/normalizeGraph.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/normalizeGraph.ts#L14-L149)
  - [`normalizeGraph`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/normalizeGraph.ts#L14-L149) — Graph validation & dummy node chain expansion

```typescript
// Code Snippet from cycleBreaking.ts (L10-L35)
export function classifyEdgeRoles(
  graph: NormalizedGraph,
  sccResult: DetailedSCCResult,
): CycleBreakingResult {
  const edgeRoleMap = new Map<string, EdgeRole>();
  const reversedMap = new Map<string, boolean>();

  // Process explicit roles: self > explicit feedback > explicit cross > explicit forward
  for (const edge of graph.edges) {
    if (edge.source === edge.target) {
      edgeRoleMap.set(edge.id, "self");
      reversedMap.set(edge.id, false);
    } else if (edge.isCycle || edge.layoutRole === "feedback") {
      edgeRoleMap.set(edge.id, "feedback");
      reversedMap.set(edge.id, true);
    }
  }
  // Eades greedy ordering execution...
}

// Code Snippet from rankAssignment.ts (L57-L74)
// Longest path rank assignment
const nodeRankMap = new Map<string, number>();
let maxRank = 0;

for (const nodeId of topoOrder) {
  const preds = forwardPredecessors.get(nodeId) ?? [];
  if (preds.length === 0) {
    nodeRankMap.set(nodeId, 0);
  } else {
    let maxPredRank = 0;
    for (const p of preds) {
      maxPredRank = Math.max(maxPredRank, nodeRankMap.get(p) ?? 0);
    }
    const rank = maxPredRank + 1;
    nodeRankMap.set(nodeId, rank);
    maxRank = Math.max(maxRank, rank);
  }
}
```
