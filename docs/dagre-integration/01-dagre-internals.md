← [Overview](./README.md) | [Index](../README.md) | [Next: Our Integration Layer →](./02-our-integration-layer.md)

# Dagre Internals: The Black Box

We use `dagre` as a third-party dependency. From GVUI's perspective, Dagre is a black box. We pass in a graph where nodes have known `width` and `height`, and we get back a graph where nodes have `x` and `y` coordinates, and edges have routing waypoints.

All of this magic happens in a single line of code in our system:
`dagre.layout(g)`

While we don't modify this code, it is important to understand conceptually what it is doing. Dagre implements the standard Graphviz `dot` algorithm, which operates in three distinct phases.

## 1. Rank Assignment (Network Simplex)

The first step in drawing a hierarchical graph is deciding which "row" (or rank) each node belongs to.

**The Problem:** Nodes need to flow in a single direction (usually downwards), meaning edges should point from lower ranks to higher ranks.
**The Solution:** Dagre uses the **Network Simplex** algorithm. It formulates the ranking problem as an optimization problem: minimize the total length of all edges, subject to the constraint that every edge must point downwards (length ≥ 1). 

*Example:*
If A → B, A → C, and B → C:
A is rank 0.
B is rank 1.
C is rank 2. (Even though A → C exists, C is pushed to rank 2 by the B → C edge).

## 2. Crossing Reduction (Median Ordering)

Once nodes are assigned to rows, Dagre must decide their left-to-right order within each row.

**The Problem:** Poor ordering leads to edges crossing over each other, creating visual spaghetti.
**The Solution:** Finding the absolute minimum number of crossings is NP-hard. Dagre uses a heuristic called **Median Ordering**. It sweeps up and down the graph multiple times. For a node in rank $N$, it looks at the positions of its connected neighbors in rank $N-1$ (or $N+1$). It calculates the median X-position of those neighbors, and attempts to place the node as close to that median as possible.

This heuristic is extremely fast and generally removes the vast majority of crossings, though it isn't perfect.

## 3. Coordinate Assignment (Brandes-Köpf)

Finally, Dagre translates these abstract rows and orderings into exact X/Y pixel coordinates.

**The Problem:** Nodes have varying widths. We want straight vertical edges where possible, and we want the graph to be compact without nodes overlapping.
**The Solution:** Dagre implements the **Brandes-Köpf** algorithm. It runs four separate alignment passes (Top-Left, Top-Right, Bottom-Left, Bottom-Right) trying to align nodes with their median neighbors to keep edges straight. It then resolves conflicts and averages the results of the four passes to produce the final, balanced X/Y coordinates.

## Summary

When we call `dagre.layout(g)`, Dagre:
1. Assigns Y-coordinates (ranks) via Network Simplex.
2. Sorts nodes left-to-right to minimize edge intersections.
3. Assigns exact X-coordinates via Brandes-Köpf.

Because Dagre handles all of this internally, our job in GVUI is simply to prepare the input correctly and polish the output. We explore how we do this in the next section.
