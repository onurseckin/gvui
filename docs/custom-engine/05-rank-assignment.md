← [Previous: Cycle Breaking](./04-cycle-breaking.md) | [Index](./README.md) | [Next: Crossing Minimization →](./06-crossing-minimization.md)

# Rank Assignment

Once we've broken all cycles in a graph (as covered in the previous chapter), the graph becomes a Directed Acyclic Graph (DAG). Our next task is to assign each node to a vertical level, known as a **rank**.

This chapter explains how we compute these ranks and prepare the graph for clean rendering by ensuring no edges skip layers.

## Atoms: What is a Rank?

A rank is simply an integer denoting a horizontal layer in our layout. If node A is assigned `rank 0` and node B is assigned `rank 2`, node A will be drawn above node B.

The fundamental rule of rank assignment is: **if there is a directed edge from A to B, the rank of A must be strictly less than the rank of B.**

### A Tiny Example

Imagine a simple chain of 4 nodes:

```text
(A) → (B) → (C) → (D)
```

To satisfy our rule, a valid rank assignment could be:

- Node A: Rank 0
- Node B: Rank 1
- Node C: Rank 2
- Node D: Rank 3

Every edge points downwards, perfectly respecting the constraints.

## Molecules: Topological Sort and Layering

How do we compute these ranks automatically? We use two concepts: **Topological Sort** and **Longest-Path Layering**.

### Traced Topological Sort (Kahn's Algorithm)

Topological sorting gives us a sequence where every node appears _before_ all the nodes it points to. We use **Kahn's algorithm**, which relies on tracking the **in-degree** of each node (the number of incoming edges).

Let's trace Kahn's algorithm on this 6-node graph:

```text
(A) → (B) → (D)
  ↘   ↓      ↑
   (C) → (E) → (F)
```

**Initial In-degrees:** A:0, B:1, C:2 (from A, B), D:2 (from B, F), E:1, F:1

| Step | Queue (In-degree 0) | Processed Node | Edges Removed | Updated In-degrees |
| ---- | ------------------- | -------------- | ------------- | ------------------ |
| 1    | `[A]`               | **A**          | A→B, A→C      | `B:0`, `C:1`       |
| 2    | `[B]`               | **B**          | B→D, B→C      | `D:1`, `C:0`       |
| 3    | `[C]`               | **C**          | C→E           | `E:0`              |
| 4    | `[E]`               | **E**          | E→F           | `F:0`              |
| 5    | `[F]`               | **F**          | F→D           | `D:0`              |
| 6    | `[D]`               | **D**          | _none_        | _none_             |

Resulting topological order: `A, B, C, E, F, D`. Notice how `D` comes last because it depends on `F`, which depends on `E`, etc.

### Longest-Path vs. Shortest-Path

Now we assign ranks. We use a **longest-path** approach:
**For each node, its rank is `1 + the maximum rank of all its predecessors`.**

Why longest-path? Let's compare it to shortest-path on the graph from the previous section.

**Shortest-Path Approach (Bad):**
Rank is `1 + the minimum rank of all predecessors`.

- A = 0
- B = 1 (from A)
- C = 1 (from A) ... wait, if B is 1 and C is 1, the edge B→C is perfectly horizontal!
- D = 2 (from B)
- E = 2 (from C)
- F = 3 (from E)

_Visualizing Shortest-Path:_

```text
Rank 0:  (A)
Rank 1:  (B) → (C)  <-- Bad! Horizontal edge!
Rank 2:  (D)   (E)
Rank 3:        (F)
```

This creates horizontal edges, which ruin the hierarchical downward flow.

**Longest-Path Approach (Good):**
Rank is `1 + the maximum rank of all predecessors`.

- A = 0
- B = 1 (max of [A=0])
- C = 2 (max of [A=0, B=1])
- E = 3 (max of [C=2])
- F = 4 (max of [E=3])
- D = 5 (max of [B=1, F=4])

_Visualizing Longest-Path:_

```text
Rank 0:  (A)
Rank 1:  (B)
Rank 2:  (C)
Rank 3:  (E)
Rank 4:  (F)
Rank 5:  (D)
```

Longest-path pushes nodes down as far as their longest dependency chain requires, keeping edges tight and strictly downward-flowing.

## Cells: Dummy Nodes and Edge Span

We have our ranks, but we have a problem. Look at the edge `B → D` in our longest-path layout.

- `B` is at Rank 1
- `D` is at Rank 5

The edge spans 4 ranks! If we try to draw this edge directly, it will slice right through layers 2, 3, and 4, potentially overlapping `C`, `E`, and `F`. We can't route cleanly around intermediate layers without points to anchor the lines.

**The Solution:** We insert **dummy nodes** (virtual nodes) at every intermediate rank. The edge `B → D` gets broken down:

_Before Dummy Insertion:_
`B(R1) -----------------------------------> D(R5)`

_After Dummy Insertion:_
`B(R1) → Virt1(R2) → Virt2(R3) → Virt3(R4) → D(R5)`

### How Many Dummies?

For any edge spanning `S` ranks, we insert exactly `S - 1` dummy nodes.

By doing this across the entire graph, **every single edge now spans exactly one layer**. The graph has been transformed into a perfectly structured tier cake. We call this structure the **Expanded Layer Graph**.

## Organisms: Disconnected Components and Pipeline

What happens if the graph has multiple disconnected components (e.g., islands of nodes that don't link to each other)? Kahn's algorithm naturally handles this: all components with in-degree 0 are queued initially. They are assigned ranks independently, meaning the tops of all disconnected subgraphs will align cleanly at Rank 0.

The algorithms described here are implemented in the engine. You can trace this logic in the source code:

1. **Topological Sort and Ranking:** The `assignRanks` function implements Kahn's algorithm and the longest-path assignment. See [rankAssignment.ts](../../src/engine/layout/custom/rankAssignment.ts#L11).
2. **Layer Graph Expansion:** The `buildLayerGraph` function handles grouping nodes into layer arrays and inserting the virtual dummy nodes. See [layerGraph.ts](../../src/engine/layout/custom/layerGraph.ts#L14).

The output of this phase is an ordered list of layers, each containing a mix of real and virtual nodes. As we move forward, the engine will only ever look at these adjacent layers. Next up, we will rearrange the nodes within each of these layers to prevent the lines between them from crossing.

---

← [Previous: Cycle Breaking](./04-cycle-breaking.md) | [Index](./README.md) | [Next: Crossing Minimization →](./06-crossing-minimization.md)
