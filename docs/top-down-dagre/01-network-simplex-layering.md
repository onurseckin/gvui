# 01. Network Simplex Layer Assignment

[← Back to Master Index](../README.md)

This module documents the **Network Simplex linear programming algorithm** used to assign integer rank layers to nodes in the **Top-Down Dagre Engine**.

---

## 1. The Problem & Trade-off Journey

### 1.1 The Hierarchical Layering Problem
Given a Directed Acyclic Graph (DAG) $G = (V, E)$, the first phase of hierarchical graph layout (Sugiyama framework) is **Layer Assignment** (also called *ranking*). Every node $v \in V$ must be assigned an integer layer rank $r(v) \in \mathbb{Z}_{\ge 0}$ such that for every directed edge $e = (u, v) \in E$, the head node is placed strictly below the tail node:

$$r(v) - r(u) \ge \delta(u, v) \ge 1$$

where $\delta(u, v)$ is the minimum required rank separation distance between node $u$ and node $v$.

```
   Bad Layering (Excessive Span):          Optimal Layering (Minimizes Total Span):
      
      Layer 0:  [ Root ]                      Layer 0:  [ Root ]
                │                                       │   \
                │ (Span = 3)                            │    \
                │                                       ▼     ▼
      Layer 1:  │                             Layer 1: [ A ]  [ B ]
                │                                       │     │
                │                                       ▼     ▼
      Layer 2:  │                             Layer 2: [ C ]──►[ D ]
                ▼
      Layer 3:  [ Target ]
```

### 1.2 Comparison of Layering Approaches

| Algorithm | Objective / Strategy | Time Complexity | Strengths | Weaknesses / Why Rejected |
| :--- | :--- | :--- | :--- | :--- |
| **Longest-Path Layering** | Top-down DFS/BFS placing nodes at $r(v) = \max_{(u,v)} (r(u) + 1)$ | $O(V + E)$ | Extremely fast linear-time algorithm | Produces excessively tall graphs; ignores edge weights; creates huge dummy node spans for multi-layer edges. |
| **Coffman-Graham Layering** | Caps maximum width per layer $W_{\text{max}}$ | $O(V^2)$ | Guarantees bounded canvas width for parallel scheduling | Distorts natural hierarchical clusters; forces nodes into artificial upper layers when width limit is met. |
| **Generic Simplex / Interior Point** | Standard primal/dual Linear Programming solver | $O(V^3)$ to $O(V^{3.5})$ | Solves exact continuous linear program | Slow performance overhead; requires floating-point conversion and round-off integer casting. |
| **Network Simplex (Chosen)** | Specialized Dual Spanning Tree Simplex for Minimum Cost Network Flow | $O(V \cdot E)$ empirical | **Optimal total edge length minimization**; integer solution guarantee; fast graph-pivot operations | Slightly more complex implementation than longest-path. |

### 1.3 Why Network Simplex is Chosen
Dagre selects **Network Simplex** because it directly minimizes the total weighted edge length:

$$\min \sum_{e=(u,v) \in E} w(e) \cdot (r(v) - r(u))$$

Minimizing edge length directly reduces the number of **dummy nodes** created when edges cross multiple layers ($k = r(v) - r(u) - 1$). Fewer dummy nodes translate directly to faster crossing reduction iterations, tighter vertical layouts, and cleaner visual flow.

---

## 2. Bottom-Up Mathematical Deconstruction

To understand Network Simplex, we build its mathematical model from basic node constraints up to spanning tree cut duality.

### Step 2.1: Primal Linear Program Formulation
We represent the rank layer assignment problem as an Integer Linear Program (ILP):

$$\begin{aligned}
\text{Minimize} \quad & f(\mathbf{r}) = \sum_{e=(u,v) \in E} w(e) \cdot (r(v) - r(u)) \\
\text{Subject to} \quad & r(v) - r(u) \ge \delta(u, v) \quad \forall (u, v) \in E \\
& r(v) \in \mathbb{Z}_{\ge 0} \quad \forall v \in V
\end{aligned}$$

Where:
- $w(e) \ge 1$ is the edge weight (higher weight forces nodes closer together vertically).
- $\delta(u, v) \ge 1$ is the minimum rank separation (default $\delta = 1$).

### Step 2.2: Edge Slack $g(e)$ & Tight Edges
For any directed edge $e = (u, v) \in E$, we define the **edge slack** $g(e)$ as:

$$g(e) = r(v) - r(u) - \delta(u, v)$$

From the rank separation constraint, a rank assignment is **feasible** if and only if:

$$g(e) \ge 0 \quad \forall e \in E$$

- An edge $e$ is **tight** if its slack is zero ($g(e) = 0$), meaning $r(v) - r(u) = \delta(u, v)$.
- An edge $e$ is **slack** if $g(e) > 0$.

### Step 2.3: Dual Basis via Feasible Spanning Tree
Rather than maintaining a full simplex tableau, Network Simplex maintains a **Feasible Spanning Tree** $T = (V, E_T)$ where $E_T \subseteq E$:
1. $T$ spans all vertices $V$.
2. Every tree edge $e \in E_T$ is **tight** ($g(e) = 0$).
3. Non-tree edges $e \notin E_T$ satisfy $g(e) \ge 0$.

Because every tree edge is tight, fixing the rank of a single root node completely determines the ranks of all other nodes in the spanning tree $T$.

```
              ┌─────────────────────────────────────────┐
              │     Feasible Rank Assignment r(v)       │
              └────────────────────┬────────────────────┘
                                   │
                                   ▼
              ┌─────────────────────────────────────────┐
              │    Tight Spanning Tree T = (V, E_T)     │
              │     (Every e ∈ E_T satisfies g(e)=0)    │
              └────────────────────┬────────────────────┘
                                   │
                                   ▼
              ┌─────────────────────────────────────────┐
              │   Compute Tree Edge Cut Values cutval(e)│
              └────────────────────┬────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
             cutval(e) >= 0                cutval(e) < 0
             (for all e ∈ E_T)             (for some e ∈ E_T)
                    │                             │
                    ▼                             ▼
         ┌───────────────────┐        ┌──────────────────────────┐
         │ Optimal Layering  │        │ Pivot Step:              │
         │ Found (Terminate) │        │ Swap e for min-slack e'  │
         └───────────────────┘        │ Update ranks & tree cut  │
                                      └──────────────────────────┘
```

### Step 2.4: Cut Values $\text{cutval}(e)$ Equation
Removing any tree edge $e = (u, v) \in E_T$ disconnects $T$ into two disjoint components:
- $T_{\text{tail}}(e)$: The component containing tail vertex $u$.
- $T_{\text{head}}(e)$: The component containing head vertex $v$.

The **cut value** $\text{cutval}(e)$ represents the exact rate of change in the objective function $f(\mathbf{r})$ if we increment the ranks of all nodes in $T_{\text{head}}(e)$ by $+1$:

$$\text{cutval}(e) = \sum_{g \in \text{InCut}(e)} w(g) - \sum_{g \in \text{OutCut}(e)} w(g)$$

Where:
- $\text{OutCut}(e) = \{ (x, y) \in E \mid x \in T_{\text{tail}}(e), y \in T_{\text{head}}(e) \}$ (directed edges pointing from tail component to head component).
- $\text{InCut}(e) = \{ (x, y) \in E \mid x \in T_{\text{head}}(e), y \in T_{\text{tail}}(e) \}$ (directed edges pointing from head component to tail component).

### Step 2.5: Simplex Pivot Optimality & Rank Shift
- **Optimality Condition**: If $\text{cutval}(e) \ge 0$ for all tree edges $e \in E_T$, no rank shift can decrease total edge length. The current rank assignment is **globally optimal**.
- **Pivot Execution**: If an edge $e \in E_T$ has $\text{cutval}(e) < 0$:
  1. **Leaving Edge**: Remove $e$ from tree $T$, forming cut components $T_{\text{tail}}(e)$ and $T_{\text{head}}(e)$.
  2. **Entering Edge**: Select non-tree edge $e' = (x', y') \in \text{InCut}(e)$ with minimum slack:
     $$\gamma = \min_{g \in \text{InCut}(e)} g(g)$$
  3. **Rank Shift**: Add $\gamma$ to the ranks of all nodes in $T_{\text{head}}(e)$:
     $$r(z) \leftarrow r(z) + \gamma \quad \forall z \in T_{\text{head}}(e)$$
  4. **Tree Update**: Update spanning tree edges $E_T \leftarrow (E_T \setminus \{e\}) \cup \{e'\}$.

---

## 3. Step-by-Step Computational Pseudocode

The full Network Simplex algorithm consists of initial tight tree construction, cut value evaluation, and pivot iterations.

```typescript
/**
 * Step 1: Constructs an initial feasible tree T and valid rank assignment r(v).
 */
function initializeFeasibleTree(graph: Graph): { tree: Graph; ranks: Map<NodeId, number> } {
  const ranks = new Map<NodeId, number>();

  // 1. Longest-path initial rank assignment
  const topologicalOrder = graph.topologicalSort();
  for (const node of topologicalOrder) {
    let maxRank = 0;
    for (const inEdge of graph.inEdges(node)) {
      const predRank = ranks.get(inEdge.source)!;
      maxRank = Math.max(maxRank, predRank + inEdge.minLen);
    }
    ranks.set(node, maxRank);
  }

  // 2. Build initial tight spanning tree
  const tree = new Graph({ undirected: true });
  for (const node of graph.nodes()) {
    tree.addNode(node);
  }

  while (tree.edges().length < graph.nodes().length - 1) {
    const nonTreeEdges = graph.edges().filter(e => !tree.hasEdge(e.source, e.target));
    // Find non-tree edge connecting tree to non-tree with minimum slack
    let minSlackEdge = null;
    let minSlack = Infinity;

    for (const e of nonTreeEdges) {
      const slack = ranks.get(e.target)! - ranks.get(e.source)! - e.minLen;
      if (tree.isIncident(e.source) !== tree.isIncident(e.target)) {
        if (slack < minSlack) {
          minSlack = slack;
          minSlackEdge = e;
        }
      }
    }

    if (!minSlackEdge) break;

    // Adjust ranks to make minSlackEdge tight (slack = 0)
    if (minSlack > 0) {
      const delta = minSlack;
      const unvisitedComponent = tree.getUnvisitedComponent(minSlackEdge);
      for (const node of unvisitedComponent) {
        ranks.set(node, ranks.get(node)! + delta);
      }
    }

    tree.addEdge(minSlackEdge.source, minSlackEdge.target, minSlackEdge);
  }

  return { tree, ranks };
}

/**
 * Step 2: Main Network Simplex Execution Loop
 */
function networkSimplex(graph: Graph): Map<NodeId, number> {
  const { tree, ranks } = initializeFeasibleTree(graph);

  while (true) {
    // Compute cut values for all tree edges
    const cutValues = computeCutValues(tree, graph);
    
    // Find leaving edge with negative cut value
    let leavingEdge = null;
    for (const [edge, cutVal] of cutValues.entries()) {
      if (cutVal < 0) {
        leavingEdge = edge;
        break;
      }
    }

    // Termination: All cut values non-negative => Globally optimal
    if (!leavingEdge) {
      break;
    }

    // Identify cut components
    const { tailComponent, headComponent } = tree.splitByEdge(leavingEdge);

    // Find entering edge in InCut(leavingEdge) with minimum slack
    let enteringEdge = null;
    let minSlack = Infinity;

    for (const e of graph.edges()) {
      if (headComponent.has(e.source) && tailComponent.has(e.target)) {
        const slack = ranks.get(e.target)! - ranks.get(e.source)! - e.minLen;
        if (slack < minSlack) {
          minSlack = slack;
          enteringEdge = e;
        }
      }
    }

    if (!enteringEdge) {
      throw new Error("Graph contains unresolvable cycle or invalid cut");
    }

    // Pivot: Shift head component ranks by minSlack
    for (const node of headComponent) {
      ranks.set(node, ranks.get(node)! + minSlack);
    }

    // Update spanning tree
    tree.removeEdge(leavingEdge);
    tree.addEdge(enteringEdge);
  }

  // Normalize ranks so minimum rank is 0
  const minRank = Math.min(...Array.from(ranks.values()));
  for (const [node, r] of ranks.entries()) {
    ranks.set(node, r - minRank);
  }

  return ranks;
}
```

---

## 4. Visual ASCII Schematics

### 4.1 Feasible Spanning Tree & Edge Cut Topology

```
                  Tail Component T_tail(e)               Head Component T_head(e)
              ┌───────────────────────────────┐     ┌───────────────────────────────┐
              │                               │     │                               │
              │         [ Node A ]            │     │         [ Node C ]            │
              │           │  r(A)=0           │     │           │  r(C)=1           │
              │           │                   │     │           │                   │
              │           ▼                   │     │           ▼                   │
              │         [ Node B ] ───────────┼────►│         [ Node D ]            │
              │              r(B)=0           │ e   │              r(D)=1           │
              └───────────────────────────────┘     └───────────────────────────────┘
                                  │                                 ▲
                                  │      Non-Tree InCut Edge g      │
                                  └─────────────────────────────────┘
                                              w(g)=2, slack=1
```

### 4.2 Pivot Step Rank Shift Schematic

```
   BEFORE PIVOT (cutval(e) = -1 < 0):
   Layer 0:  [ A ] (r=0) ──e_tree──► [ C ] (r=0, Slack violation!)
   Layer 1:  [ B ] (r=1) ──────────► [ D ] (r=1)

   PIVOT EXECUTION:
   1. Remove leaving tree edge e_tree with cutval < 0.
   2. Compute min slack γ = 1 on InCut edge.
   3. Shift head component {C, D} ranks by +1.

   AFTER PIVOT (cutval >= 0, All Edges Feasible):
   Layer 0:  [ A ] (r=0)
               │
               ▼
   Layer 1:  [ B ] (r=1) ──e'_tree─► [ C ] (r=1, Tight edge g=0!)
                                       │
                                       ▼
   Layer 2:                          [ D ] (r=2)
```

---

## 5. Codebase Reference Map

- [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L604) — `computeDagreLayout` constructs graph structures and executes `dagre.layout(g)` performing Network Simplex layering.
- [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L138-L152) — Dispatcher case routing `"top-down-dagre"` engine executions.

```typescript
// Code Snippet from layoutDispatcher.ts (L138-L152)
export async function computeGraphLayout(
  dataset: GraphDataset,
  mode: LayoutMode = "top-down",
): Promise<{ nodes: PositionedNode[]; edges: PositionedEdge[] }> {
  switch (mode) {
    case "top-down":
      return await computeCustomEngineGraphLayout(dataset);
    case "top-down-dagre":
      return computeDagreLayout(dataset, "TB");
    case "left-right":
      return computeDagreLayout(dataset, "LR");
    case "force":
      return computeForceLayout(dataset);
    case "radial":
      return computeRadialLayout(dataset);
    default:
      return await computeCustomEngineGraphLayout(dataset);
  }
}
```
