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
| **Simple DFS Back-Edge Reversal** | Reverses edges pointing to active call-stack nodes | $O(\|V\| + \|E\|)$ linear time | Arbitrary edge reversal based on DFS traversal order; often reverses long forward chains needlessly | ❌ Rejected for general graphs |
| **Tarjan's SCC Decomposition + Eades Greedy Flow** | Identifies Strongly Connected Components, then greedily picks nodes with maximum net out-degree | Minimizes the total count of reversed feedback edges while preserving local sub-graph flow | Slightly higher setup overhead ($O(\|V\| + \|E\|)$ per component) | ✅ **Chosen Approach** |
| **Exact Integer Linear Program (Feedback Arc Set)** | Solves NP-hard minimum feedback arc set via ILP | Guarantees minimum feedback arc set | Exponential worst-case complexity; unacceptable latency in browser JS thread | ❌ Rejected for UI performance |

---

## 2. Bottom-Up Mathematical Deconstruction

### Step 2.1: Strongly Connected Component (SCC) Partitioning
Using Tarjan's algorithm, the input graph $G = (V, E)$ is partitioned into disjoint strongly connected components $C_1, C_2, \dots, C_k$:

$$V = \bigcup_{i=1}^k V_{C_i}, \quad \text{where } V_{C_i} \cap V_{C_j} = \emptyset \text{ for } i \neq j$$

Component $C_i$ is **cyclic** if $|V_{C_i}| > 1$ or contains a self-loop $(v, v) \in E$. Cycle breaking is isolated strictly within cyclic SCCs.

---

### Step 2.2: Eades Net Flow Metric $\delta(v)$
Within a cyclic component $C_i$, for any active node subset $V_{\text{active}} \subseteq V_{C_i}$, we define the in-degree $\text{deg}^-(v)$ and out-degree $\text{deg}^+(v)$ restricted to $V_{\text{active}}$:

$$\text{deg}^+(v) = |\{ u \in V_{\text{active}} \mid (v, u) \in E \}|$$
$$\text{deg}^-(v) = |\{ u \in V_{\text{active}} \mid (u, v) \in E \}|$$

The net flow score $\delta(v)$ measures node $v$'s tendency to act as a source versus a sink:

$$\delta(v) = \text{deg}^+(v) - \text{deg}^-(v)$$

Nodes are assigned positions in a linear ordering sequence $\pi = (v_1, v_2, \dots, v_n)$ according to Eades greedy rules:
1. **Sinks** ($\text{deg}^+(v) = 0$): Placed at the right end of sequence $\pi$.
2. **Sources** ($\text{deg}^-(v) = 0$): Placed at the left end of sequence $\pi$.
3. **Internal Nodes**: The node maximizing $\delta(v)$ is placed at the left end of sequence $\pi$.

An edge $e = (u, v)$ is classified as a **feedback edge** if $\pi(u) \ge \pi(v)$, and is temporarily reversed during rank assignment.

---

### Step 2.3: Longest Path Rank Assignment $r(v)$
Once cycle breaking converts the graph into an acyclic DAG $G_{\text{DAG}} = (V, E_{\text{forward}})$, Kahn's algorithm computes a topological ordering sequence $\text{Topo}(V)$.

The rank layer $r(v)$ of each vertex $v \in V$ is computed incrementally using the longest path formulation:

$$r(v) = \begin{cases} 0 & \text{if } \text{Pred}(v) = \emptyset \\ \max_{u \in \text{Pred}(v)} (r(u)) + 1 & \text{otherwise} \end{cases}$$

where $\text{Pred}(v) = \{ u \in V \mid (u, v) \in E_{\text{forward}} \}$.

---

### Step 2.4: Dummy Node Injection Span $(r(v) - r(u) - 1)$
An edge $e = (u, v) \in E_{\text{forward}}$ spanning multiple layers ($r(v) - r(u) > 1$) is split into a chain of $k - 1$ virtual dummy nodes, where:

$$k = r(v) - r(u)$$

$$\text{Chain}(e) = \left( u \to \omega_{e, 1} \to \omega_{e, 2} \to \dots \to \omega_{e, k-1} \to v \right)$$

where each dummy node $\omega_{e, i}$ is assigned rank layer $r(\omega_{e, i}) = r(u) + i$.

---

## 3. Step-by-Step Computational Pseudocode

The following pseudocode illustrates Eades cycle breaking and rank assignment:

```typescript
function classifyEdgeRolesAndAssignRanks(graph: NormalizedGraph): RankAssignmentResult {
  // Step 1: Compute SCCs via Tarjan's algorithm
  const sccResult = computeStronglyConnectedComponents(graph);
  const edgeRoleMap = new Map<string, EdgeRole>();

  // Step 2: Process cyclic components with Eades heuristic
  for (const compNodes of sccResult.components) {
    if (compNodes.length <= 1) continue;

    const activeNodes = new Set(compNodes);
    const leftList: string[] = [];
    const rightList: string[] = [];

    while (activeNodes.size > 0) {
      // Find sink (out-degree === 0)
      const sink = findNodeWithOutDegreeZero(activeNodes);
      if (sink) {
        activeNodes.delete(sink);
        rightList.unshift(sink);
        continue;
      }

      // Find source (in-degree === 0)
      const source = findNodeWithInDegreeZero(activeNodes);
      if (source) {
        activeNodes.delete(source);
        leftList.push(source);
        continue;
      }

      // Maximize net flow delta(v) = deg+(v) - deg-(v)
      const bestNode = findNodeWithMaxNetFlow(activeNodes);
      activeNodes.delete(bestNode);
      leftList.push(bestNode);
    }

    const sccOrder = [...leftList, ...rightList];
    const posMap = new Map<string, number>(sccOrder.map((id, idx) => [id, idx]));

    // Classify edges: srcPos < tgtPos => forward, else feedback
    for (const edge of getInternalSCCEdges(compNodes)) {
      if (posMap.get(edge.source)! < posMap.get(edge.target)!) {
        edgeRoleMap.set(edge.id, "forward");
      } else {
        edgeRoleMap.set(edge.id, "feedback");
      }
    }
  }

  // Step 3: Compute Topological Order via Kahn's algorithm on forward edges
  const forwardEdges = graph.edges.filter(e => edgeRoleMap.get(e.id) !== "feedback");
  const topoOrder = kahnTopologicalSort(graph.nodes, forwardEdges);

  // Step 4: Longest Path Rank Assignment
  const nodeRankMap = new Map<string, number>();
  for (const nodeId of topoOrder) {
    const preds = getForwardPredecessors(nodeId, forwardEdges);
    if (preds.length === 0) {
      nodeRankMap.set(nodeId, 0);
    } else {
      const maxPredRank = Math.max(...preds.map(p => nodeRankMap.get(p)!));
      nodeRankMap.set(nodeId, maxPredRank + 1);
    }
  }

  return { nodeRankMap, edgeRoleMap };
}
```

---

## 4. Visual ASCII Diagrams

### Back-Edge Reversal & Rank Layering Sequence

```
Initial Graph (Cycle: B -> C -> B):         Step 1: Eades Reversal (C -> B Reversed):
        [Node A] (In-deg 0)                         [Node A] (Rank 0)
           │                                           │
           ▼                                           ▼
        [Node B] <──────┐                           [Node B] (Rank 1)
           │            │                              │
           ▼            │                              ▼
        [Node C] ───────┘                           [Node C] (Rank 2)
                                                       │
                                                       └──────> (Feedback Edge C -> B)

Step 2: Rank Assignment & Longest Path Layering:
 Rank 0:    ┌──────────┐
            │  Node A  │
            └────┬─────┘
                 │
 Rank 1:    ┌────┴─────┐
            │  Node B  │
            └────┬─────┘
                 │
 Rank 2:    ┌────┴─────┐
            │  Node C  ├───────────────────┐
            └──────────┘                   │ (Reversed Feedback)
                 ▲                         │
                 └─────────────────────────┘
```

---

## 5. Codebase Reference Map & Line Anchors

- [`src/engine/layout/custom/cycleBreaking.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/cycleBreaking.ts#L10-L355)
  - [`classifyEdgeRoles`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/cycleBreaking.ts#L10-L355) — Classifies edge roles (`forward`, `feedback`, `cross`, `self`) via Tarjan SCCs + Eades flow.
- [`src/engine/layout/custom/rankAssignment.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/rankAssignment.ts#L11-L105)
  - [`assignRanks`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/rankAssignment.ts#L11-L105) — Computes longest path rank layers and edge rank spans.
- [`src/engine/layout/custom/normalizeGraph.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/normalizeGraph.ts#L14-L149)
  - [`normalizeGraph`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/custom/normalizeGraph.ts#L14-L149) — Validates input nodes/edges and extracts weak graph components.
