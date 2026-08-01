← [Previous](./README.md) | [Index](../README.md) | [Next](./02-our-integration-layer.md) →

# Dagre Internals: The Black Box

We use `dagre` as a third-party dependency. From GVUI's perspective, Dagre is a black box. We pass in a graph where nodes have known `width` and `height`, and we get back a graph where nodes have `x` and `y` coordinates, and edges have routing waypoints.

> [!IMPORTANT]
> **This is Library Context.** GVUI never modifies the internal Dagre code. This document explains the underlying concepts so you understand _why_ Dagre behaves the way it does, not to teach you how to maintain it.

All of this magic happens in a single line of code in our system. See [computeDagreLayout](../../src/engine/layout/nodeDimensions.ts#L478).
`dagre.layout(g)`

Dagre implements the standard Graphviz `dot` algorithm, which operates in three distinct phases.

---

## 1. Rank Assignment (Network Simplex)

The first step in drawing a hierarchical graph is deciding which "row" (or rank) each node belongs to.

**The Problem:** Nodes need to flow in a single direction (usually downwards). If edges point backwards, the diagram becomes chaotic. We need a mathematical way to enforce this directionality while keeping the diagram as compact as possible.
**The Solution:** Dagre treats this as a minimum-cost flow problem, solving it with the **Network Simplex** algorithm. It assigns ranks to minimize the total length of all edges, subject to the strict constraint that every edge must have a length of at least 1 (it must point downwards to a lower rank).

### Concrete Example

Consider 3 nodes: `A`, `B`, and `C`.
Edges: `A → B`, `A → C`, and `B → C`.

If we just blindly placed nodes based on distance from A:

- Rank 0: `A`
- Rank 1: `B` and `C` (since both connect to `A`)

But wait! We have an edge `B → C`. If both are on Rank 1, the edge is horizontal (length 0). This violates our constraint that edges must point downwards (length $\ge$ 1).

Network Simplex optimizes this:

1. `A` is placed at **Rank 0**.
2. `B` is placed at **Rank 1** (satisfying `A → B`).
3. `C` is pushed to **Rank 2** (satisfying `B → C`). The edge `A → C` now spans two ranks (length 2). Total edge length is minimized while keeping all edges pointing down.

---

## 2. Crossing Reduction (Median Ordering)

Once nodes are assigned to rows, Dagre must decide their left-to-right order within each row.

**The Problem:** If nodes are placed randomly in a row, edges will cross over each other unnecessarily, creating visual spaghetti. We want to untangle them.
**The Solution:** Finding the absolute minimum number of crossings for a whole graph is computationally impossible (NP-hard). Instead, Dagre uses a fast heuristic called **Median Ordering**. It sweeps through the ranks. For a node in Rank $N$, it looks at the nodes it connects to in the previous rank. It calculates the median (middle) position of those neighbors, and tries to place the node directly below that median.

### Concrete Example

Imagine Rank 0 has four nodes positioned horizontally: `W(x=10)`, `X(x=20)`, `Y(x=30)`, `Z(x=40)`.
In Rank 1, we have a node `Node 1` that connects to `W`, `Y`, and `Z`.

1. Find the connected neighbors' X-positions: `10`, `30`, `40`.
2. Find the median of those positions: `30`.
3. `Node 1` wants to be placed at X=30 in Rank 1.

By placing `Node 1` directly under the bulk of its connections, Dagre minimizes the chance of its edges stretching across the entire diagram and crossing other lines.

---

## 3. Coordinate Assignment (Brandes-Köpf)

Finally, Dagre translates these abstract rows and orderings into exact X/Y pixel coordinates.

**The Problem:** Nodes have varying widths. If we just placed them on a grid, large nodes would overlap small ones. We want straight vertical edges where possible, and we want the graph to be compact without any bounding boxes overlapping.
**The Solution:** Dagre implements the **Brandes-Köpf** algorithm. It runs four separate alignment passes, trying to align nodes with their median neighbors to keep edges perfectly straight.

Why four passes? Any single pass is biased. A Top-Left pass will pack nodes tightly to the top-left, making the right side look sparse and uneven.

### Concrete Example

Let's say `Node B` could be placed anywhere between x=100 and x=200 without overlapping other nodes.

- **Pass 1 (Top-Left bias):** Places `B` at x=100.
- **Pass 2 (Top-Right bias):** Places `B` at x=200.
- **Pass 3 (Bottom-Left bias):** Places `B` at x=120.
- **Pass 4 (Bottom-Right bias):** Places `B` at x=180.

Dagre takes these four layouts, resolves any glaring conflicts, and averages the results: `(100+200+120+180)/4 = 150`. `Node B` gets its final coordinate at `x=150`, resulting in a balanced, centered layout rather than one skewed to a corner.
