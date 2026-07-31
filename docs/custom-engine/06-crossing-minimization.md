← [Previous: Rank Assignment](./05-rank-assignment.md) | [Index](./README.md) | [Next: Coordinate Assignment →](./07-coordinate-assignment.md)

# Crossing Minimization

At this point in the pipeline, our graph is neatly divided into horizontal layers, and every edge strictly connects a node in layer $L$ to a node in layer $L+1$. However, the *horizontal order* of nodes within each layer is currently arbitrary. 

If we draw the graph now, the edges will likely look like a tangled bird's nest. This chapter explains how we reorder the nodes within their layers to minimize edge crossings.

## What is a Crossing? (Atoms)

Let's look at a simple two-layer setup:

```text
Layer 0:    (A)       (B)
             | \     / |
             |  \   /  |
             |   \ /   |
             |    X    |
             |   / \   |
             |  /   \  |
             v v     v v
Layer 1:    (C)       (D)
```

Here, we have edges `A→C`, `A→D`, `B→C`, and `B→D`. Notice the `X` in the middle? That's an edge crossing between `A→D` and `B→C`.

**The mathematical rule of a crossing:** Two edges `(u1 → v1)` and `(u2 → v2)` will cross if and only if their horizontal order in the top layer is different from their horizontal order in the bottom layer. 
In other words, if `u1` is left of `u2`, but `v1` is right of `v2`, the lines *must* cross.

Can we eliminate the crossing in the picture above? Yes! If we swap `C` and `D` in Layer 1, or swap `A` and `B` in Layer 0, the lines uncross:

```text
Layer 0:    (A)       (B)
             |         |
             | \     / |
             |  \   /  |
             |   \ /   |
             v    v    v
Layer 1:    (D)       (C)
```
*(Wait, wait—if we swap C and D, `A→C` and `B→D` now cross! In a complete bipartite graph like this, a crossing is mathematically unavoidable. But the goal is to **minimize** them, finding the arrangement that yields the fewest overall.)*

## The Barycenter Heuristic (Molecules)

Finding the mathematically perfect order that yields the absolute minimum number of crossings is computationally impossible for large graphs (it's an NP-hard problem). Instead, we use a fast and highly effective heuristic: **Barycentric Sorting**.

The core idea is simple: **A node should be placed as close as possible to the average position of its neighbors.**

We compute the "barycenter" (average index) for each node based on the positions of the nodes it connects to in the adjacent layer.

### A Concrete Example

Imagine Layer 1 is fixed, and we want to reorder Layer 2.

**Layer 1 (fixed positions):**
- Pos 0: Node X
- Pos 1: Node Y
- Pos 2: Node Z

**Layer 2 (needs sorting):**
- Node A (connected to X and Z)
- Node B (connected to Y)
- Node C (connected to Z)

Let's calculate the barycenters for Layer 2:
- **Node A:** connects to X(0) and Z(2). Average = `(0 + 2) / 2 = 1.0`
- **Node B:** connects to Y(1). Average = `1.0`
- **Node C:** connects to Z(2). Average = `2.0`

Sorting Layer 2 by these barycenters gives us the order: `A, B, C` (or `B, A, C` depending on tie-breakers). By aligning nodes with the center of gravity of their connections, we drastically untangle the edges.

## Bidirectional Sweeps and Transposition (Cells)

Sorting one layer based on the layer above it is great, but what about the layer below it? To get the best results, we alternate directions in a process called **sweeping**.

1. **Downward Sweep:** We iterate from the top layer to the bottom. For each layer $L$, we fix layer $L-1$, compute barycenters for $L$ using its upward neighbors, and sort $L$.
2. **Upward Sweep:** We iterate from the bottom layer to the top. For each layer $L$, we fix layer $L+1$, compute barycenters for $L$ using its downward neighbors, and sort $L$.

A single pass down and up often reduces crossings massively (e.g., from 50 crossings down to 10). But doing it multiple times continues to refine the layout.

### Adjacent Transposition

Barycentric sorting is excellent, but it can occasionally get stuck in local minimums—situations where the averages look fine, but two adjacent nodes are flipped.

To fix this, after our sweeps, we perform an **Adjacent Transposition Pass**. We walk through every layer and look at adjacent pairs of nodes (e.g., node at index `i` and `i+1`). We temporarily swap them. If the total number of crossings in the graph *decreases*, we keep the swap. If it increases or stays the same, we swap them back. 

### Why 24 Sweeps?
In our engine, we run up to 24 sweeps (down and up alternating). We track the "best layout seen so far". If a sweep doesn't improve the best crossing count, we continue, but after several sweeps without improvement, the algorithm recognizes diminishing returns and terminates early. You can view this logic in `minimizeCrossings`.

## The Engine Implementation (Organisms)

This entire phase is self-contained within the `minimizeCrossings` function. 

- **Sweeps & Sorting:** You can see the barycenter calculations and sorting applied in both downward and upward directions.
- **Transposition:** The adjacent swapping loop guarantees we catch minor local tangles.
- **Counting:** The `countTotalGraphCrossings` function determines exactly how many intersections exist to validate improvements.

See the source code in [crossingMinimization.ts](../../src/engine/layout/custom/crossingMinimization.ts#L95).

With the layers perfectly ordered to minimize tangles, we finally have the topology mapped out. The graph is untangled. The next step is assigning exact X and Y pixel coordinates to these ordered nodes.

---
← [Previous: Rank Assignment](./05-rank-assignment.md) | [Index](./README.md) | [Next: Coordinate Assignment →](./07-coordinate-assignment.md)
