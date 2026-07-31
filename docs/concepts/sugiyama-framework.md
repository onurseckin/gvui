← Previous | [Index](../README.md) | Next →

# The Sugiyama Framework

## The Problem: Chaos to Hierarchy

Imagine you have a set of tasks where some tasks depend on others. You want to draw a flowchart showing what to do first. 

If you place tasks randomly on the screen and connect them with arrows, you get a "hairball." Lines cross everywhere, arrows point in completely random directions, and a user cannot tell where the process starts or ends.

The goal of hierarchical graph layout is to transform this tangled mess into a clear, top-to-bottom flowchart where arrows generally point downwards, and edge crossings are minimized.

## The Aha Moment: Decomposing the Problem

In 1981, researchers Kozo Sugiyama, Shojiro Tagawa, and Mitsuhiko Toda realized something profound: finding the "perfect" hierarchical layout for a graph in a single mathematical step is impossible for anything larger than a few nodes. The problem is too complex (NP-Hard).

Their breakthrough was dividing the massive problem into **four independent phases**, executed strictly in sequence. Each phase solves exactly one type of visual clutter, preparing a cleaner graph for the next phase.

If you understand these four phases, you understand the DNA of almost every flowchart engine in existence, including Dagre and our custom layout engine.

## The Four Phases: A Walkthrough

Let's trace the four phases using a 6-node graph.

### 1. Cycle Removal (Making it Flow)

**The Problem:** We want a top-to-bottom layout. But what if Node A points to B, B points to C, and C points *back* to A? This cycle creates an infinite loop. We can't assign them to top-to-bottom layers if they form a circle.

**The Solution:** Detect cycles and temporarily reverse the direction of one edge to break the loop. We remember which edge we reversed so we can draw the arrowhead correctly at the very end.

**Example:**
*Input: A → B, B → C, C → A, C → D, D → E, A → F*
(Notice the cycle A → B → C → A)

```text
  A → B
  ↑   ↓
  C ← 
```

*Action:* The algorithm reverses C → A into A → C to break the loop.

*Output:* The graph is now a Directed Acyclic Graph (DAG). All flows travel in one general direction.

### 2. Layer Assignment (Vertical Positioning)

**The Problem:** Nodes need to be assigned to horizontal ranks (layers) so that edges point downward. We want to avoid long edges that span many layers, as they waste vertical space.

**The Solution:** Run a ranking algorithm. A simple approach is "longest path": push every node down until it is strictly below all of its parents. 

**Example:**
*Action:* 
- A has no parents. Rank 0.
- B, C, and F depend on A. Rank 1.
- D depends on C. Rank 2.
- E depends on D. Rank 3.

*Output:*
```text
Layer 0:  [A]
Layer 1:  [B, C, F]
Layer 2:  [D]
Layer 3:  [E]
```

### 3. Crossing Minimization (Horizontal Ordering)

**The Problem:** Now we have nodes neatly in layers, but their horizontal order *within* each layer is completely arbitrary. If we leave them as `[B, C, F]`, edges from A might cross each other unnecessarily.

**The Solution:** Reorder the nodes within each layer. Algorithms typically sweep up and down the graph: they sort the nodes in Layer 1 based on the average positions of their connected parents in Layer 0. Then they sort Layer 2 based on Layer 1, and so on, repeating until crossings stop decreasing.

**Example:**
*Action:* The sweep algorithm realizes that placing C between B and F causes edges to tangle. It reorders Layer 1 to `[C, B, F]`.

*Output:* Nodes are perfectly ordered horizontally to untangle the lines.

### 4. Coordinate Assignment (Exact Pixel Values)

**The Problem:** We have the perfect topological order, but a computer screen needs actual X and Y pixel coordinates. We need to center the nodes, balance the spaces, and route the edges neatly around them.

**The Solution:** Convert layers to Y-coordinates using the heights of the nodes. Convert ordering to X-coordinates using the widths of the nodes. Route the edges through the gaps.

*Output:*
```text
Node A: x=100, y=50
Node C: x=50,  y=150
Node B: x=150, y=150
Node F: x=250, y=150
...
```

## How It Fits into Our Architecture

The Sugiyama framework is the skeleton. Our layout options build upon it differently:

| Layout Engine | Approach | When to use |
| :--- | :--- | :--- |
| **Dagre** | Executes a pure, classic implementation of the 4 Sugiyama phases. Edges are straight lines or simple bezier curves. | Default for most graphs. Fast, reliable, clean. |
| **Custom Engine** | Hybrid. Uses Sugiyama Phase 1 and Phase 2 to establish vertical ranks. However, it replaces Phases 3 and 4 with a massive A* search algorithm to achieve perfect orthogonal (90-degree) edge routing around rigid node boxes. | When perfect edge routing and avoiding labels is critical. |
| **Radial** | Non-Sugiyama. Uses trigonometry to place nodes in circles. | When the graph is highly centralized (one node connected to 50 others) and hierarchy doesn't matter. |

To understand how our Custom Engine evaluates its A* search states during its advanced routing phase, read about [Lexicographic Scoring](./lexicographic-scoring.md).
