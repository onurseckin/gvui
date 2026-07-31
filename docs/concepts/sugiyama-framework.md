← Previous | [Index](../README.md) | Next →

# The Sugiyama Framework

## The Problem: Chaos to Hierarchy

Imagine you have a set of tasks where some tasks depend on others. You want to draw a diagram showing what to do first. If you place tasks randomly and connect them with arrows, you get a "hairball." Lines cross everywhere, arrows point in random directions, and you can't tell where the process starts or ends.

The goal of hierarchical graph layout is to transform this tangled mess into a clear, top-to-bottom flowchart where arrows generally point downwards, and edge crossings are minimized.

## The Aha Moment: Decomposing the Problem

In 1981, researchers Kozo Sugiyama, Shojiro Tagawa, and Mitsuhiko Toda realized that finding the "perfect" layout for a graph in one go is mathematically impossible for anything larger than a few nodes. The problem is too complex. 

Their breakthrough was dividing the problem into **four independent phases**, executed in sequence. Each phase solves exactly one type of visual clutter, preparing a cleaner graph for the next phase.

If you understand these four phases, you understand how almost every flowchart engine (including Dagre and our custom layout engine) works.

## The Four Phases: A Walkthrough

Let's walk through the four phases with a tiny 5-node graph.

### 1. Cycle Removal (Making it Flow)

**The Problem:** We want a top-to-bottom layout, but what if Node A points to B, and B points back to A? This cycle creates an infinite loop. We can't assign them to hierarchical layers if they point to each other.

**The Solution:** Temporarily reverse the direction of one edge to break the cycle. We remember which edge we reversed so we can draw the arrowhead correctly at the very end.

**Example:**
*Input: A → B, B → C, C → A, C → D, D → E*
(Notice the cycle A → B → C → A)

```
  A → B
  ↑   ↓
  C ← 
```

*Action:* We reverse C → A into A → C to break the loop.

*Output:*
```
  A → B
  ↓   ↓
  C ← 
```
*The graph is now a Directed Acyclic Graph (DAG).*

### 2. Layer Assignment (Vertical Positioning)

**The Problem:** Nodes need to be assigned to horizontal ranks (layers) so that edges point downward. We want to avoid long edges that span many layers, as they waste space and cause crossings.

**The Solution:** Run a ranking algorithm. The simplest is "longest path": push every node down until it is below all of its parents. 

**Example:**
*Input:* Our acyclic graph.
*Action:* 
- A has no parents. Rank 0.
- B and C depend on A. Rank 1.
- D depends on C. Rank 2.
- E depends on D. Rank 3.

*Output:*
```
Layer 0:  [A]
Layer 1:  [B, C]
Layer 2:  [D]
Layer 3:  [E]
```

### 3. Crossing Minimization (Horizontal Ordering)

**The Problem:** Now we have nodes in layers, but their horizontal order within each layer is arbitrary. If we place them badly, edges will cross.

**The Solution:** Reorder the nodes within each layer. We typically sweep up and down the graph: we sort the nodes in Layer 1 based on the positions of their parents in Layer 0. Then we sort Layer 2 based on Layer 1, and so on.

**Example:**
*Input:* Layer 1 has [B, C]. Does A → B cross A → C?
*Action:* We swap the order of B and C in Layer 1 to untangle the edges.

*Output:*
```
Layer 0:     [A]
            /   \
Layer 1:  [C]   [B]
           |
Layer 2:  [D]
           |
Layer 3:  [E]
```

### 4. Coordinate Assignment (Exact Pixel Values)

**The Problem:** We have the topological order, but a screen needs actual X and Y pixel coordinates. We need to center the nodes, balance the spaces, and route the edges neatly around them.

**The Solution:** Convert layers to Y-coordinates by looking at node heights. Convert ordering to X-coordinates by looking at node widths. 

*Output:*
```
Node A: x=100, y=50
Node C: x=50,  y=150
Node B: x=150, y=150
...
```

## How It Fits into the Engine

The Sugiyama framework is the skeleton. In our system:
- **Dagre** executes a classic implementation of these four phases.
- **Our Custom Engine** uses a hybrid approach: it uses Phase 1 and 2 to establish ranks, but intertwines Phase 3 (Ordering) and Phase 4 (Coordinate & Edge Routing) into a massive search algorithm (A*) to achieve perfect orthogonal edge routing. 

For more on how we score these layouts, read about our [Lexicographic Scoring](./lexicographic-scoring.md).
