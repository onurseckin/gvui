← [Previous: Rank Assignment](./05-rank-assignment.md) | [Index](./README.md) | [Next: Coordinate Assignment →](./07-coordinate-assignment.md)

# Crossing Minimization

At this point in the pipeline, our graph is neatly divided into horizontal layers, and every edge strictly connects a node in layer $L$ to a node in layer $L+1$ (thanks to dummy nodes). However, the _horizontal order_ of nodes within each layer is currently arbitrary.

If we draw the graph now, the edges will likely look like a tangled bird's nest. This chapter explains how we reorder the nodes within their layers to minimize edge crossings.

## Atoms: What is a Crossing?

Let's look at a simple two-layer setup:

```text
Layer 0:    (A)       (B)
             | \     / |
             |  \   /  |
             |   \ /   |
             |    X    |  <-- Crossing!
             |   / \   |
             |  /   \  |
             v v     v v
Layer 1:    (C)       (D)
```

Here, we have edges `A→C`, `A→D`, `B→C`, and `B→D`. Notice the `X` in the middle? That's an edge crossing between `A→D` and `B→C`.

**The mathematical rule of a crossing:** Two edges `(u1 → v1)` and `(u2 → v2)` will cross if and only if their horizontal order in the top layer is different from their horizontal order in the bottom layer. In other words, if `u1` is left of `u2`, but `v1` is right of `v2`, the lines _must_ cross.

### The NP-Hard Problem

Can we find the perfectly optimal arrangement that yields the absolute minimum number of crossings? Technically yes, but practically no. Crossing minimization in bipartite graphs is an **NP-hard** problem. As the number of nodes grows, the number of possible permutations explodes factorially. Testing them all is computationally intractable.

Instead, we use a fast, highly effective heuristic: **Barycentric Sorting**.

## Molecules: The Barycenter Heuristic

The core idea is simple and intuitive: **A node should be placed as close as possible to the average position of its neighbors.**

We compute the "barycenter" (average index) for each node based on the positions of the nodes it connects to in the adjacent layer.

### Full Barycenter Computation Table

Imagine a larger example. Layer 0 is fixed, and we want to reorder Layer 1 to untangle the edges.

**Layer 0 (Fixed Positions):**

- Index 0: Node X
- Index 1: Node Y
- Index 2: Node Z
- Index 3: Node W

**Layer 1 (Needs Sorting):**

- Node A (connected to Y, W)
- Node B (connected to X)
- Node C (connected to Z)
- Node D (connected to X, Y, Z)

Let's calculate the barycenters for Layer 1. The formula is the sum of neighbor indices divided by the count of neighbors:

| Node | Neighbors in L0 | Neighbor Indices | Sum | Count | Barycenter (Sum/Count) |
| ---- | --------------- | ---------------- | --- | ----- | ---------------------- |
| A    | Y, W            | 1, 3             | 4   | 2     | **2.0**                |
| B    | X               | 0                | 0   | 1     | **0.0**                |
| C    | Z               | 2                | 2   | 1     | **2.0**                |
| D    | X, Y, Z         | 0, 1, 2          | 3   | 3     | **1.0**                |

Sorting Layer 1 by these barycenters yields:
`B (0.0), D (1.0), A (2.0), C (2.0)`
_(Note: A and C tied at 2.0; their original relative order is typically preserved as a tie-breaker)._

By aligning nodes with the center of gravity of their connections, we drastically untangle the edges without having to brute-force permutations.

## Cells: Bidirectional Sweeps

Sorting one layer based on the layer above it is great, but what about the layer below it? A graph has many layers. To get the best results, we alternate directions in a process called **sweeping**.

1. **Downward Sweep:** We iterate from top to bottom. For each layer $L$, we fix $L-1$, compute barycenters for $L$ using its upward neighbors, and sort $L$.
2. **Upward Sweep:** We iterate from bottom to top. For each layer $L$, we fix $L+1$, compute barycenters for $L$ using its downward neighbors, and sort $L$.

### Tracing a Bidirectional Sweep

Imagine a 3-layer graph with terrible initial crossings (e.g., 50 crossings).

- **Iteration 1 (Downward):** Sort L1 based on L0. Sort L2 based on L1. Crossings drop to 20.
- **Iteration 2 (Upward):** Sort L1 based on L2. Sort L0 based on L1. Crossings drop to 12.
- **Iteration 3 (Downward):** Sort L1 based on L0. Sort L2 based on L1. Crossings drop to 10.
- **Iteration 4 (Upward):** Sort L1 based on L2. Sort L0 based on L1. Crossings drop to 8.

The engine continues this sweeping process, storing the layout that achieved the lowest crossing count.

## Cells: Adjacent Transposition

Barycentric sorting is excellent, but it relies on averages. It can occasionally get stuck in local minimums where two adjacent nodes are perfectly flipped, causing a residual crossing that the averages mask.

To fix this, after our sweeps, we perform an **Adjacent Transposition Pass**.

**Example:**
Suppose after sweeping, we have nodes `[A, B, C]` in a layer. We have 5 total graph crossings.

1. We swap adjacent pair `(A, B)` -> layout is `[B, A, C]`. We recount crossings. If crossings = 4, we **keep** the swap!
2. Next pair `(A, C)` (since A is now in the middle) -> swap to `[B, C, A]`. Recount crossings. If crossings = 6, we **revert** the swap back to `[B, A, C]`.

This greedy adjacent swapping loop guarantees we catch minor local tangles that the barycenter heuristic missed.

## Organisms: The Convergence Argument

Why does the engine stop at a budget of **24 sweeps**?

Through empirical testing, crossing minimization using barycentric sweeps demonstrates massive diminishing returns. The first 4 sweeps usually eliminate 90% of the crossings. By sweep 12, the layout is typically oscillating between two identically scored states.

The engine tracks the "best layout seen so far". If a sweep doesn't improve the best crossing count, it continues, but after several consecutive sweeps without improvement, the algorithm recognizes convergence and terminates early to save CPU cycles. 24 is a hard upper bound to guarantee performance.

This entire phase is self-contained within the `minimizeCrossings` function. See the source code in [crossingMinimization.ts](../../src/engine/layout/custom/crossingMinimization.ts#L95) to explore the sweep loops, barycenter calculations, and transposition logic.

With the layers perfectly ordered to minimize tangles, we finally have the topology mapped out. The graph is untangled. The next step is assigning exact X and Y pixel coordinates to these ordered nodes.

---

← [Previous: Rank Assignment](./05-rank-assignment.md) | [Index](./README.md) | [Next: Coordinate Assignment →](./07-coordinate-assignment.md)
