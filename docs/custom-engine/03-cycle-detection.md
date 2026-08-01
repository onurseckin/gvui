← [The Sugiyama Framework](./02-the-sugiyama-framework.md) | [Index](./README.md) | [Next: Cycle Breaking →](./04-cycle-breaking.md)

# Chapter 3: Cycle Detection

If you have a graph where `A` points to `B`, it's obvious how to draw them: `A` goes on top, `B` goes below.
But what if `A` points to `B`, `B` points to `C`, and `C` points back to `A`? Which node goes on top?

This is a **cycle**. Cycles completely break layered graph layouts because they create impossible logical loops. Before we can assign layers, we must find and fix these cycles.

To find cycles, we need to understand how computers explore graphs, starting with a fundamental tool: Depth-First Search.

## Atoms: Exploring the Graph

### Depth-First Search (DFS)

Imagine you are in a maze. A simple strategy to explore it is to keep walking forward as far as you can. When you hit a dead end, you backtrack to the last intersection and try a different path. This is **Depth-First Search (DFS)**.

Let's trace DFS on a simple tree:

```
  (A)
  / \
(B) (C)
 |
(D)
```

1. We start at **A**.
2. We go down to **B**.
3. We go down to **D**. Dead end!
4. We backtrack to **B**. No other paths. Backtrack to **A**.
5. We go down to **C**. Dead end! Backtrack to **A**. Done.

The **discovery order** is: `A → B → D → C`. Notice how we dive deep into one branch (`A → B → D`) before ever checking the other branch (`C`).

### The Back Edge

Now let's add one edge to our tree: an edge from `D` pointing back up to `A`.

```
    (A) <---+
    / \     |
  (B) (C)   |
   |        |
  (D) ------+
```

Let's run our DFS again:

1. Start at **A**.
2. Go to **B**.
3. Go to **D**.
4. From **D**, the only path is to **A**.
   But wait! We've already visited **A**. It's currently in our active path.

When a DFS encounters a node that it is _already exploring_ (an ancestor in the current path), this is called a **back edge**.

> [!IMPORTANT]
> A back edge ALWAYS indicates a cycle. If you can walk forward from `A` to `D`, and then follow a back edge from `D` back to `A`, you have found a loop: `A → B → D → A`.

## Molecules: Strongly Connected Components

### What is an SCC?

In a directed graph, a **Strongly Connected Component (SCC)** is a group of nodes where every node can reach every other node in that group.

A single isolated node is an SCC of size 1. But when nodes form cycles, they merge into larger SCCs.

Consider this 6-node graph:

```
(1) ---> (2) ---> (3)
 ^        |        |
 |        v        v
(4) <--- (5)      (6)
```

Let's break down the SCCs:

1. Look at nodes `1`, `2`, `4`, and `5`. You can start at any of these and reach all the others (e.g., `1 → 2 → 5 → 4 → 1`). This is our first SCC.
2. Look at node `3`. It can't reach anyone else. It's an SCC of size 1.
3. Look at node `6`. It also can't reach anyone else. It's an SCC of size 1.

So, this graph has 3 SCCs: `{1, 2, 4, 5}`, `{3}`, and `{6}`.

### Why do we care?

If we treat every SCC as a single giant "super-node", the resulting graph will NEVER have cycles. This is called a _condensation graph_.

By finding the SCCs, we perfectly isolate every cycle in the graph. Once we know where the cycles are, we can deal with them.

## Cells: Tarjan's Algorithm

To find SCCs efficiently, we use an elegant algorithm invented by Robert Tarjan in 1972. It finds all SCCs in a single DFS pass.

### The Two Key Numbers

As Tarjan's algorithm runs DFS, it assigns two numbers to every node:

1. **Discovery Time (index):** A simple counter. The first node visited gets index 1, the second gets 2, etc. (Our code starts at 0, but we'll use 1 for readability here).
2. **Low-Link Value (lowlink):** This is the magic number. It represents the _smallest discovery time_ reachable from this node, including through its children and back edges.

When we first visit a node, its low-link equals its discovery time. As we explore its children and find back edges pointing to older nodes (nodes with smaller discovery times), we update the low-link to match that older discovery time.

### The Stack

Tarjan's algorithm uses a stack (a list where you add and remove from the end) to keep track of nodes currently being explored or that belong to an SCC we are currently building.

### The Key Insight

After exploring all children of a node, we check:
**Does this node's `lowlink` equal its `index`?**

If yes, it means there is no path from this node to any node discovered earlier. This node is the "root" of an SCC! We then pop nodes off the stack until we pop this root node. All the popped nodes form one complete SCC.

### Traced Execution

Let's trace Tarjan's algorithm on this graph:

```
(A) ---> (B) ---> (C)
 ^        |
 |        v
(D) <--- (E)
```

**Step-by-step Trace:**

| Step | Current Node | Action                                                                                              | Discovery | Low-Link | Stack        |
| ---- | ------------ | --------------------------------------------------------------------------------------------------- | --------- | -------- | ------------ |
| 1    | **A**        | Visit A. Index=1, Low=1, push to stack. Explore B.                                                  | 1         | 1        | [A]          |
| 2    | **B**        | Visit B. Index=2, Low=2, push to stack. Explore C.                                                  | 2         | 2        | [A, B]       |
| 3    | **C**        | Visit C. Index=3, Low=3, push to stack. No children.                                                | 3         | 3        | [A, B, C]    |
| 4    | **C**        | Return to C. `lowlink(C) == index(C)` (3 == 3). **Root found!** Pop C. SCC: `{C}`                   | 3         | 3        | [A, B]       |
| 5    | **B**        | Back at B. Explore E.                                                                               | 2         | 2        | [A, B]       |
| 6    | **E**        | Visit E. Index=4, Low=4, push to stack. Explore D.                                                  | 4         | 4        | [A, B, E]    |
| 7    | **D**        | Visit D. Index=5, Low=5, push to stack. Explore A.                                                  | 5         | 5        | [A, B, E, D] |
| 8    | **D**        | A is on the stack! Back edge! Update Low(D) = min(5, Index(A)=1) = 1                                | 5         | 1        | [A, B, E, D] |
| 9    | **E**        | Return to E. Update Low(E) = min(4, Low(D)=1) = 1                                                   | 4         | 1        | [A, B, E, D] |
| 10   | **B**        | Return to B. Update Low(B) = min(2, Low(E)=1) = 1                                                   | 2         | 1        | [A, B, E, D] |
| 11   | **A**        | Return to A. `lowlink(A) == index(A)` (1 == 1). **Root found!** Pop A, B, E, D. SCC: `{A, B, E, D}` | 1         | 1        | []           |

Notice how the back edge from D to A propagated the small low-link value (1) all the way back up to B and E, binding them all together into a single SCC! Node C had no back edges, so its low-link stayed 3, and it formed its own SCC.

## Organisms: The Bigger Picture

How does this plug into our layout pipeline?

Before doing any layout math, we run our graph through Tarjan's algorithm. You can read the implementation in our custom engine here:
See [detectStronglyConnectedComponents](../../src/engine/layout/custom/stronglyConnectedComponents.ts#L10-L102)

The function returns a `DetailedSCCResult` object, which tells us exactly which nodes are trapped together in cycles.

However, Tarjan's algorithm only _finds_ the cycles. It doesn't fix them. For a layered layout to work, we must temporarily break these cycles by reversing certain edges. That is the job of the next phase.

← [The Sugiyama Framework](./02-the-sugiyama-framework.md) | [Index](./README.md) | [Next: Cycle Breaking →](./04-cycle-breaking.md)
