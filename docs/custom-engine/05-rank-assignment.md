← [Previous: Cycle Breaking](./04-cycle-breaking.md) | [Index](./README.md) | [Next: Crossing Minimization →](./06-crossing-minimization.md)

# Rank Assignment

Once we've broken all cycles in a graph (as covered in the previous chapter), the graph becomes a Directed Acyclic Graph (DAG). Our next task is to assign each node to a vertical level, known as a **rank**. 

This chapter explains how we compute these ranks and prepare the graph for clean rendering by ensuring no edges skip layers.

## The Goal: What is a Rank?

A rank is simply an integer denoting a horizontal layer in our layout. If node A is assigned `rank 0` and node B is assigned `rank 2`, node A will be drawn above node B. 

The fundamental rule of rank assignment is: **if there is a directed edge from A to B, the rank of A must be strictly less than the rank of B.**

### A Tiny Example (Atoms)

Imagine a simple chain of 4 nodes:

```
(A) → (B) → (C) → (D)
```

To satisfy our rule, a valid rank assignment could be:
- Node A: Rank 0
- Node B: Rank 1
- Node C: Rank 2
- Node D: Rank 3

Every edge points downwards, perfectly respecting the constraints. 

## Topological Sort and Longest-Path Layering (Molecules)

How do we compute these ranks automatically? We use two concepts: **Topological Sort** and **Longest-Path Layering**.

### Topological Sort

Topological sorting gives us a sequence where every node appears *before* all the nodes it points to. We use **Kahn's algorithm**, which relies on tracking the **in-degree** of each node (the number of incoming edges).

Let's look at a 5-node example:
```
(A) → (B) → (D)
      ↓      ↑
     (C) ----+
(E) ---------+
```

Here's how Kahn's algorithm processes this graph step-by-step:

| Step | Queue (In-degree 0) | Processed Node | Edges Removed | Next In-degrees |
|---|---|---|---|---|
| 1 | `[A, E]` | **A** | A → B | `B:0`, `C:1`, `D:2` |
| 2 | `[E, B]` | **E** | E → D | `C:1`, `D:1` |
| 3 | `[B]` | **B** | B → C, B → D | `C:0`, `D:0` |
| 4 | `[C, D]` | **C** | C → D | `D:-1` (already 0) |
| 5 | `[D]` | **D** | *none* | *none* |

The resulting order is: `A, E, B, C, D`.

### Longest-Path Layering

Now that we have the nodes ordered, we can assign ranks. We use a **longest-path** approach:

**For each node, its rank is exactly `1 + the maximum rank of all its predecessors`.**

Why longest-path? Because it pushes nodes down as far as their longest dependency chain requires, keeping edges tight. If we used shortest-path, we might place a node near the top, forcing other edges connected to it to stretch unnaturally long across the graph.

Let's trace this formula over our topological order (`A, E, B, C, D`):

| Node | Predecessors | Max Predecessor Rank | Computed Rank |
|---|---|---|---|
| A | None | (Default: -1) | 0 |
| E | None | (Default: -1) | 0 |
| B | `[A]` | `rank(A)=0` | 1 |
| C | `[B]` | `rank(B)=1` | 2 |
| D | `[B, C, E]` | `max(rank(B)=1, rank(C)=2, rank(E)=0) = 2` | 3 |

See how `D` is forced all the way down to Rank 3? That's because of the longest path `A → B → C → D`.

## Dummy Nodes (Cells)

We have our ranks, but we have a problem. Look at the edge `E → D` from our example.
- `E` is at Rank 0
- `D` is at Rank 3

The edge spans 3 ranks! If we try to draw this edge directly, it will slice right through layers 1 and 2, potentially overlapping other nodes and creating a chaotic layout. We can't route cleanly around intermediate layers without points to anchor the lines.

**The Solution:** We insert **dummy nodes** (virtual nodes) at every intermediate rank. The edge `E → D` gets broken down:
`E (rank 0)  →  Virtual_1 (rank 1)  →  Virtual_2 (rank 2)  →  D (rank 3)`

### How Many Dummies?
For any edge spanning `S` ranks, we insert exactly `S - 1` dummy nodes.

By doing this across the entire graph, **every single edge now spans exactly one layer**. The graph has been transformed into a perfectly structured tier cake. We call this structure the **Expanded Layer Graph**.

## The Full Pipeline (Organisms)

The algorithms described here are implemented in the engine. You can trace this logic in the source code:

1. **Topological Sort and Ranking:** The `assignRanks` function implements Kahn's algorithm and the longest-path assignment. See [rankAssignment.ts](../../src/engine/layout/custom/rankAssignment.ts#L11).
2. **Layer Graph Expansion:** The `buildLayerGraph` function handles grouping nodes into layer arrays and inserting the virtual dummy nodes. See [layerGraph.ts](../../src/engine/layout/custom/layerGraph.ts#L14).

The output of this phase is an ordered list of layers, each containing a mix of real and virtual nodes. This cleanly structured output is exactly what the next phase requires.

As we move forward, the engine will only ever look at these adjacent layers. Next up, we will rearrange the nodes within each of these layers to prevent the lines between them from crossing.

---
← [Previous: Cycle Breaking](./04-cycle-breaking.md) | [Index](./README.md) | [Next: Crossing Minimization →](./06-crossing-minimization.md)
