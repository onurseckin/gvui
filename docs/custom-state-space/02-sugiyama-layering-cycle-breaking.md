# 02. Sugiyama Layering & Cycle Breaking

[← Previous: State-Space Search & Lexicographic Fitness](./01-state-space-search.md) | [← Back to Custom State-Space Engine Overview](./README.md) | [Next: Barycentric Crossing Minimization →](./03-barycentric-crossing-minimization.md)

This document details the cycle breaking, rank assignment, and graph normalization pipeline powering the **Custom State-Space Layout Engine**.

---

## 1. Problem & Trade-Off Journey

### The Core Challenge
Hierarchical graph layouts (Sugiyama-style framework) organize nodes into discrete horizontal rank layers where edges flow directionally from top to bottom ($r(u) < r(v)$ for edge $(u, v)$).

However, real-world workflow graphs and dependency networks frequently contain **directed cycles** (e.g., feedback loops, retries, or recursive parent-child relationships):

```
Cyclic Graph (Deadlock in Topological Sort):     Decoupled DAG (Feedback Edge Reversed):
           ┌──────────┐                                     ┌──────────┐
           │  Node A  │ (Rank 0)                            │  Node A  │ (Rank 0)
           └────┬─────┘                                     └────┬─────┘
                │                                                │
                ▼                                                ▼
           ┌──────────┐                                     ┌──────────┐
           │  Node B  │ (Rank 1)                            │  Node B  │ (Rank 1)
           └────┬─────┘                                     └────┬─────┘
                │ ▲                                              │ │ (Feedback
          Cycle │ │ Feedback                                     │ │  Reversed)
                ▼ │                                              ▼ ▼
           ┌──────────┐                                     ┌──────────┐
           │  Node C  │ (Rank 2)                            │  Node C  │ (Rank 2)
           └──────────┘                                     └──────────┘
```

If a graph contains cycles:
1. **Topological sorting fails**: Kahn's algorithm or standard DFS cannot assign linear ranks because in-degrees never collapse to 0.
2. **Infinite dummy node expansion**: If long-span edges traverse cycles, rank assignment produces negative or infinite rank gaps ($r(v) - r(u) < 0$).

### Trade-Off Comparison of Cycle-Breaking Algorithms

| Algorithm | Mechanism | Pros | Cons | Decision |
| :--- | :--- | :--- | :--- | :--- |
| **Simple DFS Back-Edge Reversal** | Reverses edges pointing to active call-stack nodes | $O(|V| + |E|)$ linear time | Arbitrary edge reversal based on DFS traversal order; often reverses long forward chains needlessly | ❌ Rejected for general graphs |
| **Tarjan's SCC Decomposition + Eades Greedy Flow** | Identifies Strongly Connected Components, then greedily picks nodes with maximum net out-degree | Minimizes the total count of reversed feedback edges while preserving local sub-graph flow | Slightly higher setup overhead ($O(|V| + |E|)$ per component) | ✅ **Chosen Approach** |
| **Exact Integer Linear Program (Feedback Arc Set)** | Solves NP-hard minimum feedback arc set via ILP | Guarantees minimum feedback arc set | Exponential worst-case complexity; unacceptable latency in browser JS thread | ❌ Rejected for UI performance |

---

## 2. Bottom-Up Mathematical Deconstruction

### Step 2.1: Tarjan Strongly Connected Component (SCC) Partitioning

#### 1. Mathematical Sub-Component Formula
Using Tarjan's algorithm, the graph $G = (V, E)$ is partitioned into disjoint SCCs $C_1, C_2, \dots, C_k$. For each vertex $v$, we maintain a discovery timestamp $d(v)$ and a low-link value $\text{low}(v)$:

$$\text{low}(v) = \min \begin{cases} d(v) \\ \{ \text{low}(w) \mid (v, w) \in E_{\text{tree}} \} \\ \{ d(w) \mid (v, w) \in E_{\text{back}} \land w \in \text{Stack} \} \end{cases}$$

A node $v$ is the root of an SCC if and only if $\text{low}(v) = d(v)$.

#### 2. Concrete Numerical Graph Example
Consider a 4-node graph $V = \{A, B, C, D\}$ with directed edges:
$e_1 = (A, B), \; e_2 = (B, C), \; e_3 = (C, A), \; e_4 = (C, D)$.

- **DFS Traversal Execution**:
  1. Visit $A$: $d(A) = 1, \text{low}(A) = 1$, Stack = $[A]$
  2. Visit $B$: $d(B) = 2, \text{low}(B) = 2$, Stack = $[A, B]$
  3. Visit $C$: $d(C) = 3, \text{low}(C) = 3$, Stack = $[A, B, C]$
  4. Visit $D$: $d(D) = 4, \text{low}(D) = 4$, Stack = $[A, B, C, D]$. No outgoing edges. $\text{low}(D) = d(D) = 4 \implies$ Pop stack $[D] \to \text{SCC}_1 = \{D\}$.
  5. Back at $C$: Edge $(C, A)$ points to $A \in \text{Stack}$ with $d(A) = 1$.
     $$\text{low}(C) = \min(3, d(A)) = \min(3, 1) = 1$$
  6. Back at $B$: Child $C$ has $\text{low}(C) = 1 \implies \text{low}(B) = \min(2, 1) = 1$.
  7. Back at $A$: Child $B$ has $\text{low}(B) = 1 \implies \text{low}(A) = \min(1, 1) = 1$.
     $$\text{low}(A) = d(A) = 1 \implies \text{Pop stack } [C, B, A] \to \text{SCC}_2 = \{A, B, C\}$$

- **Identified SCCs**:
  - $\text{SCC}_1 = \{D\}$ (Trivial acyclic)
  - $\text{SCC}_2 = \{A, B, C\}$ (Cyclic, $|V_{\text{SCC}}| = 3 > 1$)

#### 3. Targeted Sub-Step Pseudocode
```typescript
function computeSCCs(graph: Graph): string[][] {
  let index = 0;
  const stack: string[] = [];
  const inStack = new Set<string>();
  const d = new Map<string, number>();
  const low = new Map<string, number>();
  const sccs: string[][] = [];

  function strongConnect(v: string) {
    d.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    inStack.add(v);

    for (const w of graph.getOutEdges(v)) {
      if (!d.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (inStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, d.get(w)!));
      }
    }

    if (low.get(v) === d.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        inStack.delete(w);
        comp.push(w);
      } while (w !== v);
      sccs.push(comp);
    }
  }

  for (const node of graph.nodes) {
    if (!d.has(node.id)) strongConnect(node.id);
  }
  return sccs;
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.1: Tarjan SCC Timestamps & Low-Link Values
┌────────────────────────────────────────────────────────┐
│ Node A: d(A)=1, low(A)=1  (Stack: [A, B, C])           │
│   │                                                    │
│   ▼ e1=(A,B)                                           │
│ Node B: d(B)=2, low(B)=1  (Stack: [A, B, C])           │
│   │                                                    │
│   ▼ e2=(B,C)                                           │
│ Node C: d(C)=3, low(C)=1  (Back-edge (C,A) -> low=1)   │
│   ├──► e4=(C,D) ──► Node D: d(D)=4, low(D)=4           │
│   │                         └─► Pop SCC_1 = {D}        │
│   └─► e3=(C,A) (Back-edge to d(A)=1)                   │
└────────────────────────────────────────────────────────┘
 Result: SCC_1 = {D} (Acyclic), SCC_2 = {A, B, C} (Cyclic)
```

---

### Step 2.2: Eades Net Flow Metric $\delta(v)$ & Greedy Pivot Sequence

#### 1. Mathematical Sub-Component Formula
Within cyclic component $\text{SCC}_2 = \{A, B, C\}$, for any active node subset $V_{\text{active}}$, net flow $\delta(v)$ measures source vs sink behavior:

$$\delta(v) = \text{deg}^+(v) - \text{deg}^-(v)$$

Nodes are appended to linear sequence $\pi$ following Eades rules:
1. **Sinks** ($\text{deg}^+(v) = 0$): Placed at the right end of $\pi$.
2. **Sources** ($\text{deg}^-(v) = 0$): Placed at the left end of $\pi$.
3. **Internal Nodes**: Node maximizing $\delta(v)$ is placed at the left end of $\pi$.

An edge $e=(u,v)$ is classified as a **feedback edge** if $\pi(u) \ge \pi(v)$, and is reversed for rank assignment.

#### 2. Concrete Numerical Calculation Example
On cyclic component $\text{SCC}_2 = \{A, B, C\}$ with edges $(A,B), (B,C), (C,A)$:

- **Iteration 1**: Active $V_{\text{active}} = \{A, B, C\}$
  - $\text{deg}^+(A)=1, \text{deg}^-(A)=1 \implies \delta(A) = 1 - 1 = 0$
  - $\text{deg}^+(B)=1, \text{deg}^-(B)=1 \implies \delta(B) = 1 - 1 = 0$
  - $\text{deg}^+(C)=1, \text{deg}^-(C)=1 \implies \delta(C) = 1 - 1 = 0$
  - Max $\delta(v) = 0$. Pick pivot $A$. Place $A$ at left end of $\pi$.
  - $V_{\text{active}} = \{B, C\}, \quad \text{leftList} = [A]$

- **Iteration 2**: Active $V_{\text{active}} = \{B, C\}$ (Edge $(C,A)$ removed from active graph)
  - $\text{deg}^+(B)=1, \text{deg}^-(B)=0 \implies \delta(B) = 1 - 0 = +1$
  - $\text{deg}^+(C)=0, \text{deg}^-(C)=1 \implies \delta(C) = 0 - 1 = -1$
  - Max $\delta = +1$ at Node $B$ (Source in active graph!). Place $B$ at left end.
  - $V_{\text{active}} = \{C\}, \quad \text{leftList} = [A, B]$

- **Iteration 3**: Active $V_{\text{active}} = \{C\}$
  - $\text{deg}^+(C)=0, \text{deg}^-(C)=0 \implies \delta(C) = 0$. Place $C$.
  - $\text{leftList} = [A, B, C] \implies \text{Linear Sequence } \pi = [A: 0, B: 1, C: 2]$.

- **Edge Role Classification**:
  - Edge $e_1=(A,B): \pi(A)=0 < \pi(B)=1 \implies$ **Forward Edge**
  - Edge $e_2=(B,C): \pi(B)=1 < \pi(C)=2 \implies$ **Forward Edge**
  - Edge $e_3=(C,A): \pi(C)=2 > \pi(A)=0 \implies$ **FEEDBACK EDGE (REVERSED!)**

#### 3. Targeted Sub-Step Pseudocode
```typescript
function eadesGreedyOrdering(sccNodes: string[], sccEdges: Edge[]): Map<string, number> {
  const activeNodes = new Set(sccNodes);
  const leftList: string[] = [];
  const rightList: string[] = [];

  while (activeNodes.size > 0) {
    const sink = findNodeWithOutDegreeZero(activeNodes, sccEdges);
    if (sink) { activeNodes.delete(sink); rightList.unshift(sink); continue; }

    const source = findNodeWithInDegreeZero(activeNodes, sccEdges);
    if (source) { activeNodes.delete(source); leftList.push(source); continue; }

    const bestNode = findNodeWithMaxNetFlow(activeNodes, sccEdges); // max deg+ - deg-
    activeNodes.delete(bestNode);
    leftList.push(bestNode);
  }

  const sccOrder = [...leftList, ...rightList];
  return new Map(sccOrder.map((id, idx) => [id, idx]));
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.2: Eades Net Flow Iterations & Edge Reversal
 Iteration 1: Active={A,B,C}  -> δ(A)=0, δ(B)=0, δ(C)=0   => Pick A (leftList=[A])
 Iteration 2: Active={B,C}    -> δ(B)=+1, δ(C)=-1          => Pick B (leftList=[A,B])
 Iteration 3: Active={C}      -> deg=0                      => Pick C (leftList=[A,B,C])

 Sequence π: A (0) -> B (1) -> C (2)
 Edge (A,B): 0 < 1 => Forward
 Edge (B,C): 1 < 2 => Forward
 Edge (C,A): 2 > 0 => REVERSED FEEDBACK EDGE!
```

---

### Step 2.3: Longest Path Rank Layer Assignment $r(v)$

#### 1. Mathematical Sub-Component Formula
Once cycle breaking converts the graph into an acyclic DAG $G_{\text{DAG}} = (V, E_{\text{forward}})$, the rank layer $r(v)$ of each vertex $v \in V$ is computed using longest path topological layering:

$$r(v) = \begin{cases} 0 & \text{if } \text{Pred}(v) = \emptyset \\ \max_{u \in \text{Pred}(v)} (r(u)) + 1 & \text{otherwise} \end{cases}$$

#### 2. Concrete Numerical Calculation Example
Consider our DAG with nodes $\{A, B, C, D\}$ and forward edges $(A, B), (B, C), (C, D)$, plus a long-span forward edge $(A, D)$:

- **Predecessor Sets**:
  - $\text{Pred}(A) = \emptyset$
  - $\text{Pred}(B) = \{A\}$
  - $\text{Pred}(C) = \{B\}$
  - $\text{Pred}(D) = \{C, A\}$

- **Layer Arithmetic**:
  - $r(A) = 0$
  - $r(B) = r(A) + 1 = 0 + 1 = 1$
  - $r(C) = r(B) + 1 = 1 + 1 = 2$
  - $r(D) = \max(r(C) + 1, r(A) + 1) = \max(2 + 1, 0 + 1) = \max(3, 1) = 3$

$$\text{Final Rank Assignment}: r(A) = 0, \; r(B) = 1, \; r(C) = 2, \; r(D) = 3$$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function assignRanks(topoOrder: string[], forwardEdges: Edge[]): Map<string, number> {
  const nodeRankMap = new Map<string, number>();
  for (const nodeId of topoOrder) {
    const preds = forwardEdges.filter(e => e.target === nodeId).map(e => e.source);
    if (preds.length === 0) {
      nodeRankMap.set(nodeId, 0);
    } else {
      const maxPredRank = Math.max(...preds.map(p => nodeRankMap.get(p)!));
      nodeRankMap.set(nodeId, maxPredRank + 1);
    }
  }
  return nodeRankMap;
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.3: Longest Path Layer Assignment
 Rank 0:  ┌───────────┐
          │  Node A   │ (r=0, Pred=∅)
          └─┬───────┬─┘
            │       │ (Long Span Edge e4)
            ▼       │
 Rank 1:  ┌─────────┼─┐
          │ Node B  │ │ (r=1, Pred={A})
          └─┬───────┼─┘
            │       │
            ▼       │
 Rank 2:  ┌─────────┼─┐
          │ Node C  │ │ (r=2, Pred={B})
          └─┬───────┼─┘
            │       │
            ▼       ▼
 Rank 3:  ┌───────────┐
          │  Node D   │ (r=3, Pred={C,A} -> max(2+1, 0+1) = 3)
          └───────────┘
```

---

### Step 2.4: Virtual Dummy Node Expansion Span $(r(v) - r(u) - 1)$

#### 1. Mathematical Sub-Component Formula
An edge $e = (u, v) \in E_{\text{forward}}$ spanning multiple layers ($r(v) - r(u) > 1$) is split into a chain of $k - 1$ virtual dummy nodes, where layer span $k$ is:

$$k = r(v) - r(u)$$

$$\text{Chain}(e) = \left( u \to \omega_{e, 1} \to \omega_{e, 2} \to \dots \to \omega_{e, k-1} \to v \right)$$

where each dummy node $\omega_{e, i}$ is assigned rank layer $r(\omega_{e, i}) = r(u) + i$.

#### 2. Concrete Numerical Calculation Example
For long-span edge $e_4 = (A, D)$ connecting Node $A$ ($r(A) = 0$) to Node $D$ ($r(D) = 3$):

- **Span Calculation**: $k = r(D) - r(A) = 3 - 0 = 3$.
- **Dummy Node Count**: $k - 1 = 3 - 1 = 2$ virtual nodes.
- **Inserted Dummy Nodes**:
  - Virtual node $\omega_{e4, 1}$ assigned to layer $r(\omega_{e4, 1}) = 0 + 1 = 1$.
  - Virtual node $\omega_{e4, 2}$ assigned to layer $r(\omega_{e4, 2}) = 0 + 2 = 2$.
- **Replaced Edge Chain**:
  $$A \longrightarrow \omega_{e4, 1} \longrightarrow \omega_{e4, 2} \longrightarrow D$$
- **Layer Sets After Normalization**:
  - Layer 0: $[A]$
  - Layer 1: $[B, \omega_{e4, 1}]$
  - Layer 2: $[C, \omega_{e4, 2}]$
  - Layer 3: $[D]$

#### 3. Targeted Sub-Step Pseudocode
```typescript
function normalizeGraphLayers(nodes: Node[], edges: Edge[], rankMap: Map<string, number>): LayeredGraph {
  const dummyNodes: DummyNode[] = [];
  const normalizedEdges: Edge[] = [];

  for (const edge of edges) {
    const rSrc = rankMap.get(edge.source)!;
    const rTgt = rankMap.get(edge.target)!;
    const span = rTgt - rSrc;

    if (span <= 1) {
      normalizedEdges.push(edge);
    } else {
      let prevId = edge.source;
      for (let i = 1; i < span; i++) {
        const dummyId = `dummy_${edge.id}_${i}`;
        dummyNodes.push({ id: dummyId, rank: rSrc + i, parentEdgeId: edge.id });
        normalizedEdges.push({ id: `${edge.id}_sub_${i}`, source: prevId, target: dummyId });
        prevId = dummyId;
      }
      normalizedEdges.push({ id: `${edge.id}_sub_${span}`, source: prevId, target: edge.target });
    }
  }
  return { dummyNodes, normalizedEdges };
}
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.4: Long-Span Edge Normalization with Dummy Nodes
 Before Normalization:                     After Dummy Injection:
 Rank 0: [ Node A ] ──────┐                 Rank 0: [ Node A ]
            │             │                            │     \
            ▼             │ (Span = 3)                 ▼      ▼
 Rank 1: [ Node B ]       │                 Rank 1: [ Node B ] [ ω_1 ] (r=1)
            │             │                            │     │
            ▼             │                            ▼     ▼
 Rank 2: [ Node C ]       │                 Rank 2: [ Node C ] [ ω_2 ] (r=2)
            │             │                            │     │
            ▼             ▼                            ▼     ▼
 Rank 3: [ Node D ] ◄─────┘                 Rank 3: [ Node D ] ◄─────┘
```

---

## 3. Master Synthesis: Merged Layering & Normalization Pipeline

### 1. Unified Mathematical Pipeline Formulation
Combining Tarjan SCC partitioning (2.1), Eades greedy cycle breaking (2.2), longest path rank assignment (2.3), and dummy node injection (2.4), the entire layering transformation pipeline is defined as:

$$G(V, E) \xrightarrow{\text{Tarjan}} \{C_i\} \xrightarrow{\text{Eades}} G_{\text{DAG}}(V, E_{\text{forward}}) \xrightarrow{\text{LongestPath}} r(V) \xrightarrow{\text{DummyInject}} G_{\text{norm}}(V \cup \Omega, E_{\text{norm}})$$

### 2. Master Pipeline Pseudocode
```typescript
function classifyEdgeRolesAndAssignRanks(graph: NormalizedGraph): RankAssignmentResult {
  // Step 1: Tarjan SCC Decomposition
  const sccs = computeSCCs(graph);
  const edgeRoleMap = new Map<string, EdgeRole>();

  // Step 2: Eades Greedy Cycle Breaking on cyclic components
  for (const compNodes of sccs) {
    if (compNodes.length <= 1) continue;
    const posMap = eadesGreedyOrdering(compNodes, graph.edges);

    for (const edge of getInternalSCCEdges(compNodes, graph.edges)) {
      if (posMap.get(edge.source)! < posMap.get(edge.target)!) {
        edgeRoleMap.set(edge.id, "forward");
      } else {
        edgeRoleMap.set(edge.id, "feedback"); // Reversed!
      }
    }
  }

  // Step 3: Topological Longest Path Rank Assignment
  const forwardEdges = graph.edges.filter(e => edgeRoleMap.get(e.id) !== "feedback");
  const topoOrder = kahnTopologicalSort(graph.nodes, forwardEdges);
  const nodeRankMap = assignRanks(topoOrder, forwardEdges);

  // Step 4: Dummy Node Insertion for Spans > 1
  const layeredGraph = normalizeGraphLayers(graph.nodes, forwardEdges, nodeRankMap);

  return { nodeRankMap, edgeRoleMap, layeredGraph };
}
```

### 3. Master Pipeline ASCII Architecture
```
Sugiyama Layering & Cycle Breaking Pipeline:
┌────────────────────────────────────────────────────────────────────────┐
│                       Raw Directed Graph G(V, E)                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Step 2.1: Tarjan SCC Decomposition -> Identify Cyclic Subgraphs C_i  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Step 2.2: Eades Net Flow δ(v) -> Reverse Feedback Edges (π_u >= π_v) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Step 2.3: Longest Path Topological Layering -> Assign Ranks r(v)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│  Step 2.4: Virtual Dummy Expansion -> Split Spans (r_v - r_u > 1)      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             Normalized Layered Graph G_norm(V U Ω, E_norm)             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Codebase Reference Map & Line Anchors

- [`src/engine/layout/custom/cycleBreaking.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/cycleBreaking.ts#L10-L355)
  - [`classifyEdgeRoles`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/cycleBreaking.ts#L10-L355) — Classifies edge roles (`forward`, `feedback`, `cross`, `self`) via Tarjan SCCs + Eades flow.
- [`src/engine/layout/custom/rankAssignment.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/rankAssignment.ts#L11-L105)
  - [`assignRanks`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/rankAssignment.ts#L11-L105) — Computes longest path rank layers and edge rank spans.
- [`src/engine/layout/custom/normalizeGraph.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/normalizeGraph.ts#L14-L149)
  - [`normalizeGraph`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/normalizeGraph.ts#L14-L149) — Validates input nodes/edges and extracts weak graph components.
