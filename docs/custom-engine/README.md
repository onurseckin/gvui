# Custom Engine Architecture

Welcome to the documentation for the **Custom Graph Layout Engine**.

This engine is a highly specialized, optimization-driven graph layout system designed specifically for directed dependency graphs (like software architectures, CI/CD pipelines, and state machines).

## What This Engine Does

The engine takes an abstract graph (a list of nodes and edges) and calculates precise `(x, y)` coordinates for every node, and exact routing paths for every edge.

### A Motivating Example

Imagine you have a complex graph with edge labels (badges).
Traditional layout engines like Dagre will often produce something like this:

```text
[   Node A   ]
   |     \
 (label1) \ (really long label 2)   <-- OVERLAP!
   |       \
[Node B]  [Node C]
```

Dagre doesn't understand the physical size of edge labels until it's too late, resulting in text that collides with other lines or nodes. Furthermore, Dagre routes edges as simple splines, which can be messy in dense graphs.

**The Custom Engine solves this by:**

1. Guaranteeing orthogonal (right-angled) edge routing.
2. Detecting spatial conflicts (overlaps) _after_ routing.
3. Iteratively expanding gaps and re-running the layout until the graph is perfectly conflict-free.

The result is a clean, orthogonal layout where every label has breathing room, and edges never slice through nodes.

## High-Level Pipeline

The engine operates by wrapping a traditional Sugiyama pipeline inside an A* state-space search. Here are the 10 core stages of the system:

```text
┌─────────────────────────────────────────────────────────────┐
│                 OPTIMIZATION LOOP (Search)                  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   NODE LAYOUT PIPELINE                │  │
│  │                                                       │  │
│  │  1. Normalize Graph                                   │  │
│  │     (Resolve sizes, mappings)                         │  │
│  │           ▼                                           │  │
│  │  2. Strong Connected Components (SCC)                 │  │
│  │     (Detect islands and cycles)                       │  │
│  │           ▼                                           │  │
│  │  3. Classify Edges (Cycle Breaking)                   │  │
│  │     (Temporarily flip back-edges)                     │  │
│  │           ▼                                           │  │
│  │  4. Rank Assignment                                   │  │
│  │     (Assign nodes to vertical layers)                 │  │
│  │           ▼                                           │  │
│  │  5. Build Layer Graph                                 │  │
│  │     (Insert dummy nodes for long edges)               │  │
│  │           ▼                                           │  │
│  │  6. Crossing Minimization                             │  │
│  │     (Sort nodes in layers horizontally)               │  │
│  │           ▼                                           │  │
│  │  7. Coordinate Assignment                             │  │
│  │     (Calculate (x, y) pixels)                         │  │
│  └────────────────────────┬──────────────────────────────┘  │
│                           │                                 │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │  8. Orthogonal Edge Routing                           │  │
│  │     (A* pathfinding around nodes)                     │  │
│  └────────────────────────┬──────────────────────────────┘  │
│                           │                                 │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │  9. Badge Placement                                   │  │
│  │     (Position edge labels avoiding collisions)        │  │
│  └────────────────────────┬──────────────────────────────┘  │
│                           │                                 │
│  ┌────────────────────────▼──────────────────────────────┐  │
│  │ 10. Validation & Conflict Detection                   │  │
│  │     Are there overlaps? Crossings?                    │  │
│  │     YES ──(Mutate Layout State)──> Loop back to #6    │  │
│  │     NO  ──> WE ARE DONE!                              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Table of Contents

This tutorial series is designed to take a developer with zero graph theory experience and turn them into an expert on how this engine works. Read them in order:

1. **[Foundations](./01-foundations.md)**: Nodes, edges, degrees, and what graph layout actually means.
2. **[The Sugiyama Framework](./02-the-sugiyama-framework.md)**: The classic 4-phase algorithm our engine builds upon.
3. **[Cycle Detection](./03-cycle-detection.md)**: How we identify and handle cycles using Strongly Connected Components.
4. **[Rank Assignment](./04-rank-assignment.md)**: Grouping nodes into horizontal layers.
5. **[Crossing Minimization](./05-crossing-minimization.md)**: Sorting nodes to untangle the edges.
6. **[Coordinate Assignment](./06-coordinate-assignment.md)**: Translating abstract ranks into exact pixels.
7. **[Orthogonal Routing](./07-orthogonal-routing.md)**: Finding right-angled paths around obstacles.
8. **[Badge Placement](./08-badge-placement.md)**: Scoring and selecting the perfect spot for edge labels.
9. **[The Optimization Loop](./09-optimization-loop.md)**: How the engine searches for perfect layouts.
10. **[Web Workers & Performance](./10-web-workers.md)**: Keeping the UI thread smooth during intense computation.
11. **[Diagnostics & Metrics](./11-diagnostics.md)**: How the engine measures aesthetic quality.

## Code Entry Points

If you want to read the code alongside these docs, start here:

- **Pipeline Entry:** `computeCustomLayout.ts`
- **Optimization Loop:** `optimizeLayout.ts`
- **Node Sugiyama Pipeline:** `nodeLayout.ts`
- **Types & Data Structures:** `types.ts`
