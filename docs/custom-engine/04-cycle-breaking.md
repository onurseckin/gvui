← [Cycle Detection](./03-cycle-detection.md) | [Index](./README.md) | [Next: Rank Assignment →](./05-rank-assignment.md)

# Chapter 4: Cycle Breaking

Welcome to Chapter 4. In the previous chapter, we learned how to find cycles using Strongly Connected Components (SCCs). Now, we need to deal with them.

Before we can organize our graph into neat horizontal or vertical layers, we need a structure that has a strict hierarchy. If our graph has a cycle, that hierarchy is impossible. 

---

## The Problem: The Infinite Loop of Ranking

Layered layout (often called Sugiyama layout) assigns every node a **rank** (a vertical or horizontal tier). The fundamental rule of ranking is:

> *If node `A` points to node `B`, then `A` must have a lower rank (appear earlier/higher) than `B`.*

But what if `A` points to `B`, and `B` points to `A`?
- `A` must be above `B`
- `B` must be above `A`

This is a logical contradiction. The layout engine physically cannot assign ranks to cycles.

### The Simplest Solution (And Why It Fails)

To fix this, we have to "break" the cycle by reversing one of the edges. If we temporarily reverse `B → A` to point `A → B`, the cycle is gone. We can rank the nodes, position them, and then when we actually draw the graph on the screen, we draw the arrow pointing back the original way (from `B` to `A`), typically routing it upwards to show it goes against the hierarchy.

But **which** edge do we reverse?

Imagine a large system architecture: a user clicks a button, which calls an API, which queries a database, which updates a cache, which sends a notification back to the user.
If we randomly pick the "API → Database" edge to reverse, the layout engine will think the Database is the top-level trigger, and the API is a low-level dependency. The resulting diagram will be drawn completely upside-down compared to the user's mental model.

We need a smart way to choose which edges to reverse so the resulting hierarchy makes logical sense.

---

## Edge Classification

To make sense of the structure, the layout engine classifies edges into four roles. You can see this in the `classifyEdgeRoles` function in [`cycleBreaking.ts`](../../src/engine/layout/custom/cycleBreaking.ts#L10-L35).

1. **Forward Edges**: Point from a lower rank to a higher rank. These represent the natural flow of the graph.
2. **Feedback Edges**: Point from a higher rank back to a lower rank. These are the edges we reverse to break cycles.
3. **Cross Edges**: Point between nodes at the same rank, or skip across branches without representing a true parent-child hierarchy.
4. **Self-Loops**: Edges where the source and target are the same node (`A → A`).

Our primary goal in cycle breaking is to correctly label the minimal number of edges as **Feedback Edges**.

### The Concept of "Net Flow"

How do we guess the "natural" direction of a graph when it's tangled in a cycle? We look at the flow of edges through each node.

- **In-Degree**: How many edges point *to* the node.
- **Out-Degree**: How many edges point *away from* the node.
- **Net Flow**: `Out-Degree - In-Degree`

A node with a high positive Net Flow has many outgoing edges and few incoming edges. It acts like a source or a starting point.
A node with a negative Net Flow has many incoming edges. It acts like a sink or an endpoint.

If we have to guess the hierarchy, we should put nodes with high Net Flow at the top, and nodes with low Net Flow at the bottom.

---

## The Eades Greedy Algorithm

To break cycles efficiently while keeping the diagram looking natural, this engine uses a greedy algorithm popularized by Peter Eades. 

Instead of just looking for cycles and picking an edge, Eades algorithm builds a **sequence** of nodes from left to right. Once the sequence is built, any edge that points from right to left (backwards) is marked as a feedback edge and reversed.

### The Algorithm Steps

1. Keep two lists: a `LeftList` (nodes that belong near the top) and a `RightList` (nodes that belong near the bottom).
2. Look at all active nodes in the SCC:
   - **Step A**: If there is a **Sink** (a node with Out-Degree = 0), remove it and prepend it to the `RightList`.
   - **Step B**: If there is a **Source** (a node with In-Degree = 0), remove it and append it to the `LeftList`.
   - **Step C**: If there are no pure sinks or sources, find the node with the **highest Net Flow** (Out - In). Remove it and append it to the `LeftList`.
3. When removing a node, remove all its connected edges and update the degrees of the remaining nodes.
4. Repeat until all nodes are removed.
5. Combine `LeftList` + `RightList` into the final sequence.
6. For every edge `U → V`, if `U` appears *after* `V` in the sequence, mark it as a **Feedback** edge.

---

## Traced Execution

Let's watch this algorithm run on a complex graph with multiple overlapping cycles.

**The Graph:**
- `A → B`
- `B → C`
- `B → D`
- `C → A`
- `D → E`
- `E → F`
- `E → B`
- `F → A`

This forms a single Strongly Connected Component (every node can reach every other node). Let's trace it step by step.

### Initialization

We calculate the initial degrees for all nodes:

| Node | In-Degree | Out-Degree | Net Flow (Out - In) |
|------|-----------|------------|---------------------|
| A    | 2 (C, F)  | 1 (B)      | -1                  |
| B    | 2 (A, E)  | 2 (C, D)   | 0                   |
| C    | 1 (B)     | 1 (A)      | 0                   |
| D    | 1 (B)     | 1 (E)      | 0                   |
| E    | 1 (D)     | 2 (B, F)   | +1                  |
| F    | 1 (E)     | 1 (A)      | 0                   |

`LeftList` = `[]`
`RightList` = `[]`

### Iteration 1

1. **Sink Check**: Any node with Out-Degree 0? No.
2. **Source Check**: Any node with In-Degree 0? No.
3. **Max Net Flow**: Node `E` has the highest Net Flow (+1).

We pick **E** and add it to `LeftList`.
`LeftList` = `[E]`

We remove `E` and its outgoing edges (`E → B`, `E → F`) and incoming edge (`D → E`). We update the degrees of its neighbors:
- `B` loses 1 In-Degree
- `F` loses 1 In-Degree
- `D` loses 1 Out-Degree

### Iteration 2

Updated State:

| Node | In-Degree | Out-Degree |
|------|-----------|------------|
| A    | 2         | 1          |
| B    | 1 *(was 2)*| 2          |
| C    | 1         | 1          |
| D    | 1         | 0 *(was 1)*|
| F    | 0 *(was 1)*| 1          |

1. **Sink Check**: Yes! Node `D` now has an Out-Degree of 0.

We pick **D** and prepend it to `RightList`.
`RightList` = `[D]`

We remove `D` and its incoming edge (`B → D`).
- `B` loses 1 Out-Degree.

### Iteration 3

Updated State:

| Node | In-Degree | Out-Degree |
|------|-----------|------------|
| A    | 2         | 1          |
| B    | 1         | 1 *(was 2)*|
| C    | 1         | 1          |
| F    | 0         | 1          |

1. **Sink Check**: None.
2. **Source Check**: Yes! Node `F` has an In-Degree of 0.

We pick **F** and append it to `LeftList`.
`LeftList` = `[E, F]`

Remove `F` and its edge (`F → A`).
- `A` loses 1 In-Degree.

### Iteration 4

Updated State for A, B, C:
- `A`: In=1, Out=1 (Net = 0)
- `B`: In=1, Out=1 (Net = 0)
- `C`: In=1, Out=1 (Net = 0)

1. Sink? No. Source? No. Max Flow? All are 0.
We tie-break alphabetically and pick **A**. Append to `LeftList`.
`LeftList` = `[E, F, A]`

Remove `A` and edges (`A → B`, `C → A`).
- `B` loses 1 In-Degree (now 0).
- `C` loses 1 Out-Degree (now 0).

### Iterations 5 & 6

- `C` has Out-Degree 0 (Sink). Prepend to `RightList`: `[C, D]`
- `B` has Out-Degree 0 (Sink). Prepend to `RightList`: `[B, C, D]`

### Final Classification

We combine the lists:
**Sequence:** `[E, F, A, B, C, D]`
*(Positions: E=0, F=1, A=2, B=3, C=4, D=5)*

Now we look at our original edges. If an edge goes from a higher position back to a lower position, it is a Feedback Edge!

- `A(2) → B(3)`: Forward
- `B(3) → C(4)`: Forward
- `B(3) → D(5)`: Forward
- **`C(4) → A(2)`: Feedback! (Reverse to A → C)**
- **`D(5) → E(0)`: Feedback! (Reverse to E → D)**
- `E(0) → F(1)`: Forward
- `E(0) → B(3)`: Forward
- `F(1) → A(2)`: Forward

By reversing just two edges (`C → A` and `D → E`), we completely eliminated all cycles. The graph is now a Directed Acyclic Graph (DAG)!

---

## Why Eades Over Alternatives?

When building a graph visualization engine, there are three common ways to break cycles. Here's why this engine uses Eades:

| Approach | How it works | Time Complexity | Quality | Why Rejected/Chosen |
|----------|--------------|-----------------|---------|---------------------|
| **DFS Reversal** | Run Depth First Search. If you hit an already visited node, reverse the edge. | **O(V + E)** (Fastest) | Very Poor | The edge chosen depends purely on node iteration order. It creates chaotic, upside-down hierarchies. Rejected. |
| **Integer Linear Programming (ILP)** | Formulate an equation to mathematically find the absolute minimum number of feedback edges. | **O(2^N)** (NP-Hard) | Perfect | Too slow for interactive web rendering. A graph with 100 nodes could freeze the browser. Rejected. |
| **Eades Greedy** | The algorithm we just traced. | **O(E)** | Very Good | The sweet spot. It runs instantly in the browser and practically guarantees a minimal or near-minimal number of feedback edges. **Chosen.** |

## Into the Pipeline

Once the `classifyEdgeRoles` function finishes, the layout engine has a guaranteed Directed Acyclic Graph. 

The original nodes and edges aren't deleted. Instead, the edges are tagged with `{ role: "feedback", reversed: true }`. 

In the next step of the pipeline, the ranking algorithm will pretend those feedback edges point forward. But later, during the final visual rendering, the drawing routines will look at that `role: "feedback"` tag, draw the arrow pointing correctly against the flow, and perhaps style it differently to show the user it's a cyclic dependency.

Now that we have a pure hierarchy, we can finally figure out exactly which row every node belongs in.

← [Cycle Detection](./03-cycle-detection.md) | [Index](./README.md) | [Next: Rank Assignment →](./05-rank-assignment.md)
