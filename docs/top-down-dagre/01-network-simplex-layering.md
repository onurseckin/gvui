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

To understand Network Simplex, we build its mathematical model from basic node constraints up to spanning tree cut duality using explicit numerical calculations.

---

### Step 2.1: Edge Slack $g(e)$ & Feasibility Condition

#### 1. Mathematical Sub-Component Formula
For any directed edge $e = (u, v) \in E$, the **edge slack** $g(e)$ measures the excess vertical rank separation beyond the minimum required distance $\delta(u, v) \ge 1$:

$$g(e) = r(v) - r(u) - \delta(u, v)$$

- A rank assignment $\mathbf{r}$ is **feasible** if and only if $g(e) \ge 0$ for all edges $e \in E$.
- An edge $e$ is **tight** if $g(e) = 0$, meaning $r(v) - r(u) = \delta(u, v)$.
- An edge $e$ is **slack** if $g(e) > 0$.

#### 2. Concrete Numerical Graph Example
Consider three nodes $u, v, w \in V$ with current rank assignments $r(u) = 0$, $r(w) = 1$, and $r(v) = 2$, with minimum separation $\delta = 1$:

1. **Tight Edge Calculation** for $e_1 = (u, w)$:
   $$g(e_1) = r(w) - r(u) - \delta(u, w) = 1 - 0 - 1 = 0 \quad \text{(Tight Edge)}$$

2. **Slack Edge Calculation** for $e_2 = (u, v)$:
   $$g(e_2) = r(v) - r(u) - \delta(u, v) = 2 - 0 - 1 = 1 \quad \text{(Slack Edge, } g(e_2) = 1 \text{)}$$

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM CALCULATE_EDGE_SLACK(source, target, ranks, min_len = 1)
    INPUT: source node ID, target node ID, map of node ranks, minimum length min_len
    OUTPUT: integer edge slack value

    r_source <- ranks[source]
    r_target <- ranks[target]
    RETURN r_target - r_source - min_len
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.1: Edge Slack Calculation & Tightness Assessment

  Layer 0:  [ Node u ] (r(u) = 0)
              │               \
              │ (δ = 1)        \ (δ = 1)
              ▼                 ▼
  Layer 1:  [ Node w ]        (Intermediate)
              r(w) = 1          │
              g(e1) = 1-0-1     │
              g(e1) = 0         ▼
              [TIGHT EDGE]    [ Node v ] (r(v) = 2)
                              g(e2) = 2 - 0 - 1 = 1
                              [SLACK EDGE: g = 1]
```

---

### Step 2.2: Spanning Tree Cut Value $\text{cutval}(e)$ Equation

#### 1. Mathematical Sub-Component Formula
Removing a tree edge $e = (u, v) \in E_T$ disconnects the feasible spanning tree $T$ into two disjoint components: $T_{\text{tail}}(e)$ containing tail node $u$, and $T_{\text{head}}(e)$ containing head node $v$.

The **cut value** $\text{cutval}(e)$ measures the net change in total weighted edge length per unit rank shift of $T_{\text{head}}(e)$:

$$\text{cutval}(e) = \sum_{g \in \text{InCut}(e)} w(g) - \sum_{g \in \text{OutCut}(e)} w(g)$$

Where:
- $\text{OutCut}(e) = \{ (x, y) \in E \mid x \in T_{\text{tail}}(e), y \in T_{\text{head}}(e) \}$
- $\text{InCut}(e) = \{ (x, y) \in E \mid x \in T_{\text{head}}(e), y \in T_{\text{tail}}(e) \}$

#### 2. Concrete Numerical Graph Example
Consider a 4-node graph $V = \{A, B, C, D\}$ with tree edges $E_T = \{(A, B), (A, C), (C, D)\}$ and all edge weights $w = 1$.

Evaluate tree edge $e = (A, C)$:
- Removing $e$ forms $T_{\text{tail}}(e) = \{A, B\}$ and $T_{\text{head}}(e) = \{C, D\}$.
- Directed edges in graph $G$:
  - $\text{OutCut}(e) = \{ (A, C), (B, D) \}$, with weights $w(A, C) = 1$ and $w(B, D) = 1 \implies \sum_{\text{OutCut}} w = 1 + 1 = 2$.
  - $\text{InCut}(e) = \{ (D, B) \}$, with weight $w(D, B) = 1 \implies \sum_{\text{InCut}} w = 1$.

Step-by-step arithmetic:
$$\text{cutval}(e) = \sum_{\text{InCut}} w - \sum_{\text{OutCut}} w = 1 - 2 = -1$$

Because $\text{cutval}(e) = -1 < 0$, shifting head component $T_{\text{head}}(e) = \{C, D\}$ down by $+1$ will strictly decrease the overall objective function!

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM COMPUTE_CUT_VALUE(leaving_edge, tail_component, head_component, all_edges)
    INPUT: leaving edge (u, v), set of tail nodes, set of head nodes, list of all edges
    OUTPUT: integer cut value

    in_cut_weight <- 0
    out_cut_weight <- 0

    FOR EACH edge IN all_edges:
        src_in_tail <- edge.source IN tail_component
        tgt_in_head <- edge.target IN head_component
        src_in_head <- edge.source IN head_component
        tgt_in_tail <- edge.target IN tail_component

        IF src_in_tail AND tgt_in_head THEN
            out_cut_weight <- out_cut_weight + edge.weight
        END IF
        IF src_in_head AND tgt_in_tail THEN
            in_cut_weight <- in_cut_weight + edge.weight
        END IF
    END FOR

    RETURN in_cut_weight - out_cut_weight
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.2: Tree Edge Cut Value Calculation (cutval(e) = -1)

       Tail Component T_tail = {A, B}         Head Component T_head = {C, D}
       ┌─────────────────────────────┐       ┌─────────────────────────────┐
       │ [ A ] (r=0) ───(w=1)───────┼──────►│ [ C ] (r=1)                 │
       │   │                         │ e(A,C)│   │                         │
       │ (w=1)                       │       │ (w=1)                       │
       │   ▼                         │       │   ▼                         │
       │ [ B ] (r=1) ───(w=1)───────┼──────►│ [ D ] (r=2)                 │
       └─────────────────────────────┘ Out1  └──────────────┬──────────────┘
                                    (B,D)                   │ InCut (D,B)
                                                            │ w(D,B) = 1
                                                            ▼
       Arithmetic: InCut Sum = 1, OutCut Sum = 2
       cutval(e) = 1 - 2 = -1 < 0  ==> Pivot Required!
```

---

### Step 2.3: Simplex Pivot Execution & Minimum Slack Rank Shift

#### 1. Mathematical Sub-Component Formula
When a tree edge $e \in E_T$ has $\text{cutval}(e) < 0$, it is removed from the tree (leaving edge). To restore tree connectivity while maintaining feasibility, we select an entering non-tree edge $e' \in \text{InCut}(e)$ with minimum slack $\gamma$:

$$\gamma = \min_{g \in \text{InCut}(e)} g(g)$$

All node ranks in the head component $T_{\text{head}}(e)$ are shifted by $+\gamma$:

$$r(z) \leftarrow r(z) + \gamma \quad \forall z \in T_{\text{head}}(e)$$

The net objective function improvement is exactly $\Delta f = \text{cutval}(e) \cdot \gamma < 0$.

#### 2. Concrete Numerical Graph Example
From Step 2.2, tree edge $e = (A, C)$ has $\text{cutval}(e) = -1$.
- `InCut(e)` contains non-tree edge $e' = (D, B)$ with $r(D) = 2, r(B) = 1, \delta(D, B) = 0$ (or slack $g(e') = 1$).
- Minimum slack calculation:
  $$\gamma = g(e') = 1$$
- Rank Shift for $T_{\text{head}} = \{C, D\}$:
  $$r(C) \leftarrow 1 + 1 = 2$$
  $$r(D) \leftarrow 2 + 1 = 3$$
- Objective Function Change:
  $$\Delta f = \text{cutval}(e) \cdot \gamma = (-1) \cdot 1 = -1 \quad \text{(Objective reduced by 1)}$$

#### 3. Targeted Sub-Step Pseudocode
```text
ALGORITHM EXECUTE_SIMPLEX_PIVOT(head_component, in_cut_edges, ranks)
    INPUT: set of head component nodes, list of in-cut edges, map of node ranks
    OUTPUT: minimum slack value, entering edge chosen

    min_slack <- INFINITY
    entering_edge <- null

    FOR EACH edge IN in_cut_edges:
        slack <- CALCULATE_EDGE_SLACK(edge.source, edge.target, ranks, edge.min_len)
        IF slack < min_slack THEN
            min_slack <- slack
            entering_edge <- edge
        END IF
    END FOR

    FOR EACH node IN head_component:
        ranks[node] <- ranks[node] + min_slack
    END FOR

    RETURN min_slack, entering_edge
```

#### 4. Sub-Step ASCII Infographic
```
Step 2.3: Pivot Rank Shift & Tree Reconstruction

  BEFORE PIVOT (cutval = -1, gamma = 1):
  Layer 0:  [ A ] (r=0)
  Layer 1:  [ B ] (r=1)  ──e(A,C)──►  [ C ] (r=1)
  Layer 2:                            [ D ] (r=2)

  PIVOT TRANSFORMATION:
  1. Remove leaving edge e(A, C)
  2. Select entering edge e'(D, B) with gamma = 1
  3. Add +1 to ranks of T_head = {C, D}

  AFTER PIVOT (All tree edges tight, objective decreased by 1):
  Layer 0:  [ A ] (r=0)
  Layer 1:  [ B ] (r=1)
  Layer 2:               ──e'(D,B)──► [ C ] (r=2)
  Layer 3:                            [ D ] (r=3)
```

---

## 3. Step-by-Step Computational Pseudocode

The full Network Simplex algorithm consists of initial tight tree construction, cut value evaluation, and pivot iterations.

```text
ALGORITHM INITIALIZE_FEASIBLE_TREE(graph)
    INPUT: directed acyclic graph
    OUTPUT: spanning tree, map of initial node ranks

    ranks <- empty map
    topological_order <- TOPOLOGICAL_SORT(graph)

    FOR EACH node IN topological_order:
        max_rank <- 0
        FOR EACH in_edge IN IN_EDGES(graph, node):
            pred_rank <- ranks[in_edge.source]
            max_rank <- MAX(max_rank, pred_rank + in_edge.min_len)
        END FOR
        ranks[node] <- max_rank
    END FOR

    tree <- empty undirected graph
    FOR EACH node IN NODES(graph):
        ADD_NODE(tree, node)
    END FOR

    WHILE COUNT_EDGES(tree) < COUNT_NODES(graph) - 1 DO
        non_tree_edges <- edges in graph not in tree
        min_slack_edge <- null
        min_slack <- INFINITY

        FOR EACH edge IN non_tree_edges:
            slack <- ranks[edge.target] - ranks[edge.source] - edge.min_len
            IF IS_INCIDENT(tree, edge.source) != IS_INCIDENT(tree, edge.target) THEN
                IF slack < min_slack THEN
                    min_slack <- slack
                    min_slack_edge <- edge
                END IF
            END IF
        END FOR

        IF min_slack_edge IS null THEN
            BREAK
        END IF

        IF min_slack > 0 THEN
            unvisited_component <- GET_UNVISITED_COMPONENT(tree, min_slack_edge)
            FOR EACH node IN unvisited_component:
                ranks[node] <- ranks[node] + min_slack
            END FOR
        END IF

        ADD_EDGE(tree, min_slack_edge)
    END WHILE

    RETURN tree, ranks


ALGORITHM NETWORK_SIMPLEX(graph)
    INPUT: directed graph
    OUTPUT: map of final node ranks

    tree, ranks <- INITIALIZE_FEASIBLE_TREE(graph)

    WHILE TRUE DO
        cut_values <- COMPUTE_CUT_VALUES(tree, graph)
        leaving_edge <- null

        FOR EACH (edge, cut_val) IN cut_values:
            IF cut_val < 0 THEN
                leaving_edge <- edge
                BREAK
            END IF
        END FOR

        IF leaving_edge IS null THEN
            BREAK // All cut values non-negative: globally optimal
        END IF

        tail_component, head_component <- SPLIT_TREE_BY_EDGE(tree, leaving_edge)

        entering_edge <- null
        min_slack <- INFINITY

        FOR EACH edge IN EDGES(graph):
            IF edge.source IN head_component AND edge.target IN tail_component THEN
                slack <- ranks[edge.target] - ranks[edge.source] - edge.min_len
                IF slack < min_slack THEN
                    min_slack <- slack
                    entering_edge <- edge
                END IF
            END IF
        END FOR

        IF entering_edge IS null THEN
            ERROR "Graph contains unresolvable cycle or invalid cut"
        END IF

        FOR EACH node IN head_component:
            ranks[node] <- ranks[node] + min_slack
        END FOR

        REMOVE_EDGE(tree, leaving_edge)
        ADD_EDGE(tree, entering_edge)
    END WHILE

    min_rank <- MINIMUM(ranks)
    FOR EACH node IN ranks:
        ranks[node] <- ranks[node] - min_rank
    END FOR

    RETURN ranks
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
