← [Foundations](./01-foundations.md) | [Index](./README.md) | [Next: Cycle Detection →](./03-cycle-detection.md)

# The Sugiyama Framework

In the previous chapter, we defined what a graph is. Now, we need to draw it. 

If you just scatter nodes randomly and draw lines between them, the result is a tangled mess. We need a systematic way to assign coordinates so that the flow is clear and edges don't become a bowl of spaghetti.

For directed graphs, the gold standard is the **Sugiyama Framework**, named after Kozo Sugiyama who introduced it in 1981. It is the underlying algorithm powering tools like Graphviz (dot) and Dagre.

## The Problem with Drawing Everything at Once

Imagine trying to guess the absolute `(x, y)` coordinates for 50 nodes simultaneously while trying to minimize overlapping edges. The math is overwhelmingly complex. It's an NP-hard optimization problem.

Sugiyama's brilliant insight was **decomposition**. Instead of trying to find the perfect `(x, y)` coordinates all at once, he split the problem into a pipeline of four distinct, sequential phases. 

Each phase solves exactly *one* type of visual clutter, taking the output of the previous phase as its input.

## The 4 Phases of Sugiyama

Let's walk a 5-node graph through the four phases. 

Our input graph is mathematical (no coordinates). The nodes are A, B, C, D, E.
The edges are: A→B, A→C, B→D, C→D, E→C.

### Phase 1: Rank Assignment (Layering)

**Goal:** Determine the vertical (Y) ordering of the graph. Group nodes into discrete horizontal layers (ranks) so that edges flow strictly downward.

**What goes wrong without it:** Without layers, you get arrows pointing up, down, left, and right. It becomes impossible to trace the dependency flow.

```text
Rank 0:      [ A ]           [ E ]
               | \             |
               |  \            |
Rank 1:      [ B ] \           |
               |    \          |
               |   [ C ] <-----+
               |    /
Rank 2:        |   /
             [ D ]<
```

Notice that `C` is in Rank 1, but `E` points to it. So `E` must be in a rank *above* `C`. The algorithm assigns an integer rank to every node.

*(Note: If the graph has cycles, we first have to temporarily flip some edges to make it a Directed Acyclic Graph (DAG) before we can assign ranks. This is Phase 0: Cycle Breaking).*

### Phase 2: Vertex Ordering (Crossing Minimization)

**Goal:** Determine the horizontal (X) ordering *within* each rank to minimize the number of edges that cross each other.

**What goes wrong without it:** If we just place nodes in arbitrary order from left to right within their ranks, edges will cross, creating visual confusion.

If Rank 1 is ordered as `[C, B]`, the edge from `A` to `B` will cross the edge from `E` to `C`:

```text
Before Ordering (1 Crossing)
[ A ]       [ E ]
  \           /
   \         / 
    \       /  
   [ C ] [ B ] 
```

The Ordering phase permutes the nodes to `[B, C]` to remove the crossing:

```text
After Ordering (0 Crossings)
[ A ]       [ E ]
  |           |
  |           |
  |           |
[ B ]       [ C ] 
```

### Phase 3: Coordinate Assignment (Positioning)

**Goal:** Translate the abstract ranks and orders into actual `(x, y)` pixel coordinates. 

**What goes wrong without it:** Even if the order is right, the layout will look terrible if nodes aren't aligned properly. Edges might be jagged instead of straight.

This phase looks at the node widths and heights, calculates the necessary padding, and assigns exact numeric coordinates. It tries to align nodes vertically with their neighbors to create straight edges.

```text
(0,0) A      (200,0) E
      |              |
      |              |
(0,100) B    (200,100) C
```

### Phase 4: Edge Routing

**Goal:** Draw the actual lines connecting the nodes. 

**What goes wrong without it:** Edges might slice right through other nodes, or text labels might collide.

In a simple implementation, this just draws a straight line between the centers of the nodes. In an advanced implementation, this creates orthogonal (right-angled) paths that route *around* obstacles.

## Why We Built a Custom Engine On Top of Sugiyama

The Dagre library implements this 4-phase framework and does a decent job for simple graphs. So why write a custom engine?

Because the basic Sugiyama pipeline is **greedy and strictly forward-moving**. 

If Phase 1 makes a decision that accidentally makes Phase 4 impossible (e.g., leaving no room for a large edge label), the pipeline has no way to go back and fix it. It just pushes forward and produces a layout with overlapping text or edges cutting through nodes.

### The Custom Engine's Superpower: State-Space Search

See [computeCustomLayout.ts](../../src/engine/layout/custom/computeCustomLayout.ts) and [optimizeLayout.ts](../../src/engine/layout/custom/optimizeLayout.ts).

Our custom engine still uses the Sugiyama phases internally (see [nodeLayout.ts](../../src/engine/layout/custom/nodeLayout.ts#L44-L57)), but it wraps the *entire pipeline* in an optimization loop.

Instead of running the 4 phases once, our engine:
1. Runs the pipeline.
2. Looks at the final output (the routed edges and placed labels).
3. Evaluates it: "Are there edge crossings? Do labels overlap nodes?"
4. If there are flaws, it **mutates the input parameters** (e.g., adding artificial gaps, swapping node orders, forcing an edge to a different side).
5. Runs the pipeline again.

It treats graph layout not as a one-shot script, but as a **search problem**, exploring thousands of layout variations to find the one with perfect aesthetics.

## Alternative Layout Algorithms

Why Sugiyama and not something else? 

| Layout Type | How it Works | Best For | Why we don't use it for our primary view |
|---|---|---|---|
| **Sugiyama** | Layers and ranks. | Directed dependencies (CI/CD, architectures). | *We do use this!* It clearly shows the flow of time/logic. |
| **Force-Directed** | Physics simulation (nodes repel, edges act as springs). | Undirected networks (social graphs, highly connected clusters). | It produces "hairballs". Directionality is lost. You can't tell what is a source and what is a sink. |
| **Radial** | Concentric circles. | Showing central hubs and spokes. | Poor use of rectangular screen space. Hard to read sequential flows. |

Our dispatcher ([layoutDispatcher.ts](../../src/engine/layout/layoutDispatcher.ts)) actually *can* run Force and Radial layouts if requested, but our custom state-space search engine is built specifically on top of Sugiyama to provide perfect dependency diagrams.

In the next chapter, we will dive into the very first step of the pipeline: [Cycle Detection](./03-cycle-detection.md).

---
← [Foundations](./01-foundations.md) | [Index](./README.md) | [Next: Cycle Detection →](./03-cycle-detection.md)
